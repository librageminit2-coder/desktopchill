begin;
-- desktopchill learn v23 (2026-10-24). Chỉ THÊM bảng / cột / hàm và thay hàm learn_*; không xoá dữ liệu học viên.
-- 1) Bỏ "Test out" (đã gỡ nút ở v23a). Không thu hồi kết quả test out cũ, TRỪ tài khoản HobbyHappy: thu hồi 250 sao English
--    (kèm điểm VIP / cấp VIP tương ứng); giữ nguyên XP và kho hình. Cơ chế thu hồi chung: bảng learn_revokes.
-- 2) Vòng quay may mắn (gacha): rương chủ đề / boss cho vé quay thay vì hình cố định; vé lưu trong kho; trùng hình → XP.
--    Mỗi tài khoản được 1 vé miễn phí. Top 10 mỗi bảng xếp hạng nhận 1 vé mỗi tuần. Duel: tối đa 1 vé / ngày.
-- 3) Tuần mới: 16:00 thứ Hai giờ Hà Nội. Duel reset điểm và MỌI bảng xếp hạng phát quà ngay lúc đó (pg_cron + chốt dự phòng). Bảng Top collector.
-- 4) Duel: 10 lượt thách đấu + 10 lượt bị thách đấu mỗi ngày được tính điểm và có XP; sau đó vẫn chơi được nhưng không tính.
-- 5) Nhóm bạn bè + quiz nhanh cho nhóm (thành viên tự vào phòng chờ). Hồ sơ công khai (không có email / SĐT).
-- 6) Chạy nhanh hơn với ~2000 người: cột tính sẵn trên learn_users, lưu tiến trình bằng token (không băm PIN mỗi lần lưu).

-- ============ 0. cột tính sẵn (cập nhật mỗi khi dữ liệu học thay đổi) ============
alter table learn_users add column if not exists c_en int not null default 0;
alter table learn_users add column if not exists c_zh int not null default 0;
alter table learn_users add column if not exists c_ie int not null default 0;
alter table learn_users add column if not exists c_vpts int not null default 0;
alter table learn_users add column if not exists c_xp int not null default 0;
alter table learn_users add column if not exists c_sum jsonb not null default '{}'::jsonb;
alter table learn_users add column if not exists c_days jsonb not null default '{}'::jsonb;
-- điểm VIP bị trừ do thu hồi (giữ cả khi chủ đề vẫn còn đủ để chạm trần điểm khoá)
alter table learn_users add column if not exists vip_penalty int not null default 0;
create index if not exists learn_users_c_en on learn_users(c_en desc) where c_en > 0;
create index if not exists learn_users_c_zh on learn_users(c_zh desc) where c_zh > 0;
create index if not exists learn_users_c_ie on learn_users(c_ie desc) where c_ie > 0;
create index if not exists learn_users_seen on learn_users(last_seen desc);
create index if not exists learn_duels_open on learn_duels(state, expires_at) where state in ('a_play', 'b_turn');
create index if not exists learn_duels_fin on learn_duels(finished_at) where state = 'done';
create index if not exists learn_walls_user on learn_walls(user_id);
create index if not exists learn_notifs_unread on learn_notifs(user_id) where read_at is null;

create or replace function learn_num(v jsonb) returns int language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then least(greatest(v::text::numeric, -2000000000), 2000000000)::int else 0 end
$$;
create or replace function learn_week_xp_days(dd jsonb) returns int language sql stable as $$
  select coalesce(sum(learn_num(value)), 0)::int from jsonb_each(case when jsonb_typeof(dd) = 'object' then dd else '{}'::jsonb end)
  where key >= to_char((now() at time zone 'Asia/Ho_Chi_Minh') - interval '6 days', 'YYYY-MM-DD')
$$;
create or replace function learn_vipc(p_vpts int, p_bonus int) returns int language sql immutable as $$
  select learn_vip_level(coalesce(p_vpts, 0) + least(greatest(coalesce(p_bonus, 0), 0), 150))
$$;
create or replace function learn_users_cache_trg() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.data is distinct from old.data or new.vip_penalty is distinct from old.vip_penalty then
    new.c_en := learn_course_score(new.data, 'en'); new.c_zh := learn_course_score(new.data, 'zh'); new.c_ie := learn_course_score(new.data, 'ielts');
    new.c_vpts := greatest(0, learn_vip_points(new.data, 0) - coalesce(new.vip_penalty, 0)); new.c_xp := learn_num(new.data->'xp'); new.c_sum := learn_summary(new.data);
    new.c_days := case when jsonb_typeof(new.data->'days') = 'object' then new.data->'days' else '{}'::jsonb end;
  end if;
  return new;
end $$;
drop trigger if exists learn_users_cache on learn_users;
create trigger learn_users_cache before insert or update of data, vip_penalty on learn_users for each row execute function learn_users_cache_trg();
create or replace function learn_user_vip(p_uid bigint) returns int language sql stable as $$
  select learn_vipc(c_vpts, vip_bonus) from learn_users where id = p_uid
$$;

-- ============ 1. thu hồi theo danh sách (dùng cho HobbyHappy) ============
-- learn_unit_words + learn_tout_units: nhận diện chủ đề làm bằng test out (8 bài đúng 2 sao, 20 từ vào thẻ ôn cùng lúc).
-- Chỉ dùng để CHỌN bài nào thu hồi trước cho tài khoản được chỉ định; không áp dụng cho người khác.
create table if not exists learn_unit_words (unit text primary key, w0 text not null, w10 text not null);
alter table learn_unit_words enable row level security;

create or replace function learn_tout_units(d jsonb) returns text[] language plpgsql stable as $$
declare k text; st jsonb; dn jsonb; i int; s int; n1 int; n2 int; uw learn_unit_words; lg text; e0 jsonb; e1 jsonb; same boolean; diff boolean; out text[] := '{}';
begin
  if jsonb_typeof(d->'done') is distinct from 'object' then return out; end if;
  for k, dn in select key, value from jsonb_each(d->'done') loop
    if jsonb_typeof(dn) is distinct from 'array' or jsonb_array_length(dn) < 8 then continue; end if;
    if exists (select 1 from jsonb_array_elements(dn) e where e::text not in ('1', 'true')) then continue; end if;
    st := d->'stars'->k; n1 := 0; n2 := 0;
    for i in 0..7 loop
      s := case when jsonb_typeof(st) = 'array' then learn_num(st->i) else 0 end;
      if s <= 1 then n1 := n1 + 1; elsif s = 2 then n2 := n2 + 1; end if;
    end loop;
    if n1 > 0 or n2 = 0 then continue; end if;
    select * into uw from learn_unit_words where unit = k;
    same := false; diff := false;
    if found then
      lg := split_part(k, '-', 1); e0 := d->'srs'->(lg || '|' || uw.w0); e1 := d->'srs'->(lg || '|' || uw.w10);
      if jsonb_typeof(e0) = 'object' and jsonb_typeof(e1) = 'object' and learn_num(e0->'r') = 0 and learn_num(e1->'r') = 0
         and jsonb_typeof(e0->'d') = 'number' and jsonb_typeof(e1->'d') = 'number' then
        if abs((e0->>'d')::numeric - (e1->>'d')::numeric) < 1000 then same := true;
        elsif abs((e0->>'d')::numeric - (e1->>'d')::numeric) > 60000 then diff := true; end if;
      end if;
    end if;
    if same or (n2 = 8 and not diff) then out := out || k; end if;
  end loop;
  return out;
end $$;

-- mỗi lần thu hồi: danh sách bài [chủ đề, số bài 0–7, số sao còn lại] (0 = về "chưa học")
create table if not exists learn_revokes (
  id bigserial primary key, user_id bigint not null references learn_users(id) on delete cascade,
  items jsonb not null, reason text not null default '', stars int not null default 0,
  vip_before int, vip_after int, pts_before int, pts_after int, xp_kept int,
  created_at timestamptz not null default now());
create index if not exists learn_revokes_user on learn_revokes(user_id, id);
alter table learn_revokes enable row level security;

-- áp các lần thu hồi mà bản dữ liệu này chưa có (dấu fix.rv = id thu hồi cuối đã áp); máy cũ gửi lên dữ liệu cũ vẫn bị sửa đúng
create or replace function learn_revoke_apply(p_uid bigint, d jsonb) returns jsonb language plpgsql stable as $$
declare r learn_revokes; it jsonb; u text; k int; sv int; dn jsonb; st jsonb; done_rv bigint;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return d; end if;
  done_rv := case when jsonb_typeof(d->'fix'->'rv') = 'number' then (d->'fix'->>'rv')::bigint else 0 end;
  for r in select * from learn_revokes where user_id = p_uid and id > done_rv order by id loop
    for it in select value from jsonb_array_elements(r.items) loop
      u := it->>0; k := (it->>1)::int; sv := coalesce((it->>2)::int, 0);
      dn := d->'done'->u; st := d->'stars'->u;
      if jsonb_typeof(dn) is distinct from 'array' then continue; end if;
      if jsonb_typeof(st) is distinct from 'array' then st := '[0,0,0,0,0,0,0,0]'::jsonb; end if;
      if sv <= 0 then dn := jsonb_set(dn, array[k::text], '0'::jsonb); st := jsonb_set(st, array[k::text], '0'::jsonb);
      else st := jsonb_set(st, array[k::text], to_jsonb(least(greatest(learn_num(st->k), 1), sv))); end if;
      d := jsonb_set(jsonb_set(d, array['done', u], dn), array['stars', u], st);
    end loop;
    d := jsonb_set(d, '{fix}', coalesce(case when jsonb_typeof(d->'fix') = 'object' then d->'fix' end, '{}'::jsonb) || jsonb_build_object('rv', r.id));
  end loop;
  return d;
end $$;

-- thu hồi n sao của một khoá: ưu tiên chủ đề làm bằng test out, rồi các bài ở level cao nhất; giữ XP và hình nền
create or replace function learn_revoke_stars(p_uid bigint, p_lang text, p_n int, p_reason text) returns jsonb language plpgsql as $$
declare u learn_users; tou text[]; lv text[] := case p_lang when 'en' then array['a1','a2','b1','b1p','b2','b2p','c1'] when 'zh' then array['hsk1','hsk2','hsk3','hsk4','hsk5','hsk6'] else array['b4','b5','b6','b7','b8'] end;
  r record; left_ int := p_n; items jsonb := '[]'::jsonb; s int; take int; p0 int; p1 int; rid bigint; want int;
begin
  select * into u from learn_users where id = p_uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
  tou := learn_tout_units(u.data);
  p0 := u.c_vpts + least(greatest(u.vip_bonus, 0), 150);
  for r in
    select key unit, k, coalesce(case when jsonb_typeof(u.data->'stars'->key) = 'array' then learn_num(u.data->'stars'->key->k) end, 0) st
    from jsonb_each(case when jsonb_typeof(u.data->'done') = 'object' then u.data->'done' else '{}'::jsonb end) e, generate_series(7, 0, -1) k
    where key like p_lang || '-%' and jsonb_typeof(e.value) = 'array' and (e.value->>k) in ('1', 'true')
    order by (key = any(tou)) desc, array_position(lv, split_part(key, '-', 2)) desc nulls last, split_part(key, '-', 3)::int desc, k desc
  loop
    exit when left_ <= 0;
    s := greatest(r.st, 1);
    take := least(s, left_);
    items := items || jsonb_build_array(jsonb_build_array(r.unit, r.k, s - take));
    left_ := left_ - take;
  end loop;
  if jsonb_array_length(items) = 0 then return jsonb_build_object('ok', false, 'error', 'nothing'); end if;
  insert into learn_revokes(user_id, items, reason, stars, vip_before, pts_before, xp_kept) values (p_uid, items, p_reason, p_n - left_, learn_vip_level(p0), p0, u.c_xp) returning id into rid;
  update learn_users set data = learn_revoke_apply(p_uid, data) where id = p_uid;
  select c_vpts + least(greatest(vip_bonus, 0), 150) into p1 from learn_users where id = p_uid;
  -- điểm VIP tương ứng số sao bị thu hồi (1 chủ đề = 24 sao = 600/1000 điểm chia số chủ đề mốc của khoá);
  -- nếu khoá vẫn chạm trần điểm sau khi bỏ bài, phần thiếu được trừ qua vip_penalty
  want := round((p_n - left_) / 24.0 * case p_lang when 'en' then 600.0 / nullif((select units from learn_course_meta where lang = 'en'), 0)
    when 'zh' then 1000.0 / nullif((select units from learn_course_meta where lang = 'zh'), 0) else 1000.0 / nullif((select units from learn_course_meta where lang = 'ielts'), 0) end);
  if coalesce(want, 0) > p0 - p1 then
    update learn_users set vip_penalty = vip_penalty + (want - (p0 - p1)) where id = p_uid;
    select c_vpts + least(greatest(vip_bonus, 0), 150) into p1 from learn_users where id = p_uid;
  end if;
  update learn_revokes set pts_after = p1, vip_after = learn_vip_level(p1) where id = rid;
  perform learn_notify(p_uid, 'revoke', null, jsonb_build_object('stars', p_n - left_, 'lang', p_lang, 'vip_before', learn_vip_level(p0), 'vip_after', learn_vip_level(p1)));
  return jsonb_build_object('ok', true, 'id', rid, 'stars', p_n - left_, 'lessons', jsonb_array_length(items), 'vip_before', learn_vip_level(p0), 'vip_after', learn_vip_level(p1), 'pts_before', p0, 'pts_after', p1);
end $$;

-- ============ 2. lưu tiến trình bằng token (không cần PIN mỗi lần) ============
create or replace function learn_save2(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d jsonb := p_data;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  if pg_column_size(d) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  d := learn_revoke_apply(uid, d);
  update learn_users set data = d, updated_at = now() where id = uid;
  return jsonb_build_object('ok', true, 'rv', d->'fix'->'rv');
end $$;
create or replace function learn_save(p_name text, p_pin text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(p_name)); e text;
begin
  if pg_column_size(p_data) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  e := learn_check(k, p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  update learn_users set data = learn_revoke_apply(id, p_data), updated_at = now() where name_key = k;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function learn_save2(text, jsonb) to anon, authenticated;

-- ============ 3. tuần mới lúc 16:00 thứ Hai (giờ Hà Nội) ============
-- tuần mang ngày thứ Hai bắt đầu; chạy từ 16:00 thứ Hai đó tới 16:00 thứ Hai tuần sau
create or replace function learn_week_start(p_week date) returns timestamptz language sql immutable as $$
  select (p_week + time '16:00') at time zone 'Asia/Ho_Chi_Minh'
$$;
create or replace function learn_week_of(t timestamptz) returns date language sql stable as $$
  select date_trunc('week', (t at time zone 'Asia/Ho_Chi_Minh') - interval '16 hours')::date
$$;

-- ============ 4. vòng quay may mắn ============
create table if not exists learn_gacha (
  id bigserial primary key,
  user_id bigint not null references learn_users(id) on delete cascade,
  source text not null default '',
  created_at timestamptz not null default now(),
  spun_at timestamptz, wall int, rarity text, dup boolean, xp int not null default 0
);
create index if not exists learn_gacha_open on learn_gacha(user_id, id) where spun_at is null;
create index if not exists learn_gacha_user on learn_gacha(user_id, spun_at desc);
alter table learn_gacha enable row level security;

-- tỉ lệ theo độ hiếm (%), XP khi trùng hình đã có
create or replace function learn_gacha_odds() returns table(rarity text, weight numeric, dup_xp int) language sql immutable as $$
  values ('common'::text, 62::numeric, 60), ('rare', 26, 120), ('epic', 9, 240), ('legendary', 3, 480)
$$;
create or replace function learn_gacha_give(p_uid bigint, p_n int, p_source text) returns int language sql as $$
  insert into learn_gacha(user_id, source) select p_uid, left(coalesce(p_source, ''), 80) from generate_series(1, greatest(coalesce(p_n, 0), 0));
  select greatest(coalesce(p_n, 0), 0);
$$;
create or replace function learn_gacha_left(p_uid bigint) returns int language sql stable as $$
  select count(*)::int from learn_gacha where user_id = p_uid and spun_at is null
$$;
-- vé miễn phí lần đầu cho mọi tài khoản (cả tài khoản mới)
create or replace function learn_gacha_welcome(p_uid bigint) returns boolean language plpgsql as $$
begin
  if exists (select 1 from learn_gacha where user_id = p_uid and source = 'welcome') then return false; end if;
  perform learn_gacha_give(p_uid, 1, 'welcome');
  return true;
end $$;

create or replace function learn_gacha_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  perform learn_gacha_welcome(uid);
  return jsonb_build_object('ok', true, 'left', learn_gacha_left(uid),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'n', n) order by mi) from (select source, count(*) n, min(id) mi from learn_gacha where user_id = uid and spun_at is null group by source) s), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('wall', wall, 'rarity', rarity, 'dup', dup, 'xp', xp, 'at', spun_at, 'source', source) order by spun_at desc) from (select * from learn_gacha where user_id = uid and spun_at is not null order by spun_at desc limit 30) h), '[]'::jsonb),
    'spins', (select count(*) from learn_gacha where user_id = uid and spun_at is not null),
    'odds', (select jsonb_agg(jsonb_build_object('rarity', o.rarity, 'weight', o.weight, 'dup_xp', o.dup_xp, 'n', (select count(*) from learn_wall_catalog c where c.rarity = o.rarity and c.id not in (5, 41, 71)))) from learn_gacha_odds() o));
end $$;

create or replace function learn_gacha_spin(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); t learn_gacha; r numeric := random() * 100; acc numeric := 0; o record; rr text; w int; gx int := 0; isdup boolean := false;
begin
  select * into t from learn_gacha where user_id = uid and spun_at is null order by id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok', false, 'error', 'noticket'); end if;
  -- 6% ra hiệu ứng Bestie chưa có (rương quà có cả hiệu ứng)
  if random() < 0.06 then
    rr := learn_fx_give(uid, null, 'gacha');
    if rr is not null then
      update learn_gacha set spun_at = now(), wall = null, rarity = 'fx:' || rr, dup = false, xp = 0 where id = t.id;
      return jsonb_build_object('ok', true, 'fx', rr, 'rarity', (select rarity from learn_fx_catalog where id = rr), 'source', t.source, 'left', learn_gacha_left(uid));
    end if;
  end if;
  for o in select * from learn_gacha_odds() loop
    acc := acc + o.weight; rr := o.rarity;
    if r < acc then exit; end if;
  end loop;
  select c.id into w from learn_wall_catalog c where c.rarity = rr and c.id not in (5, 41, 71) order by random() limit 1;
  if w is null then select c.id into w from learn_wall_catalog c where c.id not in (5, 41, 71) order by random() limit 1; select rarity into rr from learn_wall_catalog where id = w; end if;
  if not learn_give_wall(uid, w, 'gacha') then
    isdup := true; gx := (select dup_xp from learn_gacha_odds() x where x.rarity = rr);
    perform learn_grant_xp(uid, gx, 'gacha-dup');
  end if;
  update learn_gacha set spun_at = now(), wall = w, rarity = rr, dup = isdup, xp = gx where id = t.id;
  return jsonb_build_object('ok', true, 'wall', w, 'rarity', rr, 'dup', isdup, 'xp', gx, 'source', t.source, 'left', learn_gacha_left(uid));
end $$;

-- số sao thật của một rương (tính từ tiến trình đã lưu): chủ đề cần xong 8 bài; boss lấy sao boss tốt nhất
create or replace function learn_slot_stars(d jsonb, p_slot text) returns int language plpgsql stable as $$
declare p text[]; dn jsonb; st jsonb; i int; s int := 0;
begin
  if p_slot like 'boss|%' then
    p := string_to_array(p_slot, '|');
    return least(3, greatest(learn_num(d->'bossStars'->(p[2] || '|' || p[3])), case when jsonb_typeof(d->'boss'->(p[2] || '|' || p[3])) is not null then 1 else 0 end));
  end if;
  dn := d->'done'->p_slot; st := d->'stars'->p_slot;
  if jsonb_typeof(dn) is distinct from 'array' or jsonb_array_length(dn) < 8 then return 0; end if;
  if exists (select 1 from jsonb_array_elements(dn) e where e::text not in ('1', 'true')) then return 0; end if;
  for i in 0..7 loop s := s + greatest(1, least(3, case when jsonb_typeof(st) = 'array' then learn_num(st->i) else 1 end)); end loop;
  return case when s >= 22 then 3 when s >= 16 then 2 else 1 end;
end $$;

-- rương chủ đề / boss: trao VÉ QUAY (2★ = 1 vé, 3★ = 2 vé; boss 1★/2★/3★ = 1/2/3 vé) thay vì hình cố định
create or replace function learn_wall_claim(p_token text, p_slot text, p_stars int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); ws int[]; prev int := 0; real int; st int; isboss boolean := p_slot like 'boss|%'; n0 int; n1 int; n int;
begin
  select walls into ws from learn_wall_slots where slot = p_slot;
  if ws is null then return jsonb_build_object('ok', false, 'error', 'noslot'); end if;
  select learn_slot_stars(data, p_slot) into real from learn_users where id = uid;
  st := least(greatest(coalesce(p_stars, 0), 0), 3, coalesce(real, 0));
  select stars into prev from learn_wall_claims where user_id = uid and slot = p_slot;
  prev := coalesce(prev, 0);
  if st <= prev then return jsonb_build_object('ok', true, 'tickets', 0, 'stars', prev, 'real', real, 'left', learn_gacha_left(uid)); end if;
  n0 := case when isboss then prev when prev >= 3 then 2 when prev >= 2 then 1 else 0 end;
  n1 := case when isboss then st when st >= 3 then 2 when st >= 2 then 1 else 0 end;
  n := greatest(0, least(n1, array_length(ws, 1)) - n0);
  if n > 0 then perform learn_gacha_give(uid, n, 'chest:' || p_slot); end if;
  insert into learn_wall_claims(user_id, slot, stars) values (uid, p_slot, st)
    on conflict (user_id, slot) do update set stars = greatest(learn_wall_claims.stars, excluded.stars);
  return jsonb_build_object('ok', true, 'tickets', n, 'stars', st, 'real', real, 'left', learn_gacha_left(uid));
end $$;

create or replace function learn_walls_mine(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; pts int; lv int;
begin
  select * into u from learn_users where id = uid;
  pts := u.c_vpts + least(greatest(u.vip_bonus, 0), 150); lv := learn_vip_level(pts);
  return jsonb_build_object('ok', true,
    'walls', coalesce((select jsonb_agg(jsonb_build_object('w', wall, 'src', source, 'at', created_at) order by created_at) from learn_walls where user_id = uid), '[]'::jsonb),
    'claims', coalesce((select jsonb_object_agg(slot, stars) from learn_wall_claims where user_id = uid), '{}'::jsonb),
    'vip', lv, 'vip_pts', pts, 'bonus', u.vip_bonus, 'penalty', u.vip_penalty, 'tickets', learn_gacha_left(uid),
    'share', jsonb_build_object('quota', lv, 'used', (select count(*) from learn_shares where from_id = uid and vip = lv),
      'today', exists (select 1 from learn_shares where from_id = uid and learn_vn_day(created_at) = learn_vn_day()),
      'sent', coalesce((select jsonb_agg(jsonb_build_object('to', s.to_id, 'name', x.name, 'wall', s.wall, 'vip', s.vip, 'at', s.created_at) order by s.created_at desc)
        from learn_shares s join learn_users x on x.id = s.to_id where s.from_id = uid), '[]'::jsonb)));
end $$;

-- ============ 5. giới hạn điểm VIP thưởng theo ngày (chống dồn điểm bằng quiz) ============
create table if not exists learn_bonus_day (user_id bigint not null references learn_users(id) on delete cascade, day date not null, kind text not null, pts int not null default 0, primary key (user_id, day, kind));
alter table learn_bonus_day enable row level security;
create or replace function learn_add_bonus_cap(p_uid bigint, p_n int, p_kind text, p_cap int) returns int language plpgsql as $$
declare used int; give int;
begin
  select pts into used from learn_bonus_day where user_id = p_uid and day = learn_vn_day() and kind = p_kind;
  give := least(greatest(p_n, 0), greatest(p_cap - coalesce(used, 0), 0));
  if give > 0 then
    insert into learn_bonus_day(user_id, day, kind, pts) values (p_uid, learn_vn_day(), p_kind, give) on conflict (user_id, day, kind) do update set pts = learn_bonus_day.pts + give;
    perform learn_add_bonus(p_uid, give);
  end if;
  return give;
end $$;

-- quiz: người thắng nhận 1 vé quay (tối đa 1 vé / ngày từ quiz); điểm VIP từ quiz tối đa 10 / ngày
create or replace function learn_quiz_award(p_game bigint) returns void language plpgsql as $$
declare g learn_quiz_games; r record; k int := 0; tk boolean; pts int;
begin
  select * into g from learn_quiz_games where id = p_game for update;
  if g.awarded then return; end if;
  update learn_quiz_games set awarded = true where id = g.id;
  if jsonb_array_length(g.questions) < 5 or (select count(*) from learn_quiz_players where game_id = g.id and not kicked) < 3 then return; end if;
  for r in select * from learn_quiz_players where game_id = g.id and not kicked and user_id is not null order by score desc, correct desc, joined_at loop
    k := k + 1;
    if r.user_id = g.host_user then continue; end if;
    if k = 1 then
      pts := learn_add_bonus_cap(r.user_id, 10, 'quiz', 10);
      tk := not exists (select 1 from learn_gacha where user_id = r.user_id and source like 'quiz:%' and learn_vn_day(created_at) = learn_vn_day());
      if tk then perform learn_gacha_give(r.user_id, 1, 'quiz:' || left(g.title, 60)); end if;
      perform learn_notify(r.user_id, 'quiz_win', g.host_user, jsonb_build_object('title', g.title, 'rank', 1, 'pts', pts, 'ticket', tk));
    elsif k <= 3 then
      pts := learn_add_bonus_cap(r.user_id, case when k = 2 then 6 else 4 end, 'quiz', 10);
      perform learn_notify(r.user_id, 'quiz_win', g.host_user, jsonb_build_object('title', g.title, 'rank', k, 'pts', pts));
    else perform learn_add_bonus_cap(r.user_id, 1, 'quiz', 10); end if;
  end loop;
end $$;

-- ============ 6. duel: 10 lượt gửi + 10 lượt nhận được tính mỗi ngày ============
alter table learn_duels add column if not exists a_scored boolean not null default true;
alter table learn_duels add column if not exists b_scored boolean not null default true;
alter table learn_duels add column if not exists ticket boolean not null default false;
alter table learn_duels add column if not exists a_xp int;
alter table learn_duels add column if not exists b_xp int;
alter table learn_duels add column if not exists passed_from bigint;
create index if not exists learn_duels_a_day on learn_duels(a, created_at);
create index if not exists learn_duels_b_day on learn_duels(b, created_at);

create or replace function learn_duel_xp(p_res text) returns int language sql immutable as $$
  select case p_res when 'win' then 10 when 'draw' then 6 else 3 end
$$;
create or replace function learn_duel_ticket_used(p_uid bigint, p_day date) returns boolean language sql stable as $$
  select exists (select 1 from learn_duels where winner = p_uid and ticket and finished_at >= (p_day::timestamp at time zone 'Asia/Ho_Chi_Minh') and finished_at < ((p_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'))
$$;
-- bảng điểm tuần: chỉ tính phía được tính điểm của mỗi trận (thắng 3, hoà 1)
create or replace function learn_duel_board(p_week date) returns table(uid bigint, pts int, wins int, played int, last_at timestamptz) language sql stable as $$
  with lo as (select learn_week_start(p_week) t0),
  d as (select * from learn_duels, lo where state = 'done' and finished_at >= lo.t0 and finished_at < lo.t0 + interval '7 days'),
  r as (select a as u, winner, finished_at t from d where a_scored union all select b as u, winner, finished_at t from d where b_scored and not forfeit)
  select r.u, sum(case when winner = r.u then 3 when winner is null then 1 else 0 end)::int, count(*) filter (where winner = r.u)::int, count(*)::int, max(t)
  from r join learn_users x on x.id = r.u where not x.banned
  group by r.u
$$;

-- trao thưởng khi trận kết thúc: XP cho phía được tính; người thắng nhận 1 vé quay nếu hôm nay chưa có vé duel
create or replace function learn_duel_finish(p_id bigint) returns jsonb language plpgsql as $$
declare d learn_duels; w bigint; l bigint; ax int := 0; bx int := 0; tk boolean := false; wsc boolean;
begin
  select * into d from learn_duels where id = p_id for update;
  if d.state <> 'done' or d.a_xp is not null then return '{}'::jsonb; end if;
  w := d.winner; l := case when w = d.a then d.b when w = d.b then d.a end;
  if d.a_scored then ax := learn_duel_xp(case when w is null then 'draw' when w = d.a then 'win' else 'loss' end); end if;
  if d.b_scored and not d.forfeit then bx := learn_duel_xp(case when w is null then 'draw' when w = d.b then 'win' else 'loss' end); end if;
  if ax > 0 then perform learn_grant_xp(d.a, ax, 'duel-xp'); end if;
  if bx > 0 then perform learn_grant_xp(d.b, bx, 'duel-xp'); end if;
  wsc := case when w = d.a then d.a_scored when w = d.b then d.b_scored else false end;
  if w is not null and wsc and not learn_duel_ticket_used(w, learn_vn_day(coalesce(d.finished_at, now()))) then
    tk := true; perform learn_gacha_give(w, 1, 'duel:' || coalesce((select name from learn_users where id = l), 'opponent'));
    perform learn_add_bonus(w, 5); if l is not null then perform learn_add_bonus(l, 1); end if;
  end if;
  update learn_duels set a_xp = ax, b_xp = bx, ticket = tk, prize = tk, pick_wall = case when tk then null else pick_wall end where id = d.id;
  return jsonb_build_object('a_xp', ax, 'b_xp', bx, 'ticket', tk);
end $$;

create or replace function learn_duel_resolve() returns int language plpgsql security definer set search_path = public, extensions as $$
declare d learn_duels; n int := 0; aw jsonb;
begin
  update learn_duels set state = 'expired' where state = 'a_play' and expires_at < now();
  for d in select * from learn_duels where state = 'b_turn' and expires_at < now() order by expires_at for update skip locked loop
    update learn_duels set state = 'done', winner = d.a, forfeit = true, finished_at = d.expires_at,
      b_res = jsonb_build_object('score', 0, 'correct', 0, 'n', jsonb_array_length(d.questions), 'ms', 0, 'forfeit', true)
      where id = d.id;
    aw := learn_duel_finish(d.id);
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', true, 'forfeit', true, 'ticket', aw->'ticket', 'xp', aw->'a_xp'));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', false, 'forfeit', true));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function learn_duel_view(d learn_duels, uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'title', d.title, 'lang', d.lang, 'state', d.state, 'random', d.random, 'created_at', d.created_at, 'expires_at', d.expires_at, 'finished_at', d.finished_at,
    'role', case when d.a = uid then 'a' else 'b' end,
    'my_turn', (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn' and d.expires_at > now()),
    'me', case when d.a = uid then d.a_res - 'det' else d.b_res - 'det' end,
    'them', case when d.state = 'done' then (case when d.a = uid then d.b_res else d.a_res end) - 'det' when d.a = uid then null else d.a_res - 'det' end,
    'opp', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vipc(c_vpts, vip_bonus)) from learn_users where id = case when d.a = uid then d.b else d.a end),
    'winner', d.winner, 'won', d.winner = uid, 'pick_wall', d.pick_wall, 'prize_xp', d.prize_xp, 'prize', d.prize, 'forfeit', d.forfeit,
    'scored', case when d.a = uid then d.a_scored else d.b_scored end, 'xp', case when d.a = uid then d.a_xp else d.b_xp end,
    'ticket', d.ticket and d.winner = uid, 'can_pick', false, 'n', jsonb_array_length(d.questions),
    'passed_by', case when d.passed_from is not null then (select name from learn_users where id = d.passed_from) end, 'passed', d.passed_from is not null)
$$;

create or replace function learn_duel_counts(p_uid bigint) returns jsonb language sql stable as $$
  with t0 as (select (learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh') t)
  select jsonb_build_object(
    'sent', (select count(*) from learn_duels, t0 where a = p_uid and created_at >= t0.t),
    'sent_left', greatest(0, 10 - (select count(*) from learn_duels, t0 where a = p_uid and a_scored and created_at >= t0.t)),
    'recv_left', greatest(0, 10 - (select count(*) from learn_duels, t0 where b = p_uid and b_scored and created_at >= t0.t)),
    'ticket_today', learn_duel_ticket_used(p_uid, learn_vn_day()))
$$;

create or replace function learn_duel_create(p_token text, p_to bigint, p_lang text, p_title text, p_questions jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := p_to; q jsonb := learn_duel_clean(p_questions); d learn_duels; rnd boolean := p_to is null;
  t0 timestamptz := learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh'; myv int := learn_user_vip(uid); asc_ boolean; bsc boolean;
begin
  if jsonb_array_length(q) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  -- chống spam: tối đa 60 trận gửi đi mỗi ngày (chỉ 10 trận đầu được tính điểm)
  if (select count(*) from learn_duels where a = uid and created_at >= t0) >= 60 then return jsonb_build_object('ok', false, 'error', 'duel_today'); end if;
  if o is null then
    select x.id into o from learn_users x where x.id <> uid and not x.banned and x.last_seen > now() - interval '3 days'
      and not exists (select 1 from learn_duels d2 where d2.state in ('a_play', 'b_turn') and ((d2.a = uid and d2.b = x.id) or (d2.b = uid and d2.a = x.id)))
      order by abs(learn_vipc(x.c_vpts, x.vip_bonus) - myv), random() limit 1;
    if o is null then return jsonb_build_object('ok', false, 'error', 'noone'); end if;
  else
    if o = uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
    if not exists (select 1 from learn_users where id = o and not banned) then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
    if exists (select 1 from learn_duels where state in ('a_play', 'b_turn') and ((a = uid and b = o) or (b = uid and a = o))) then return jsonb_build_object('ok', false, 'error', 'duel_open'); end if;
  end if;
  asc_ := (select count(*) from learn_duels where a = uid and a_scored and created_at >= t0) < 10;
  bsc := (select count(*) from learn_duels where b = o and b_scored and created_at >= t0) < 10;
  insert into learn_duels(a, b, lang, title, questions, random, expires_at, a_scored, b_scored) values (uid, o, coalesce(nullif(p_lang, ''), 'en'), left(coalesce(nullif(btrim(p_title), ''), 'Duel'), 80), q, rnd, now() + interval '1 day', asc_, bsc) returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id, 'scored', asc_, 'opponent', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vipc(c_vpts, vip_bonus)) from learn_users where id = o),
    'questions', learn_duel_public(d.questions), 'counts', learn_duel_counts(uid));
end $$;

create or replace function learn_duel_submit(p_token text, p_id bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; r jsonb; w bigint; aw jsonb := '{}'::jsonb;
begin
  select * into d from learn_duels where id = p_id and (a = uid or b = uid) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'noduel'); end if;
  r := learn_duel_grade(d.questions, coalesce(p_answers, '[]'::jsonb));
  if d.a = uid and d.state = 'a_play' then
    update learn_duels set a_res = r, state = 'b_turn', expires_at = now() + interval '1 day' where id = d.id returning * into d;
    perform learn_notify(d.b, 'duel', uid, jsonb_build_object('duel', d.id, 'title', d.title, 'scored', d.b_scored));
  elsif d.b = uid and d.state = 'b_turn' and d.expires_at > now() then
    w := case when (r->>'score')::int > (d.a_res->>'score')::int then d.b when (r->>'score')::int < (d.a_res->>'score')::int then d.a
              when (r->>'ms')::int < (d.a_res->>'ms')::int then d.b when (r->>'ms')::int > (d.a_res->>'ms')::int then d.a end;
    update learn_duels set b_res = r, state = 'done', winner = w, finished_at = now() where id = d.id;
    aw := learn_duel_finish(d.id);
    select * into d from learn_duels where id = d.id;
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', w = d.a, 'draw', w is null, 'xp', d.a_xp, 'ticket', d.ticket and w = d.a, 'scored', d.a_scored));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', w = d.b, 'draw', w is null, 'xp', d.b_xp, 'ticket', d.ticket and w = d.b, 'scored', d.b_scored, 'silent', true));
  else
    return jsonb_build_object('ok', false, 'error', case when d.state = 'expired' or d.expires_at < now() then 'expired' else 'notyourturn' end);
  end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid), 'det', r->'det', 'questions', case when d.state = 'done' then d.questions end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

create or replace function learn_duel_get(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels;
begin
  perform learn_duel_resolve();
  select * into d from learn_duels where id = p_id and (a = uid or b = uid);
  if not found then return jsonb_build_object('ok', false, 'error', 'noduel'); end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid),
    'questions', case when (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn') then learn_duel_public(d.questions) when d.state = 'done' then d.questions end,
    'my_det', case when d.state = 'done' then case when d.a = uid then d.a_res->'det' else d.b_res->'det' end end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

create or replace function learn_duel_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid bigint := learn_uid(p_token); wk date := learn_week_of(now()); c jsonb;
begin
  perform learn_duel_resolve();
  c := learn_duel_counts(v_uid);
  return jsonb_build_object('ok', true,
    'items', coalesce((select jsonb_agg(learn_duel_view(d, v_uid) order by d.created_at desc) from (select * from learn_duels where a = v_uid or b = v_uid order by created_at desc limit 40) d), '[]'::jsonb),
    'today', c->'sent', 'per_day', 10, 'sent_left', c->'sent_left', 'recv_left', c->'recv_left', 'ticket_today', c->'ticket_today',
    'duel_today', false, 'prize_today', c->'ticket_today', 'pick_today', c->'ticket_today',
    'wins', (select count(*) from learn_duels where winner = v_uid), 'played', (select count(*) from learn_duels where (a = v_uid or b = v_uid) and state = 'done'),
    'week', (select jsonb_build_object('pts', b.pts, 'wins', b.wins, 'played', b.played) from learn_duel_board(wk) b where b.uid = v_uid),
    'week_end', wk + 7,
    'pool', (select count(*) from learn_users where id <> v_uid and not banned and last_seen > now() - interval '3 days'));
end $$;

-- ============ 7. bảng xếp hạng: dùng cột tính sẵn + Top collector ============
create or replace function learn_rank_refresh(p_lang text) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_lang not in ('en', 'zh', 'ielts') then return; end if;
  insert into learn_rank_meta(lang, refreshed_at) values (p_lang, now() - interval '1 hour') on conflict do nothing;
  if (select refreshed_at from learn_rank_meta where lang = p_lang) > now() - interval '30 seconds' then return; end if;
  update learn_rank_meta set refreshed_at = now() where lang = p_lang;
  insert into learn_rank_scores(user_id, lang, score, reached_at)
    select u.id, p_lang, case p_lang when 'en' then u.c_en when 'zh' then u.c_zh else u.c_ie end, now() from learn_users u
    where not u.banned and u.last_seen > now() - interval '120 days' and case p_lang when 'en' then u.c_en when 'zh' then u.c_zh else u.c_ie end > 0
    on conflict (user_id, lang) do update set score = excluded.score, reached_at = case when excluded.score <> learn_rank_scores.score then now() else learn_rank_scores.reached_at end
    where learn_rank_scores.score is distinct from excluded.score;
  update learn_rank_scores s set score = 0 from learn_users u where s.user_id = u.id and s.lang = p_lang and s.score > 0
    and case p_lang when 'en' then u.c_en when 'zh' then u.c_zh else u.c_ie end = 0;
end $$;

-- quà theo hạng của bảng học (mỗi hạng 1 lần / khoá, cần ≥ 24 sao) — từ v23 trao lúc chốt tuần (16:00 thứ Hai)
create or replace function learn_rank_award(p_uid bigint, p_lang text, k int, p_score int) returns void language plpgsql as $$
declare ws int[] := '{}'; w int; x int := 0;
begin
  if p_score < 24 or exists (select 1 from learn_rank_rewards where user_id = p_uid and lang = p_lang and rank = k) then return; end if;
  if k = 1 then
    w := learn_pick_wall(p_uid, 'rare'); if w is not null then perform learn_give_wall(p_uid, w, 'rank:' || p_lang || ' #1'); ws := ws || w; end if;
    w := learn_pick_wall(p_uid, null); if w is not null then perform learn_give_wall(p_uid, w, 'rank:' || p_lang || ' #1'); ws := ws || w; end if;
  elsif k = 2 then
    w := learn_pick_wall(p_uid, 'rare'); if w is not null then perform learn_give_wall(p_uid, w, 'rank:' || p_lang || ' #2'); ws := ws || w; end if;
  elsif k = 3 then
    w := learn_pick_wall(p_uid, null); if w is not null then perform learn_give_wall(p_uid, w, 'rank:' || p_lang || ' #3'); ws := ws || w; end if;
  else
    x := case k when 4 then 300 when 5 then 250 when 6 then 220 when 7 then 190 when 8 then 160 when 9 then 140 else 120 end;
  end if;
  if k <= 3 and coalesce(array_length(ws, 1), 0) = 0 then x := 500; end if;
  if x > 0 then perform learn_grant_xp(p_uid, x, 'rank-' || p_lang); end if;
  insert into learn_rank_rewards(user_id, lang, rank, walls, xp) values (p_uid, p_lang, k, ws, x) on conflict do nothing;
  perform learn_notify(p_uid, 'rank_reward', null, jsonb_build_object('board', p_lang, 'rank', k, 'walls', to_jsonb(ws), 'xp', x));
end $$;

-- top 10 của một bảng (dùng cho cả hiển thị và chốt tuần)
create or replace function learn_board_rows(p_board text, p_week date) returns table(uid bigint, score int, rk bigint, wins int, played int) language plpgsql stable as $$
begin
  if p_board = 'duel' then
    return query select b.uid, b.pts, row_number() over (order by b.pts desc, b.wins desc, b.last_at asc), b.wins, b.played from learn_duel_board(p_week) b where b.pts > 0;
  elsif p_board = 'col' then
    return query select w.user_id, w.n::int, row_number() over (order by w.n desc, w.last_at asc, w.user_id), null::int, null::int
      from (select lw.user_id, count(*) n, max(lw.created_at) last_at from learn_walls lw join learn_users u on u.id = lw.user_id where not u.banned group by lw.user_id) w;
  elsif p_board = 'bestie' then
    -- cặp Bestie (đang là Bestie) theo tổng sao Vượt ải; mỗi cặp ra 2 dòng (2 người cùng hạng)
    return query with pr as (select x.pair, sum(x.stars)::int sc, max(x.best_at) la from learn_adv_progress x group by x.pair having sum(x.stars) > 0),
      ok as (select pr.*, bb.a ua, bb.b ub from pr join learn_besties bb on bb.status = 'accepted' and learn_pair_key(bb.a, bb.b) = pr.pair),
      rk as (select ok.*, row_number() over (order by ok.sc desc, ok.la asc, ok.pair) r from ok)
      select rk.ua, rk.sc, rk.r, null::int, null::int from rk union all select rk.ub, rk.sc, rk.r, null::int, null::int from rk;
  else
    return query select s.user_id, s.score, row_number() over (order by s.score desc, s.reached_at asc, s.user_id), null::int, null::int
      from learn_rank_scores s join learn_users u on u.id = s.user_id where s.lang = p_board and s.score > 0 and not u.banned;
  end if;
end $$;

create or replace function learn_rank_board(p_token text, p_board text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid bigint := case when coalesce(p_token, '') = '' then null else learn_uid(p_token) end; items jsonb; me jsonb; wk date := learn_week_of(now());
begin
  if p_board not in ('en', 'zh', 'ielts', 'duel', 'col', 'bestie') then return jsonb_build_object('ok', false, 'error', 'board'); end if;
  perform learn_week_settle();
  if p_board = 'duel' then perform learn_duel_resolve();
  elsif p_board in ('en', 'zh', 'ielts') then perform learn_rank_refresh(p_board); end if;
  if p_board = 'bestie' then
    with o as (select * from learn_board_rows('bestie', wk)), g as (select o.rk, max(o.score) score, array_agg(o.uid order by o.uid) us from o group by o.rk)
    select coalesce(jsonb_agg(jsonb_build_object('rank', g.rk, 'score', g.score, 'pair', (select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', learn_vipc(u.c_vpts, u.vip_bonus)) order by u.id) from learn_users u where u.id = any(g.us)),
        'rel', case when v_uid = any(g.us) then 'me' else 'none' end) order by g.rk) filter (where g.rk <= 10), '[]'::jsonb),
      (select jsonb_build_object('rank', g2.rk, 'score', g2.score) from g g2 where v_uid = any(g2.us))
      into items, me from g;
    return jsonb_build_object('ok', true, 'board', p_board, 'items', items, 'me', me, 'week', wk, 'week_end', wk + 7, 'mine', '[]'::jsonb);
  end if;
  with o as (select * from learn_board_rows(p_board, wk))
  select coalesce(jsonb_agg(jsonb_build_object('rank', o.rk, 'uid', o.uid, 'score', o.score, 'wins', o.wins, 'played', o.played) order by o.rk) filter (where o.rk <= 10), '[]'::jsonb),
    (select jsonb_build_object('rank', o2.rk, 'score', o2.score, 'wins', o2.wins, 'played', o2.played) from o o2 where o2.uid = v_uid)
    into items, me from o;
  select coalesce(jsonb_agg(e || jsonb_build_object('name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', learn_vipc(u.c_vpts, u.vip_bonus),
      'rel', case when u.id = v_uid then 'me' when f.status = 'accepted' then 'friend' when f.status = 'pending' and f.requester = v_uid then 'sent' when f.status = 'pending' then 'incoming' else 'none' end) order by (e->>'rank')::int), '[]'::jsonb)
    into items
    from jsonb_array_elements(items) e join learn_users u on u.id = (e->>'uid')::bigint
    left join learn_friends f on v_uid is not null and f.a = least(v_uid, u.id) and f.b = greatest(v_uid, u.id);
  return jsonb_build_object('ok', true, 'board', p_board, 'items', items, 'me', me, 'week', wk, 'week_end', wk + 7,
    'mine', case when v_uid is null or p_board not in ('en', 'zh', 'ielts') then '[]'::jsonb else coalesce((select jsonb_agg(rank order by rank) from learn_rank_rewards where user_id = v_uid and lang = p_board), '[]'::jsonb) end);
end $$;

-- chốt tuần (16:00 thứ Hai): mọi bảng phát quà cùng lúc.
--   EN / 中文 / IELTS: quà theo hạng như cũ (mỗi hạng 1 lần / khoá) + 1 vé quay cho top 10
--   Duel (XP + hình hiếm như cũ, trong learn_duel_settle), Top collector, Bestie: 1 vé quay cho top 10
create table if not exists learn_week_tickets (week date not null, board text not null, settled_at timestamptz not null default now(), n int not null default 0, primary key (week, board));
alter table learn_week_tickets enable row level security;
create or replace function learn_week_boards() returns text[] language sql immutable as $$ select array['en', 'zh', 'ielts', 'duel', 'col', 'bestie'] $$;
create or replace function learn_week_settle() returns int language plpgsql security definer set search_path = public, extensions as $$
declare wk date := date '2026-10-26'; cur date := learn_week_of(now()); b text; r record; n int := 0; k int; ok int;
begin
  if exists (select 1 from learn_week_tickets where week = cur - 7 and board = 'bestie') then return 0; end if;
  perform learn_duel_settle();
  while wk < cur loop
    foreach b in array learn_week_boards() loop
      insert into learn_week_tickets(week, board) values (wk, b) on conflict do nothing;
      get diagnostics ok = row_count;
      if ok = 0 then continue; end if;
      if b in ('en', 'zh', 'ielts') then update learn_rank_meta set refreshed_at = now() - interval '1 hour' where lang = b; perform learn_rank_refresh(b); end if;
      k := 0;
      for r in select * from learn_board_rows(b, wk) x where x.rk <= 10 order by x.rk loop
        k := k + 1;
        if b in ('en', 'zh', 'ielts') then perform learn_rank_award(r.uid, b, r.rk::int, r.score); end if;
        perform learn_gacha_give(r.uid, 1, 'week:' || b || ':' || to_char(wk, 'DD/MM'));
        perform learn_notify(r.uid, 'rank_ticket', null, jsonb_build_object('board', b, 'week', wk, 'rank', r.rk));
      end loop;
      update learn_week_tickets set n = k where week = wk and board = b;
      n := n + k;
    end loop;
    wk := wk + 7;
  end loop;
  return n;
end $$;

create or replace function learn_tick(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); g jsonb;
begin
  perform learn_duel_resolve(); perform learn_week_settle();
  with c as (update learn_xp_grants set claimed_at = now() where user_id = uid and claimed_at is null returning xp, source)
  select coalesce(jsonb_agg(jsonb_build_object('xp', xp, 'source', source)), '[]'::jsonb) into g from c;
  return jsonb_build_object('ok', true, 'grants', g);
end $$;

-- chốt duel tuần (XP + 1 hình hiếm cho top 10, như cũ) — thoát nhanh khi tuần trước đã chốt
create or replace function learn_duel_settle() returns int language plpgsql security definer set search_path = public, extensions as $$
declare wk date := date '2026-10-19'; cur date := learn_week_of(now()); r record; k int; w int; x int; n int := 0;
begin
  if exists (select 1 from learn_duel_weeks where week = cur - 7) then return 0; end if;
  while wk < cur loop
    if not exists (select 1 from learn_duel_weeks where week = wk) then
      begin
        insert into learn_duel_weeks(week) values (wk);
      exception when unique_violation then wk := wk + 7; continue;
      end;
      k := 0;
      for r in select * from learn_duel_board(wk) b where b.pts > 0 order by b.pts desc, b.wins desc, b.last_at asc limit 10 loop
        k := k + 1;
        x := case k when 1 then 600 when 2 then 450 when 3 then 350 else 200 end;
        w := learn_pick_wall(r.uid, 'rare');
        if w is not null then perform learn_give_wall(r.uid, w, 'rank:Duel week ' || to_char(wk, 'DD/MM')); else x := x + 300; end if;
        perform learn_grant_xp(r.uid, x, 'duel-week');
        insert into learn_duel_week_rewards(week, user_id, rank, pts, wall, xp) values (wk, r.uid, k, r.pts, w, x) on conflict do nothing;
        perform learn_notify(r.uid, 'rank_reward', null, jsonb_build_object('board', 'duel', 'week', wk, 'rank', k, 'walls', case when w is null then '[]'::jsonb else jsonb_build_array(w) end, 'xp', x));
        n := n + 1;
      end loop;
    end if;
    wk := wk + 7;
  end loop;
  return n;
end $$;

-- ============ 8. nhóm bạn bè + quiz nhanh cho nhóm ============
create table if not exists learn_groups (id bigserial primary key, owner bigint not null references learn_users(id) on delete cascade, name text not null, created_at timestamptz not null default now());
create table if not exists learn_group_members (group_id bigint not null references learn_groups(id) on delete cascade, user_id bigint not null references learn_users(id) on delete cascade, added_at timestamptz not null default now(), primary key (group_id, user_id));
create index if not exists learn_group_members_user on learn_group_members(user_id);
alter table learn_groups enable row level security;
alter table learn_group_members enable row level security;

create or replace function learn_group_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'owner', g.owner, 'mine', g.owner = uid, 'created_at', g.created_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', learn_vipc(u.c_vpts, u.vip_bonus), 'last_seen', u.last_seen, 'owner', u.id = g.owner) order by u.id = g.owner desc, u.last_seen desc nulls last), '[]'::jsonb)
      from learn_group_members m join learn_users u on u.id = m.user_id where m.group_id = g.id)) order by g.created_at)
    from learn_groups g where exists (select 1 from learn_group_members m where m.group_id = g.id and m.user_id = uid)), '[]'::jsonb));
end $$;

-- tạo / sửa nhóm (chỉ chủ nhóm). Thành viên phải là bạn bè của chủ nhóm. Tối đa 30 người / nhóm, 20 nhóm / người.
create or replace function learn_group_save(p_token text, p_id bigint, p_name text, p_members bigint[]) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); gid bigint := p_id; nm text := left(btrim(coalesce(p_name, '')), 40); ms bigint[];
begin
  if char_length(nm) < 1 then return jsonb_build_object('ok', false, 'error', 'badname'); end if;
  select coalesce(array_agg(distinct m), '{}') into ms from unnest(coalesce(p_members, '{}')) m where m <> uid and learn_are_friends(uid, m);
  if array_length(ms, 1) > 29 then return jsonb_build_object('ok', false, 'error', 'toomany'); end if;
  if gid is null then
    if (select count(*) from learn_groups where owner = uid) >= 20 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
    insert into learn_groups(owner, name) values (uid, nm) returning id into gid;
    insert into learn_group_members(group_id, user_id) values (gid, uid);
  else
    if not exists (select 1 from learn_groups where id = gid and owner = uid) then return jsonb_build_object('ok', false, 'error', 'notowner'); end if;
    update learn_groups set name = nm where id = gid;
    delete from learn_group_members where group_id = gid and user_id <> uid and not (user_id = any(ms));
  end if;
  insert into learn_group_members(group_id, user_id) select gid, m from unnest(ms) m on conflict do nothing;
  return jsonb_build_object('ok', true, 'id', gid);
end $$;

create or replace function learn_group_leave(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  if exists (select 1 from learn_groups where id = p_id and owner = uid) then delete from learn_groups where id = p_id;
  else delete from learn_group_members where group_id = p_id and user_id = uid; end if;
  return jsonb_build_object('ok', true);
end $$;

-- quiz nhanh cho nhóm: tạo ván và gửi lời mời; máy của các thành viên tự vào phòng chờ
create or replace function learn_group_quiz(p_token text, p_id bigint, p_title text, p_questions jsonb, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); g learn_groups; j jsonb; n int := 0; m record;
begin
  select * into g from learn_groups where id = p_id;
  if not found or not exists (select 1 from learn_group_members where group_id = p_id and user_id = uid) then return jsonb_build_object('ok', false, 'error', 'notmember'); end if;
  j := learn_quiz_create(p_token, coalesce(nullif(btrim(p_title), ''), g.name || ' quiz'), p_questions, coalesce(p_settings, '{}'::jsonb) || jsonb_build_object('group', g.id, 'guests', false), null);
  if not (j->>'ok')::boolean then return j; end if;
  for m in select user_id from learn_group_members where group_id = p_id and user_id <> uid loop
    perform learn_notify(m.user_id, 'gquiz', uid, jsonb_build_object('pin', j->>'pin', 'title', left(coalesce(nullif(btrim(p_title), ''), g.name || ' quiz'), 80), 'group', g.id, 'gname', g.name, 'game', j->'id'));
    n := n + 1;
  end loop;
  return j || jsonb_build_object('invited', n);
end $$;

-- lời mời quiz nhóm đang chờ (≤ 15 phút, ván chưa kết thúc, mình chưa vào)
create or replace function learn_gquiz_pending(p_uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('nid', n.id, 'pin', n.payload->>'pin', 'title', n.payload->>'title', 'gname', n.payload->>'gname', 'host', u.name)
  from learn_notifs n left join learn_users u on u.id = n.actor
  join learn_quiz_games q on q.pin = n.payload->>'pin' and q.state <> 'ended' and q.id = (n.payload->>'game')::bigint
  where n.user_id = p_uid and n.kind = 'gquiz' and n.read_at is null and n.created_at > now() - interval '15 minutes'
    and not exists (select 1 from learn_quiz_players p where p.game_id = q.id and p.user_id = p_uid)
  order by n.created_at desc limit 1
$$;
-- hỏi nhanh (12 giây/lần, chỉ khi ở trong nhóm): có quiz nhóm nào đang chờ không
create or replace function learn_ping(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'gquiz', learn_gquiz_pending(uid), 'adv', learn_adv_pending(uid), 'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null));
end $$;

-- ============ 9. hồ sơ công khai (không có email / số điện thoại) ============
create or replace function learn_profile(p_token text, p_uid bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me bigint := learn_uid(p_token); u learn_users; f learn_friends; lv int := 1; need int := 60; left_ int; st jsonb;
begin
  select * into u from learn_users where id = p_uid and not banned;
  if not found then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
  left_ := u.c_xp;
  while left_ >= need and lv < 999 loop left_ := left_ - need; lv := lv + 1; need := 60 + (lv - 1) * 30; end loop;
  select * into f from learn_friends where a = least(me, p_uid) and b = greatest(me, p_uid);
  st := u.data->'streak';
  return jsonb_build_object('ok', true, 'uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'code', u.friend_code,
    'vip', learn_vipc(u.c_vpts, u.vip_bonus), 'vip_pts', u.c_vpts + least(greatest(u.vip_bonus, 0), 150),
    'level', lv, 'xp', u.c_xp, 'joined', u.created_at, 'last_seen', u.last_seen,
    'streak', case when st->>'last' >= to_char((now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 day', 'YYYY-MM-DD') then learn_num(st->'n') else 0 end,
    'sum', u.c_sum, 'stars', jsonb_build_object('en', u.c_en, 'zh', u.c_zh, 'ielts', u.c_ie),
    'course', u.data->>'lang', 'levels', case when jsonb_typeof(u.data->'level') = 'object' then u.data->'level' else '{}'::jsonb end,
    'badges', case when jsonb_typeof(u.data->'badges') = 'object' then (select count(*) from jsonb_object_keys(u.data->'badges')) else 0 end,
    'bosses', case when jsonb_typeof(u.data->'boss') = 'object' then (select count(*) from jsonb_object_keys(u.data->'boss')) else 0 end,
    'walls', coalesce((select jsonb_agg(wall order by created_at desc) from learn_walls where user_id = u.id), '[]'::jsonb),
    'duel', jsonb_build_object('wins', (select count(*) from learn_duels where winner = u.id), 'played', (select count(*) from learn_duels where (a = u.id or b = u.id) and state = 'done')),
    'friends', (select count(*) from learn_friends x where (x.a = u.id or x.b = u.id) and x.status = 'accepted'),
    'bestie', (select jsonb_build_object('uid', o.id, 'name', o.name, 'avatar', coalesce(o.avatar, '')) from learn_users o where o.id = learn_bestie_id(u.id)),
    'rel', case when me = u.id then 'me' when f.status = 'accepted' then 'friend' when f.status = 'pending' and f.requester = me then 'sent' when f.status = 'pending' then 'incoming' else 'none' end);
end $$;

-- ============ 10. learn_me / friends_list nhanh hơn + vé quay + quiz nhóm ============
-- số tin chưa đọc: đếm theo từng kênh của mình (dùng chỉ mục chan, id) thay vì quét cả bảng tin nhắn
create or replace function learn_msg_unread(p_uid bigint) returns int language sql stable as $$
  with ch as (
    select learn_dm_chan(p_uid, case when f.a = p_uid then f.b else f.a end) chan from learn_friends f where (f.a = p_uid or f.b = p_uid) and f.status = 'accepted'
    union all select 'room:' || room_id from learn_room_members where user_id = p_uid)
  select coalesce(sum((select count(*) from learn_msgs m where m.chan = ch.chan and m.id > coalesce(r.last_id, 0) and m.sender is distinct from p_uid and m.created_at > now() - interval '30 days')), 0)::int
  from ch left join learn_msg_reads r on r.user_id = p_uid and r.chan = ch.chan
$$;

create or replace function learn_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; pts int;
begin
  select * into u from learn_users where id = uid;
  pts := u.c_vpts + least(greatest(u.vip_bonus, 0), 150);
  perform learn_duel_resolve();
  perform learn_gacha_welcome(uid);
  return jsonb_build_object('ok', true, 'uid', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''),
    'vip', learn_vip_level(pts), 'vip_pts', pts, 'bonus', u.vip_bonus, 'penalty', u.vip_penalty,
    'requests', (select count(*) from learn_friends where (a = uid or b = uid) and status = 'pending' and requester <> uid),
    'rooms', (select count(*) from learn_room_members where user_id = uid),
    'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null),
    'duels', (select count(*) from learn_duels where b = uid and state = 'b_turn'),
    'msgs', learn_msg_unread(uid),
    'walls', (select count(*) from learn_walls where user_id = uid),
    'contact', exists (select 1 from learn_contacts where user_id = uid), 'must_pin', exists (select 1 from learn_pin_temp where user_id = uid),
    'tickets', learn_gacha_left(uid),
    'groups', (select count(*) from learn_group_members where user_id = uid),
    'gquiz', learn_gquiz_pending(uid),
    'bestie', learn_bestie_brief(uid), 'bestie_in', (select count(*) from learn_besties where (a = uid or b = uid) and status = 'pending' and requester <> uid),
    'adv', learn_adv_pending(uid),
    'revoke', (select jsonb_build_object('id', id, 'items', items, 'stars', stars, 'vip_before', vip_before, 'vip_after', vip_after, 'at', created_at) from learn_revokes where user_id = uid order by id desc limit 1));
end $$;

create or replace function learn_friends_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'status', f.status,
      'incoming', f.status = 'pending' and f.requester <> uid, 'since', f.created_at, 'last_seen', u.last_seen,
      'sum', case when f.status = 'accepted' then u.c_sum else null end,
      'vip', learn_vipc(u.c_vpts, u.vip_bonus),
      'walls', case when f.status = 'accepted' then (select count(*) from learn_walls w where w.user_id = u.id) end,
      'week_xp', case when f.status = 'accepted' then learn_week_xp_days(u.c_days) else null end)
      order by f.status desc, u.last_seen desc nulls last)
    from learn_friends f join learn_users u on u.id = case when f.a = uid then f.b else f.a end
    where f.a = uid or f.b = uid), '[]'::jsonb),
    'me', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'code', friend_code, 'sum', c_sum,
      'vip', learn_vipc(c_vpts, vip_bonus), 'walls', (select count(*) from learn_walls w where w.user_id = uid),
      'week_xp', learn_week_xp_days(c_days)) from learn_users where id = uid));
end $$;

drop trigger if exists learn_users_a_tout on learn_users;
drop function if exists learn_register2_fix();

-- ============ 11. quản trị: danh sách bị thu hồi + thống kê vé quay ============
create or replace function learn_admin_v23() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'revoked', coalesce((select jsonb_agg(jsonb_build_object('uid', r.user_id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'stars', r.stars, 'lessons', jsonb_array_length(r.items), 'reason', r.reason, 'vip_before', r.vip_before, 'vip_after', r.vip_after, 'pts_before', r.pts_before, 'pts_after', r.pts_after, 'at', r.created_at) order by r.created_at desc)
      from learn_revokes r join learn_users u on u.id = r.user_id), '[]'::jsonb),
    'gacha', jsonb_build_object('given', (select count(*) from learn_gacha), 'spun', (select count(*) from learn_gacha where spun_at is not null),
      'dups', (select count(*) from learn_gacha where dup), 'by_rarity', coalesce((select jsonb_object_agg(rarity, n) from (select rarity, count(*) n from learn_gacha where spun_at is not null group by rarity) x), '{}'::jsonb),
      'by_source', coalesce((select jsonb_object_agg(s, n) from (select split_part(source, ':', 1) s, count(*) n from learn_gacha group by 1) x), '{}'::jsonb)));
end $$;

-- ============ quyền ============
revoke all on learn_unit_words, learn_revokes, learn_gacha, learn_bonus_day, learn_week_tickets, learn_groups, learn_group_members from anon, authenticated;
revoke execute on function learn_tout_units(jsonb), learn_revoke_apply(bigint, jsonb), learn_revoke_stars(bigint, text, int, text), learn_week_start(date), learn_gacha_give(bigint, int, text), learn_gacha_left(bigint), learn_gacha_welcome(bigint), learn_slot_stars(jsonb, text),
  learn_add_bonus_cap(bigint, int, text, int), learn_duel_finish(bigint), learn_duel_counts(bigint), learn_duel_ticket_used(bigint, date), learn_board_rows(text, date), learn_week_settle(), learn_rank_award(bigint, text, int, int), learn_week_boards(),
  learn_gquiz_pending(bigint), learn_users_cache_trg() from anon, authenticated, public;
grant execute on function learn_gacha_state(text), learn_gacha_spin(text), learn_wall_claim(text, text, int), learn_walls_mine(text), learn_duel_create(text, bigint, text, text, jsonb),
  learn_duel_submit(text, bigint, jsonb), learn_duel_get(text, bigint), learn_duel_list(text), learn_rank_board(text, text), learn_tick(text), learn_group_list(text),
  learn_group_save(text, bigint, text, bigint[]), learn_group_leave(text, bigint), learn_group_quiz(text, bigint, text, jsonb, jsonb), learn_ping(text), learn_profile(text, bigint),
  learn_me(text), learn_friends_list(text), learn_save(text, text, jsonb) to anon, authenticated;
grant execute on function learn_admin_v23() to authenticated;
revoke execute on function learn_admin_v23() from anon, public;


-- ============ 13. BESTIE · Learn Together ============
-- Mỗi người có tối đa 1 Bestie (phải là bạn bè, gửi lời mời → người kia đồng ý).
-- • Tự chia sẻ bộ sưu tập hình nền cho nhau (dùng làm nền trang), mỗi người tắt được phần chia sẻ của mình.
-- • Học cùng: Bestie cũng học hôm nay → XP mỗi bài +10%. Bestie offline quá 3 ngày → XP mỗi bài −10% (tính ở máy người học).
-- • Bị thách đấu: chuyển trận cho Bestie đấu thay, tối đa 5 lượt / ngày.
-- • Hiệu ứng Bestie (vỗ tay, thả tim, …) + câu slogan: hiện khoảng 2 giây khi hai người cùng vào một quiz hoặc lớp học.
--   Hiệu ứng mới có trong rương quà (vòng quay, rương Vượt ải Bestie).
create table if not exists learn_besties (
  id bigserial primary key,
  a bigint not null references learn_users(id) on delete cascade,
  b bigint not null references learn_users(id) on delete cascade,
  requester bigint not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(), since timestamptz,
  a_share boolean not null default true, b_share boolean not null default true,
  a_fx text not null default 'highfive', b_fx text not null default 'highfive',
  a_slogan text not null default '', b_slogan text not null default '',
  check (a < b), unique (a, b));
create index if not exists learn_besties_b on learn_besties(b);
create table if not exists learn_bestie_passes (id bigserial primary key, from_uid bigint not null references learn_users(id) on delete cascade, to_uid bigint not null, duel_id bigint not null, created_at timestamptz not null default now());
create index if not exists learn_bestie_passes_from on learn_bestie_passes(from_uid, created_at);
create table if not exists learn_fx_catalog (id text primary key, name text not null, rarity text not null, free boolean not null default false, ord int not null default 0);
create table if not exists learn_fx_owned (user_id bigint not null references learn_users(id) on delete cascade, fx text not null references learn_fx_catalog(id), source text not null default '', created_at timestamptz not null default now(), primary key (user_id, fx));
alter table learn_besties enable row level security;
alter table learn_bestie_passes enable row level security;
alter table learn_fx_catalog enable row level security;
alter table learn_fx_owned enable row level security;
alter table learn_duels add column if not exists passed_from bigint;

insert into learn_fx_catalog(id, name, rarity, free, ord) values
  ('highfive', 'High five', 'common', true, 1), ('hearts', 'Floating hearts', 'common', true, 2),
  ('confetti', 'Confetti pop', 'common', false, 3), ('stars', 'Shooting stars', 'rare', false, 4), ('hug', 'Big hug', 'rare', false, 5),
  ('lantern', 'Lantern night', 'rare', false, 6), ('sakura', 'Sakura rain', 'epic', false, 7), ('fireworks', 'Fireworks', 'epic', false, 8),
  ('rainbow', 'Rainbow bridge', 'epic', false, 9), ('rocket', 'Rocket duo', 'legendary', false, 10), ('dragon', 'Twin dragons', 'legendary', false, 11),
  ('crown', 'Double crown', 'legendary', false, 12)
on conflict (id) do update set name = excluded.name, rarity = excluded.rarity, free = excluded.free, ord = excluded.ord;

create or replace function learn_bestie_row(p_uid bigint) returns learn_besties language sql stable as $$
  select * from learn_besties where (a = p_uid or b = p_uid) and status = 'accepted' limit 1
$$;
create or replace function learn_bestie_id(p_uid bigint) returns bigint language sql stable as $$
  select case when a = p_uid then b else a end from learn_besties where (a = p_uid or b = p_uid) and status = 'accepted' limit 1
$$;
create or replace function learn_today_vn() returns text language sql stable as $$ select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') $$;
-- học hôm nay = có XP trong ngày (theo lịch của máy người học; chấp nhận lệch múi giờ ±1 ngày)
create or replace function learn_studied_today(u learn_users) returns boolean language sql stable as $$
  select learn_num(u.c_days->learn_today_vn()) > 0
$$;
-- hệ số XP bài học: 1.1 khi Bestie cũng học hôm nay, 0.9 khi Bestie offline quá 3 ngày, còn lại 1.0
create or replace function learn_bestie_mult(p_uid bigint) returns numeric language plpgsql stable as $$
declare o bigint := learn_bestie_id(p_uid); u learn_users;
begin
  if o is null then return 1.0; end if;
  select * into u from learn_users where id = o;
  if u.last_seen is null or u.last_seen < now() - interval '3 days' then return 0.9; end if;
  if learn_studied_today(u) then return 1.1; end if;
  return 1.0;
end $$;
create or replace function learn_fx_has(p_uid bigint, p_fx text) returns boolean language sql stable as $$
  select exists (select 1 from learn_fx_catalog where id = p_fx and free) or exists (select 1 from learn_fx_owned where user_id = p_uid and fx = p_fx)
$$;
-- tặng 1 hiệu ứng chưa có (ưu tiên độ hiếm cho trước); trả về id hoặc null nếu đã có hết
create or replace function learn_fx_give(p_uid bigint, p_rarity text, p_source text) returns text language plpgsql as $$
declare f text;
begin
  select c.id into f from learn_fx_catalog c where not c.free and not exists (select 1 from learn_fx_owned o where o.user_id = p_uid and o.fx = c.id)
    order by case when p_rarity is null then 0 when c.rarity = p_rarity then 0 else 1 end, random() limit 1;
  if f is null then return null; end if;
  insert into learn_fx_owned(user_id, fx, source) values (p_uid, f, left(coalesce(p_source, ''), 80)) on conflict do nothing;
  return f;
end $$;

create or replace function learn_bestie_brief(p_uid bigint) returns jsonb language plpgsql stable as $$
declare r learn_besties; o learn_users; me_a boolean;
begin
  r := learn_bestie_row(p_uid);
  if r.id is null then return null; end if;
  me_a := r.a = p_uid;
  select * into o from learn_users where id = case when me_a then r.b else r.a end;
  return jsonb_build_object('id', r.id, 'uid', o.id, 'name', o.name, 'avatar', coalesce(o.avatar, ''), 'vip', learn_vipc(o.c_vpts, o.vip_bonus), 'since', r.since,
    'last_seen', o.last_seen, 'online', o.last_seen > now() - interval '5 minutes', 'studied_today', learn_studied_today(o),
    'offline_days', case when o.last_seen is null then 99 else floor(extract(epoch from now() - o.last_seen) / 86400)::int end,
    'mult', learn_bestie_mult(p_uid),
    'my_share', case when me_a then r.a_share else r.b_share end, 'their_share', case when me_a then r.b_share else r.a_share end,
    'my_fx', case when me_a then r.a_fx else r.b_fx end, 'their_fx', case when me_a then r.b_fx else r.a_fx end,
    'my_slogan', case when me_a then r.a_slogan else r.b_slogan end, 'their_slogan', case when me_a then r.b_slogan else r.a_slogan end);
end $$;

create or replace function learn_bestie_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); bb jsonb := learn_bestie_brief(uid); o bigint := (bb->>'uid')::bigint; t0 timestamptz := learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh';
begin
  return jsonb_build_object('ok', true, 'bestie', bb,
    'their_walls', case when o is not null and (bb->>'their_share')::boolean then coalesce((select jsonb_agg(wall order by wall) from learn_walls where user_id = o), '[]'::jsonb) else '[]'::jsonb end,
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', learn_vipc(u.c_vpts, u.vip_bonus), 'at', x.created_at))
      from learn_besties x join learn_users u on u.id = x.requester where (x.a = uid or x.b = uid) and x.status = 'pending' and x.requester <> uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'at', x.created_at))
      from learn_besties x join learn_users u on u.id = case when x.a = uid then x.b else x.a end where x.requester = uid and x.status = 'pending'), '[]'::jsonb),
    'passes_left', greatest(0, 5 - (select count(*) from learn_bestie_passes where from_uid = uid and created_at >= t0)),
    'fx', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'rarity', c.rarity, 'owned', c.free or o2.fx is not null) order by c.ord)
      from learn_fx_catalog c left join learn_fx_owned o2 on o2.user_id = uid and o2.fx = c.id), '[]'::jsonb),
    'friends', (select count(*) from learn_friends where (a = uid or b = uid) and status = 'accepted'));
end $$;

create or replace function learn_bestie_request(p_token text, p_uid bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); x bigint := least(uid, p_uid); y bigint := greatest(uid, p_uid); r learn_besties;
begin
  if p_uid = uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if not learn_are_friends(uid, p_uid) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
  if learn_bestie_id(uid) is not null then return jsonb_build_object('ok', false, 'error', 'youhave'); end if;
  if learn_bestie_id(p_uid) is not null then return jsonb_build_object('ok', false, 'error', 'theyhave'); end if;
  select * into r from learn_besties where a = x and b = y;
  if found then
    if r.requester <> uid then
      update learn_besties set status = 'accepted', since = now() where id = r.id;
      delete from learn_besties where status = 'pending' and (a in (uid, p_uid) or b in (uid, p_uid));
      perform learn_notify(p_uid, 'bestie_ok', uid, '{}'::jsonb);
      return jsonb_build_object('ok', true, 'accepted', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'pending');
  end if;
  if (select count(*) from learn_besties where requester = uid and status = 'pending') >= 5 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  insert into learn_besties(a, b, requester) values (x, y, uid);
  perform learn_notify(p_uid, 'bestie_req', uid, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'accepted', false);
end $$;

create or replace function learn_bestie_respond(p_token text, p_uid bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); r learn_besties;
begin
  select * into r from learn_besties where a = least(uid, p_uid) and b = greatest(uid, p_uid) and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'norequest'); end if;
  if not p_accept or r.requester = uid then delete from learn_besties where id = r.id; return jsonb_build_object('ok', true); end if;
  if learn_bestie_id(uid) is not null then return jsonb_build_object('ok', false, 'error', 'youhave'); end if;
  if learn_bestie_id(p_uid) is not null then delete from learn_besties where id = r.id; return jsonb_build_object('ok', false, 'error', 'theyhave'); end if;
  update learn_besties set status = 'accepted', since = now() where id = r.id;
  delete from learn_besties where status = 'pending' and (a in (uid, p_uid) or b in (uid, p_uid));
  update learn_notifs set read_at = now() where user_id = uid and actor = p_uid and kind = 'bestie_req' and read_at is null;
  perform learn_notify(p_uid, 'bestie_ok', uid, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'accepted', true);
end $$;

create or replace function learn_bestie_remove(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(uid);
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  delete from learn_besties where a = least(uid, o) and b = greatest(uid, o);
  update learn_adv_sessions set state = 'left', ended_at = now() where state in ('invite', 'play') and (host = uid or guest = uid);
  perform learn_notify(o, 'bestie_removed', uid, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function learn_bestie_set(p_token text, p_share boolean, p_fx text, p_slogan text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); r learn_besties := learn_bestie_row(uid); sl text := left(btrim(regexp_replace(coalesce(p_slogan, ''), '\s+', ' ', 'g')), 60);
begin
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if p_fx is not null and not learn_fx_has(uid, p_fx) then return jsonb_build_object('ok', false, 'error', 'notowned'); end if;
  if r.a = uid then
    update learn_besties set a_share = coalesce(p_share, a_share), a_fx = coalesce(p_fx, a_fx), a_slogan = coalesce(case when p_slogan is null then null else sl end, a_slogan) where id = r.id;
  else
    update learn_besties set b_share = coalesce(p_share, b_share), b_fx = coalesce(p_fx, b_fx), b_slogan = coalesce(case when p_slogan is null then null else sl end, b_slogan) where id = r.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- nhắc Bestie quay lại học (tối đa 1 lần / 6 giờ)
create or replace function learn_bestie_nudge(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(uid);
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if exists (select 1 from learn_notifs where user_id = o and actor = uid and kind = 'bestie_nudge' and created_at > now() - interval '6 hours') then return jsonb_build_object('ok', true, 'again', true); end if;
  perform learn_notify(o, 'bestie_nudge', uid, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- chuyển trận duel đang chờ mình cho Bestie đấu thay (tối đa 5 lượt / ngày)
create or replace function learn_bestie_pass(p_token text, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(uid); d learn_duels; t0 timestamptz := learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh'; bsc boolean;
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'nobestie'); end if;
  select * into d from learn_duels where id = p_duel for update;
  if not found or d.b <> uid or d.state <> 'b_turn' or d.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'notyours'); end if;
  if d.a = o then return jsonb_build_object('ok', false, 'error', 'fromthem'); end if;
  if d.passed_from is not null then return jsonb_build_object('ok', false, 'error', 'passed'); end if;
  if (select count(*) from learn_bestie_passes where from_uid = uid and created_at >= t0) >= 5 then return jsonb_build_object('ok', false, 'error', 'passlimit'); end if;
  if exists (select 1 from learn_duels where state in ('a_play', 'b_turn') and id <> d.id and ((a = d.a and b = o) or (a = o and b = d.a))) then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  bsc := (select count(*) from learn_duels where b = o and b_scored and created_at >= t0) < 10;
  update learn_duels set b = o, passed_from = uid, b_scored = bsc, expires_at = greatest(expires_at, now() + interval '12 hours') where id = d.id;
  insert into learn_bestie_passes(from_uid, to_uid, duel_id) values (uid, o, d.id);
  update learn_notifs set read_at = now() where user_id = uid and kind = 'duel' and (payload->>'duel')::bigint = d.id and read_at is null;
  perform learn_notify(o, 'duel', d.a, jsonb_build_object('duel', d.id, 'title', d.title, 'scored', bsc, 'passed_by', (select name from learn_users where id = uid)));
  perform learn_notify(d.a, 'duel_passed', uid, jsonb_build_object('duel', d.id, 'to', (select name from learn_users where id = o)));
  return jsonb_build_object('ok', true, 'left', greatest(0, 5 - (select count(*) from learn_bestie_passes where from_uid = uid and created_at >= t0)));
end $$;

-- Bestie có đang ở cùng quiz / lớp không (để hiện hiệu ứng ~2 giây)
create or replace function learn_bestie_here(p_token text, p_kind text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(uid); here boolean := false; g bigint;
begin
  if o is null then return jsonb_build_object('ok', true, 'here', false); end if;
  if p_kind = 'quiz' then
    select id into g from learn_quiz_games where pin = p_ref and state <> 'ended' order by id desc limit 1;
    here := g is not null and exists (select 1 from learn_quiz_players where game_id = g and user_id = o and not kicked)
      and exists (select 1 from learn_quiz_players where game_id = g and user_id = uid and not kicked);
  elsif p_kind = 'room' then
    here := exists (select 1 from learn_room_members where room_id = p_ref::bigint and user_id = o) and exists (select 1 from learn_room_members where room_id = p_ref::bigint and user_id = uid);
  end if;
  return jsonb_build_object('ok', true, 'here', here, 'bestie', case when here then learn_bestie_brief(uid) end);
exception when others then return jsonb_build_object('ok', true, 'here', false);
end $$;


-- ============ 14. VƯỢT ẢI BESTIE (2 người cùng online) ============
-- 2 bản đồ: English (7 vùng: A1 → C1) và 中文 (6 vùng: HSK1 → HSK6). Mỗi vùng 5 boss + 1 vua vùng (chấm đỏ).
-- Vùng 1 mở sẵn; vùng sau mở khi hạ vua vùng trước; vua vùng mở khi hạ ≥ 3 boss trong vùng.
-- Một trận: người mở mời Bestie (đang online) → Bestie nhận trong 90 giây → các vòng câu hỏi phối hợp:
--   twin  (Đồng tâm)  : cùng một câu, cả hai đúng mới gây đủ sát thương; trả lời cách nhau ≤ 3 giây = "ăn ý" ×1.25
--   split (Mảnh ghép) : một người thấy câu hỏi, người kia thấy đáp án; nhắn cho nhau để chọn đúng
--   relay (Tiếp sức)  : mỗi người giữ một nửa số mảnh của câu, lần lượt đặt đúng thứ tự
--   link  (Nối đôi)   : một người thấy từ, người kia thấy nghĩa; chọn cùng lúc (≤ 5 giây) để nối
-- Boss 100 máu, đội 3 tim. Thắng → rương: XP theo vùng × sao, hiệu ứng Bestie, vé quay (vua vùng lần đầu).
create table if not exists learn_adv_sessions (
  id bigserial primary key,
  pair text not null, map text not null check (map in ('en', 'zh')), boss text not null,
  host bigint not null references learn_users(id) on delete cascade, guest bigint not null references learn_users(id) on delete cascade,
  state text not null default 'invite' check (state in ('invite', 'play', 'won', 'lost', 'left', 'expired', 'declined')),
  rounds jsonb not null, ridx int not null default -1, r_start timestamptz, r_live jsonb not null default '{}'::jsonb,
  hp int not null default 100, hearts int not null default 3, log jsonb not null default '[]'::jsonb, chat jsonb not null default '[]'::jsonb,
  h_seen timestamptz, g_seen timestamptz, reward jsonb,
  created_at timestamptz not null default now(), ended_at timestamptz);
create index if not exists learn_adv_sessions_pair on learn_adv_sessions(pair, created_at desc);
create index if not exists learn_adv_sessions_open on learn_adv_sessions(guest) where state in ('invite', 'play');
create table if not exists learn_adv_progress (pair text not null, map text not null, boss text not null, stars int not null default 0, wins int not null default 0,
  first_at timestamptz not null default now(), best_at timestamptz not null default now(), primary key (pair, map, boss));
alter table learn_adv_sessions enable row level security;
alter table learn_adv_progress enable row level security;

create or replace function learn_pair_key(x bigint, y bigint) returns text language sql immutable as $$ select least(x, y) || '-' || greatest(x, y) $$;
create or replace function learn_adv_regions(p_map text) returns int language sql immutable as $$ select case p_map when 'en' then 7 when 'zh' then 6 else 0 end $$;
-- boss id: '<map>-<vùng>-<số>' (số 6 = vua vùng)
create or replace function learn_adv_parse(p_boss text, out map text, out region int, out n int) language plpgsql immutable as $$
declare p text[] := string_to_array(coalesce(p_boss, ''), '-');
begin
  map := p[1]; region := p[2]::int; n := p[3]::int;
  if map not in ('en', 'zh') or region < 1 or region > learn_adv_regions(map) or n < 1 or n > 6 then map := null; end if;
exception when others then map := null;
end $$;
create or replace function learn_adv_open(p_pair text, p_boss text) returns boolean language plpgsql stable as $$
declare b record; beaten int;
begin
  select * into b from learn_adv_parse(p_boss);
  if b.map is null then return false; end if;
  if b.region > 1 and not exists (select 1 from learn_adv_progress where pair = p_pair and map = b.map and boss = b.map || '-' || (b.region - 1) || '-6' and stars > 0) then return false; end if;
  if b.n = 6 then
    select count(*) into beaten from learn_adv_progress where pair = p_pair and map = b.map and boss like b.map || '-' || b.region || '-%' and boss <> b.map || '-' || b.region || '-6' and stars > 0;
    return beaten >= 3;
  end if;
  return true;
end $$;
create or replace function learn_adv_secs(p_type text) returns int language sql immutable as $$
  select case p_type when 'twin' then 20 when 'split' then 35 when 'relay' then 45 when 'link' then 45 else 30 end
$$;

-- đề do máy người mời tạo từ kho bài học; máy chủ làm sạch và giữ đáp án
create or replace function learn_adv_clean(p jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; e jsonb; t text; k int := 0; n int;
begin
  if jsonb_typeof(p) is distinct from 'array' then return out; end if;
  for e in select value from jsonb_array_elements(p) limit 12 loop
    t := e->>'type';
    if t in ('twin', 'split') then
      if jsonb_typeof(e->'opts') is distinct from 'array' then continue; end if;
      n := jsonb_array_length(e->'opts'); if n < 2 or n > 4 then continue; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'q', left(coalesce(e->>'q', ''), 300), 'opts', (select jsonb_agg(left(v, 120)) from jsonb_array_elements_text(e->'opts') v),
        'a', least(greatest(coalesce((e->>'a')::int, 0), 0), n - 1), 'note', left(coalesce(e->>'note', ''), 80), 'zh', coalesce((e->>'zh')::boolean, false), 'clue', case when k % 2 = 0 then 'h' else 'g' end));
    elsif t = 'relay' then
      if jsonb_typeof(e->'tk') is distinct from 'array' then continue; end if;
      n := jsonb_array_length(e->'tk'); if n < 3 or n > 14 then continue; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'vi', left(coalesce(e->>'vi', ''), 300), 'tk', (select jsonb_agg(left(v, 40)) from jsonb_array_elements_text(e->'tk') v),
        'own', (select jsonb_agg(case when (i + k) % 2 = 0 then 'h' else 'g' end order by i) from generate_series(0, n - 1) i), 'zh', coalesce((e->>'zh')::boolean, false)));
    elsif t = 'link' then
      if jsonb_typeof(e->'words') is distinct from 'array' or jsonb_typeof(e->'means') is distinct from 'array' or jsonb_typeof(e->'a') is distinct from 'array' then continue; end if;
      n := jsonb_array_length(e->'words'); if n < 3 or n > 6 or jsonb_array_length(e->'means') <> n or jsonb_array_length(e->'a') <> n then continue; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'words', (select jsonb_agg(left(v, 60)) from jsonb_array_elements_text(e->'words') v),
        'means', (select jsonb_agg(left(v, 80)) from jsonb_array_elements_text(e->'means') v), 'a', e->'a', 'side', case when k % 2 = 0 then 'h' else 'g' end, 'zh', coalesce((e->>'zh')::boolean, false)));
    else continue; end if;
    k := k + 1;
  end loop;
  return out;
end $$;

-- bản đồ của cặp: tiến độ, vùng đã mở, lời mời / trận đang mở, xếp hạng của cặp
create or replace function learn_adv_map(p_token text, p_map text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(v_uid); pk text; s learn_adv_sessions; rk jsonb;
begin
  if o is null then return jsonb_build_object('ok', true, 'nobestie', true, 'friends', (select count(*) from learn_friends where (a = v_uid or b = v_uid) and status = 'accepted')); end if;
  pk := learn_pair_key(v_uid, o);
  update learn_adv_sessions set state = 'expired', ended_at = now() where pair = pk and state = 'invite' and created_at < now() - interval '90 seconds';
  -- trận bị bỏ dở (một người không còn mở quá 30 giây) → đóng lại
  update learn_adv_sessions set state = 'left', ended_at = now() where pair = pk and state = 'play' and (h_seen < now() - interval '30 seconds' or g_seen < now() - interval '30 seconds');
  select * into s from learn_adv_sessions where pair = pk and state in ('invite', 'play') order by id desc limit 1;
  select jsonb_build_object('rank', x.rk, 'score', x.score) into rk from learn_board_rows('bestie', learn_week_of(now())) x where x.uid = v_uid;
  return jsonb_build_object('ok', true, 'bestie', learn_bestie_brief(v_uid), 'pair', pk,
    'progress', coalesce((select jsonb_object_agg(boss, jsonb_build_object('stars', stars, 'wins', wins)) from learn_adv_progress where pair = pk and map = p_map), '{}'::jsonb),
    'total', (select coalesce(sum(stars), 0) from learn_adv_progress where pair = pk), 'rank', rk,
    'open', case when s.id is not null then jsonb_build_object('id', s.id, 'state', s.state, 'boss', s.boss, 'map', s.map, 'host', s.host, 'mine', s.host = v_uid) end,
    'today_wins', (select count(*) from learn_adv_sessions where pair = pk and state = 'won' and ended_at >= learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh'));
end $$;

create or replace function learn_adv_start(p_token text, p_boss text, p_rounds jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(uid); pk text; b record; rs jsonb := learn_adv_clean(p_rounds); s learn_adv_sessions; ou learn_users;
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'nobestie'); end if;
  pk := learn_pair_key(uid, o);
  select * into b from learn_adv_parse(p_boss);
  if b.map is null then return jsonb_build_object('ok', false, 'error', 'noboss'); end if;
  if not learn_adv_open(pk, p_boss) then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if jsonb_array_length(rs) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  select * into ou from learn_users where id = o;
  if ou.last_seen is null or ou.last_seen < now() - interval '5 minutes' then return jsonb_build_object('ok', false, 'error', 'offline'); end if;
  update learn_adv_sessions set state = 'expired', ended_at = now() where pair = pk and state in ('invite', 'play');
  insert into learn_adv_sessions(pair, map, boss, host, guest, rounds, h_seen) values (pk, b.map, p_boss, uid, o, rs, now()) returning * into s;
  perform learn_notify(o, 'adv_invite', uid, jsonb_build_object('id', s.id, 'boss', p_boss, 'map', b.map));
  return jsonb_build_object('ok', true, 'id', s.id);
end $$;

create or replace function learn_adv_join(p_token text, p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); s learn_adv_sessions;
begin
  select * into s from learn_adv_sessions where id = p_id for update;
  if not found or s.guest <> uid then return jsonb_build_object('ok', false, 'error', 'nosession'); end if;
  update learn_notifs set read_at = now() where user_id = uid and kind = 'adv_invite' and (payload->>'id')::bigint = p_id and read_at is null;
  if s.state <> 'invite' or s.created_at < now() - interval '90 seconds' then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if not p_accept then update learn_adv_sessions set state = 'declined', ended_at = now() where id = s.id; return jsonb_build_object('ok', true); end if;
  update learn_adv_sessions set state = 'play', ridx = 0, r_start = now() + interval '4 seconds', r_live = '{}'::jsonb, g_seen = now(), h_seen = coalesce(h_seen, now()) where id = s.id;
  return jsonb_build_object('ok', true, 'id', s.id);
end $$;

-- chấm vòng hiện tại, chuyển vòng / kết thúc trận, trao thưởng (gọi trong khoá dòng)
create or replace function learn_adv_step(p_id bigint, p_force boolean) returns void language plpgsql as $$
declare s learn_adv_sessions; r jsonb; t text; lv jsonb; n int; fdmg numeric; dmg numeric := 0; lost int := 0; okh boolean; okg boolean; th bigint; tg bigint; note text := '';
  ln int; done boolean := false; reg int; b record; v_stars int; xp int; fh text; fg text; tk boolean := false; isking boolean; first boolean; wins_today int;
begin
  select * into s from learn_adv_sessions where id = p_id for update;
  if s.state <> 'play' or s.ridx < 0 then return; end if;
  -- một người rời trận quá 30 giây → kết thúc
  if s.h_seen < now() - interval '30 seconds' or s.g_seen < now() - interval '30 seconds' then
    update learn_adv_sessions set state = 'left', ended_at = now() where id = s.id; return;
  end if;
  if now() < s.r_start then return; end if;
  r := s.rounds->s.ridx; t := r->>'type'; lv := s.r_live; n := jsonb_array_length(s.rounds);
  fdmg := ceil(120.0 / n);
  if t = 'twin' then
    done := (lv ? 'h' and lv ? 'g');
  elsif t = 'split' then done := lv ? 'c';
  elsif t = 'relay' then done := jsonb_array_length(coalesce(lv->'line', '[]'::jsonb)) >= jsonb_array_length(r->'tk');
  elsif t = 'link' then done := jsonb_array_length(coalesce(lv->'ok', '[]'::jsonb)) >= jsonb_array_length(r->'words');
  end if;
  if not done and not p_force and now() < s.r_start + make_interval(secs => learn_adv_secs(t)) then return; end if;
  -- chấm
  if t = 'twin' then
    okh := (lv->'h'->>'c')::int = (r->>'a')::int; okg := (lv->'g'->>'c')::int = (r->>'a')::int;
    okh := coalesce(okh, false); okg := coalesce(okg, false);
    if okh and okg then
      th := (lv->'h'->>'t')::bigint; tg := (lv->'g'->>'t')::bigint;
      if abs(th - tg) <= 3000 then dmg := fdmg * 1.25; note := 'sync'; else dmg := fdmg; note := 'both'; end if;
    elsif okh or okg then dmg := fdmg * 0.5; note := 'one';
    else lost := 1; note := 'miss'; end if;
  elsif t = 'split' then
    if (lv->>'c')::int = (r->>'a')::int then dmg := fdmg; note := 'ok'; else lost := 1; note := 'miss'; end if;
  elsif t = 'relay' then
    ln := jsonb_array_length(coalesce(lv->'line', '[]'::jsonb));
    if ln >= jsonb_array_length(r->'tk') then dmg := fdmg * greatest(0.5, 1 - 0.1 * coalesce((lv->>'miss')::int, 0)); note := 'ok';
    else dmg := fdmg * 0.5 * ln / jsonb_array_length(r->'tk'); lost := 1; note := 'time'; end if;
  elsif t = 'link' then
    ln := jsonb_array_length(coalesce(lv->'ok', '[]'::jsonb));
    dmg := fdmg * ln / jsonb_array_length(r->'words') * case when coalesce((lv->>'bad')::int, 0) <= 1 then 1 else 0.85 end;
    if ln < 3 then lost := 1; note := 'weak'; else note := 'ok'; end if;
  end if;
  s.hp := greatest(0, s.hp - round(dmg)::int); s.hearts := greatest(0, s.hearts - lost);
  s.log := s.log || jsonb_build_array(jsonb_build_object('r', s.ridx, 'type', t, 'dmg', round(dmg)::int, 'lost', lost, 'note', note, 'live', lv));
  if s.hp <= 0 then
    s.state := 'won';
  elsif s.hearts <= 0 or s.ridx + 1 >= n then
    s.state := 'lost';
  end if;
  if s.state = 'play' then
    update learn_adv_sessions set hp = s.hp, hearts = s.hearts, log = s.log, ridx = s.ridx + 1, r_start = now() + interval '3 seconds', r_live = '{}'::jsonb where id = s.id;
    return;
  end if;
  update learn_adv_sessions set hp = s.hp, hearts = s.hearts, log = s.log, state = s.state, ended_at = now() where id = s.id;
  if s.state <> 'won' then return; end if;
  -- thưởng
  select * into b from learn_adv_parse(s.boss);
  reg := b.region; isking := b.n = 6; v_stars := greatest(1, s.hearts);
  first := not exists (select 1 from learn_adv_progress where pair = s.pair and map = s.map and boss = s.boss and stars > 0);
  insert into learn_adv_progress(pair, map, boss, stars, wins) values (s.pair, s.map, s.boss, v_stars, 1)
    on conflict (pair, map, boss) do update set stars = greatest(learn_adv_progress.stars, excluded.stars), wins = learn_adv_progress.wins + 1,
      best_at = case when excluded.stars > learn_adv_progress.stars then now() else learn_adv_progress.best_at end;
  select count(*) into wins_today from learn_adv_sessions where pair = s.pair and state = 'won' and ended_at >= learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh';
  xp := case when wins_today <= 10 then round((8 + 4 * reg) * v_stars * case when isking then 1.5 else 1 end)::int else 0 end;
  if xp > 0 then perform learn_grant_xp(s.host, xp, 'adv'); perform learn_grant_xp(s.guest, xp, 'adv'); end if;
  if isking or (v_stars = 3 and random() < 0.2) or (first and random() < 0.35) then
    fh := learn_fx_give(s.host, case when isking and reg >= 5 then 'legendary' when isking and reg >= 3 then 'epic' when isking then 'rare' else null end, 'adv:' || s.boss);
    fg := learn_fx_give(s.guest, case when isking and reg >= 5 then 'legendary' when isking and reg >= 3 then 'epic' when isking then 'rare' else null end, 'adv:' || s.boss);
  end if;
  if isking and first then tk := true; perform learn_gacha_give(s.host, 1, 'adv:' || s.boss); perform learn_gacha_give(s.guest, 1, 'adv:' || s.boss); end if;
  update learn_adv_sessions set reward = jsonb_build_object('stars', v_stars, 'xp', xp, 'fx_h', fh, 'fx_g', fg, 'ticket', tk, 'first', first, 'king', isking) where id = s.id;
end $$;

-- trạng thái cho từng người (chỉ thấy phần của mình): gọi ~0,7 giây / lần trong trận
create or replace function learn_adv_view(s learn_adv_sessions, me text) returns jsonb language plpgsql stable as $$
declare r jsonb; t text; v jsonb; lv jsonb := s.r_live;
begin
  if s.ridx >= 0 and s.ridx < jsonb_array_length(s.rounds) then
    r := s.rounds->s.ridx; t := r->>'type';
    v := jsonb_build_object('type', t, 'secs', learn_adv_secs(t), 'zh', r->'zh');
    if t = 'twin' then v := v || jsonb_build_object('q', r->'q', 'opts', r->'opts', 'note', r->'note', 'mine', lv->me->'c', 'other_done', lv ? case when me = 'h' then 'g' else 'h' end);
    elsif t = 'split' then
      v := v || jsonb_build_object('role', case when r->>'clue' = me then 'clue' else 'pick' end, 'note', r->'note', 'n', jsonb_array_length(r->'opts'));
      if r->>'clue' = me then v := v || jsonb_build_object('q', r->'q'); else v := v || jsonb_build_object('opts', r->'opts', 'picked', lv->'c'); end if;
    elsif t = 'relay' then
      v := v || jsonb_build_object('vi', r->'vi', 'n', jsonb_array_length(r->'tk'), 'line', coalesce(lv->'line', '[]'::jsonb),
        'line_t', (select coalesce(jsonb_agg(r->'tk'->(x::int) order by o), '[]'::jsonb) from jsonb_array_elements_text(coalesce(lv->'line', '[]'::jsonb)) with ordinality q(x, o)),
        'mine', (select jsonb_agg(jsonb_build_object('i', i, 't', r->'tk'->i) order by md5(s.id || '-' || i)) from generate_series(0, jsonb_array_length(r->'tk') - 1) i where r->'own'->>i = me),
        'theirs', (select count(*) from generate_series(0, jsonb_array_length(r->'tk') - 1) i where r->'own'->>i <> me), 'miss', coalesce(lv->'miss', '0'::jsonb));
    elsif t = 'link' then
      v := v || jsonb_build_object('role', case when r->>'side' = me then 'words' else 'means' end,
        'items', case when r->>'side' = me then r->'words' else r->'means' end, 'n', jsonb_array_length(r->'words'),
        'ok', coalesce(lv->'ok', '[]'::jsonb), 'okm', (select coalesce(jsonb_agg(r->'a'->(x::int)), '[]'::jsonb) from jsonb_array_elements_text(coalesce(lv->'ok', '[]'::jsonb)) x),
        'my_pick', lv->'p'->me, 'their_pick', (lv->'p'->(case when me = 'h' then 'g' else 'h' end)) is not null, 'bad', coalesce(lv->'bad', '0'::jsonb), 'last', lv->'last');
    end if;
  end if;
  return jsonb_build_object('id', s.id, 'state', s.state, 'boss', s.boss, 'map', s.map, 'role', me, 'ridx', s.ridx, 'n', jsonb_array_length(s.rounds),
    'hp', s.hp, 'hearts', s.hearts, 'starts_in_ms', case when s.r_start is not null then (extract(epoch from s.r_start - now()) * 1000)::int end,
    'round', v, 'last', s.log->-1, 'chat', s.chat, 'reward', s.reward,
    'other_seen_ms', (extract(epoch from now() - case when me = 'h' then s.g_seen else s.h_seen end) * 1000)::int,
    'host', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, '')) from learn_users where id = s.host),
    'guest', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, '')) from learn_users where id = s.guest),
    'answers', case when s.state in ('won', 'lost', 'left') then s.rounds end);
end $$;

create or replace function learn_adv_state(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); s learn_adv_sessions; me text;
begin
  select * into s from learn_adv_sessions where id = p_id;
  if not found or (s.host <> uid and s.guest <> uid) then return jsonb_build_object('ok', false, 'error', 'nosession'); end if;
  me := case when s.host = uid then 'h' else 'g' end;
  if s.state = 'invite' and s.created_at < now() - interval '90 seconds' then update learn_adv_sessions set state = 'expired', ended_at = now() where id = s.id; end if;
  if me = 'h' then update learn_adv_sessions set h_seen = now() where id = s.id; else update learn_adv_sessions set g_seen = now() where id = s.id; end if;
  if s.state = 'play' then perform learn_adv_step(s.id, false); end if;
  select * into s from learn_adv_sessions where id = p_id;
  return jsonb_build_object('ok', true, 's', learn_adv_view(s, me));
end $$;

create or replace function learn_adv_act(p_token text, p_id bigint, p_act jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); s learn_adv_sessions; me text; ot text; r jsonb; t text; lv jsonb; a text := p_act->>'t'; i int; line jsonb; nm text; p jsonb; q jsonb; ms bigint;
begin
  select * into s from learn_adv_sessions where id = p_id for update;
  if not found or (s.host <> uid and s.guest <> uid) then return jsonb_build_object('ok', false, 'error', 'nosession'); end if;
  me := case when s.host = uid then 'h' else 'g' end; ot := case when me = 'h' then 'g' else 'h' end;
  if a = 'chat' then
    select name into nm from learn_users where id = uid;
    update learn_adv_sessions set chat = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(s.chat || jsonb_build_array(jsonb_build_object('from', me, 'name', nm, 'm', left(btrim(coalesce(p_act->>'m', '')), 140), 'at', now()))) x offset greatest(0, jsonb_array_length(s.chat) + 1 - 30)) y) where id = s.id;
    return jsonb_build_object('ok', true);
  elsif a = 'leave' then
    if s.state in ('invite', 'play') then update learn_adv_sessions set state = 'left', ended_at = now() where id = s.id; end if;
    return jsonb_build_object('ok', true);
  end if;
  if s.state <> 'play' or now() < s.r_start then return jsonb_build_object('ok', false, 'error', 'notnow'); end if;
  r := s.rounds->s.ridx; t := r->>'type'; lv := s.r_live; ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if t = 'twin' and a = 'ans' then
    if lv ? me then return jsonb_build_object('ok', false, 'error', 'answered'); end if;
    lv := lv || jsonb_build_object(me, jsonb_build_object('c', (p_act->>'c')::int, 't', ms));
  elsif t = 'split' and a = 'ans' then
    if r->>'clue' = me or lv ? 'c' then return jsonb_build_object('ok', false, 'error', 'notyou'); end if;
    lv := lv || jsonb_build_object('c', (p_act->>'c')::int);
  elsif t = 'relay' and a = 'tile' then
    i := (p_act->>'i')::int; line := coalesce(lv->'line', '[]'::jsonb);
    if i is null or i < 0 or i >= jsonb_array_length(r->'tk') or r->'own'->>i <> me or line @> to_jsonb(i) then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    if r->'tk'->>i = r->'tk'->>jsonb_array_length(line) then lv := lv || jsonb_build_object('line', line || to_jsonb(i));
    else lv := lv || jsonb_build_object('miss', coalesce((lv->>'miss')::int, 0) + 1, 'wrong', jsonb_build_object('by', me, 'i', i, 'at', ms)); end if;
  elsif t = 'link' and a = 'pick' then
    i := (p_act->>'i')::int;
    if i is null or i < 0 or i >= jsonb_array_length(r->'words') then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    p := coalesce(lv->'p', '{}'::jsonb) || jsonb_build_object(me, jsonb_build_object('i', i, 't', ms));
    q := p->ot;
    if q is not null and abs((q->>'t')::bigint - ms) <= 5000 then
      -- người giữ "từ" là side; nghĩa đúng của từ wi là a[wi]
      declare wi int := case when r->>'side' = me then i else (q->>'i')::int end; mi int := case when r->>'side' = me then (q->>'i')::int else i end;
      begin
        if (r->'a'->>wi)::int = mi and not coalesce(lv->'ok', '[]'::jsonb) @> to_jsonb(wi) then
          lv := lv || jsonb_build_object('ok', coalesce(lv->'ok', '[]'::jsonb) || to_jsonb(wi), 'last', jsonb_build_object('ok', true, 'w', wi, 'm', mi, 'at', ms));
        else lv := lv || jsonb_build_object('bad', coalesce((lv->>'bad')::int, 0) + 1, 'last', jsonb_build_object('ok', false, 'w', wi, 'm', mi, 'at', ms)); end if;
      end;
      p := '{}'::jsonb;
    end if;
    lv := lv || jsonb_build_object('p', p);
  else
    return jsonb_build_object('ok', false, 'error', 'bad');
  end if;
  update learn_adv_sessions set r_live = lv where id = s.id;
  perform learn_adv_step(s.id, false);
  return jsonb_build_object('ok', true);
end $$;

-- lời mời vượt ải đang chờ mình (≤ 90 giây)
create or replace function learn_adv_pending(p_uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('id', s.id, 'boss', s.boss, 'map', s.map, 'host', u.name, 'host_avatar', coalesce(u.avatar, ''))
  from learn_adv_sessions s join learn_users u on u.id = s.host
  where s.guest = p_uid and s.state = 'invite' and s.created_at > now() - interval '90 seconds' order by s.id desc limit 1
$$;


-- ============ 15. đồng bộ nhiều máy: GỘP dữ liệu học thay vì ghi đè ============
-- Trước đây mỗi lần lưu, máy nào gửi lên cũng ghi đè cả khối dữ liệu → điện thoại còn bản cũ có thể xoá tiến độ vừa học trên máy tính.
-- Nay máy chủ gộp: bài đã học / sao / rương / hình / huy hiệu lấy phần lớn hơn hoặc hợp lại; XP cộng phần XP theo ngày mà máy kia chưa có;
-- cài đặt (khoá học đang chọn, nền, …) theo bản sửa sau cùng. learn_save2 trả lại bản đã gộp để máy cập nhật.
create or replace function learn_jmax(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(a) = 'number' and jsonb_typeof(b) = 'number' then case when a::numeric >= b::numeric then a else b end
    when jsonb_typeof(a) = 'number' and jsonb_typeof(b) is distinct from 'number' then a
    when jsonb_typeof(b) = 'number' and jsonb_typeof(a) is distinct from 'number' then b
    when jsonb_typeof(a) = 'string' and jsonb_typeof(b) = 'string' then case when (a #>> '{}') >= (b #>> '{}') then a else b end
    else coalesce(b, a) end
$$;
create or replace function learn_jobj(a jsonb) returns jsonb language sql immutable as $$ select case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end $$;
create or replace function learn_jobj_max(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, learn_jmax(learn_jobj(a)->k, learn_jobj(b)->k)), '{}'::jsonb)
  from (select jsonb_object_keys(learn_jobj(a)) k union select jsonb_object_keys(learn_jobj(b))) t
$$;
create or replace function learn_jarr_max(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(a) is distinct from 'array' then b when jsonb_typeof(b) is distinct from 'array' then a
    else (select coalesce(jsonb_agg(learn_jmax(a->i, b->i) order by i), '[]'::jsonb) from generate_series(0, greatest(jsonb_array_length(a), jsonb_array_length(b)) - 1) i) end
$$;
create or replace function learn_jobj_arrmax(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, learn_jarr_max(learn_jobj(a)->k, learn_jobj(b)->k)), '{}'::jsonb)
  from (select jsonb_object_keys(learn_jobj(a)) k union select jsonb_object_keys(learn_jobj(b))) t
$$;
-- thẻ ôn từ: giữ thẻ đã ôn nhiều lần hơn, bằng nhau thì thẻ có hạn ôn muộn hơn
create or replace function learn_jobj_srs(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, case when x is null then y when y is null then x
      when coalesce((x->>'r')::numeric, 0) > coalesce((y->>'r')::numeric, 0) then x
      when coalesce((x->>'r')::numeric, 0) < coalesce((y->>'r')::numeric, 0) then y
      when coalesce((x->>'d')::numeric, 0) >= coalesce((y->>'d')::numeric, 0) then x else y end), '{}'::jsonb)
  from (select k, learn_jobj(a)->k x, learn_jobj(b)->k y from (select jsonb_object_keys(learn_jobj(a)) k union select jsonb_object_keys(learn_jobj(b))) t) z
$$;
-- XP: lấy tổng của một bên + phần XP theo ngày mà bên kia có thêm
create or replace function learn_xp_merge(o jsonb, n jsonb) returns jsonb language sql immutable as $$
  with d as (select k, coalesce((learn_jobj(o->'days')->>k)::numeric, 0) a, coalesce((learn_jobj(n->'days')->>k)::numeric, 0) b
    from (select jsonb_object_keys(learn_jobj(o->'days')) k union select jsonb_object_keys(learn_jobj(n->'days'))) t)
  select to_jsonb(greatest(coalesce((o->>'xp')::numeric, 0) + coalesce((select sum(greatest(0, b - a)) from d), 0),
                           coalesce((n->>'xp')::numeric, 0) + coalesce((select sum(greatest(0, a - b)) from d), 0)))
$$;
create or replace function learn_data_merge(o jsonb, n jsonb) returns jsonb language plpgsql immutable as $$
declare ob jsonb := learn_jobj(o); base jsonb; r jsonb; nu boolean; so text; sn text;
begin
  if jsonb_typeof(n) is distinct from 'object' then return o; end if;
  if ob = '{}'::jsonb then return n; end if;
  nu := coalesce((n->>'updated')::numeric, 0) >= coalesce((ob->>'updated')::numeric, 0);
  base := case when nu then ob || n else n || ob end;
  so := coalesce(ob->'streak'->>'last', ''); sn := coalesce(n->'streak'->>'last', '');
  r := base || jsonb_build_object(
    'updated', learn_jmax(ob->'updated', n->'updated'),
    'done', learn_jobj_arrmax(ob->'done', n->'done'),
    'stars', learn_jobj_arrmax(ob->'stars', n->'stars'),
    'xp', learn_xp_merge(ob, n),
    'days', learn_jobj_max(ob->'days', n->'days'),
    'srs', learn_jobj_srs(ob->'srs', n->'srs'),
    'counts', learn_jobj_max(ob->'counts', n->'counts'),
    'best', learn_jobj_max(ob->'best', n->'best'),
    'wclaims', learn_jobj_max(ob->'wclaims', n->'wclaims'),
    'bossStars', learn_jobj_max(ob->'bossStars', n->'bossStars'),
    'walls', learn_jobj(ob->'walls') || learn_jobj(n->'walls'),
    'chests', learn_jobj(ob->'chests') || learn_jobj(n->'chests'),
    'boss', learn_jobj(ob->'boss') || learn_jobj(n->'boss'),
    'badges', learn_jobj(ob->'badges') || learn_jobj(n->'badges'),
    'guide', learn_jobj(ob->'guide') || learn_jobj(n->'guide'),
    'minutes', learn_jmax(ob->'minutes', n->'minutes'),
    'vipSeen', learn_jmax(ob->'vipSeen', n->'vipSeen'),
    'dchest', learn_jmax(ob->'dchest', n->'dchest'),
    'onboarded', to_jsonb(coalesce((ob->>'onboarded')::boolean, false) or coalesce((n->>'onboarded')::boolean, false)),
    'streak', case when so > sn then ob->'streak' when so < sn then n->'streak' else learn_jobj_max(ob->'streak', n->'streak') end,
    'daily', case when coalesce(ob->'daily'->>'d', '') > coalesce(n->'daily'->>'d', '') then ob->'daily'
                  when coalesce(ob->'daily'->>'d', '') < coalesce(n->'daily'->>'d', '') then n->'daily' else learn_jobj_max(ob->'daily', n->'daily') end,
    -- mốc thu hồi theo máy gửi lên: máy chưa áp thì máy chủ áp lại trên bản đã gộp
    'fix', coalesce(n->'fix', '{}'::jsonb));
  r := r || jsonb_build_object('words', to_jsonb((select count(*) from jsonb_object_keys(learn_jobj(r->'srs')))));
  return jsonb_strip_nulls(r);
exception when others then return n;
end $$;

create or replace function learn_save2(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d jsonb := p_data; o jsonb;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  if pg_column_size(d) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  select data into o from learn_users where id = uid for update;
  d := learn_data_merge(o, d);
  if pg_column_size(d) > 400000 then d := p_data; end if;
  d := learn_revoke_apply(uid, d);
  update learn_users set data = d, updated_at = now() where id = uid;
  return jsonb_build_object('ok', true, 'rv', d->'fix'->'rv', 'data', d);
end $$;
-- bản cũ (máy còn chạy giao diện cũ) cũng gộp, không ghi đè
create or replace function learn_save(p_name text, p_pin text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(p_name)); e text; uid bigint; o jsonb; d jsonb;
begin
  if pg_column_size(p_data) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  e := learn_check(k, p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  select id, data into uid, o from learn_users where name_key = k for update;
  d := learn_data_merge(o, p_data);
  if pg_column_size(d) > 400000 then d := p_data; end if;
  update learn_users set data = learn_revoke_apply(uid, d), updated_at = now() where id = uid;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function learn_save2(text, jsonb) to anon, authenticated;
grant execute on function learn_save(text, text, jsonb) to anon, authenticated;


-- ============ quyền (Bestie + Vượt ải) ============
revoke all on learn_besties, learn_bestie_passes, learn_fx_catalog, learn_fx_owned, learn_adv_sessions, learn_adv_progress from anon, authenticated;
revoke execute on function learn_bestie_row(bigint), learn_bestie_id(bigint), learn_today_vn(), learn_studied_today(learn_users), learn_bestie_mult(bigint), learn_fx_has(bigint, text),
  learn_fx_give(bigint, text, text), learn_bestie_brief(bigint), learn_pair_key(bigint, bigint), learn_adv_regions(text), learn_adv_parse(text), learn_adv_open(text, text), learn_adv_secs(text),
  learn_adv_clean(jsonb), learn_adv_step(bigint, boolean), learn_adv_view(learn_adv_sessions, text), learn_adv_pending(bigint) from anon, authenticated, public;
grant execute on function learn_bestie_state(text), learn_bestie_request(text, bigint), learn_bestie_respond(text, bigint, boolean), learn_bestie_remove(text),
  learn_bestie_set(text, boolean, text, text), learn_bestie_nudge(text), learn_bestie_pass(text, bigint), learn_bestie_here(text, text, text),
  learn_adv_map(text, text), learn_adv_start(text, text, jsonb), learn_adv_join(text, bigint, boolean), learn_adv_state(text, bigint), learn_adv_act(text, bigint, jsonb) to anon, authenticated;

create or replace function learn_chat_threads(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(t order by (t->>'last_at') desc nulls last) from (
    select jsonb_build_object('chan', learn_dm_chan(uid, o.id), 'kind', 'dm', 'uid', o.id, 'name', o.name, 'avatar', coalesce(o.avatar, ''), 'vip', learn_vipc(o.c_vpts, o.vip_bonus), 'last_seen', o.last_seen,
      'last', (select left(m.body, 80) from learn_msgs m where m.chan = learn_dm_chan(uid, o.id) order by m.id desc limit 1),
      'last_at', (select m.created_at from learn_msgs m where m.chan = learn_dm_chan(uid, o.id) order by m.id desc limit 1),
      'unread', (select count(*) from learn_msgs m where m.chan = learn_dm_chan(uid, o.id) and m.sender <> uid and m.id > coalesce((select last_id from learn_msg_reads r where r.user_id = uid and r.chan = learn_dm_chan(uid, o.id)), 0))) t
    from learn_friends f join learn_users o on o.id = case when f.a = uid then f.b else f.a end where (f.a = uid or f.b = uid) and f.status = 'accepted'
    union all
    select jsonb_build_object('chan', 'room:' || r.id, 'kind', 'room', 'room', r.id, 'name', r.name, 'code', r.code,
      'last', (select left(m.body, 80) from learn_msgs m where m.chan = 'room:' || r.id order by m.id desc limit 1),
      'last_at', (select m.created_at from learn_msgs m where m.chan = 'room:' || r.id order by m.id desc limit 1),
      'unread', (select count(*) from learn_msgs m where m.chan = 'room:' || r.id and m.sender is distinct from uid and m.id > coalesce((select last_id from learn_msg_reads x where x.user_id = uid and x.chan = 'room:' || r.id), 0))) t
    from learn_room_members mm join learn_rooms r on r.id = mm.room_id where mm.user_id = uid and not r.archived
  ) q(t)), '[]'::jsonb));
end $$;

create or replace function learn_msg_rows(p_chan text, p_after bigint) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'from', m.sender, 'name', coalesce(u.name, m.nick), 'avatar', coalesce(u.avatar, ''),
    'vip', case when u.id is not null then learn_vipc(u.c_vpts, u.vip_bonus) end, 'body', m.body, 'at', m.created_at) order by m.id), '[]'::jsonb)
  from (select * from learn_msgs where chan = p_chan and id > coalesce(p_after, 0) order by id desc limit 80) m left join learn_users u on u.id = m.sender
$$;

create or replace function learn_notifs(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload, 'at', n.created_at, 'read', n.read_at is not null,
      'actor', n.actor, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', case when u.id is not null then learn_vipc(u.c_vpts, u.vip_bonus) end) order by n.created_at desc)
      from (select * from learn_notifs where user_id = uid order by created_at desc limit 40) n left join learn_users u on u.id = n.actor), '[]'::jsonb));
end $$;

create or replace function learn_room_get(p_token text, p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); myrole text := learn_room_role(p_room, uid); r learn_rooms;
begin
  if myrole is null then return jsonb_build_object('ok', false, 'error', 'notmember'); end if;
  select * into r from learn_rooms where id = p_room;
  return jsonb_build_object('ok', true, 'role', myrole, 'me', uid,
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'description', r.description, 'lang', r.lang, 'level', r.level, 'owner', r.owner_id, 'settings', r.settings, 'archived', r.archived, 'created_at', r.created_at),
    'members', coalesce((select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'role', m.role, 'joined_at', m.joined_at, 'last_seen', u.last_seen,
        'sum', u.c_sum,
        'week_xp', (select coalesce(sum(value::text::int), 0) from jsonb_each(case when jsonb_typeof(u.data->'days') = 'object' then u.data->'days' else '{}'::jsonb end) where key >= to_char(now() - interval '6 days', 'YYYY-MM-DD') and jsonb_typeof(value) = 'number'),
        'tasks_done', (select count(*) from learn_room_tasks t where t.room_id = p_room and (
            case when t.lesson is null then (jsonb_typeof(u.data->'done'->t.unit_id) = 'array' and jsonb_array_length(u.data->'done'->t.unit_id) >= 8 and not exists (select 1 from jsonb_array_elements(u.data->'done'->t.unit_id) e where e::text not in ('1','true')))
                 else coalesce((u.data->'done'->t.unit_id->>t.lesson) in ('1','true'), false) end)),
        'quiz_avg', (select round(avg(case when g.n > 0 then 100.0 * p.correct / g.n end)) from learn_quiz_players p join (select id, jsonb_array_length(questions) n from learn_quiz_games where room_id = p_room and state = 'ended') g on g.id = p.game_id where p.user_id = u.id))
        order by case m.role when 'teacher' then 0 when 'assistant' then 1 else 2 end, u.name)
      from learn_room_members m join learn_users u on u.id = m.user_id where m.room_id = p_room), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'lang', t.lang, 'unit_id', t.unit_id, 'lesson', t.lesson, 'due_at', t.due_at, 'created_at', t.created_at,
        'done_by', (select count(*) from learn_room_members m join learn_users u on u.id = m.user_id where m.room_id = p_room and m.role = 'student' and (
            case when t.lesson is null then (jsonb_typeof(u.data->'done'->t.unit_id) = 'array' and jsonb_array_length(u.data->'done'->t.unit_id) >= 8 and not exists (select 1 from jsonb_array_elements(u.data->'done'->t.unit_id) e where e::text not in ('1','true')))
                 else coalesce((u.data->'done'->t.unit_id->>t.lesson) in ('1','true'), false) end))) order by coalesce(t.due_at, t.created_at) desc)
      from learn_room_tasks t where t.room_id = p_room), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(x order by x->>'pinned' desc, x->>'created_at' desc) from (select jsonb_build_object('id', p.id, 'uid', p.user_id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'kind', p.kind, 'body', p.body, 'pinned', p.pinned, 'created_at', p.created_at) x
      from learn_room_posts p left join learn_users u on u.id = p.user_id where p.room_id = p_room order by p.pinned desc, p.created_at desc limit 60) s), '[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'state', g.state, 'pin', case when g.state <> 'ended' then g.pin end, 'created_at', g.created_at, 'questions', jsonb_array_length(g.questions),
        'players', (select count(*) from learn_quiz_players p where p.game_id = g.id and not p.kicked),
        'winner', (select nick from learn_quiz_players p where p.game_id = g.id and not p.kicked order by score desc limit 1)) order by g.created_at desc)
      from learn_quiz_games g where g.room_id = p_room), '[]'::jsonb));
end $$;

create or replace function learn_admin_users(p_search text, p_limit int, p_offset int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('total', (select count(*) from learn_users where coalesce(p_search, '') = '' or name_key like '%' || lower(p_search) || '%' or friend_code = upper(p_search)),
    'items', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''), 'created_at', u.created_at, 'updated_at', u.updated_at, 'last_seen', u.last_seen,
        'banned', u.banned, 'locked', u.lock_until is not null and u.lock_until > now(), 'fails', u.fails, 'sum', u.c_sum,
        'friends', (select count(*) from learn_friends f where (f.a = u.id or f.b = u.id) and f.status = 'accepted'),
        'rooms', (select count(*) from learn_room_members m where m.user_id = u.id),
        'quizzes', (select count(*) from learn_quiz_players p where p.user_id = u.id)) x
      from learn_users u where coalesce(p_search, '') = '' or u.name_key like '%' || lower(p_search) || '%' or u.friend_code = upper(p_search)
      order by greatest(u.updated_at, coalesce(u.last_seen, u.updated_at)) desc nulls last limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) s), '[]'::jsonb));
end $$;

create or replace function learn_admin_user(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u learn_users;
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  select * into u from learn_users where id = p_id;
  if not found then return null; end if;
  return jsonb_build_object('id', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''), 'created_at', u.created_at, 'updated_at', u.updated_at, 'last_seen', u.last_seen, 'banned', u.banned,
    'locked', u.lock_until is not null and u.lock_until > now(), 'fails', u.fails, 'sum', u.c_sum,
    'days', case when jsonb_typeof(u.data->'days') = 'object' then u.data->'days' else '{}'::jsonb end,
    'done', case when jsonb_typeof(u.data->'done') = 'object' then u.data->'done' else '{}'::jsonb end,
    'badges', coalesce(u.data->'badges', '{}'::jsonb), 'goal', u.data->'goal',
    'sessions', (select count(*) from learn_sessions s where s.user_id = u.id),
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'status', f.status)), '[]'::jsonb) from learn_friends f join learn_users o on o.id = case when f.a = u.id then f.b else f.a end where f.a = u.id or f.b = u.id),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'role', m.role)), '[]'::jsonb) from learn_room_members m join learn_rooms r on r.id = m.room_id where m.user_id = u.id),
    'quizzes', (select coalesce(jsonb_agg(jsonb_build_object('title', g.title, 'score', p.score, 'correct', p.correct, 'n', jsonb_array_length(g.questions), 'at', g.created_at) order by g.created_at desc), '[]'::jsonb) from learn_quiz_players p join learn_quiz_games g on g.id = p.game_id where p.user_id = u.id));
end $$;

create or replace function learn_walls_of(p_token text, p_uid bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  if p_uid <> uid and not learn_are_friends(uid, p_uid) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
  return jsonb_build_object('ok', true, 'walls', coalesce((select jsonb_agg(wall order by wall) from learn_walls where user_id = p_uid), '[]'::jsonb),
    'vip', learn_user_vip(p_uid), 'got_from_me', exists (select 1 from learn_shares where from_id = uid and to_id = p_uid and vip = learn_user_vip(uid)));
end $$;

create or replace function learn_share(p_token text, p_to bigint, p_wall int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); lv int; nm text;
begin
  lv := learn_user_vip(uid);
  if lv < 1 then return jsonb_build_object('ok', false, 'error', 'novip'); end if;
  if not learn_are_friends(uid, p_to) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
  if not exists (select 1 from learn_walls where user_id = uid and wall = p_wall) then return jsonb_build_object('ok', false, 'error', 'notowned'); end if;
  if exists (select 1 from learn_walls where user_id = p_to and wall = p_wall) then return jsonb_build_object('ok', false, 'error', 'theyhave'); end if;
  if exists (select 1 from learn_shares where from_id = uid and learn_vn_day(created_at) = learn_vn_day()) then return jsonb_build_object('ok', false, 'error', 'sharetoday'); end if;
  if (select count(*) from learn_shares where from_id = uid and vip = lv) >= lv then return jsonb_build_object('ok', false, 'error', 'quota'); end if;
  if exists (select 1 from learn_shares where from_id = uid and to_id = p_to and vip = lv) then return jsonb_build_object('ok', false, 'error', 'samelevel'); end if;
  select name into nm from learn_users where id = uid;
  insert into learn_shares(from_id, to_id, wall, vip) values (uid, p_to, p_wall, lv);
  perform learn_give_wall(p_to, p_wall, 'gift:' || nm);
  perform learn_notify(p_to, 'gift', uid, jsonb_build_object('wall', p_wall));
  return jsonb_build_object('ok', true);
end $$;

insert into learn_unit_words(unit, w0, w10) values
($q$en-a1-1$q$,$q$colleague$q$,$q$introduce$q$),
($q$en-a1-2$q$,$q$start$q$,$q$morning$q$),
($q$en-a1-3$q$,$q$computer$q$,$q$monitor$q$),
($q$en-a1-4$q$,$q$floor$q$,$q$toilet$q$),
($q$en-a1-5$q$,$q$boss$q$,$q$what$q$),
($q$en-a1-6$q$,$q$coffee$q$,$q$tea$q$),
($q$en-a1-7$q$,$q$grandparents$q$,$q$daughter$q$),
($q$en-a1-8$q$,$q$o'clock$q$,$q$today$q$),
($q$en-a1-9$q$,$q$happy$q$,$q$cold$q$),
($q$en-a1-10$q$,$q$home$q$,$q$read$q$),
($q$en-a1-11$q$,$q$shop$q$,$q$queue$q$),
($q$en-a1-12$q$,$q$snow$q$,$q$spring$q$),
($q$en-a1-13$q$,$q$smoothie$q$,$q$small$q$),
($q$en-a1-14$q$,$q$cab$q$,$q$traffic lights$q$),
($q$en-a1-15$q$,$q$shirt$q$,$q$hat$q$),
($q$en-a1-16$q$,$q$do the washing-up$q$,$q$dust$q$),
($q$en-a1-17$q$,$q$museum$q$,$q$on foot$q$),
($q$en-a1-18$q$,$q$love$q$,$q$football$q$),
($q$en-a1-19$q$,$q$thermometer$q$,$q$cut$q$),
($q$en-a1-20$q$,$q$present$q$,$q$fireworks$q$),
($q$en-a2-1$q$,$q$schedule$q$,$q$next week$q$),
($q$en-a2-2$q$,$q$attach$q$,$q$dear$q$),
($q$en-a2-3$q$,$q$slow$q$,$q$software update$q$),
($q$en-a2-4$q$,$q$call back$q$,$q$voicemail$q$),
($q$en-a2-5$q$,$q$day off$q$,$q$annual leave$q$),
($q$en-a2-6$q$,$q$traffic$q$,$q$motorbike$q$),
($q$en-a2-7$q$,$q$went$q$,$q$trip$q$),
($q$en-a2-8$q$,$q$online shop$q$,$q$sale$q$),
($q$en-a2-9$q$,$q$clinic$q$,$q$allergic$q$),
($q$en-a2-10$q$,$q$invitation$q$,$q$cinema$q$),
($q$en-a2-11$q$,$q$book a table$q$,$q$chef$q$),
($q$en-a2-12$q$,$q$pastime$q$,$q$knitting$q$),
($q$en-a2-13$q$,$q$single room$q$,$q$guesthouse$q$),
($q$en-a2-14$q$,$q$flight$q$,$q$window seat$q$),
($q$en-a2-15$q$,$q$lift$q$,$q$noise$q$),
($q$en-a2-16$q$,$q$notification$q$,$q$dead$q$),
($q$en-a2-17$q$,$q$recipe$q$,$q$rice cooker$q$),
($q$en-a2-18$q$,$q$gym$q$,$q$sweat$q$),
($q$en-a2-19$q$,$q$ATM$q$,$q$electricity bill$q$),
($q$en-a2-20$q$,$q$lost property$q$,$q$drop$q$),
($q$en-b1-1$q$,$q$drawing$q$,$q$already$q$),
($q$en-b1-2$q$,$q$progress$q$,$q$deadline extension$q$),
($q$en-b1-3$q$,$q$bug$q$,$q$step$q$),
($q$en-b1-4$q$,$q$remote$q$,$q$let's$q$),
($q$en-b1-5$q$,$q$one-on-one$q$,$q$would you mind$q$),
($q$en-b1-6$q$,$q$weekend$q$,$q$traffic jam$q$),
($q$en-b1-7$q$,$q$training course$q$,$q$learning curve$q$),
($q$en-b1-8$q$,$q$event$q$,$q$celebrate$q$),
($q$en-b1-9$q$,$q$check in$q$,$q$room service$q$),
($q$en-b1-10$q$,$q$process$q$,$q$drag$q$),
($q$en-b1-11$q$,$q$flat$q$,$q$move out$q$),
($q$en-b1-12$q$,$q$habit$q$,$q$give up$q$),
($q$en-b1-13$q$,$q$post$q$,$q$screen time$q$),
($q$en-b1-14$q$,$q$faulty$q$,$q$apology$q$),
($q$en-b1-15$q$,$q$best friend$q$,$q$jealous$q$),
($q$en-b1-16$q$,$q$raise$q$,$q$in-laws$q$),
($q$en-b1-17$q$,$q$recycle$q$,$q$electricity$q$),
($q$en-b1-18$q$,$q$emergency$q$,$q$damage$q$),
($q$en-b1-19$q$,$q$travel budget$q$,$q$rent a motorbike$q$),
($q$en-b1-20$q$,$q$volunteer work$q$,$q$in need$q$),
($q$en-b1p-1$q$,$q$floor plan$q$,$q$architectural$q$),
($q$en-b1p-2$q$,$q$beam$q$,$q$bracing$q$),
($q$en-b1p-3$q$,$q$shop drawing$q$,$q$reissue$q$),
($q$en-b1p-4$q$,$q$truss$q$,$q$nogging$q$),
($q$en-b1p-5$q$,$q$BIM$q$,$q$sync$q$),
($q$en-b1p-6$q$,$q$quality assurance$q$,$q$auditor$q$),
($q$en-b1p-7$q$,$q$stand-up$q$,$q$sprint$q$),
($q$en-b1p-8$q$,$q$onboarding$q$,$q$confidentiality$q$),
($q$en-b1p-9$q$,$q$timesheet$q$,$q$deduction$q$),
($q$en-b1p-10$q$,$q$landmark$q$,$q$skyline$q$),
($q$en-b1p-11$q$,$q$broth$q$,$q$incense$q$),
($q$en-b1p-12$q$,$q$PPE$q$,$q$first aider$q$),
($q$en-b2-1$q$,$q$specification$q$,$q$width$q$),
($q$en-b2-2$q$,$q$inspection$q$,$q$audit$q$),
($q$en-b2-3$q$,$q$client$q$,$q$requirement list$q$),
($q$en-b2-4$q$,$q$automate$q$,$q$input$q$),
($q$en-b2-5$q$,$q$promotion$q$,$q$wish$q$),
($q$en-b2-6$q$,$q$complaint$q$,$q$by the time$q$),
($q$en-b2-7$q$,$q$pitch$q$,$q$persuade$q$),
($q$en-b2-8$q$,$q$prioritise$q$,$q$say no$q$),
($q$en-b2-9$q$,$q$post-mortem$q$,$q$consequence$q$),
($q$en-b2-10$q$,$q$culture$q$,$q$generalise$q$),
($q$en-b2-11$q$,$q$overdraft$q$,$q$fraud$q$),
($q$en-b2-12$q$,$q$headline$q$,$q$according to$q$),
($q$en-b2-13$q$,$q$property$q$,$q$high-rise$q$),
($q$en-b2-14$q$,$q$stressed out$q$,$q$insomnia$q$),
($q$en-b2-15$q$,$q$scholarship$q$,$q$homesick$q$),
($q$en-b2-16$q$,$q$long hours$q$,$q$gig economy$q$),
($q$en-b2-17$q$,$q$ageing population$q$,$q$check up on$q$),
($q$en-b2-18$q$,$q$traffic congestion$q$,$q$honk$q$),
($q$en-b2-19$q$,$q$nutrition$q$,$q$organic$q$),
($q$en-b2-20$q$,$q$overtourism$q$,$q$revenue$q$),
($q$en-b2p-1$q$,$q$moment connection$q$,$q$anchor bolt$q$),
($q$en-b2p-2$q$,$q$RFI$q$,$q$response time$q$),
($q$en-b2p-3$q$,$q$kick-off meeting$q$,$q$roles and responsibilities$q$),
($q$en-b2p-4$q$,$q$executive summary$q$,$q$quick win$q$),
($q$en-b2p-5$q$,$q$quote$q$,$q$hourly rate$q$),
($q$en-b2p-6$q$,$q$job description$q$,$q$cultural fit$q$),
($q$en-b2p-7$q$,$q$appraisal$q$,$q$360-degree feedback$q$),
($q$en-b2p-8$q$,$q$retention$q$,$q$sense of purpose$q$),
($q$en-b2p-9$q$,$q$process improvement$q$,$q$pivot table$q$),
($q$en-b2p-10$q$,$q$competitive advantage$q$,$q$time-zone advantage$q$),
($q$en-b2p-11$q$,$q$sustainable$q$,$q$insulation$q$),
($q$en-b2p-12$q$,$q$cross-cultural$q$,$q$high-context$q$),
($q$en-c1-1$q$,$q$outline$q$,$q$moving on to$q$),
($q$en-c1-2$q$,$q$negotiate$q$,$q$should you need$q$),
($q$en-c1-3$q$,$q$feedback$q$,$q$should have$q$),
($q$en-c1-4$q$,$q$option$q$,$q$pros and cons$q$),
($q$en-c1-5$q$,$q$disagree$q$,$q$I do understand$q$),
($q$en-c1-6$q$,$q$networking$q$,$q$to be honest$q$),
($q$en-c1-7$q$,$q$chair$q$,$q$next steps$q$),
($q$en-c1-8$q$,$q$role model$q$,$q$comfort zone$q$),
($q$en-c1-9$q$,$q$disagreement$q$,$q$fed up$q$),
($q$en-c1-10$q$,$q$work history$q$,$q$motivated$q$),
($q$en-c1-11$q$,$q$one-liner$q$,$q$crack a joke$q$),
($q$en-c1-12$q$,$q$stance$q$,$q$flawed$q$),
($q$en-c1-13$q$,$q$win someone over$q$,$q$bargaining chip$q$),
($q$en-c1-14$q$,$q$personal data$q$,$q$artificial intelligence$q$),
($q$en-c1-15$q$,$q$break the news$q$,$q$elephant in the room$q$),
($q$en-c1-16$q$,$q$under the weather$q$,$q$sit on the fence$q$),
($q$en-c1-17$q$,$q$misinformation$q$,$q$primary source$q$),
($q$en-c1-18$q$,$q$public hearing$q$,$q$proposed change$q$),
($q$en-c1-19$q$,$q$identity$q$,$q$preconception$q$),
($q$en-c1-20$q$,$q$propose a toast$q$,$q$tribute$q$),
($q$zh-hsk1-1$q$,$q$你好$q$,$q$他$q$),
($q$zh-hsk1-2$q$,$q$今天$q$,$q$年$q$),
($q$zh-hsk1-3$q$,$q$办公室$q$,$q$椅子$q$),
($q$zh-hsk1-4$q$,$q$吃$q$,$q$米饭$q$),
($q$zh-hsk1-5$q$,$q$家$q$,$q$没有$q$),
($q$zh-hsk1-6$q$,$q$买$q$,$q$个$q$),
($q$zh-hsk1-7$q$,$q$天气$q$,$q$春天$q$),
($q$zh-hsk1-8$q$,$q$路$q$,$q$快$q$),
($q$zh-hsk1-9$q$,$q$喜欢$q$,$q$跑步$q$),
($q$zh-hsk1-10$q$,$q$中国$q$,$q$河内$q$),
($q$zh-hsk1-11$q$,$q$健康$q$,$q$头$q$),
($q$zh-hsk1-12$q$,$q$动物$q$,$q$只$q$),
($q$zh-hsk1-13$q$,$q$住$q$,$q$门$q$),
($q$zh-hsk1-14$q$,$q$刷牙$q$,$q$回家$q$),
($q$zh-hsk1-15$q$,$q$香蕉$q$,$q$找钱$q$),
($q$zh-hsk1-16$q$,$q$教室$q$,$q$题$q$),
($q$zh-hsk1-17$q$,$q$见面$q$,$q$下个月$q$),
($q$zh-hsk2-1$q$,$q$上班$q$,$q$公共汽车$q$),
($q$zh-hsk2-2$q$,$q$打电话$q$,$q$短信$q$),
($q$zh-hsk2-3$q$,$q$开会$q$,$q$讨论$q$),
($q$zh-hsk2-4$q$,$q$帮$q$,$q$借$q$),
($q$zh-hsk2-5$q$,$q$运动$q$,$q$输$q$),
($q$zh-hsk2-6$q$,$q$红色$q$,$q$衬衫$q$),
($q$zh-hsk2-7$q$,$q$节日$q$,$q$祝$q$),
($q$zh-hsk2-8$q$,$q$咖啡$q$,$q$果汁$q$),
($q$zh-hsk2-9$q$,$q$庆祝$q$,$q$许愿$q$),
($q$zh-hsk2-10$q$,$q$做客$q$,$q$筷子$q$),
($q$zh-hsk2-11$q$,$q$部$q$,$q$笑$q$),
($q$zh-hsk2-12$q$,$q$单人间$q$,$q$无线网$q$),
($q$zh-hsk2-13$q$,$q$理发$q$,$q$帅$q$),
($q$zh-hsk2-14$q$,$q$家务$q$,$q$吸尘器$q$),
($q$zh-hsk2-15$q$,$q$野餐$q$,$q$垫子$q$),
($q$zh-hsk2-16$q$,$q$长得$q$,$q$像$q$),
($q$zh-hsk3-1$q$,$q$邮件$q$,$q$标题$q$),
($q$zh-hsk3-2$q$,$q$打算$q$,$q$以前$q$),
($q$zh-hsk3-3$q$,$q$软件$q$,$q$网站$q$),
($q$zh-hsk3-4$q$,$q$报告$q$,$q$百分之$q$),
($q$zh-hsk3-5$q$,$q$整理$q$,$q$墙$q$),
($q$zh-hsk3-6$q$,$q$锅$q$,$q$鱼$q$),
($q$zh-hsk3-7$q$,$q$家乡$q$,$q$街$q$),
($q$zh-hsk3-8$q$,$q$发音$q$,$q$认真$q$),
($q$zh-hsk3-9$q$,$q$丢$q$,$q$着急$q$),
($q$zh-hsk3-10$q$,$q$离开$q$,$q$成功$q$),
($q$zh-hsk3-11$q$,$q$下单$q$,$q$满减$q$),
($q$zh-hsk3-12$q$,$q$营业厅$q$,$q$月租$q$),
($q$zh-hsk3-13$q$,$q$高铁$q$,$q$往返$q$),
($q$zh-hsk3-14$q$,$q$台风$q$,$q$大风$q$),
($q$zh-hsk3-15$q$,$q$乐器$q$,$q$手指$q$),
($q$zh-hsk3-16$q$,$q$婚礼$q$,$q$礼服$q$),
($q$zh-hsk4-1$q$,$q$打招呼$q$,$q$感兴趣$q$),
($q$zh-hsk4-2$q$,$q$领导$q$,$q$布置$q$),
($q$zh-hsk4-3$q$,$q$图纸$q$,$q$画$q$),
($q$zh-hsk4-4$q$,$q$项目$q$,$q$计划$q$),
($q$zh-hsk4-5$q$,$q$线上$q$,$q$麦克风$q$),
($q$zh-hsk4-6$q$,$q$反馈$q$,$q$方案$q$),
($q$zh-hsk4-7$q$,$q$租$q$,$q$阳台$q$),
($q$zh-hsk4-8$q$,$q$商场$q$,$q$试穿$q$),
($q$zh-hsk4-9$q$,$q$医院$q$,$q$打针$q$),
($q$zh-hsk4-10$q$,$q$地铁$q$,$q$高峰$q$),
($q$zh-hsk4-11$q$,$q$分类$q$,$q$一次性$q$),
($q$zh-hsk4-12$q$,$q$朋友圈$q$,$q$刷$q$),
($q$zh-hsk4-13$q$,$q$谈恋爱$q$,$q$感情$q$),
($q$zh-hsk4-14$q$,$q$作息$q$,$q$维生素$q$),
($q$zh-hsk4-15$q$,$q$端午节$q$,$q$传说$q$),
($q$zh-hsk4-16$q$,$q$驾照$q$,$q$倒车$q$),
($q$zh-hsk5-1$q$,$q$出差$q$,$q$机场$q$),
($q$zh-hsk5-2$q$,$q$接待$q$,$q$邀请$q$),
($q$zh-hsk5-3$q$,$q$技术$q$,$q$厚度$q$),
($q$zh-hsk5-4$q$,$q$质量$q$,$q$为了$q$),
($q$zh-hsk5-5$q$,$q$谈判$q$,$q$既然$q$),
($q$zh-hsk5-6$q$,$q$汇报$q$,$q$通过$q$),
($q$zh-hsk5-7$q$,$q$点菜$q$,$q$饭馆$q$),
($q$zh-hsk5-8$q$,$q$银行$q$,$q$身份证$q$),
($q$zh-hsk5-9$q$,$q$课程$q$,$q$坚持$q$),
($q$zh-hsk5-10$q$,$q$团建$q$,$q$风景$q$),
($q$zh-hsk5-11$q$,$q$房价$q$,$q$面积$q$),
($q$zh-hsk5-12$q$,$q$补习班$q$,$q$焦虑$q$),
($q$zh-hsk5-13$q$,$q$养老$q$,$q$社区$q$),
($q$zh-hsk5-14$q$,$q$诈骗$q$,$q$个人信息$q$),
($q$zh-hsk5-15$q$,$q$平衡$q$,$q$收入$q$),
($q$zh-hsk5-16$q$,$q$景区$q$,$q$小众$q$),
($q$zh-hsk6-1$q$,$q$投诉$q$,$q$否则$q$),
($q$zh-hsk6-2$q$,$q$相处$q$,$q$宁可$q$),
($q$zh-hsk6-3$q$,$q$市场$q$,$q$由于$q$),
($q$zh-hsk6-4$q$,$q$条款$q$,$q$以免$q$),
($q$zh-hsk6-5$q$,$q$面试$q$,$q$既$q$),
($q$zh-hsk6-6$q$,$q$话题$q$,$q$越$q$),
($q$zh-hsk6-7$q$,$q$效率$q$,$q$打扰$q$),
($q$zh-hsk6-8$q$,$q$突发$q$,$q$临时$q$),
($q$zh-hsk6-9$q$,$q$文化$q$,$q$尊称$q$),
($q$zh-hsk6-10$q$,$q$致辞$q$,$q$支持$q$),
($q$zh-hsk6-11$q$,$q$辟谣$q$,$q$来源$q$),
($q$zh-hsk6-12$q$,$q$城市化$q$,$q$振兴$q$),
($q$zh-hsk6-13$q$,$q$消费观$q$,$q$欲望$q$),
($q$zh-hsk6-14$q$,$q$观念$q$,$q$啃老$q$),
($q$zh-hsk6-15$q$,$q$公益$q$,$q$透明$q$),
($q$zh-hsk6-16$q$,$q$传承$q$,$q$融合$q$),
($q$ielts-b4-1$q$,$q$hometown$q$,$q$urban$q$),
($q$ielts-b4-2$q$,$q$career$q$,$q$promotion$q$),
($q$ielts-b4-3$q$,$q$routine$q$,$q$energetic$q$),
($q$ielts-b4-4$q$,$q$relative$q$,$q$loyal$q$),
($q$ielts-b4-5$q$,$q$diet$q$,$q$lifestyle$q$),
($q$ielts-b4-6$q$,$q$purchase$q$,$q$consumer$q$),
($q$ielts-b4-7$q$,$q$destination$q$,$q$souvenir$q$),
($q$ielts-b4-8$q$,$q$device$q$,$q$distraction$q$),
($q$ielts-b4-9$q$,$q$vehicle$q$,$q$reliable$q$),
($q$ielts-b4-10$q$,$q$athlete$q$,$q$spectator$q$),
($q$ielts-b4-11$q$,$q$climate$q$,$q$environment$q$),
($q$ielts-b4-12$q$,$q$entertainment$q$,$q$headline$q$),
($q$ielts-b4-13$q$,$q$neighbour$q$,$q$nearby$q$),
($q$ielts-b4-14$q$,$q$novel$q$,$q$page-turner$q$),
($q$ielts-b4-15$q$,$q$casual$q$,$q$fit$q$),
($q$ielts-b4-16$q$,$q$pet$q$,$q$company$q$),
($q$ielts-b4-17$q$,$q$kindergarten$q$,$q$nostalgic$q$),
($q$ielts-b4-18$q$,$q$gift$q$,$q$receive$q$),
($q$ielts-b5-1$q$,$q$curriculum$q$,$q$literacy$q$),
($q$ielts-b5-2$q$,$q$healthcare$q$,$q$mental health$q$),
($q$ielts-b5-3$q$,$q$offender$q$,$q$law enforcement$q$),
($q$ielts-b5-4$q$,$q$urbanisation$q$,$q$residential$q$),
($q$ielts-b5-5$q$,$q$unemployment$q$,$q$automation$q$),
($q$ielts-b5-6$q$,$q$advertisement$q$,$q$regulate$q$),
($q$ielts-b5-7$q$,$q$mass tourism$q$,$q$stereotype$q$),
($q$ielts-b5-8$q$,$q$research$q$,$q$analyse$q$),
($q$ielts-b5-9$q$,$q$birth rate$q$,$q$working-age population$q$),
($q$ielts-b5-10$q$,$q$renewable energy$q$,$q$consumption$q$),
($q$ielts-b5-11$q$,$q$close friend$q$,$q$face-to-face$q$),
($q$ielts-b5-12$q$,$q$e-commerce$q$,$q$bargain hunter$q$),
($q$ielts-b5-13$q$,$q$work-life balance$q$,$q$annual leave$q$),
($q$ielts-b5-14$q$,$q$parenting$q$,$q$tiger parent$q$),
($q$ielts-b5-15$q$,$q$sleep deprivation$q$,$q$therapist$q$),
($q$ielts-b5-16$q$,$q$street food$q$,$q$balanced diet$q$),
($q$ielts-b6-1$q$,$q$globalisation$q$,$q$widen the gap$q$),
($q$ielts-b6-2$q$,$q$public spending$q$,$q$means-tested$q$),
($q$ielts-b6-3$q$,$q$creativity$q$,$q$performing arts$q$),
($q$ielts-b6-4$q$,$q$algorithm$q$,$q$regulation$q$),
($q$ielts-b6-5$q$,$q$mother tongue$q$,$q$assimilate$q$),
($q$ielts-b6-6$q$,$q$home ownership$q$,$q$blend in$q$),
($q$ielts-b6-7$q$,$q$mainstream media$q$,$q$objective$q$),
($q$ielts-b6-8$q$,$q$biodiversity$q$,$q$illegal wildlife trade$q$),
($q$ielts-b6-9$q$,$q$developmental$q$,$q$sedentary lifestyle$q$),
($q$ielts-b6-10$q$,$q$space exploration$q$,$q$telescope$q$),
($q$ielts-b6-11$q$,$q$self-esteem$q$,$q$trolling$q$),
($q$ielts-b6-12$q$,$q$gender equality$q$,$q$male-dominated$q$),
($q$ielts-b6-13$q$,$q$gig economy$q$,$q$precarious$q$),
($q$ielts-b6-14$q$,$q$expense tracker$q$,$q$inflation$q$),
($q$ielts-b6-15$q$,$q$public space$q$,$q$maintenance$q$),
($q$ielts-b6-16$q$,$q$fitness tracker$q$,$q$overtraining$q$),
($q$ielts-b7-1$q$,$q$genetic modification$q$,$q$eradicate$q$),
($q$ielts-b7-2$q$,$q$inequality$q$,$q$bridge the gap$q$),
($q$ielts-b7-3$q$,$q$migrant$q$,$q$labour shortage$q$),
($q$ielts-b7-4$q$,$q$higher education$q$,$q$academic freedom$q$),
($q$ielts-b7-5$q$,$q$lifestyle disease$q$,$q$contend$q$),
($q$ielts-b7-6$q$,$q$mitigation$q$,$q$bear the brunt$q$),
($q$ielts-b7-7$q$,$q$tangible heritage$q$,$q$modernisation$q$),
($q$ielts-b7-8$q$,$q$fast fashion$q$,$q$stem from$q$),
($q$ielts-b7-9$q$,$q$leadership style$q$,$q$empower$q$),
($q$ielts-b7-10$q$,$q$volunteer$q$,$q$disaster relief$q$),
($q$ielts-b7-11$q$,$q$telecommuting$q$,$q$digital nomad$q$),
($q$ielts-b7-12$q$,$q$online course$q$,$q$peer interaction$q$),
($q$ielts-b7-13$q$,$q$celebrity$q$,$q$overnight fame$q$),
($q$ielts-b7-14$q$,$q$target audience$q$,$q$manipulate$q$),
($q$ielts-b7-15$q$,$q$car ownership$q$,$q$ridership$q$),
($q$ielts-b7-16$q$,$q$chronic loneliness$q$,$q$social prescribing$q$),
($q$ielts-b8-1$q$,$q$eudaimonia$q$,$q$purpose$q$),
($q$ielts-b8-2$q$,$q$surveillance state$q$,$q$metadata$q$),
($q$ielts-b8-3$q$,$q$freedom of expression$q$,$q$polarisation$q$),
($q$ielts-b8-4$q$,$q$longevity$q$,$q$pose a risk$q$),
($q$ielts-b8-5$q$,$q$food security$q$,$q$agribusiness$q$),
($q$ielts-b8-6$q$,$q$water scarcity$q$,$q$pricing mechanism$q$),
($q$ielts-b8-7$q$,$q$modernity$q$,$q$cherish$q$),
($q$ielts-b8-8$q$,$q$commercialisation$q$,$q$regardless of$q$),
($q$ielts-b8-9$q$,$q$basic research$q$,$q$not necessarily$q$),
($q$ielts-b8-10$q$,$q$animal welfare$q$,$q$exploitation$q$),
($q$ielts-b8-11$q$,$q$social ladder$q$,$q$private tutoring$q$),
($q$ielts-b8-12$q$,$q$universal basic income$q$,$q$flat payment$q$),
($q$ielts-b8-13$q$,$q$gentrify$q$,$q$influx$q$),
($q$ielts-b8-14$q$,$q$benefactor$q$,$q$self-serving$q$),
($q$ielts-b8-15$q$,$q$minimalism$q$,$q$countdown timer$q$),
($q$ielts-b8-16$q$,$q$intergenerational fairness$q$,$q$first-time buyer$q$)
on conflict (unit) do update set w0 = excluded.w0, w10 = excluded.w10;


-- ============ 15. áp dụng ============
-- tính lại cột tính sẵn cho mọi tài khoản (một lần)
update learn_users set c_en = learn_course_score(data, 'en'), c_zh = learn_course_score(data, 'zh'), c_ie = learn_course_score(data, 'ielts'),
  c_vpts = learn_vip_points(data, 0), c_xp = learn_num(data->'xp'), c_sum = learn_summary(data),
  c_days = case when jsonb_typeof(data->'days') = 'object' then data->'days' else '{}'::jsonb end;

-- Test out: KHÔNG thu hồi chung. Chỉ thu hồi 250 sao English của tài khoản HobbyHappy (giữ XP và kho hình).
-- Chạy lại không thu hồi lần hai.
select case
  when not exists (select 1 from learn_users where name_key = 'hobbyhappy') then jsonb_build_object('hobbyhappy', 'không tìm thấy tài khoản')
  when exists (select 1 from learn_revokes r join learn_users u on u.id = r.user_id where u.name_key = 'hobbyhappy' and r.reason = 'v23: HobbyHappy -250 EN') then jsonb_build_object('hobbyhappy', 'đã thu hồi trước đó')
  else learn_revoke_stars((select id from learn_users where name_key = 'hobbyhappy'), 'en', 250, 'v23: HobbyHappy -250 EN')
end as hobbyhappy_revoke;
update learn_rank_meta set refreshed_at = now() - interval '1 hour';
select learn_rank_refresh('en'), learn_rank_refresh('zh'), learn_rank_refresh('ielts');

-- chốt tuần tự động lúc 16:00 thứ Hai giờ Hà Nội (= 09:00 UTC). Cần bật extension pg_cron (Supabase: Database → Extensions).
-- Không có pg_cron vẫn chạy: lần đầu có người mở web sau 16:00 thì máy chủ tự chốt.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then raise notice 'pg_cron chưa bật: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'learn-week-settle';
    perform cron.schedule('learn-week-settle', '0 9 * * 1', 'select public.learn_week_settle()');
    perform cron.unschedule(jobid) from cron.job where jobname = 'learn-week-settle-retry';
    perform cron.schedule('learn-week-settle-retry', '10 9 * * 1', 'select public.learn_week_settle()');
    raise notice 'pg_cron: đã đặt lịch chốt tuần 16:00 thứ Hai (giờ Hà Nội)';
  end if;
exception when others then raise notice 'không đặt được lịch pg_cron: %', sqlerrm;
end $$;

-- thông báo cập nhật v23 (chạy lại không gửi trùng)
select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":23}'::jsonb) from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '23')
) t;
notify pgrst, 'reload schema';
commit;
