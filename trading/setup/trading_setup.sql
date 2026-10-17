-- ============================================================
--  desktopchill.com/trading — tài khoản (cần duyệt) + nhận định đã lưu
--  Chạy MỘT LẦN trong Supabase → SQL Editor → New query → dán toàn bộ → Run.
--  Chạy lại nhiều lần cũng an toàn (không mất dữ liệu).
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trading_users (
  id bigint generated always as identity primary key,
  email text not null unique,
  name text not null,
  pw_hash text not null,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','blocked')),
  role text not null default 'user' check (role in ('user','admin')),
  fails int not null default 0,
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  last_login timestamptz
);
create table if not exists public.trading_sessions (
  token_hash text primary key,
  user_id bigint not null references public.trading_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists public.trading_notes (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.trading_users(id) on delete cascade,
  symbol text not null,
  price numeric not null,
  idx_price numeric,
  data jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists trading_notes_user on public.trading_notes(user_id, created_at desc);

alter table public.trading_users enable row level security;
alter table public.trading_sessions enable row level security;
alter table public.trading_notes enable row level security;
revoke all on public.trading_users, public.trading_sessions, public.trading_notes from anon, authenticated;

-- ---------- tiện ích nội bộ ----------
create or replace function public.trading_uid(p_token text)
returns bigint language sql security definer set search_path = public, extensions stable as $$
  select s.user_id from trading_sessions s join trading_users u on u.id = s.user_id
  where s.token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex') and s.expires_at > now() and u.status = 'approved';
$$;
create or replace function public.trading_is_admin(p_token text)
returns boolean language sql security definer set search_path = public, extensions stable as $$
  select exists(select 1 from trading_users where id = trading_uid(p_token) and role = 'admin');
$$;

-- ---------- đăng ký ----------
create or replace function public.trading_register(p_email text, p_name text, p_password text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e text := lower(btrim(p_email)); n text := btrim(p_name);
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 120 then return jsonb_build_object('ok', false, 'error', 'bademail'); end if;
  if char_length(n) < 2 or char_length(n) > 60 then return jsonb_build_object('ok', false, 'error', 'badname'); end if;
  if char_length(coalesce(p_password,'')) < 8 or char_length(p_password) > 72 then return jsonb_build_object('ok', false, 'error', 'badpass'); end if;
  if exists (select 1 from trading_users where email = e) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if (select count(*) from trading_users where status = 'pending' and created_at > now() - interval '1 hour') > 30 then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  insert into trading_users(email, name, pw_hash, note) values (e, n, crypt(p_password, gen_salt('bf', 10)), left(btrim(coalesce(p_note,'')), 300));
  return jsonb_build_object('ok', true, 'status', 'pending');
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- ---------- đăng nhập ----------
create or replace function public.trading_login(p_email text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u trading_users; tok text;
begin
  select * into u from trading_users where email = lower(btrim(p_email)) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
  if u.lock_until is not null and u.lock_until > now() then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if u.pw_hash <> crypt(coalesce(p_password,''), u.pw_hash) then
    update trading_users set fails = u.fails + 1, lock_until = case when u.fails + 1 >= 8 then now() + interval '15 minutes' else null end where id = u.id;
    return jsonb_build_object('ok', false, 'error', case when u.fails + 1 >= 8 then 'locked' else 'badpass' end);
  end if;
  update trading_users set fails = 0, lock_until = null where id = u.id;
  if u.status <> 'approved' then return jsonb_build_object('ok', false, 'error', u.status); end if;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into trading_sessions(token_hash, user_id, expires_at) values (encode(digest(tok, 'sha256'), 'hex'), u.id, now() + interval '30 days');
  delete from trading_sessions where expires_at < now();
  update trading_users set last_login = now() where id = u.id;
  return jsonb_build_object('ok', true, 'token', tok, 'user', jsonb_build_object('name', u.name, 'email', u.email, 'role', u.role));
end $$;

create or replace function public.trading_me(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := trading_uid(p_token); u trading_users;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select * into u from trading_users where id = uid;
  update trading_sessions set expires_at = now() + interval '30 days' where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expires_at < now() + interval '25 days';
  return jsonb_build_object('ok', true, 'user', jsonb_build_object('name', u.name, 'email', u.email, 'role', u.role));
end $$;

create or replace function public.trading_logout(p_token text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  delete from trading_sessions where token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;

create or replace function public.trading_change_password(p_token text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := trading_uid(p_token); u trading_users;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select * into u from trading_users where id = uid;
  if u.pw_hash <> crypt(coalesce(p_old,''), u.pw_hash) then return jsonb_build_object('ok', false, 'error', 'badpass'); end if;
  if char_length(coalesce(p_new,'')) < 8 then return jsonb_build_object('ok', false, 'error', 'weak'); end if;
  update trading_users set pw_hash = crypt(p_new, gen_salt('bf', 10)) where id = uid;
  delete from trading_sessions where user_id = uid and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- nhận định đã lưu ----------
create or replace function public.trading_notes_list(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := trading_uid(p_token);
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  return jsonb_build_object('ok', true, 'notes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'symbol', symbol, 'price', price, 'idx_price', idx_price, 'data', data, 'note', note, 'created_at', created_at) order by created_at desc) from trading_notes where user_id = uid), '[]'::jsonb));
end $$;

create or replace function public.trading_note_save(p_token text, p_symbol text, p_price numeric, p_idx_price numeric, p_data jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := trading_uid(p_token); nid bigint;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_symbol !~ '^[A-Z0-9]{2,10}$' then return jsonb_build_object('ok', false, 'error', 'badsym'); end if;
  if pg_column_size(p_data) > 60000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  if (select count(*) from trading_notes where user_id = uid) >= 2000 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  insert into trading_notes(user_id, symbol, price, idx_price, data, note) values (uid, p_symbol, p_price, p_idx_price, coalesce(p_data, '{}'::jsonb), left(p_note, 1000)) returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function public.trading_note_update(p_token text, p_id bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := trading_uid(p_token);
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  update trading_notes set note = left(p_note, 1000) where id = p_id and user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.trading_note_delete(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := trading_uid(p_token);
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  delete from trading_notes where id = p_id and user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- quản trị: duyệt tài khoản ----------
create or replace function public.trading_admin_users(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not trading_is_admin(p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'users', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'name', name, 'note', note, 'status', status, 'role', role, 'created_at', created_at, 'decided_at', decided_at, 'last_login', last_login,
    'notes', (select count(*) from trading_notes n where n.user_id = u.id)) order by (status = 'pending') desc, created_at desc) from trading_users u), '[]'::jsonb));
end $$;

create or replace function public.trading_admin_set(p_token text, p_user_id bigint, p_status text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not trading_is_admin(p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_status not in ('approved','rejected','blocked','pending') then return jsonb_build_object('ok', false, 'error', 'badstatus'); end if;
  if exists (select 1 from trading_users where id = p_user_id and role = 'admin') then return jsonb_build_object('ok', false, 'error', 'isadmin'); end if;
  update trading_users set status = p_status, decided_at = now() where id = p_user_id;
  if p_status <> 'approved' then delete from trading_sessions where user_id = p_user_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.trading_admin_delete(p_token text, p_user_id bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not trading_is_admin(p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  delete from trading_users where id = p_user_id and role <> 'admin';
  return jsonb_build_object('ok', true);
end $$;

-- ---------- tạo / đặt lại tài khoản quản trị (KHÔNG cấp cho anon — chỉ chạy trong SQL Editor) ----------
create or replace function public.trading_make_admin(p_email text, p_name text, p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into trading_users(email, name, pw_hash, status, role, decided_at)
  values (lower(btrim(p_email)), p_name, crypt(p_password, gen_salt('bf', 10)), 'approved', 'admin', now())
  on conflict (email) do update set pw_hash = excluded.pw_hash, status = 'approved', role = 'admin', name = excluded.name, fails = 0, lock_until = null;
  return 'OK — tài khoản quản trị đã sẵn sàng';
end $$;

-- quyền gọi hàm
revoke all on function public.trading_uid(text), public.trading_is_admin(text), public.trading_make_admin(text, text, text) from public, anon, authenticated;
grant execute on function
  public.trading_register(text, text, text, text), public.trading_login(text, text), public.trading_me(text), public.trading_logout(text),
  public.trading_change_password(text, text, text), public.trading_notes_list(text), public.trading_note_save(text, text, numeric, numeric, jsonb, text),
  public.trading_note_update(text, bigint, text), public.trading_note_delete(text, bigint),
  public.trading_admin_users(text), public.trading_admin_set(text, bigint, text), public.trading_admin_delete(text, bigint)
to anon, authenticated;

-- ============================================================
--  BƯỚC CUỐI: tạo tài khoản quản trị của bạn.
--  Sửa mật khẩu trong dấu nháy bên dưới (≥ 8 ký tự), bỏ dấu -- ở đầu dòng rồi Run lại riêng dòng này.
-- ============================================================
-- select public.trading_make_admin('librageminit2@gmail.com', 'Tuấn', 'MAT-KHAU-CUA-BAN');
