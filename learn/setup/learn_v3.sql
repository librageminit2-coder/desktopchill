-- desktopchill learn — v3: hình nền thưởng, VIP, chia sẻ, thông báo, khiêu chiến 1-1, quà quiz, ảnh đại diện.
-- Chỉ THÊM bảng/hàm mới và thay thế các hàm learn_* do chính /learn tạo. Không đụng dữ liệu Profit Tracker.

-- ============ bảng ============
alter table learn_users add column if not exists vip_bonus int not null default 0;
alter table learn_quiz_games add column if not exists awarded boolean not null default false;

create table if not exists learn_wall_catalog (id int primary key, name text not null, rarity text not null);
create table if not exists learn_wall_slots (slot text primary key, walls int[] not null);
create table if not exists learn_course_meta (lang text primary key, units int not null);
create table if not exists learn_walls (
  user_id bigint not null references learn_users(id) on delete cascade,
  wall int not null,
  source text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, wall)
);
create table if not exists learn_wall_claims (
  user_id bigint not null references learn_users(id) on delete cascade,
  slot text not null,
  stars int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, slot)
);
create table if not exists learn_shares (
  id bigserial primary key,
  from_id bigint not null references learn_users(id) on delete cascade,
  to_id bigint not null references learn_users(id) on delete cascade,
  wall int not null, vip int not null,
  created_at timestamptz not null default now()
);
create index if not exists learn_shares_from on learn_shares(from_id, vip);
create table if not exists learn_notifs (
  id bigserial primary key,
  user_id bigint not null references learn_users(id) on delete cascade,
  kind text not null,
  actor bigint references learn_users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists learn_notifs_user on learn_notifs(user_id, created_at desc);
create table if not exists learn_duels (
  id bigserial primary key,
  a bigint not null references learn_users(id) on delete cascade,
  b bigint not null references learn_users(id) on delete cascade,
  lang text not null default 'en',
  title text not null default 'Duel',
  questions jsonb not null,
  a_res jsonb, b_res jsonb,
  state text not null default 'a_play' check (state in ('a_play', 'b_turn', 'done', 'expired', 'declined')),
  random boolean not null default false,
  winner bigint,
  pick_wall int,
  picked_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 days'
);
create index if not exists learn_duels_a on learn_duels(a, created_at desc);
create index if not exists learn_duels_b on learn_duels(b, created_at desc);
alter table learn_wall_catalog enable row level security;
alter table learn_wall_slots enable row level security;
alter table learn_course_meta enable row level security;
alter table learn_walls enable row level security;
alter table learn_wall_claims enable row level security;
alter table learn_shares enable row level security;
alter table learn_notifs enable row level security;
alter table learn_duels enable row level security;

-- ============ tiện ích ============
create or replace function learn_vn_day(t timestamptz default now()) returns date language sql stable as $$
  select (t at time zone 'Asia/Ho_Chi_Minh')::date
$$;

-- Điểm VIP: hoàn thành cả khoá English = 600, cả khoá 中文 = 1000, cả khoá IELTS = 1000, cộng điểm thưởng (tối đa 150)
create or replace function learn_vip_points(d jsonb, bonus int) returns int language sql stable as $$
  with u as (
    select k from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v)
    where jsonb_typeof(v) = 'array' and jsonb_array_length(v) >= 8
      and not exists (select 1 from jsonb_array_elements(v) e where e::text not in ('1', 'true'))
  )
  select (
    coalesce(round(600.0 * (select count(*) from u where k like 'en-%') / nullif((select units from learn_course_meta where lang = 'en'), 0)), 0)
  + coalesce(round(1000.0 * (select count(*) from u where k like 'zh-%') / nullif((select units from learn_course_meta where lang = 'zh'), 0)), 0)
  + coalesce(round(1000.0 * (select count(*) from u where k like 'ielts-%') / nullif((select units from learn_course_meta where lang = 'ielts'), 0)), 0)
  + least(greatest(coalesce(bonus, 0), 0), 150))::int
$$;
create or replace function learn_vip_level(pts int) returns int language sql immutable as $$
  select (select count(*) from unnest(array[20, 60, 120, 200, 300, 420, 560, 720, 860, 1000]) t where t <= coalesce(pts, 0))::int
$$;
create or replace function learn_user_vip(p_uid bigint) returns int language sql stable as $$
  select learn_vip_level(learn_vip_points(data, vip_bonus)) from learn_users where id = p_uid
$$;
create or replace function learn_add_bonus(p_uid bigint, n int) returns void language sql as $$
  update learn_users set vip_bonus = least(vip_bonus + n, 1000) where id = p_uid
$$;
create or replace function learn_notify(p_uid bigint, p_kind text, p_actor bigint, p_payload jsonb) returns void language sql as $$
  insert into learn_notifs(user_id, kind, actor, payload) values (p_uid, p_kind, p_actor, coalesce(p_payload, '{}'::jsonb));
  delete from learn_notifs where user_id = p_uid and id not in (select id from learn_notifs where user_id = p_uid order by created_at desc limit 100);
$$;
create or replace function learn_are_friends(x bigint, y bigint) returns boolean language sql stable as $$
  select exists (select 1 from learn_friends where a = least(x, y) and b = greatest(x, y) and status = 'accepted')
$$;
create or replace function learn_give_wall(p_uid bigint, p_wall int, p_source text) returns boolean language plpgsql as $$
begin
  insert into learn_walls(user_id, wall, source) values (p_uid, p_wall, left(coalesce(p_source, ''), 80));
  return true;
exception when unique_violation then return false;
end $$;

-- ============ ảnh đại diện: emoji hoặc ảnh nhỏ (data:image/…) ============
create or replace function learn_set_avatar(p_token text, p_avatar text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); a text := coalesce(p_avatar, '');
begin
  if a like 'data:image/%' then
    if length(a) > 60000 or a !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then return jsonb_build_object('ok', false, 'error', 'badimage'); end if;
  else a := left(a, 40); end if;
  update learn_users set avatar = a where id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- ============ hồ sơ ngắn + đếm thông báo ============
create or replace function learn_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; pts int;
begin
  select * into u from learn_users where id = uid;
  pts := learn_vip_points(u.data, u.vip_bonus);
  update learn_duels set state = 'expired' where state in ('a_play', 'b_turn') and expires_at < now() and (a = uid or b = uid);
  return jsonb_build_object('ok', true, 'uid', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''),
    'vip', learn_vip_level(pts), 'vip_pts', pts, 'bonus', u.vip_bonus,
    'requests', (select count(*) from learn_friends where (a = uid or b = uid) and status = 'pending' and requester <> uid),
    'rooms', (select count(*) from learn_room_members where user_id = uid),
    'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null),
    'duels', (select count(*) from learn_duels where b = uid and state = 'b_turn'),
    'walls', (select count(*) from learn_walls where user_id = uid));
end $$;

-- ============ bạn bè: thêm thông báo + VIP ============
create or replace function learn_friend_request(p_token text, p_who text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint; x bigint; y bigint; f learn_friends;
begin
  select id into o from learn_users where friend_code = upper(btrim(p_who)) or name_key = lower(btrim(p_who)) limit 1;
  if o is null then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
  if o = uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  x := least(uid, o); y := greatest(uid, o);
  select * into f from learn_friends where a = x and b = y;
  if found then
    if f.status = 'accepted' then return jsonb_build_object('ok', false, 'error', 'already'); end if;
    if f.requester <> uid then
      update learn_friends set status = 'accepted' where a = x and b = y;
      perform learn_notify(o, 'friend_ok', uid, '{}'::jsonb);
      return jsonb_build_object('ok', true, 'accepted', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'pending');
  end if;
  if (select count(*) from learn_friends where (a = uid or b = uid)) >= 300 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  insert into learn_friends(a, b, requester) values (x, y, uid);
  perform learn_notify(o, 'friend_req', uid, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'accepted', false);
end $$;

create or replace function learn_friend_respond(p_token text, p_uid bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); n int;
begin
  if p_accept then
    update learn_friends set status = 'accepted' where a = least(uid, p_uid) and b = greatest(uid, p_uid) and requester <> uid and status = 'pending';
    get diagnostics n = row_count;
    if n > 0 then perform learn_notify(p_uid, 'friend_ok', uid, '{}'::jsonb); end if;
  else
    delete from learn_friends where a = least(uid, p_uid) and b = greatest(uid, p_uid);
  end if;
  update learn_notifs set read_at = now() where user_id = uid and actor = p_uid and kind = 'friend_req' and read_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function learn_week_xp(d jsonb) returns int language sql stable as $$
  select coalesce(sum(value::text::int), 0)::int from jsonb_each(case when jsonb_typeof(d->'days') = 'object' then d->'days' else '{}'::jsonb end)
  where key >= to_char(now() - interval '6 days', 'YYYY-MM-DD') and jsonb_typeof(value) = 'number'
$$;

create or replace function learn_friends_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'status', f.status,
      'incoming', f.status = 'pending' and f.requester <> uid, 'since', f.created_at, 'last_seen', u.last_seen,
      'sum', case when f.status = 'accepted' then learn_summary(u.data) else null end,
      'vip', learn_vip_level(learn_vip_points(u.data, u.vip_bonus)),
      'walls', case when f.status = 'accepted' then (select count(*) from learn_walls w where w.user_id = u.id) end,
      'week_xp', case when f.status = 'accepted' then learn_week_xp(u.data) else null end)
      order by f.status desc, u.last_seen desc nulls last)
    from learn_friends f join learn_users u on u.id = case when f.a = uid then f.b else f.a end
    where f.a = uid or f.b = uid), '[]'::jsonb),
    'me', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'code', friend_code, 'sum', learn_summary(data),
      'vip', learn_vip_level(learn_vip_points(data, vip_bonus)), 'walls', (select count(*) from learn_walls w where w.user_id = uid),
      'week_xp', learn_week_xp(data)) from learn_users where id = uid));
end $$;

-- ============ hình nền: nhận từ rương / boss ============
-- p_stars: rương chủ đề → 2★ = 1 hình, 3★ = 2 hình; boss → 1★/2★/3★ = 1/2/3 hình
create or replace function learn_wall_claim(p_token text, p_slot text, p_stars int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); ws int[]; prev int := 0; st int := least(greatest(coalesce(p_stars, 0), 0), 3);
  isboss boolean := p_slot like 'boss|%'; n0 int; n1 int; i int; got int[] := '{}'; dup int[] := '{}';
begin
  select walls into ws from learn_wall_slots where slot = p_slot;
  if ws is null then return jsonb_build_object('ok', false, 'error', 'noslot'); end if;
  select stars into prev from learn_wall_claims where user_id = uid and slot = p_slot;
  prev := coalesce(prev, 0);
  if st <= prev then return jsonb_build_object('ok', true, 'new', '[]'::jsonb, 'dup', '[]'::jsonb, 'stars', prev); end if;
  n0 := case when isboss then prev when prev >= 3 then 2 when prev >= 2 then 1 else 0 end;
  n1 := case when isboss then st when st >= 3 then 2 when st >= 2 then 1 else 0 end;
  for i in (n0 + 1)..least(n1, array_length(ws, 1)) loop
    if learn_give_wall(uid, ws[i], 'chest:' || p_slot) then got := got || ws[i]; else dup := dup || ws[i]; perform learn_add_bonus(uid, 2); end if;
  end loop;
  insert into learn_wall_claims(user_id, slot, stars) values (uid, p_slot, st)
    on conflict (user_id, slot) do update set stars = greatest(learn_wall_claims.stars, excluded.stars);
  return jsonb_build_object('ok', true, 'new', to_jsonb(got), 'dup', to_jsonb(dup), 'stars', st);
end $$;

create or replace function learn_walls_mine(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; pts int; lv int;
begin
  select * into u from learn_users where id = uid;
  pts := learn_vip_points(u.data, u.vip_bonus); lv := learn_vip_level(pts);
  return jsonb_build_object('ok', true,
    'walls', coalesce((select jsonb_agg(jsonb_build_object('w', wall, 'src', source, 'at', created_at) order by created_at) from learn_walls where user_id = uid), '[]'::jsonb),
    'claims', coalesce((select jsonb_object_agg(slot, stars) from learn_wall_claims where user_id = uid), '{}'::jsonb),
    'vip', lv, 'vip_pts', pts, 'bonus', u.vip_bonus,
    'share', jsonb_build_object('quota', lv, 'used', (select count(*) from learn_shares where from_id = uid and vip = lv),
      'today', exists (select 1 from learn_shares where from_id = uid and learn_vn_day(created_at) = learn_vn_day()),
      'sent', coalesce((select jsonb_agg(jsonb_build_object('to', s.to_id, 'name', x.name, 'wall', s.wall, 'vip', s.vip, 'at', s.created_at) order by s.created_at desc)
        from learn_shares s join learn_users x on x.id = s.to_id where s.from_id = uid), '[]'::jsonb)),
    'duel_today', exists (select 1 from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()),
    'pick_today', exists (select 1 from learn_duels where winner = uid and picked_at is not null and pick_wall > 0 and learn_vn_day(picked_at) = learn_vn_day()));
end $$;

-- xem bộ sưu tập của một người bạn (để chọn hình chia sẻ / so sánh)
create or replace function learn_walls_of(p_token text, p_uid bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  if p_uid <> uid and not learn_are_friends(uid, p_uid) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
  return jsonb_build_object('ok', true, 'walls', coalesce((select jsonb_agg(wall order by wall) from learn_walls where user_id = p_uid), '[]'::jsonb),
    'vip', learn_user_vip(p_uid), 'got_from_me', exists (select 1 from learn_shares where from_id = uid and to_id = p_uid and vip = learn_user_vip(uid)));
end $$;

-- ============ VIP chia sẻ hình nền ============
-- Ở VIP L: chia sẻ tối đa L hình (mỗi hình cho một người khác nhau), mỗi người chỉ nhận 1 hình ở mỗi cấp VIP, mỗi ngày 1 lần chia sẻ.
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

-- ============ thông báo & lời mời ============
create or replace function learn_notifs(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload, 'at', n.created_at, 'read', n.read_at is not null,
      'actor', n.actor, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', case when u.id is not null then learn_vip_level(learn_vip_points(u.data, u.vip_bonus)) end) order by n.created_at desc)
      from (select * from learn_notifs where user_id = uid order by created_at desc limit 40) n left join learn_users u on u.id = n.actor), '[]'::jsonb));
end $$;

create or replace function learn_notifs_read(p_token text, p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  update learn_notifs set read_at = now() where user_id = uid and read_at is null and (p_ids is null or id = any(p_ids));
  return jsonb_build_object('ok', true);
end $$;

-- mời bạn vào quiz (PIN) hoặc lớp học (mã lớp)
create or replace function learn_invite(p_token text, p_to bigint, p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); pl jsonb;
begin
  if p_kind not in ('quiz', 'class') then return jsonb_build_object('ok', false, 'error', 'badkind'); end if;
  if not learn_are_friends(uid, p_to) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
  if (select count(*) from learn_notifs where actor = uid and kind in ('quiz', 'class') and created_at > now() - interval '1 hour') >= 40 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  if p_kind = 'quiz' then
    if not exists (select 1 from learn_quiz_games where pin = p_payload->>'pin' and state <> 'ended') then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
    pl := jsonb_build_object('pin', p_payload->>'pin', 'title', left(coalesce(p_payload->>'title', 'Live quiz'), 80));
  else
    if learn_room_role((p_payload->>'room')::bigint, uid) is null then return jsonb_build_object('ok', false, 'error', 'notmember'); end if;
    pl := (select jsonb_build_object('room', id, 'code', code, 'name', name) from learn_rooms where id = (p_payload->>'room')::bigint);
  end if;
  if exists (select 1 from learn_notifs where user_id = p_to and actor = uid and kind = p_kind and payload = pl and created_at > now() - interval '30 minutes') then return jsonb_build_object('ok', true, 'again', true); end if;
  perform learn_notify(p_to, p_kind, uid, pl);
  return jsonb_build_object('ok', true);
end $$;

-- ============ khiêu chiến 1-1 (không cần online cùng lúc) ============
create or replace function learn_duel_clean(p jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; e jsonb; o jsonb; n int; k int := 0;
begin
  if jsonb_typeof(p) <> 'array' then return out; end if;
  for e in select value from jsonb_array_elements(p) limit 15 loop
    if jsonb_typeof(e->'opts') <> 'array' then continue; end if;
    n := jsonb_array_length(e->'opts');
    if n < 2 or n > 4 or coalesce(char_length(e->>'q'), 0) = 0 then continue; end if;
    select jsonb_agg(left(v, 120)) into o from jsonb_array_elements_text(e->'opts') v;
    out := out || jsonb_build_array(jsonb_build_object('q', left(e->>'q', 300), 'opts', o, 'a', least(greatest(coalesce((e->>'a')::int, 0), 0), n - 1),
      'd', least(greatest(coalesce((e->>'d')::int, k / 2), 0), 4), 'zh', coalesce((e->>'zh')::boolean, false)));
    k := k + 1;
  end loop;
  return out;
end $$;
create or replace function learn_duel_public(q jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(x - 'a' order by i), '[]'::jsonb) from jsonb_array_elements(q) with ordinality t(x, i)
$$;
-- chấm điểm: đúng = 100 × hệ số độ khó (1 → 2) × (1 + 0.5 × tốc độ), mỗi câu tối đa 20 giây
create or replace function learn_duel_grade(q jsonb, ans jsonb) returns jsonb language plpgsql immutable as $$
declare i int; n int := jsonb_array_length(q); c int; ms int; ok boolean; w numeric; pts int := 0; cor int := 0; tms int := 0; det jsonb := '[]'::jsonb; p int;
begin
  for i in 0..n - 1 loop
    c := (ans->i->>'c')::int; ms := least(greatest(coalesce((ans->i->>'ms')::int, 20000), 0), 20000);
    ok := c is not null and c = (q->i->>'a')::int;
    w := 1 + coalesce((q->i->>'d')::int, 0) * 0.25;
    p := case when ok then round(100 * w * (1 + 0.5 * (1 - ms / 20000.0))) else 0 end;
    pts := pts + p; if ok then cor := cor + 1; end if; tms := tms + ms;
    det := det || jsonb_build_array(jsonb_build_object('c', c, 'ok', ok, 'ms', ms, 'p', p));
  end loop;
  return jsonb_build_object('score', pts, 'correct', cor, 'ms', tms, 'n', n, 'det', det, 'at', now());
end $$;

create or replace function learn_duel_create(p_token text, p_to bigint, p_lang text, p_title text, p_questions jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := p_to; q jsonb := learn_duel_clean(p_questions); d learn_duels; rnd boolean := p_to is null;
begin
  if jsonb_array_length(q) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  if exists (select 1 from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()) then return jsonb_build_object('ok', false, 'error', 'duel_today'); end if;
  if o is null then
    select id into o from learn_users x where x.id <> uid and not x.banned and x.last_seen > now() - interval '3 days'
      and not exists (select 1 from learn_duels d2 where d2.state in ('a_play', 'b_turn') and ((d2.a = uid and d2.b = x.id) or (d2.b = uid and d2.a = x.id)))
      order by abs(learn_vip_level(learn_vip_points(x.data, x.vip_bonus)) - learn_user_vip(uid)), random() limit 1;
    if o is null then return jsonb_build_object('ok', false, 'error', 'noone'); end if;
  else
    if o = uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
    if not learn_are_friends(uid, o) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
    if exists (select 1 from learn_duels where state in ('a_play', 'b_turn') and ((a = uid and b = o) or (b = uid and a = o))) then return jsonb_build_object('ok', false, 'error', 'duel_open'); end if;
  end if;
  insert into learn_duels(a, b, lang, title, questions, random) values (uid, o, coalesce(nullif(p_lang, ''), 'en'), left(coalesce(nullif(btrim(p_title), ''), 'Duel'), 80), q, rnd) returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id, 'opponent', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vip_level(learn_vip_points(data, vip_bonus))) from learn_users where id = o),
    'questions', learn_duel_public(d.questions));
end $$;

create or replace function learn_duel_view(d learn_duels, uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'title', d.title, 'lang', d.lang, 'state', d.state, 'random', d.random, 'created_at', d.created_at, 'expires_at', d.expires_at,
    'role', case when d.a = uid then 'a' else 'b' end,
    'my_turn', (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn' and d.expires_at > now()),
    'me', case when d.a = uid then d.a_res - 'det' else d.b_res - 'det' end,
    'them', case when d.state = 'done' then (case when d.a = uid then d.b_res else d.a_res end) - 'det' when d.a = uid then null else d.a_res - 'det' end,
    'opp', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vip_level(learn_vip_points(data, vip_bonus))) from learn_users where id = case when d.a = uid then d.b else d.a end),
    'winner', d.winner, 'won', d.winner = uid, 'pick_wall', d.pick_wall, 'can_pick', d.winner = uid and d.pick_wall is null, 'n', jsonb_array_length(d.questions))
$$;

create or replace function learn_duel_get(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels;
begin
  select * into d from learn_duels where id = p_id and (a = uid or b = uid);
  if not found then return jsonb_build_object('ok', false, 'error', 'noduel'); end if;
  if d.state in ('a_play', 'b_turn') and d.expires_at < now() then update learn_duels set state = 'expired' where id = d.id returning * into d; end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid),
    'questions', case when (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn') then learn_duel_public(d.questions) when d.state = 'done' then d.questions end,
    'my_det', case when d.state = 'done' then case when d.a = uid then d.a_res->'det' else d.b_res->'det' end end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

create or replace function learn_duel_submit(p_token text, p_id bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; r jsonb; w bigint; l bigint; opts int;
begin
  select * into d from learn_duels where id = p_id and (a = uid or b = uid) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'noduel'); end if;
  r := learn_duel_grade(d.questions, coalesce(p_answers, '[]'::jsonb));
  if d.a = uid and d.state = 'a_play' then
    update learn_duels set a_res = r, state = 'b_turn', expires_at = now() + interval '3 days' where id = d.id returning * into d;
    perform learn_notify(d.b, 'duel', uid, jsonb_build_object('duel', d.id, 'title', d.title));
  elsif d.b = uid and d.state = 'b_turn' and d.expires_at > now() then
    w := case when (r->>'score')::int > (d.a_res->>'score')::int then d.b when (r->>'score')::int < (d.a_res->>'score')::int then d.a
              when (r->>'ms')::int < (d.a_res->>'ms')::int then d.b when (r->>'ms')::int > (d.a_res->>'ms')::int then d.a end;
    l := case when w = d.a then d.b when w = d.b then d.a end;
    update learn_duels set b_res = r, state = 'done', winner = w where id = d.id returning * into d;
    if w is not null then
      perform learn_add_bonus(w, 5); perform learn_add_bonus(l, 1);
      select count(*) into opts from learn_walls lw where lw.user_id = l and not exists (select 1 from learn_walls x where x.user_id = w and x.wall = lw.wall);
      if opts = 0 then update learn_duels set pick_wall = 0 where id = d.id returning * into d; perform learn_add_bonus(w, 10); end if;
    else perform learn_add_bonus(d.a, 2); perform learn_add_bonus(d.b, 2); end if;
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', w = d.a, 'draw', w is null));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', w = d.b, 'draw', w is null, 'silent', true));
  else
    return jsonb_build_object('ok', false, 'error', case when d.state = 'expired' or d.expires_at < now() then 'expired' else 'notyourturn' end);
  end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid), 'det', r->'det', 'questions', case when d.state = 'done' then d.questions end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

create or replace function learn_duel_decline(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels;
begin
  update learn_duels set state = 'declined' where id = p_id and b = uid and state = 'b_turn' returning * into d;
  if found then perform learn_notify(d.a, 'duel_declined', uid, jsonb_build_object('duel', d.id)); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function learn_duel_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  update learn_duels set state = 'expired' where state in ('a_play', 'b_turn') and expires_at < now() and (a = uid or b = uid);
  return jsonb_build_object('ok', true,
    'items', coalesce((select jsonb_agg(learn_duel_view(d, uid) order by d.created_at desc) from (select * from learn_duels where a = uid or b = uid order by created_at desc limit 40) d), '[]'::jsonb),
    'duel_today', exists (select 1 from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()),
    'pick_today', exists (select 1 from learn_duels where winner = uid and picked_at is not null and pick_wall > 0 and learn_vn_day(picked_at) = learn_vn_day()),
    'wins', (select count(*) from learn_duels where winner = uid), 'played', (select count(*) from learn_duels where (a = uid or b = uid) and state = 'done'),
    'pool', (select count(*) from learn_users where id <> uid and not banned and last_seen > now() - interval '3 days'));
end $$;

create or replace function learn_duel_options(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; l bigint;
begin
  select * into d from learn_duels where id = p_id and winner = uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'notwinner'); end if;
  l := case when d.a = uid then d.b else d.a end;
  return jsonb_build_object('ok', true, 'picked', d.pick_wall, 'walls', coalesce((select jsonb_agg(lw.wall order by lw.wall) from learn_walls lw where lw.user_id = l
    and not exists (select 1 from learn_walls x where x.user_id = uid and x.wall = lw.wall)), '[]'::jsonb),
    'pick_today', exists (select 1 from learn_duels where winner = uid and picked_at is not null and pick_wall > 0 and learn_vn_day(picked_at) = learn_vn_day()));
end $$;

create or replace function learn_duel_pick(p_token text, p_id bigint, p_wall int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; l bigint; nm text;
begin
  select * into d from learn_duels where id = p_id and winner = uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'notwinner'); end if;
  if d.pick_wall is not null then return jsonb_build_object('ok', false, 'error', 'picked'); end if;
  if exists (select 1 from learn_duels where winner = uid and picked_at is not null and pick_wall > 0 and learn_vn_day(picked_at) = learn_vn_day()) then return jsonb_build_object('ok', false, 'error', 'pick_today'); end if;
  l := case when d.a = uid then d.b else d.a end;
  if not exists (select 1 from learn_walls where user_id = l and wall = p_wall) then return jsonb_build_object('ok', false, 'error', 'notowned'); end if;
  select name into nm from learn_users where id = l;
  if not learn_give_wall(uid, p_wall, 'duel:' || nm) then return jsonb_build_object('ok', false, 'error', 'youhave'); end if;
  update learn_duels set pick_wall = p_wall, picked_at = now() where id = d.id;
  perform learn_notify(l, 'duel_pick', uid, jsonb_build_object('duel', d.id, 'wall', p_wall));
  return jsonb_build_object('ok', true);
end $$;

-- ============ quiz: thêm câu đùa ("fun") + phần thưởng cho người thắng ============
create or replace function learn_quiz_clean(p jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; e jsonb; o jsonb; n int;
begin
  if jsonb_typeof(p) <> 'array' then return out; end if;
  for e in select value from jsonb_array_elements(p) limit 100 loop
    if jsonb_typeof(e->'opts') <> 'array' then continue; end if;
    n := jsonb_array_length(e->'opts');
    if n < 2 or n > 4 or coalesce(char_length(e->>'q'), 0) = 0 then continue; end if;
    select jsonb_agg(left(v, 120)) into o from jsonb_array_elements_text(e->'opts') v;
    out := out || jsonb_build_array(jsonb_build_object('q', left(e->>'q', 300), 'opts', o, 'a', least(greatest(coalesce((e->>'a')::int, 0), 0), n - 1),
      't', least(greatest(coalesce((e->>'t')::int, 0), 0), 240), 'note', left(coalesce(e->>'note', ''), 200), 'fun', left(coalesce(e->>'fun', ''), 240)));
  end loop;
  return out;
end $$;

-- người thắng (đã đăng nhập, ván ≥ 3 người, ≥ 5 câu): 1 hình nền ngẫu nhiên chưa có (mỗi ngày 1 hình từ quiz) + điểm VIP
create or replace function learn_quiz_award(p_game bigint) returns void language plpgsql as $$
declare g learn_quiz_games; r record; k int := 0; w int; t text;
begin
  select * into g from learn_quiz_games where id = p_game for update;
  if g.awarded then return; end if;
  update learn_quiz_games set awarded = true where id = g.id;
  if jsonb_array_length(g.questions) < 5 or (select count(*) from learn_quiz_players where game_id = g.id and not kicked) < 3 then return; end if;
  for r in select * from learn_quiz_players where game_id = g.id and not kicked and user_id is not null order by score desc, correct desc, joined_at loop
    k := k + 1;
    if r.user_id = g.host_user then continue; end if;
    if k = 1 then
      perform learn_add_bonus(r.user_id, 10);
      w := null;
      if not exists (select 1 from learn_walls where user_id = r.user_id and source like 'quiz:%' and learn_vn_day(created_at) = learn_vn_day()) then
        select c.id into w from learn_wall_catalog c where not exists (select 1 from learn_walls x where x.user_id = r.user_id and x.wall = c.id) order by random() limit 1;
        if w is not null then perform learn_give_wall(r.user_id, w, 'quiz:' || g.title); end if;
      end if;
      perform learn_notify(r.user_id, 'quiz_win', g.host_user, jsonb_build_object('title', g.title, 'wall', w, 'rank', 1, 'pts', 10));
    elsif k <= 3 then
      perform learn_add_bonus(r.user_id, case when k = 2 then 6 else 4 end);
      perform learn_notify(r.user_id, 'quiz_win', g.host_user, jsonb_build_object('title', g.title, 'rank', k, 'pts', case when k = 2 then 6 else 4 end));
    else perform learn_add_bonus(r.user_id, 1); end if;
  end loop;
end $$;

create or replace function learn_quiz_host_action(p_key uuid, p_action text, p_arg jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games;
begin
  select * into g from learn_quiz_games where host_key = p_key for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  if p_action = 'start' and g.state = 'lobby' then
    update learn_quiz_games set state = 'question', q_index = 0, q_started_at = now() + interval '3 seconds' where id = g.id;
  elsif p_action = 'reveal' and g.state = 'question' then
    update learn_quiz_players p set streak = 0 where p.game_id = g.id and not exists (select 1 from learn_quiz_answers a where a.game_id = g.id and a.player_id = p.id and a.q_index = g.q_index);
    update learn_quiz_games set state = 'reveal' where id = g.id;
  elsif p_action = 'board' and g.state = 'reveal' then
    update learn_quiz_games set state = 'board' where id = g.id;
  elsif p_action = 'next' and g.state in ('reveal', 'board') then
    if g.q_index + 1 >= jsonb_array_length(g.questions) then
      update learn_quiz_games set state = 'ended', ended_at = now() where id = g.id;
      perform learn_quiz_award(g.id);
    else
      update learn_quiz_games set state = 'question', q_index = g.q_index + 1, q_started_at = now() + interval '3 seconds' where id = g.id;
    end if;
  elsif p_action = 'end' then
    update learn_quiz_games set state = 'ended', ended_at = now() where id = g.id;
    if g.state <> 'lobby' and g.q_index + 1 >= jsonb_array_length(g.questions) then perform learn_quiz_award(g.id); else update learn_quiz_games set awarded = true where id = g.id; end if;
  elsif p_action = 'kick' then
    update learn_quiz_players set kicked = true where game_id = g.id and id = (p_arg->>'id')::bigint;
  elsif p_action = 'lock' then
    update learn_quiz_games set locked = not locked where id = g.id;
  end if;
  return learn_quiz_host_state(p_key);
end $$;

-- câu đùa hiện cho người chơi khi lộ đáp án
create or replace function learn_quiz_play_state(p_pin text, p_pkey uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; pl learn_quiz_players; q jsonb; my learn_quiz_answers; rk int; showq boolean;
begin
  select p.* into pl from learn_quiz_players p where p.pkey = p_pkey;
  if not found then return jsonb_build_object('ok', false, 'error', 'noplayer'); end if;
  if pl.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into g from learn_quiz_games where id = pl.game_id;
  q := case when g.q_index >= 0 then g.questions->g.q_index end;
  showq := coalesce((g.settings->>'show_q')::boolean, true);
  select * into my from learn_quiz_answers where game_id = g.id and player_id = pl.id and q_index = g.q_index;
  select count(*) + 1 into rk from learn_quiz_players where game_id = g.id and not kicked and (score > pl.score);
  return jsonb_build_object('ok', true, 'title', g.title, 'state', g.state, 'q_index', g.q_index, 'total', jsonb_array_length(g.questions),
    'nick', pl.nick, 'score', pl.score, 'streak', pl.streak, 'rank', rk, 'players', (select count(*) from learn_quiz_players where game_id = g.id and not kicked),
    'n_opts', case when q is not null then jsonb_array_length(q->'opts') end,
    'q', case when q is not null and g.state <> 'lobby' and showq then q->>'q' end,
    'opts', case when q is not null and g.state <> 'lobby' and showq then q->'opts' end,
    'time', case when q is not null then learn_quiz_qtime(g) end,
    'elapsed_ms', case when g.q_started_at is not null then (extract(epoch from now() - g.q_started_at) * 1000)::int end,
    'answered', my.choice is not null, 'choice', my.choice,
    'result', case when g.state in ('reveal', 'board', 'ended') and q is not null then jsonb_build_object('correct', coalesce(my.correct, false), 'points', coalesce(my.points, 0), 'a', (q->>'a')::int, 'note', q->>'note', 'fun', q->>'fun', 'answered', my.choice is not null) end,
    'board', case when g.state in ('board', 'ended') then learn_quiz_board(g.id, 5) end,
    'award', case when g.state = 'ended' and pl.user_id is not null then (select payload from learn_notifs where user_id = pl.user_id and kind = 'quiz_win' and payload->>'title' = g.title and created_at > g.created_at order by created_at desc limit 1) end);
end $$;

-- ============ quyền ============
revoke all on learn_wall_catalog, learn_wall_slots, learn_course_meta, learn_walls, learn_wall_claims, learn_shares, learn_notifs, learn_duels from anon, authenticated;
revoke execute on function learn_notify(bigint, text, bigint, jsonb), learn_give_wall(bigint, int, text), learn_add_bonus(bigint, int), learn_quiz_award(bigint) from anon, authenticated, public;
grant execute on function learn_wall_claim(text, text, int), learn_walls_mine(text), learn_walls_of(text, bigint), learn_share(text, bigint, int),
  learn_notifs(text), learn_notifs_read(text, bigint[]), learn_invite(text, bigint, text, jsonb),
  learn_duel_create(text, bigint, text, text, jsonb), learn_duel_get(text, bigint), learn_duel_submit(text, bigint, jsonb), learn_duel_decline(text, bigint),
  learn_duel_list(text), learn_duel_options(text, bigint), learn_duel_pick(text, bigint, int) to anon, authenticated;
