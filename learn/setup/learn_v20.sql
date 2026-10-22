-- learn v20: email + số điện thoại cho tài khoản, đăng nhập bằng tên / email / số điện thoại,
-- đổi tên, đổi PIN, quên PIN (gửi yêu cầu cho admin), duel từ bảng xếp hạng (không cần là bạn).
-- Chỉ THÊM bảng / hàm; dữ liệu cũ của learn_users giữ nguyên (đổi tên / PIN chỉ khi chính người dùng hoặc admin yêu cầu).

-- ============ liên hệ của tài khoản ============
create table if not exists learn_contacts (
  user_id bigint primary key references learn_users(id) on delete cascade,
  email text not null, email_key text not null unique,
  phone text not null, phone_key text not null unique,
  updated_at timestamptz not null default now()
);
-- PIN tạm do admin cấp: phải đổi ở lần đăng nhập kế tiếp
create table if not exists learn_pin_temp (user_id bigint primary key references learn_users(id) on delete cascade, issued_at timestamptz not null default now());
-- yêu cầu quên PIN (admin xử lý)
create table if not exists learn_pin_requests (
  id bigserial primary key,
  ident text not null,               -- tên / email / số điện thoại người dùng nhập
  contact text not null default '',  -- cách liên hệ họ muốn admin dùng
  note text not null default '',
  user_id bigint references learn_users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists learn_pin_requests_status on learn_pin_requests(status, created_at desc);
-- nhật ký thay đổi tài khoản (đổi tên, đổi PIN, đổi liên hệ, admin cấp PIN)
create table if not exists learn_account_log (id bigserial primary key, user_id bigint references learn_users(id) on delete cascade, kind text not null, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
alter table learn_contacts enable row level security;
alter table learn_pin_temp enable row level security;
alter table learn_pin_requests enable row level security;
alter table learn_account_log enable row level security;

create or replace function learn_email_key(p text) returns text language sql immutable as $$
  select case when lower(btrim(coalesce(p, ''))) ~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then lower(btrim(p)) end
$$;
-- số Việt Nam: +84 / 84 → 0; giữ lại chữ số; 9–15 số
create or replace function learn_phone_key(p text) returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if d ~ '^84[0-9]{9,10}$' then d := '0' || substr(d, 3); end if;
  if d ~ '^[1-9][0-9]{8,9}$' then d := '0' || d; end if;
  if char_length(d) between 9 and 15 then return d; end if;
  return null;
end $$;
create or replace function learn_name_ok(p text) returns boolean language sql immutable as $$
  select char_length(btrim(coalesce(p, ''))) between 3 and 24 and btrim(p) ~ '^[[:alnum:] ._-]+$' and btrim(p) !~ '^[0-9 ._-]+$'
$$;
-- tên / email / số điện thoại → name_key
create or replace function learn_resolve(p_ident text) returns text language plpgsql stable security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_ident, ''))); r text;
begin
  if exists (select 1 from learn_users where name_key = k) then return k; end if;
  if position('@' in k) > 0 then
    select u.name_key into r from learn_contacts c join learn_users u on u.id = c.user_id where c.email_key = k;
  elsif learn_phone_key(k) is not null then
    select u.name_key into r from learn_contacts c join learn_users u on u.id = c.user_id where c.phone_key = learn_phone_key(k);
  end if;
  return coalesce(r, k);
end $$;

-- ============ đăng ký có email + điện thoại ============
create or replace function learn_register2(p_name text, p_pin text, p_data jsonb, p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); ek text := learn_email_key(p_email); pk text := learn_phone_key(p_phone); uid bigint;
begin
  if not learn_name_ok(p_name) then return jsonb_build_object('ok', false, 'error', 'badname'); end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then return jsonb_build_object('ok', false, 'error', 'badpin'); end if;
  if ek is null then return jsonb_build_object('ok', false, 'error', 'bademail'); end if;
  if pk is null then return jsonb_build_object('ok', false, 'error', 'badphone'); end if;
  if pg_column_size(p_data) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  if exists (select 1 from learn_users where name_key = k) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if exists (select 1 from learn_contacts where email_key = ek) then return jsonb_build_object('ok', false, 'error', 'emailtaken'); end if;
  if exists (select 1 from learn_contacts where phone_key = pk) then return jsonb_build_object('ok', false, 'error', 'phonetaken'); end if;
  insert into learn_users(name, name_key, pin_hash, data) values (btrim(p_name), k, crypt(p_pin, gen_salt('bf', 8)), coalesce(p_data, '{}'::jsonb)) returning id into uid;
  insert into learn_contacts(user_id, email, email_key, phone, phone_key) values (uid, btrim(p_email), ek, btrim(p_phone), pk);
  return jsonb_build_object('ok', true, 'name', btrim(p_name));
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- ============ đăng nhập bằng tên / email / số điện thoại ============
create or replace function learn_login(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text := learn_resolve(p_name); e text; u learn_users;
begin
  e := learn_check(k, p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  select * into u from learn_users where name_key = k;
  return jsonb_build_object('ok', true, 'name', u.name, 'data', u.data);
end $$;

create or replace function learn_auth(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text := learn_resolve(p_name); e text; u learn_users; t text;
begin
  e := learn_check(k, p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  select * into u from learn_users where name_key = k;
  if u.banned then return jsonb_build_object('ok', false, 'error', 'banned'); end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into learn_sessions(token_hash, user_id) values (encode(digest(t, 'sha256'), 'hex'), u.id);
  delete from learn_sessions where user_id = u.id and token_hash not in (select token_hash from learn_sessions where user_id = u.id order by last_used desc limit 10);
  update learn_users set last_seen = now() where id = u.id;
  return jsonb_build_object('ok', true, 'token', t, 'uid', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''));
end $$;

-- ============ cài đặt tài khoản ============
create or replace function learn_contact_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid bigint := learn_uid(p_token); c learn_contacts;
begin
  select * into c from learn_contacts where user_id = uid;
  return jsonb_build_object('ok', true, 'email', c.email, 'phone', c.phone, 'has', c.user_id is not null, 'must_pin', exists (select 1 from learn_pin_temp where user_id = uid));
end $$;

-- lần đầu thêm liên hệ: không cần PIN; đổi liên hệ đã có: cần PIN hiện tại
create or replace function learn_contact_set(p_token text, p_pin text, p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; ek text := learn_email_key(p_email); pk text := learn_phone_key(p_phone); had boolean; e text;
begin
  select * into u from learn_users where id = uid;
  if ek is null then return jsonb_build_object('ok', false, 'error', 'bademail'); end if;
  if pk is null then return jsonb_build_object('ok', false, 'error', 'badphone'); end if;
  had := exists (select 1 from learn_contacts where user_id = uid);
  if had then e := learn_check(u.name_key, p_pin); if e is not null then return jsonb_build_object('ok', false, 'error', e); end if; end if;
  if exists (select 1 from learn_contacts where email_key = ek and user_id <> uid) then return jsonb_build_object('ok', false, 'error', 'emailtaken'); end if;
  if exists (select 1 from learn_contacts where phone_key = pk and user_id <> uid) then return jsonb_build_object('ok', false, 'error', 'phonetaken'); end if;
  insert into learn_contacts(user_id, email, email_key, phone, phone_key) values (uid, btrim(p_email), ek, btrim(p_phone), pk)
    on conflict (user_id) do update set email = excluded.email, email_key = excluded.email_key, phone = excluded.phone, phone_key = excluded.phone_key, updated_at = now();
  insert into learn_account_log(user_id, kind) values (uid, case when had then 'contact_change' else 'contact_add' end);
  if had then perform learn_notify(uid, 'security', null, jsonb_build_object('what', 'contact')); end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'emailtaken');
end $$;

-- đổi tên tài khoản (tên đăng nhập + tên hiển thị); tối đa 3 lần / 30 ngày
create or replace function learn_rename(p_token text, p_pin text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; e text; k text := lower(btrim(coalesce(p_name, '')));
begin
  select * into u from learn_users where id = uid;
  e := learn_check(u.name_key, p_pin); if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if not learn_name_ok(p_name) then return jsonb_build_object('ok', false, 'error', 'badname'); end if;
  if k = u.name_key and btrim(p_name) = u.name then return jsonb_build_object('ok', true, 'name', u.name); end if;
  if exists (select 1 from learn_users where name_key = k and id <> uid) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if (select count(*) from learn_account_log where user_id = uid and kind = 'rename' and created_at > now() - interval '30 days') >= 3 then return jsonb_build_object('ok', false, 'error', 'renamelimit'); end if;
  update learn_users set name = btrim(p_name), name_key = k where id = uid;
  insert into learn_account_log(user_id, kind, detail) values (uid, 'rename', jsonb_build_object('from', u.name, 'to', btrim(p_name)));
  return jsonb_build_object('ok', true, 'name', btrim(p_name));
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- đổi PIN: cần PIN hiện tại; đăng xuất các thiết bị khác
create or replace function learn_change_pin(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; e text;
begin
  select * into u from learn_users where id = uid;
  e := learn_check(u.name_key, p_old); if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if coalesce(p_new, '') !~ '^\d{4,6}$' then return jsonb_build_object('ok', false, 'error', 'badpin'); end if;
  if p_new = p_old then return jsonb_build_object('ok', false, 'error', 'samepin'); end if;
  update learn_users set pin_hash = crypt(p_new, gen_salt('bf', 8)), fails = 0, lock_until = null where id = uid;
  delete from learn_pin_temp where user_id = uid;
  delete from learn_sessions where user_id = uid and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  insert into learn_account_log(user_id, kind) values (uid, 'pin_change');
  perform learn_notify(uid, 'security', null, jsonb_build_object('what', 'pin'));
  return jsonb_build_object('ok', true);
end $$;

-- quên PIN: luôn trả ok (không tiết lộ tài khoản có tồn tại hay không)
create or replace function learn_forgot(p_ident text, p_contact text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := learn_resolve(p_ident); uid bigint;
begin
  if char_length(btrim(coalesce(p_ident, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if (select count(*) from learn_pin_requests where lower(ident) = lower(btrim(p_ident)) and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from learn_pin_requests where created_at > now() - interval '1 hour') >= 60 then return jsonb_build_object('ok', true); end if;
  select id into uid from learn_users where name_key = k;
  insert into learn_pin_requests(ident, contact, note, user_id) values (left(btrim(p_ident), 120), left(btrim(coalesce(p_contact, '')), 120), left(btrim(coalesce(p_note, '')), 300), uid);
  return jsonb_build_object('ok', true);
end $$;

-- ============ admin ============
create or replace function learn_admin_pin_requests(p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'ident', r.ident, 'contact', r.contact, 'note', r.note, 'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
      'user_id', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'last_seen', u.last_seen, 'email', c.email, 'phone', c.phone,
      'contact_match', c.user_id is not null and (learn_email_key(r.contact) = c.email_key or learn_phone_key(r.contact) = c.phone_key or learn_email_key(r.ident) = c.email_key or learn_phone_key(r.ident) = c.phone_key),
      'recent', (select count(*) from learn_pin_requests x where x.user_id = r.user_id and x.created_at > now() - interval '7 days'))
    order by r.created_at desc)
    from (select * from learn_pin_requests where p_status is null or p_status = '' or status = p_status order by created_at desc limit 200) r
    left join learn_users u on u.id = r.user_id left join learn_contacts c on c.user_id = u.id), '[]'::jsonb);
end $$;

-- 'issue': cấp PIN tạm 6 số (trả về cho admin gửi cho người dùng), 'done' / 'dismissed': đóng yêu cầu
create or replace function learn_admin_pin_action(p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r learn_pin_requests; pin text;
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  select * into r from learn_pin_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'norequest'); end if;
  if p_action = 'issue' then
    if r.user_id is null then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
    pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    update learn_users set pin_hash = crypt(pin, gen_salt('bf', 8)), fails = 0, lock_until = null where id = r.user_id;
    delete from learn_sessions where user_id = r.user_id;
    insert into learn_pin_temp(user_id) values (r.user_id) on conflict (user_id) do update set issued_at = now();
    update learn_pin_requests set status = 'done', resolved_at = now() where id = r.id;
    update learn_pin_requests set status = 'done', resolved_at = now() where user_id = r.user_id and status = 'open';
    insert into learn_account_log(user_id, kind, detail) values (r.user_id, 'admin_pin', jsonb_build_object('request', r.id));
    return jsonb_build_object('ok', true, 'pin', pin, 'name', (select name from learn_users where id = r.user_id));
  elsif p_action in ('done', 'dismissed', 'open') then
    update learn_pin_requests set status = p_action, resolved_at = case when p_action = 'open' then null else now() end where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'badaction');
end $$;

create or replace function learn_admin_contact(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('email', (select email from learn_contacts where user_id = p_id), 'phone', (select phone from learn_contacts where user_id = p_id),
    'must_pin', exists (select 1 from learn_pin_temp where user_id = p_id),
    'log', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'detail', detail, 'at', created_at) order by created_at desc) from (select * from learn_account_log where user_id = p_id order by created_at desc limit 20) l), '[]'::jsonb));
end $$;

-- ============ learn_me: thêm cờ liên hệ + PIN tạm ============
create or replace function learn_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; pts int;
begin
  select * into u from learn_users where id = uid;
  pts := learn_vip_points(u.data, u.vip_bonus);
  perform learn_duel_resolve();
  return jsonb_build_object('ok', true, 'uid', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''),
    'vip', learn_vip_level(pts), 'vip_pts', pts, 'bonus', u.vip_bonus,
    'requests', (select count(*) from learn_friends where (a = uid or b = uid) and status = 'pending' and requester <> uid),
    'rooms', (select count(*) from learn_room_members where user_id = uid),
    'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null),
    'duels', (select count(*) from learn_duels where b = uid and state = 'b_turn'),
    'msgs', learn_msg_unread(uid),
    'walls', (select count(*) from learn_walls where user_id = uid),
    'contact', exists (select 1 from learn_contacts where user_id = uid),
    'must_pin', exists (select 1 from learn_pin_temp where user_id = uid));
end $$;

-- ============ duel: được thách đấu người trên bảng xếp hạng (không cần là bạn) ============
create or replace function learn_duel_create(p_token text, p_to bigint, p_lang text, p_title text, p_questions jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := p_to; q jsonb := learn_duel_clean(p_questions); d learn_duels; rnd boolean := p_to is null;
begin
  if jsonb_array_length(q) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  if (select count(*) from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()) >= 10 then return jsonb_build_object('ok', false, 'error', 'duel_today'); end if;
  if o is null then
    select id into o from learn_users x where x.id <> uid and not x.banned and x.last_seen > now() - interval '3 days'
      and not exists (select 1 from learn_duels d2 where d2.state in ('a_play', 'b_turn') and ((d2.a = uid and d2.b = x.id) or (d2.b = uid and d2.a = x.id)))
      order by abs(learn_vip_level(learn_vip_points(x.data, x.vip_bonus)) - learn_user_vip(uid)), random() limit 1;
    if o is null then return jsonb_build_object('ok', false, 'error', 'noone'); end if;
  else
    if o = uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
    if not exists (select 1 from learn_users where id = o and not banned) then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
    if exists (select 1 from learn_duels where state in ('a_play', 'b_turn') and ((a = uid and b = o) or (b = uid and a = o))) then return jsonb_build_object('ok', false, 'error', 'duel_open'); end if;
  end if;
  insert into learn_duels(a, b, lang, title, questions, random, expires_at) values (uid, o, coalesce(nullif(p_lang, ''), 'en'), left(coalesce(nullif(btrim(p_title), ''), 'Duel'), 80), q, rnd, now() + interval '1 day') returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id, 'opponent', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vip_level(learn_vip_points(data, vip_bonus))) from learn_users where id = o),
    'questions', learn_duel_public(d.questions), 'left_today', 10 - (select count(*) from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()));
end $$;

-- ============ quyền ============
revoke all on learn_contacts, learn_pin_temp, learn_pin_requests, learn_account_log from anon, authenticated;
revoke execute on function learn_resolve(text) from anon, authenticated, public;
grant execute on function learn_register2(text, text, jsonb, text, text), learn_login(text, text), learn_auth(text, text), learn_contact_get(text), learn_contact_set(text, text, text, text),
  learn_rename(text, text, text), learn_change_pin(text, text, text), learn_forgot(text, text, text), learn_me(text), learn_duel_create(text, bigint, text, text, jsonb) to anon, authenticated;
grant execute on function learn_admin_pin_requests(text), learn_admin_pin_action(bigint, text), learn_admin_contact(bigint) to authenticated;
revoke execute on function learn_admin_pin_requests(text), learn_admin_pin_action(bigint, text), learn_admin_contact(bigint) from anon, public;
notify pgrst, 'reload schema';
