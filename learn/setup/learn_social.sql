-- desktopchill learn — social features, classes, live quiz, site analytics and admin reports
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent). Does not touch tracker_state / trading_* tables.
-- All tables have RLS on with no policies: they are only reachable through the SECURITY DEFINER functions below.

create extension if not exists pgcrypto with schema extensions;

-- ============ users: extra profile columns ============
alter table learn_users add column if not exists friend_code text;
alter table learn_users add column if not exists avatar text default '';
alter table learn_users add column if not exists last_seen timestamptz;
alter table learn_users add column if not exists banned boolean not null default false;
create unique index if not exists learn_users_friend_code on learn_users(friend_code);

create or replace function learn_rand_code(n int, alphabet text default 'ABCDEFGHJKMNPQRSTUVWXYZ23456789')
returns text language plpgsql volatile as $$
declare s text := ''; i int;
begin
  for i in 1..n loop s := s || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
  return s;
end $$;

do $$ declare r record; c text; begin
  for r in select id from learn_users where friend_code is null loop
    loop c := learn_rand_code(6); exit when not exists (select 1 from learn_users where friend_code = c); end loop;
    update learn_users set friend_code = c where id = r.id;
  end loop;
end $$;

create or replace function learn_users_code_trg() returns trigger language plpgsql as $$
declare c text; begin
  if new.friend_code is null then
    loop c := learn_rand_code(6); exit when not exists (select 1 from learn_users where friend_code = c); end loop;
    new.friend_code := c;
  end if;
  return new;
end $$;
drop trigger if exists learn_users_code on learn_users;
create trigger learn_users_code before insert on learn_users for each row execute function learn_users_code_trg();

-- progress summary from the saved app state
create or replace function learn_summary(d jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'xp', coalesce((d->>'xp')::int, 0),
    'streak', coalesce((d->'streak'->>'n')::int, 0),
    'lang', coalesce(d->>'lang', 'en'),
    'level', coalesce(d->'level', '{}'::jsonb),
    'words', coalesce((select count(*) from jsonb_object_keys(case when jsonb_typeof(d->'srs') = 'object' then d->'srs' else '{}'::jsonb end)), 0),
    'lessons', coalesce((select sum((select count(*) from jsonb_array_elements(v) e where e::text in ('1', 'true'))) from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where jsonb_typeof(v) = 'array'), 0),
    'units', coalesce((select count(*) from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where jsonb_typeof(v) = 'array' and jsonb_array_length(v) >= 8 and not exists (select 1 from jsonb_array_elements(v) e where e::text not in ('1', 'true'))), 0),
    'by_lang', jsonb_build_object(
      'en', coalesce((select count(*) from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where k like 'en-%' and jsonb_typeof(v) = 'array' and exists (select 1 from jsonb_array_elements(v) e where e::text in ('1','true'))), 0),
      'zh', coalesce((select count(*) from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where k like 'zh-%' and jsonb_typeof(v) = 'array' and exists (select 1 from jsonb_array_elements(v) e where e::text in ('1','true'))), 0),
      'ielts', coalesce((select count(*) from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v) where k like 'ielts-%' and jsonb_typeof(v) = 'array' and exists (select 1 from jsonb_array_elements(v) e where e::text in ('1','true'))), 0)
    )
  )
$$;

-- ============ sessions (token instead of sending the PIN on every call) ============
create table if not exists learn_sessions (
  token_hash text primary key,
  user_id bigint not null references learn_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now()
);
create index if not exists learn_sessions_user on learn_sessions(user_id);
alter table learn_sessions enable row level security;

create or replace function learn_uid(p_token text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare u bigint;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'auth'; end if;
  select s.user_id into u from learn_sessions s join learn_users lu on lu.id = s.user_id
   where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.last_used > now() - interval '90 days' and not lu.banned;
  if u is null then raise exception 'auth'; end if;
  update learn_sessions set last_used = now() where token_hash = encode(digest(p_token, 'sha256'), 'hex') and last_used < now() - interval '5 minutes';
  update learn_users set last_seen = now() where id = u and (last_seen is null or last_seen < now() - interval '2 minutes');
  return u;
end $$;

create or replace function learn_auth(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); e text; u learn_users; t text;
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

create or replace function learn_name_available(p_name text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'available', not exists (select 1 from learn_users where name_key = lower(btrim(coalesce(p_name, '')))))
$$;

create or replace function learn_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users;
begin
  select * into u from learn_users where id = uid;
  return jsonb_build_object('ok', true, 'uid', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''),
    'requests', (select count(*) from learn_friends where (a = uid or b = uid) and status = 'pending' and requester <> uid),
    'rooms', (select count(*) from learn_room_members where user_id = uid));
end $$;

create or replace function learn_set_avatar(p_token text, p_avatar text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  update learn_users set avatar = left(coalesce(p_avatar, ''), 40) where id = uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function learn_logout(p_token text) returns jsonb
language sql security definer set search_path = public, extensions as $$
  delete from learn_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;

-- ============ friends ============
create table if not exists learn_friends (
  a bigint not null references learn_users(id) on delete cascade,
  b bigint not null references learn_users(id) on delete cascade,
  requester bigint not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists learn_friends_b on learn_friends(b);
alter table learn_friends enable row level security;

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
    if f.requester <> uid then update learn_friends set status = 'accepted' where a = x and b = y; return jsonb_build_object('ok', true, 'accepted', true); end if;
    return jsonb_build_object('ok', false, 'error', 'pending');
  end if;
  if (select count(*) from learn_friends where (a = uid or b = uid)) >= 300 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  insert into learn_friends(a, b, requester) values (x, y, uid);
  return jsonb_build_object('ok', true, 'accepted', false);
end $$;

create or replace function learn_friend_respond(p_token text, p_uid bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  if p_accept then
    update learn_friends set status = 'accepted' where a = least(uid, p_uid) and b = greatest(uid, p_uid) and requester <> uid;
  else
    delete from learn_friends where a = least(uid, p_uid) and b = greatest(uid, p_uid);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function learn_friends_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'status', f.status,
      'incoming', f.status = 'pending' and f.requester <> uid, 'since', f.created_at, 'last_seen', u.last_seen,
      'sum', case when f.status = 'accepted' then learn_summary(u.data) else null end,
      'week_xp', case when f.status = 'accepted' then (select coalesce(sum(value::text::int), 0) from jsonb_each(case when jsonb_typeof(u.data->'days') = 'object' then u.data->'days' else '{}'::jsonb end) where key >= to_char(now() - interval '6 days', 'YYYY-MM-DD') and jsonb_typeof(value) = 'number') else null end)
      order by f.status desc, u.name)
    from learn_friends f join learn_users u on u.id = case when f.a = uid then f.b else f.a end
    where f.a = uid or f.b = uid), '[]'::jsonb),
    'me', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'code', friend_code, 'sum', learn_summary(data),
      'week_xp', (select coalesce(sum(value::text::int), 0) from jsonb_each(case when jsonb_typeof(data->'days') = 'object' then data->'days' else '{}'::jsonb end) where key >= to_char(now() - interval '6 days', 'YYYY-MM-DD') and jsonb_typeof(value) = 'number')) from learn_users where id = uid));
end $$;

-- ============ classes (rooms) ============
create table if not exists learn_rooms (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  lang text not null default 'en',
  level text not null default '',
  owner_id bigint references learn_users(id) on delete set null,
  settings jsonb not null default '{"open": true}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table learn_rooms enable row level security;

create table if not exists learn_room_members (
  room_id bigint not null references learn_rooms(id) on delete cascade,
  user_id bigint not null references learn_users(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher', 'assistant', 'student')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists learn_room_members_user on learn_room_members(user_id);
alter table learn_room_members enable row level security;

create table if not exists learn_room_tasks (
  id bigserial primary key,
  room_id bigint not null references learn_rooms(id) on delete cascade,
  title text not null,
  lang text not null,
  unit_id text not null,
  lesson int,
  due_at timestamptz,
  created_by bigint,
  created_at timestamptz not null default now()
);
create index if not exists learn_room_tasks_room on learn_room_tasks(room_id);
alter table learn_room_tasks enable row level security;

create table if not exists learn_room_posts (
  id bigserial primary key,
  room_id bigint not null references learn_rooms(id) on delete cascade,
  user_id bigint references learn_users(id) on delete set null,
  kind text not null default 'post',
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists learn_room_posts_room on learn_room_posts(room_id, created_at desc);
alter table learn_room_posts enable row level security;

create or replace function learn_room_role(p_room bigint, p_uid bigint) returns text
language sql stable security definer set search_path = public as $$
  select role from learn_room_members where room_id = p_room and user_id = p_uid
$$;

create or replace function learn_room_create(p_token text, p_name text, p_lang text, p_level text, p_desc text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); c text; rid bigint;
begin
  if char_length(btrim(coalesce(p_name, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'badname'); end if;
  if (select count(*) from learn_rooms where owner_id = uid and not archived) >= 20 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  loop c := learn_rand_code(6); exit when not exists (select 1 from learn_rooms where code = c); end loop;
  insert into learn_rooms(code, name, description, lang, level, owner_id) values (c, left(btrim(p_name), 60), left(coalesce(p_desc, ''), 400), coalesce(nullif(p_lang, ''), 'en'), left(coalesce(p_level, ''), 20), uid) returning id into rid;
  insert into learn_room_members(room_id, user_id, role) values (rid, uid, 'teacher');
  insert into learn_room_posts(room_id, user_id, kind, body) values (rid, uid, 'system', 'created the class');
  return jsonb_build_object('ok', true, 'id', rid, 'code', c);
end $$;

create or replace function learn_room_join(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); r learn_rooms;
begin
  select * into r from learn_rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found or r.archived then return jsonb_build_object('ok', false, 'error', 'noroom'); end if;
  if exists (select 1 from learn_room_members where room_id = r.id and user_id = uid) then return jsonb_build_object('ok', true, 'id', r.id, 'already', true); end if;
  if coalesce((r.settings->>'open')::boolean, true) = false then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if (select count(*) from learn_room_members where room_id = r.id) >= coalesce((r.settings->>'max')::int, 200) then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  insert into learn_room_members(room_id, user_id, role) values (r.id, uid, 'student');
  insert into learn_room_posts(room_id, user_id, kind, body) values (r.id, uid, 'system', 'joined the class');
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

create or replace function learn_rooms_mine(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'lang', r.lang, 'level', r.level, 'role', m.role, 'archived', r.archived,
      'members', (select count(*) from learn_room_members x where x.room_id = r.id),
      'tasks', (select count(*) from learn_room_tasks t where t.room_id = r.id),
      'last_post', (select max(created_at) from learn_room_posts p where p.room_id = r.id)) order by r.archived, r.created_at desc)
    from learn_room_members m join learn_rooms r on r.id = m.room_id where m.user_id = uid), '[]'::jsonb));
end $$;

-- full class view: members with progress, tasks with completion, posts, quizzes
create or replace function learn_room_get(p_token text, p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); myrole text := learn_room_role(p_room, uid); r learn_rooms;
begin
  if myrole is null then return jsonb_build_object('ok', false, 'error', 'notmember'); end if;
  select * into r from learn_rooms where id = p_room;
  return jsonb_build_object('ok', true, 'role', myrole, 'me', uid,
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'description', r.description, 'lang', r.lang, 'level', r.level, 'owner', r.owner_id, 'settings', r.settings, 'archived', r.archived, 'created_at', r.created_at),
    'members', coalesce((select jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'avatar', coalesce(u.avatar, ''), 'role', m.role, 'joined_at', m.joined_at, 'last_seen', u.last_seen,
        'sum', learn_summary(u.data),
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

create or replace function learn_room_admin(p_token text, p_room bigint, p_action text, p_arg jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); myrole text := learn_room_role(p_room, uid); target bigint; trole text; c text; r learn_rooms; nm text;
begin
  if myrole is null then return jsonb_build_object('ok', false, 'error', 'notmember'); end if;
  select * into r from learn_rooms where id = p_room;
  select name into nm from learn_users where id = uid;
  if p_action = 'leave' then
    if r.owner_id = uid and (select count(*) from learn_room_members where room_id = p_room) > 1 then return jsonb_build_object('ok', false, 'error', 'owner'); end if;
    delete from learn_room_members where room_id = p_room and user_id = uid;
    if not exists (select 1 from learn_room_members where room_id = p_room) then delete from learn_rooms where id = p_room; end if;
    return jsonb_build_object('ok', true);
  elsif p_action = 'post' then
    if char_length(btrim(coalesce(p_arg->>'body', ''))) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
    if myrole = 'student' and coalesce((r.settings->>'student_posts')::boolean, true) = false then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    insert into learn_room_posts(room_id, user_id, body) values (p_room, uid, left(btrim(p_arg->>'body'), 1000));
    return jsonb_build_object('ok', true);
  elsif p_action = 'delete_post' then
    delete from learn_room_posts where id = (p_arg->>'id')::bigint and room_id = p_room and (user_id = uid or myrole in ('teacher', 'assistant'));
    return jsonb_build_object('ok', true);
  end if;
  -- staff actions
  if myrole not in ('teacher', 'assistant') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_action = 'pin_post' then
    update learn_room_posts set pinned = not pinned where id = (p_arg->>'id')::bigint and room_id = p_room;
  elsif p_action = 'task_add' then
    if char_length(coalesce(p_arg->>'unit_id', '')) = 0 then return jsonb_build_object('ok', false, 'error', 'nounit'); end if;
    insert into learn_room_tasks(room_id, title, lang, unit_id, lesson, due_at, created_by)
      values (p_room, left(coalesce(nullif(btrim(p_arg->>'title'), ''), 'Assignment'), 120), coalesce(p_arg->>'lang', r.lang), p_arg->>'unit_id', nullif(p_arg->>'lesson', '')::int, nullif(p_arg->>'due_at', '')::timestamptz, uid);
    insert into learn_room_posts(room_id, user_id, kind, body) values (p_room, uid, 'system', 'set a new assignment: ' || left(coalesce(nullif(btrim(p_arg->>'title'), ''), 'Assignment'), 120));
  elsif p_action = 'task_del' then
    delete from learn_room_tasks where id = (p_arg->>'id')::bigint and room_id = p_room;
  elsif p_action = 'kick' then
    target := (p_arg->>'uid')::bigint; trole := learn_room_role(p_room, target);
    if target = r.owner_id or (myrole = 'assistant' and trole <> 'student') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    delete from learn_room_members where room_id = p_room and user_id = target;
  elsif p_action = 'set_role' then
    if myrole <> 'teacher' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    target := (p_arg->>'uid')::bigint;
    if target = r.owner_id then return jsonb_build_object('ok', false, 'error', 'owner'); end if;
    if (p_arg->>'role') not in ('teacher', 'assistant', 'student') then return jsonb_build_object('ok', false, 'error', 'badrole'); end if;
    update learn_room_members set role = p_arg->>'role' where room_id = p_room and user_id = target;
    insert into learn_room_posts(room_id, user_id, kind, body) values (p_room, uid, 'system', 'changed ' || (select name from learn_users where id = target) || '''s role to ' || (p_arg->>'role'));
  elsif p_action = 'transfer' then
    if r.owner_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    target := (p_arg->>'uid')::bigint;
    if learn_room_role(p_room, target) is null then return jsonb_build_object('ok', false, 'error', 'notmember'); end if;
    update learn_rooms set owner_id = target where id = p_room;
    update learn_room_members set role = 'teacher' where room_id = p_room and user_id = target;
    insert into learn_room_posts(room_id, user_id, kind, body) values (p_room, uid, 'system', 'handed the class over to ' || (select name from learn_users where id = target));
  elsif p_action = 'update' then
    if myrole <> 'teacher' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    update learn_rooms set
      name = coalesce(left(nullif(btrim(p_arg->>'name'), ''), 60), name),
      description = coalesce(left(p_arg->>'description', 400), description),
      lang = coalesce(nullif(p_arg->>'lang', ''), lang),
      level = coalesce(left(p_arg->>'level', 20), level),
      settings = settings || coalesce(p_arg->'settings', '{}'::jsonb),
      archived = coalesce((p_arg->>'archived')::boolean, archived)
    where id = p_room;
  elsif p_action = 'new_code' then
    if myrole <> 'teacher' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    loop c := learn_rand_code(6); exit when not exists (select 1 from learn_rooms where code = c); end loop;
    update learn_rooms set code = c where id = p_room;
    return jsonb_build_object('ok', true, 'code', c);
  elsif p_action = 'delete' then
    if r.owner_id <> uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    delete from learn_rooms where id = p_room;
  else
    return jsonb_build_object('ok', false, 'error', 'badaction');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============ live quiz (Kahoot-style) ============
create table if not exists learn_quiz_games (
  id bigserial primary key,
  pin text not null,
  host_key uuid not null default gen_random_uuid(),
  host_user bigint references learn_users(id) on delete set null,
  room_id bigint references learn_rooms(id) on delete set null,
  title text not null default 'Quiz',
  questions jsonb not null,
  settings jsonb not null default '{}'::jsonb,
  state text not null default 'lobby' check (state in ('lobby', 'question', 'reveal', 'board', 'ended')),
  q_index int not null default -1,
  q_started_at timestamptz,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists learn_quiz_games_live_pin on learn_quiz_games(pin) where state <> 'ended';
create index if not exists learn_quiz_games_host on learn_quiz_games(host_user, created_at desc);
alter table learn_quiz_games enable row level security;

create table if not exists learn_quiz_players (
  id bigserial primary key,
  game_id bigint not null references learn_quiz_games(id) on delete cascade,
  pkey uuid not null default gen_random_uuid(),
  nick text not null,
  user_id bigint references learn_users(id) on delete set null,
  score int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  correct int not null default 0,
  kicked boolean not null default false,
  joined_at timestamptz not null default now()
);
create unique index if not exists learn_quiz_players_nick on learn_quiz_players(game_id, lower(nick));
create index if not exists learn_quiz_players_user on learn_quiz_players(user_id);
alter table learn_quiz_players enable row level security;

create table if not exists learn_quiz_answers (
  game_id bigint not null references learn_quiz_games(id) on delete cascade,
  player_id bigint not null references learn_quiz_players(id) on delete cascade,
  q_index int not null,
  choice int not null,
  correct boolean not null,
  ms int not null,
  points int not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id, q_index)
);
alter table learn_quiz_answers enable row level security;

-- saved question sets
create table if not exists learn_quiz_sets (
  id bigserial primary key,
  owner_id bigint not null references learn_users(id) on delete cascade,
  title text not null,
  questions jsonb not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table learn_quiz_sets enable row level security;

-- questions: [{q: text, opts: [2..4 text], a: index, t: seconds (optional)}]
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
      't', least(greatest(coalesce((e->>'t')::int, 0), 0), 240), 'note', left(coalesce(e->>'note', ''), 200)));
  end loop;
  return out;
end $$;

create or replace function learn_quiz_create(p_token text, p_title text, p_questions jsonb, p_settings jsonb, p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); q jsonb := learn_quiz_clean(p_questions); pn text; g learn_quiz_games;
begin
  if jsonb_array_length(q) = 0 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  if p_room is not null and coalesce(learn_room_role(p_room, uid), 'student') = 'student' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if (select count(*) from learn_quiz_games where host_user = uid and created_at > now() - interval '1 hour') >= 30 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  update learn_quiz_games set state = 'ended', ended_at = now() where state <> 'ended' and created_at < now() - interval '6 hours';
  loop pn := lpad((floor(random() * 1000000))::int::text, 6, '0'); exit when pn !~ '^0' and not exists (select 1 from learn_quiz_games where pin = pn and state <> 'ended'); end loop;
  insert into learn_quiz_games(pin, host_user, room_id, title, questions, settings) values (pn, uid, p_room, left(coalesce(nullif(btrim(p_title), ''), 'Quiz'), 80), q, coalesce(p_settings, '{}'::jsonb)) returning * into g;
  if p_room is not null then insert into learn_room_posts(room_id, user_id, kind, body) values (p_room, uid, 'system', 'opened a live quiz: ' || g.title || ' — PIN ' || pn); end if;
  return jsonb_build_object('ok', true, 'id', g.id, 'pin', g.pin, 'host_key', g.host_key);
end $$;

create or replace function learn_quiz_qtime(g learn_quiz_games) returns int language sql immutable as $$
  select coalesce(nullif((g.questions->g.q_index->>'t')::int, 0), nullif((g.settings->>'time')::int, 0), 20)
$$;

create or replace function learn_quiz_board(p_game bigint, n int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('id', id, 'nick', nick, 'score', score, 'streak', streak, 'correct', correct) x
    from learn_quiz_players where game_id = p_game and not kicked order by score desc, correct desc, joined_at limit n) s
$$;

create or replace function learn_quiz_host_state(p_key uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; q jsonb;
begin
  select * into g from learn_quiz_games where host_key = p_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  q := case when g.q_index >= 0 then g.questions->g.q_index end;
  return jsonb_build_object('ok', true, 'id', g.id, 'pin', g.pin, 'title', g.title, 'state', g.state, 'q_index', g.q_index, 'total', jsonb_array_length(g.questions),
    'settings', g.settings, 'locked', g.locked, 'room', g.room_id, 'now', now(),
    'question', q, 'time', case when q is not null then learn_quiz_qtime(g) end,
    'elapsed_ms', case when g.q_started_at is not null then (extract(epoch from now() - g.q_started_at) * 1000)::int end,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nick', nick, 'score', score, 'member', user_id is not null) order by joined_at), '[]'::jsonb) from learn_quiz_players where game_id = g.id and not kicked),
    'answered', (select count(*) from learn_quiz_answers a join learn_quiz_players p on p.id = a.player_id where a.game_id = g.id and a.q_index = g.q_index and not p.kicked),
    'counts', case when g.state in ('reveal', 'board', 'ended') and q is not null then (select jsonb_agg((select count(*) from learn_quiz_answers a where a.game_id = g.id and a.q_index = g.q_index and a.choice = i)) from generate_series(0, jsonb_array_length(q->'opts') - 1) i) end,
    'board', case when g.state in ('board', 'ended', 'reveal') then learn_quiz_board(g.id, 10) end);
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
    -- players who did not answer lose their streak
    update learn_quiz_players p set streak = 0 where p.game_id = g.id and not exists (select 1 from learn_quiz_answers a where a.game_id = g.id and a.player_id = p.id and a.q_index = g.q_index);
    update learn_quiz_games set state = 'reveal' where id = g.id;
  elsif p_action = 'board' and g.state = 'reveal' then
    update learn_quiz_games set state = 'board' where id = g.id;
  elsif p_action = 'next' and g.state in ('reveal', 'board') then
    if g.q_index + 1 >= jsonb_array_length(g.questions) then
      update learn_quiz_games set state = 'ended', ended_at = now() where id = g.id;
    else
      update learn_quiz_games set state = 'question', q_index = g.q_index + 1, q_started_at = now() + interval '3 seconds' where id = g.id;
    end if;
  elsif p_action = 'end' then
    update learn_quiz_games set state = 'ended', ended_at = now() where id = g.id;
  elsif p_action = 'kick' then
    update learn_quiz_players set kicked = true where game_id = g.id and id = (p_arg->>'id')::bigint;
  elsif p_action = 'lock' then
    update learn_quiz_games set locked = not locked where id = g.id;
  end if;
  return learn_quiz_host_state(p_key);
end $$;

create or replace function learn_quiz_join(p_pin text, p_nick text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; uid bigint; pl learn_quiz_players; nk text := left(btrim(regexp_replace(coalesce(p_nick, ''), '\s+', ' ', 'g')), 20);
begin
  select * into g from learn_quiz_games where pin = btrim(coalesce(p_pin, '')) and state <> 'ended' order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  if p_token is not null and length(p_token) > 20 then begin uid := learn_uid(p_token); exception when others then uid := null; end; end if;
  if uid is not null then
    select * into pl from learn_quiz_players where game_id = g.id and user_id = uid;
    if found then
      if pl.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
      return jsonb_build_object('ok', true, 'pkey', pl.pkey, 'nick', pl.nick, 'title', g.title, 'rejoin', true);
    end if;
  end if;
  if g.locked then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if g.state <> 'lobby' and coalesce((g.settings->>'late')::boolean, true) = false then return jsonb_build_object('ok', false, 'error', 'started'); end if;
  if g.room_id is not null and coalesce((g.settings->>'class_only')::boolean, false) and (uid is null or learn_room_role(g.room_id, uid) is null) then return jsonb_build_object('ok', false, 'error', 'classonly'); end if;
  if uid is null and coalesce((g.settings->>'guests')::boolean, true) = false then return jsonb_build_object('ok', false, 'error', 'noguests'); end if;
  if char_length(nk) < 2 then return jsonb_build_object('ok', false, 'error', 'badnick'); end if;
  if (select count(*) from learn_quiz_players where game_id = g.id) >= coalesce((g.settings->>'max')::int, 100) then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  begin
    insert into learn_quiz_players(game_id, nick, user_id) values (g.id, nk, uid) returning * into pl;
  exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'nicktaken'); end;
  return jsonb_build_object('ok', true, 'pkey', pl.pkey, 'nick', pl.nick, 'title', g.title);
end $$;

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
    'result', case when g.state in ('reveal', 'board', 'ended') and q is not null then jsonb_build_object('correct', coalesce(my.correct, false), 'points', coalesce(my.points, 0), 'a', (q->>'a')::int, 'note', q->>'note', 'answered', my.choice is not null) end,
    'board', case when g.state in ('board', 'ended') then learn_quiz_board(g.id, 5) end);
end $$;

create or replace function learn_quiz_answer(p_pkey uuid, p_q int, p_choice int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pl learn_quiz_players; g learn_quiz_games; q jsonb; t int; ms int; ok boolean; pts int := 0; mode text; st int;
begin
  select * into pl from learn_quiz_players where pkey = p_pkey;
  if not found or pl.kicked then return jsonb_build_object('ok', false, 'error', 'noplayer'); end if;
  select * into g from learn_quiz_games where id = pl.game_id;
  if g.state <> 'question' or g.q_index <> p_q then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  q := g.questions->g.q_index; t := learn_quiz_qtime(g);
  ms := greatest(0, (extract(epoch from now() - g.q_started_at) * 1000)::int);
  if now() < g.q_started_at then return jsonb_build_object('ok', false, 'error', 'early'); end if;
  if ms > t * 1000 + 1500 then return jsonb_build_object('ok', false, 'error', 'late'); end if;
  ms := least(ms, t * 1000);
  ok := p_choice = (q->>'a')::int;
  mode := coalesce(g.settings->>'points', 'standard');
  if ok and mode <> 'none' then
    pts := case when coalesce((g.settings->>'speed')::boolean, true) then round(1000 * (1 - (ms::numeric / (t * 1000)) / 2)) else 1000 end;
    if mode = 'double' then pts := pts * 2; end if;
    st := pl.streak + 1;
    if coalesce((g.settings->>'streak')::boolean, true) and st >= 2 then pts := pts + least(st - 1, 5) * 100; end if;
  end if;
  begin
    insert into learn_quiz_answers(game_id, player_id, q_index, choice, correct, ms, points) values (g.id, pl.id, g.q_index, p_choice, ok, ms, pts);
  exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'already'); end;
  update learn_quiz_players set score = score + pts, correct = correct + (case when ok then 1 else 0 end),
    streak = case when ok then streak + 1 else 0 end, best_streak = greatest(best_streak, case when ok then streak + 1 else 0 end) where id = pl.id;
  return jsonb_build_object('ok', true);
end $$;

-- report: per player and per question. Host key, or the class staff / a player of that game via token.
create or replace function learn_quiz_report(p_key uuid, p_token text, p_game bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; uid bigint; allowed boolean := false;
begin
  if p_key is not null then select * into g from learn_quiz_games where host_key = p_key; allowed := found; end if;
  if not allowed and p_token is not null then
    uid := learn_uid(p_token);
    select * into g from learn_quiz_games where id = p_game;
    allowed := found and (g.host_user = uid or (g.room_id is not null and learn_room_role(g.room_id, uid) in ('teacher', 'assistant'))
      or exists (select 1 from learn_quiz_players where game_id = g.id and user_id = uid));
  end if;
  if not allowed then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'id', g.id, 'title', g.title, 'created_at', g.created_at, 'ended_at', g.ended_at, 'state', g.state, 'settings', g.settings,
    'questions', (select jsonb_agg(jsonb_build_object('q', e.value->>'q', 'opts', e.value->'opts', 'a', (e.value->>'a')::int,
        'answers', (select count(*) from learn_quiz_answers a where a.game_id = g.id and a.q_index = e.ordinality - 1),
        'correct', (select count(*) from learn_quiz_answers a where a.game_id = g.id and a.q_index = e.ordinality - 1 and a.correct),
        'avg_ms', (select round(avg(ms)) from learn_quiz_answers a where a.game_id = g.id and a.q_index = e.ordinality - 1),
        'counts', (select jsonb_agg((select count(*) from learn_quiz_answers a where a.game_id = g.id and a.q_index = e.ordinality - 1 and a.choice = i)) from generate_series(0, jsonb_array_length(e.value->'opts') - 1) i)) order by e.ordinality)
      from jsonb_array_elements(g.questions) with ordinality e),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nick', p.nick, 'member', p.user_id is not null, 'score', p.score, 'correct', p.correct, 'best_streak', p.best_streak,
        'answered', (select count(*) from learn_quiz_answers a where a.player_id = p.id),
        'avg_ms', (select round(avg(ms)) from learn_quiz_answers a where a.player_id = p.id),
        'answers', (select jsonb_object_agg(a.q_index, jsonb_build_array(a.choice, a.correct, a.ms, a.points)) from learn_quiz_answers a where a.player_id = p.id)) order by p.score desc, p.correct desc), '[]'::jsonb)
      from learn_quiz_players p where p.game_id = g.id and not p.kicked));
end $$;

create or replace function learn_quiz_mine(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true,
    'hosted', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'state', g.state, 'pin', case when g.state <> 'ended' then g.pin end, 'host_key', case when g.state <> 'ended' then g.host_key end, 'room', g.room_id, 'created_at', g.created_at, 'questions', jsonb_array_length(g.questions),
        'players', (select count(*) from learn_quiz_players p where p.game_id = g.id and not p.kicked)) order by g.created_at desc)
      from (select * from learn_quiz_games where host_user = uid order by created_at desc limit 40) g), '[]'::jsonb),
    'played', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'created_at', g.created_at, 'score', p.score, 'correct', p.correct, 'questions', jsonb_array_length(g.questions),
        'rank', (select count(*) + 1 from learn_quiz_players x where x.game_id = g.id and not x.kicked and x.score > p.score),
        'players', (select count(*) from learn_quiz_players x where x.game_id = g.id and not x.kicked)) order by g.created_at desc)
      from (select * from learn_quiz_players where user_id = uid order by joined_at desc limit 40) p join learn_quiz_games g on g.id = p.game_id), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'questions', s.questions, 'settings', s.settings, 'updated_at', s.updated_at) order by s.updated_at desc) from learn_quiz_sets s where s.owner_id = uid), '[]'::jsonb));
end $$;

create or replace function learn_quiz_set_save(p_token text, p_id bigint, p_title text, p_questions jsonb, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); q jsonb := learn_quiz_clean(p_questions); nid bigint;
begin
  if jsonb_array_length(q) = 0 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  if p_id is not null then
    update learn_quiz_sets set title = left(coalesce(nullif(btrim(p_title), ''), 'My quiz'), 80), questions = q, settings = coalesce(p_settings, '{}'::jsonb), updated_at = now() where id = p_id and owner_id = uid returning id into nid;
  end if;
  if nid is null then
    if (select count(*) from learn_quiz_sets where owner_id = uid) >= 100 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
    insert into learn_quiz_sets(owner_id, title, questions, settings) values (uid, left(coalesce(nullif(btrim(p_title), ''), 'My quiz'), 80), q, coalesce(p_settings, '{}'::jsonb)) returning id into nid;
  end if;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function learn_quiz_set_delete(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  delete from learn_quiz_sets where id = p_id and owner_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- ============ site analytics ============
create table if not exists site_hits (
  id bigserial primary key,
  ts timestamptz not null default now(),
  vid text, sid text, path text, ref text, device text, browser text, os text, lang text, tz text, sw int, learner bigint
);
create index if not exists site_hits_ts on site_hits(ts);
create index if not exists site_hits_vid on site_hits(vid, ts);
alter table site_hits enable row level security;

create or replace function site_hit(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from site_hits where vid = left(p->>'vid', 40) and path = left(p->>'path', 200) and ts > now() - interval '10 seconds') then return; end if;
  insert into site_hits(vid, sid, path, ref, device, browser, os, lang, tz, sw)
  values (left(p->>'vid', 40), left(p->>'sid', 40), left(coalesce(p->>'path', '/'), 200), left(p->>'ref', 200), left(p->>'device', 20), left(p->>'browser', 30), left(p->>'os', 30), left(p->>'lang', 20), left(p->>'tz', 60),
    case when coalesce(p->>'sw', '') ~ '^\d{1,5}$' then (p->>'sw')::int end);
end $$;

-- ============ admin (Supabase Auth email of the site owner) ============
create or replace function learn_is_admin() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'librageminit2@gmail.com'
$$;

create or replace function site_admin_stats(p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare since timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh' - make_interval(days => greatest(p_days, 1) - 1);
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'views', (select count(*) from site_hits where ts >= since),
    'visitors', (select count(distinct vid) from site_hits where ts >= since),
    'sessions', (select count(distinct sid) from site_hits where ts >= since),
    'today_views', (select count(*) from site_hits where ts >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
    'today_visitors', (select count(distinct vid) from site_hits where ts >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
    'live', (select count(distinct vid) from site_hits where ts >= now() - interval '5 minutes'),
    'first_hit', (select min(ts) from site_hits),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'views', v, 'visitors', u) order by d), '[]'::jsonb) from (
        select to_char(ts at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') d, count(*) v, count(distinct vid) u from site_hits where ts >= since group by 1) s),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'views', v) order by h), '[]'::jsonb) from (
        select extract(hour from ts at time zone 'Asia/Ho_Chi_Minh')::int h, count(*) v from site_hits where ts >= since group by 1) s),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('k', path, 'views', v, 'visitors', u) order by v desc), '[]'::jsonb) from (
        select path, count(*) v, count(distinct vid) u from site_hits where ts >= since group by 1 order by 2 desc limit 15) s),
    'refs', (select coalesce(jsonb_agg(jsonb_build_object('k', r, 'views', v) order by v desc), '[]'::jsonb) from (
        select coalesce(nullif(ref, ''), '(direct)') r, count(*) v from site_hits where ts >= since group by 1 order by 2 desc limit 12) s),
    'devices', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select coalesce(device, '?') k, count(distinct vid) v from site_hits where ts >= since group by 1) s),
    'browsers', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select coalesce(browser, '?') k, count(distinct vid) v from site_hits where ts >= since group by 1) s),
    'os', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select coalesce(os, '?') k, count(distinct vid) v from site_hits where ts >= since group by 1) s),
    'tz', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'visitors', v) order by v desc), '[]'::jsonb) from (select coalesce(tz, '?') k, count(distinct vid) v from site_hits where ts >= since group by 1 order by 2 desc limit 10) s),
    'langs', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'visitors', v) order by v desc), '[]'::jsonb) from (select coalesce(split_part(lang, '-', 1), '?') k, count(distinct vid) v from site_hits where ts >= since group by 1 order by 2 desc limit 8) s),
    'returning', (select count(*) from (select vid from site_hits where ts >= since group by vid having count(distinct sid) > 1) s));
end $$;

create or replace function learn_admin_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users', (select count(*) from learn_users),
    'new_7d', (select count(*) from learn_users where created_at >= now() - interval '7 days'),
    'new_30d', (select count(*) from learn_users where created_at >= now() - interval '30 days'),
    'active_1d', (select count(*) from learn_users where greatest(updated_at, coalesce(last_seen, updated_at)) >= now() - interval '1 day'),
    'active_7d', (select count(*) from learn_users where greatest(updated_at, coalesce(last_seen, updated_at)) >= now() - interval '7 days'),
    'banned', (select count(*) from learn_users where banned),
    'rooms', (select count(*) from learn_rooms where not archived),
    'games', (select count(*) from learn_quiz_games),
    'games_7d', (select count(*) from learn_quiz_games where created_at >= now() - interval '7 days'),
    'friendships', (select count(*) from learn_friends where status = 'accepted'),
    'xp_total', (select coalesce(sum(coalesce((data->>'xp')::int, 0)), 0) from learn_users),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) from (
        select to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') d, count(*) n from learn_users where created_at >= now() - interval '60 days' group by 1) s),
    'langs', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select coalesce(data->>'lang', 'en') k, count(*) v from learn_users group by 1) s),
    'levels', (select coalesce(jsonb_agg(jsonb_build_object('lang', l, 'level', lv, 'n', n) order by l, lv), '[]'::jsonb) from (
        select coalesce(data->>'lang', 'en') l, coalesce(data->'level'->>coalesce(data->>'lang', 'en'), '?') lv, count(*) n from learn_users group by 1, 2) s));
end $$;

create or replace function learn_admin_users(p_search text, p_limit int, p_offset int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('total', (select count(*) from learn_users where coalesce(p_search, '') = '' or name_key like '%' || lower(p_search) || '%' or friend_code = upper(p_search)),
    'items', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''), 'created_at', u.created_at, 'updated_at', u.updated_at, 'last_seen', u.last_seen,
        'banned', u.banned, 'locked', u.lock_until is not null and u.lock_until > now(), 'fails', u.fails, 'sum', learn_summary(u.data),
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
    'locked', u.lock_until is not null and u.lock_until > now(), 'fails', u.fails, 'sum', learn_summary(u.data),
    'days', case when jsonb_typeof(u.data->'days') = 'object' then u.data->'days' else '{}'::jsonb end,
    'done', case when jsonb_typeof(u.data->'done') = 'object' then u.data->'done' else '{}'::jsonb end,
    'badges', coalesce(u.data->'badges', '{}'::jsonb), 'goal', u.data->'goal',
    'sessions', (select count(*) from learn_sessions s where s.user_id = u.id),
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'status', f.status)), '[]'::jsonb) from learn_friends f join learn_users o on o.id = case when f.a = u.id then f.b else f.a end where f.a = u.id or f.b = u.id),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'role', m.role)), '[]'::jsonb) from learn_room_members m join learn_rooms r on r.id = m.room_id where m.user_id = u.id),
    'quizzes', (select coalesce(jsonb_agg(jsonb_build_object('title', g.title, 'score', p.score, 'correct', p.correct, 'n', jsonb_array_length(g.questions), 'at', g.created_at) order by g.created_at desc), '[]'::jsonb) from learn_quiz_players p join learn_quiz_games g on g.id = p.game_id where p.user_id = u.id));
end $$;

create or replace function learn_admin_user_action(p_id bigint, p_action text, p_arg text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  if p_action = 'unlock' then update learn_users set fails = 0, lock_until = null where id = p_id;
  elsif p_action = 'ban' then update learn_users set banned = true where id = p_id; delete from learn_sessions where user_id = p_id;
  elsif p_action = 'unban' then update learn_users set banned = false where id = p_id;
  elsif p_action = 'reset_pin' then
    if coalesce(p_arg, '') !~ '^\d{4,6}$' then return jsonb_build_object('ok', false, 'error', 'badpin'); end if;
    update learn_users set pin_hash = crypt(p_arg, gen_salt('bf', 8)), fails = 0, lock_until = null where id = p_id; delete from learn_sessions where user_id = p_id;
  elsif p_action = 'rename' then
    if char_length(btrim(coalesce(p_arg, ''))) < 3 or exists (select 1 from learn_users where name_key = lower(btrim(p_arg)) and id <> p_id) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
    update learn_users set name = btrim(p_arg), name_key = lower(btrim(p_arg)) where id = p_id;
  elsif p_action = 'logout' then delete from learn_sessions where user_id = p_id;
  elsif p_action = 'delete' then delete from learn_users where id = p_id;
  else return jsonb_build_object('ok', false, 'error', 'badaction');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function learn_admin_rooms() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'lang', r.lang, 'level', r.level, 'archived', r.archived, 'created_at', r.created_at,
      'owner', (select name from learn_users where id = r.owner_id),
      'members', (select count(*) from learn_room_members m where m.room_id = r.id),
      'tasks', (select count(*) from learn_room_tasks t where t.room_id = r.id),
      'posts', (select count(*) from learn_room_posts p where p.room_id = r.id and p.kind = 'post'),
      'quizzes', (select count(*) from learn_quiz_games g where g.room_id = r.id),
      'last', (select max(created_at) from learn_room_posts p where p.room_id = r.id)) order by r.created_at desc) from learn_rooms r), '[]'::jsonb);
end $$;

create or replace function learn_admin_games() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'state', g.state, 'created_at', g.created_at, 'ended_at', g.ended_at, 'questions', jsonb_array_length(g.questions),
      'host', (select name from learn_users where id = g.host_user), 'room', (select name from learn_rooms where id = g.room_id),
      'players', (select count(*) from learn_quiz_players p where p.game_id = g.id and not p.kicked),
      'guests', (select count(*) from learn_quiz_players p where p.game_id = g.id and p.user_id is null),
      'accuracy', (select round(100.0 * count(*) filter (where a.correct) / nullif(jsonb_array_length(g.questions) * (select count(*) from learn_quiz_players p where p.game_id = g.id and not p.kicked), 0)) from learn_quiz_answers a where a.game_id = g.id),
      'winner', (select nick || ' (' || score || ')' from learn_quiz_players p where p.game_id = g.id and not p.kicked order by score desc limit 1)) order by g.created_at desc)
    from (select * from learn_quiz_games order by created_at desc limit 300) g), '[]'::jsonb);
end $$;

create or replace function learn_admin_room_action(p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not learn_is_admin() then raise exception 'forbidden'; end if;
  if p_action = 'archive' then update learn_rooms set archived = not archived where id = p_id;
  elsif p_action = 'delete' then delete from learn_rooms where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============ permissions ============
revoke all on learn_sessions, learn_friends, learn_rooms, learn_room_members, learn_room_tasks, learn_room_posts, learn_quiz_games, learn_quiz_players, learn_quiz_answers, learn_quiz_sets, site_hits from anon, authenticated;
revoke execute on function learn_uid(text) from anon, authenticated, public;
revoke execute on function learn_rand_code(int, text) from anon, authenticated, public;
grant execute on function learn_auth(text, text), learn_name_available(text), learn_me(text), learn_set_avatar(text, text), learn_logout(text),
  learn_friend_request(text, text), learn_friend_respond(text, bigint, boolean), learn_friends_list(text),
  learn_room_create(text, text, text, text, text), learn_room_join(text, text), learn_rooms_mine(text), learn_room_get(text, bigint), learn_room_admin(text, bigint, text, jsonb),
  learn_quiz_create(text, text, jsonb, jsonb, bigint), learn_quiz_host_state(uuid), learn_quiz_host_action(uuid, text, jsonb), learn_quiz_join(text, text, text),
  learn_quiz_play_state(text, uuid), learn_quiz_answer(uuid, int, int), learn_quiz_report(uuid, text, bigint), learn_quiz_mine(text), learn_quiz_set_save(text, bigint, text, jsonb, jsonb), learn_quiz_set_delete(text, bigint),
  site_hit(jsonb) to anon, authenticated;
grant execute on function site_admin_stats(int), learn_admin_overview(), learn_admin_users(text, int, int), learn_admin_user(bigint), learn_admin_user_action(bigint, text, text),
  learn_admin_rooms(), learn_admin_games(), learn_admin_room_action(bigint, text) to authenticated;
revoke execute on function site_admin_stats(int), learn_admin_overview(), learn_admin_users(text, int, int), learn_admin_user(bigint), learn_admin_user_action(bigint, text, text),
  learn_admin_rooms(), learn_admin_games(), learn_admin_room_action(bigint, text) from anon, public;
revoke execute on function learn_room_role(bigint, bigint), learn_quiz_board(bigint, int), learn_summary(jsonb), learn_quiz_clean(jsonb) from anon, authenticated, public;
notify pgrst, 'reload schema';
