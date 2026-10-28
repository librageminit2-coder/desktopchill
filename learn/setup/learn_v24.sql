begin;
-- desktopchill learn v24 (2026-10-28). Chống gian lận / tấn công — chỉ THÊM bảng, cột, hàm; không xoá dữ liệu học viên.
-- 1) Nhịp học hợp lý: số bài mới trong một lần lưu bị giới hạn theo thời gian (≈ 1 bài / 72 giây, cộng dư 4 bài)
--    và tối đa 120 bài / ngày (giờ Hà Nội). Quá mức → lần lưu đó không nhận phần bài mới (máy học viên vẫn giữ, lần sau gửi lại).
-- 2) XP: tối đa 25 XP / phút kể từ lần nhận XP trước (+40 dư) và 4.000 XP / ngày; vượt thì chỉ nhận phần cho phép.
-- 3) Sao chỉ 0–3, ô "đã học" chỉ 0/1. Ghi nhật ký learn_cheat để admin xem.
-- 4) Giới hạn tần suất: lưu tiến độ ≤ 40 lần / phút / tài khoản; tạo tài khoản ≤ 5 / giờ / IP.
create table if not exists learn_rl (k text primary key, win timestamptz not null, n int not null);
alter table learn_rl enable row level security;
create table if not exists learn_cheat (id bigserial primary key, user_id bigint references learn_users(id) on delete cascade, kind text not null, detail jsonb, at timestamptz not null default now());
alter table learn_cheat enable row level security;
create index if not exists learn_cheat_user on learn_cheat(user_id, at desc);
alter table learn_users add column if not exists g_day date;
alter table learn_users add column if not exists g_lessons int not null default 0;
alter table learn_users add column if not exists g_xp int not null default 0;
alter table learn_users add column if not exists g_les_at timestamptz;
alter table learn_users add column if not exists g_xp_at timestamptz;

create or replace function learn_ip() returns text language plpgsql stable as $$
declare h json;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  if h is null then return null; end if;
  return nullif(btrim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', h->>'x-forwarded-for', ''), ',', 1)), '');
end $$;
-- true = còn trong giới hạn
create or replace function learn_rate(p_key text, p_limit int, p_secs int) returns boolean language plpgsql as $$
declare r learn_rl;
begin
  if p_key is null then return true; end if;
  insert into learn_rl(k, win, n) values (p_key, now(), 1)
  on conflict (k) do update set
    n = case when learn_rl.win < now() - make_interval(secs => p_secs) then 1 else learn_rl.n + 1 end,
    win = case when learn_rl.win < now() - make_interval(secs => p_secs) then now() else learn_rl.win end
  returning * into r;
  if random() < 0.002 then delete from learn_rl where win < now() - interval '1 day'; end if;
  return r.n <= p_limit;
end $$;

-- số ô "đã học" (giá trị 1/true) trong d.done
create or replace function learn_done_count(d jsonb) returns int language sql immutable as $$
  select coalesce(sum((select count(*) from jsonb_array_elements(v) e where e::text in ('1', 'true'))), 0)::int
  from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where jsonb_typeof(v) = 'array'
$$;
-- chuẩn hoá: done chỉ 0/1, stars chỉ 0..3
create or replace function learn_clean_progress(d jsonb) returns jsonb language sql immutable as $$
  select d || jsonb_build_object(
    'done', coalesce((select jsonb_object_agg(k, (select coalesce(jsonb_agg(case when e::text in ('1', 'true') then 1 else 0 end order by o), '[]'::jsonb) from jsonb_array_elements(v) with ordinality x(e, o)))
      from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where jsonb_typeof(v) = 'array'), '{}'::jsonb),
    'stars', coalesce((select jsonb_object_agg(k, (select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'number' then least(3, greatest(0, e::text::numeric))::int else 0 end order by o), '[]'::jsonb) from jsonb_array_elements(v) with ordinality x(e, o)))
      from jsonb_each(case when jsonb_typeof(d->'stars') = 'object' then d->'stars' else '{}'::jsonb end) t(k, v) where jsonb_typeof(v) = 'array'), '{}'::jsonb))
$$;
-- kiểm tra một lần lưu: o = dữ liệu đang có, d = bản đã gộp. Trả về bản được nhận.
create or replace function learn_guard(p_uid bigint, o jsonb, d jsonb) returns jsonb language plpgsql as $$
declare u learn_users; today date := learn_vn_day(); ol int; nl int; newl int; allow_l int; ox numeric; nx numeric; gain numeric; allow_x numeric; r jsonb := d;
begin
  if jsonb_typeof(o) is distinct from 'object' or o = '{}'::jsonb then return learn_clean_progress(d); end if;
  select * into u from learn_users where id = p_uid for update;
  if u.g_day is distinct from today then u.g_day := today; u.g_lessons := 0; u.g_xp := 0; end if;
  r := learn_clean_progress(r);
  -- bài học mới
  ol := learn_done_count(o); nl := learn_done_count(r); newl := greatest(0, nl - ol);
  allow_l := least(120 - u.g_lessons, 4 + floor(extract(epoch from now() - coalesce(u.g_les_at, now() - interval '30 days')) / 72)::int);
  if newl > 0 and newl > allow_l then
    r := r || jsonb_build_object('done', coalesce(o->'done', '{}'::jsonb), 'stars', coalesce(o->'stars', '{}'::jsonb));
    insert into learn_cheat(user_id, kind, detail) values (p_uid, 'pace', jsonb_build_object('new', newl, 'allow', allow_l, 'today', u.g_lessons));
    newl := 0;
  elsif newl > 0 then u.g_lessons := u.g_lessons + newl; u.g_les_at := now();
  end if;
  -- XP
  ox := coalesce((o->>'xp')::numeric, 0); nx := coalesce((r->>'xp')::numeric, 0); gain := nx - ox;
  if gain > 0 then
    allow_x := least(4000 - u.g_xp, 40 + floor(extract(epoch from now() - coalesce(u.g_xp_at, now() - interval '30 days')) / 60) * 25);
    if gain > greatest(allow_x, 0) then
      insert into learn_cheat(user_id, kind, detail) values (p_uid, 'xp', jsonb_build_object('gain', gain, 'allow', allow_x, 'today', u.g_xp));
      gain := greatest(allow_x, 0); r := r || jsonb_build_object('xp', ox + gain);
    end if;
    if gain > 0 then u.g_xp := u.g_xp + gain::int; u.g_xp_at := now(); end if;
  end if;
  update learn_users set g_day = u.g_day, g_lessons = u.g_lessons, g_xp = u.g_xp, g_les_at = u.g_les_at, g_xp_at = u.g_xp_at where id = p_uid;
  return r;
exception when others then return d;
end $$;

create or replace function learn_save2(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d jsonb := p_data; o jsonb;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  if pg_column_size(d) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  if not learn_rate('save:' || uid, 40, 60) then return jsonb_build_object('ok', false, 'error', 'slowdown'); end if;
  select data into o from learn_users where id = uid for update;
  d := learn_data_merge(o, d);
  if pg_column_size(d) > 400000 then d := p_data; end if;
  d := learn_guard(uid, o, d);
  d := learn_revoke_apply(uid, d);
  update learn_users set data = d, updated_at = now() where id = uid;
  return jsonb_build_object('ok', true, 'rv', d->'fix'->'rv', 'data', d);
end $$;
create or replace function learn_save(p_name text, p_pin text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(p_name)); e text; uid bigint; o jsonb; d jsonb;
begin
  if pg_column_size(p_data) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  e := learn_check(k, p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  select id, data into uid, o from learn_users where name_key = k for update;
  if not learn_rate('save:' || uid, 40, 60) then return jsonb_build_object('ok', false, 'error', 'slowdown'); end if;
  d := learn_data_merge(o, p_data);
  if pg_column_size(d) > 400000 then d := p_data; end if;
  d := learn_guard(uid, o, d);
  update learn_users set data = learn_revoke_apply(uid, d), updated_at = now() where id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- tạo tài khoản: tối đa 5 / giờ / IP (chống tạo tài khoản ảo hàng loạt)
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'learn_register2_core') then
    alter function learn_register2(text, text, jsonb, text, text) rename to learn_register2_core;
  end if;
end $$;
revoke all on function learn_register2_core(text, text, jsonb, text, text) from public, anon, authenticated;
create or replace function learn_register2(p_name text, p_pin text, p_data jsonb, p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare ip text := learn_ip();
begin
  if ip is not null and not learn_rate('reg:' || ip, 5, 3600) then return jsonb_build_object('ok', false, 'error', 'toomany'); end if;
  return learn_register2_core(p_name, p_pin, p_data, p_email, p_phone);
end $$;
grant execute on function learn_register2(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function learn_save2(text, jsonb) to anon, authenticated;
grant execute on function learn_save(text, text, jsonb) to anon, authenticated;
-- các hàm nội bộ không gọi trực tiếp được từ trình duyệt
revoke all on function learn_guard(bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function learn_rate(text, int, int) from public, anon, authenticated;


-- 5) Khoá quyền: trình duyệt (anon) chỉ gọi được đúng các hàm mà website / trang admin dùng.
--    Mọi hàm learn_* khác (cộng XP, phát vé, phát hình, chấm trận, …) chỉ chạy được từ bên trong máy chủ.
do $$
declare f record; allow text[] := array['learn_admin_contact','learn_admin_games','learn_admin_overview','learn_admin_pin_action','learn_admin_pin_requests','learn_admin_room_action','learn_admin_rooms','learn_admin_user','learn_admin_user_action','learn_admin_users','learn_adv_act','learn_adv_join','learn_adv_map','learn_adv_start','learn_adv_state','learn_auth','learn_bestie_here','learn_bestie_nudge','learn_bestie_pass','learn_bestie_remove','learn_bestie_request','learn_bestie_respond','learn_bestie_set','learn_bestie_state','learn_change_pin','learn_chat_get','learn_chat_send','learn_chat_threads','learn_contact_get','learn_contact_set','learn_duel_create','learn_duel_decline','learn_duel_get','learn_duel_list','learn_duel_submit','learn_forgot','learn_friend_request','learn_friend_respond','learn_friends_list','learn_gacha_spin','learn_gacha_state','learn_game_chat','learn_gift_seen','learn_group_leave','learn_group_list','learn_group_quiz','learn_group_save','learn_invite','learn_login','learn_logout','learn_me','learn_name_available','learn_notifs','learn_notifs_read','learn_notifs_read_kind','learn_ping','learn_profile','learn_quiz_answer','learn_quiz_create','learn_quiz_host_action','learn_quiz_host_state','learn_quiz_join','learn_quiz_mine','learn_quiz_play_state','learn_quiz_report','learn_quiz_set_delete','learn_quiz_set_save','learn_rank_board','learn_register2','learn_rename','learn_room_admin','learn_room_create','learn_room_get','learn_room_join','learn_rooms_mine','learn_save','learn_save2','learn_set_avatar','learn_share','learn_tick','learn_wall_buy','learn_wall_claim','learn_walls_mine','learn_walls_of'];
begin
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'learn\_%' loop
    if f.proname = any(allow) then execute format('grant execute on function %s to anon, authenticated', f.sig);
    else execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
