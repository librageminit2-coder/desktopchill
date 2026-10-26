-- desktopchill learn v22b (2026-10-26): tài khoản không còn dùng email MiTek.
-- 1) Xoá mọi email đuôi mii (vd. @mii.com) khỏi tài khoản và yêu cầu quên PIN. Tài khoản, tên (kể cả tên có "mitek") và số điện thoại giữ nguyên.
-- 2) Email thành tuỳ chọn; email đuôi mii không được lưu nữa.
-- 3) Đăng nhập / quên PIN chỉ bằng tên tài khoản hoặc số điện thoại (không còn bằng email).
-- Chạy lại nhiều lần vẫn an toàn.

create or replace function learn_is_mii(p text) returns boolean language sql immutable as $$
  select coalesce(lower(btrim(p)) ~ '@([a-z0-9-]+\.)*mii(\.[a-z0-9.-]*)?$', false)
$$;
create or replace function learn_strip_mii(p text) returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^\s,;:()<>"]+@([a-z0-9-]+\.)*mii(\.[a-z0-9.-]*)?', '(email removed)', 'gi')
$$;

-- ============ 1. email tuỳ chọn + xoá dữ liệu mii ============
alter table learn_contacts alter column email drop not null;
alter table learn_contacts alter column email_key drop not null;

update learn_contacts set email = null, email_key = null, updated_at = now() where learn_is_mii(email) or learn_is_mii(email_key);
update learn_pin_requests set ident = learn_strip_mii(ident) where ident ~* '@([a-z0-9-]+\.)*mii';
update learn_pin_requests set contact = learn_strip_mii(contact) where contact ~* '@([a-z0-9-]+\.)*mii';
update learn_pin_requests set note = learn_strip_mii(note) where note ~* '@([a-z0-9-]+\.)*mii';
update learn_account_log set detail = '{}'::jsonb where detail::text ~* '@([a-z0-9-]+\.)*mii';

-- ============ 2. đăng nhập: chỉ tên tài khoản hoặc số điện thoại ============
create or replace function learn_resolve(p_ident text) returns text language plpgsql stable security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_ident, ''))); r text;
begin
  if exists (select 1 from learn_users where name_key = k) then return k; end if;
  if position('@' in k) = 0 and learn_phone_key(k) is not null then
    select u.name_key into r from learn_contacts c join learn_users u on u.id = c.user_id where c.phone_key = learn_phone_key(k);
  end if;
  return coalesce(r, k);
end $$;

-- ============ 3. đăng ký: số điện thoại bắt buộc, email tuỳ chọn (không nhận email đuôi mii) ============
create or replace function learn_register2(p_name text, p_pin text, p_data jsonb, p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); em text := nullif(btrim(coalesce(p_email, '')), ''); ek text := learn_email_key(p_email); pk text := learn_phone_key(p_phone); uid bigint;
begin
  if not learn_name_ok(p_name) then return jsonb_build_object('ok', false, 'error', 'badname'); end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then return jsonb_build_object('ok', false, 'error', 'badpin'); end if;
  if em is not null and ek is null then return jsonb_build_object('ok', false, 'error', 'bademail'); end if;
  if learn_is_mii(em) then return jsonb_build_object('ok', false, 'error', 'emailnotallowed'); end if;
  if pk is null then return jsonb_build_object('ok', false, 'error', 'badphone'); end if;
  if pg_column_size(p_data) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  if exists (select 1 from learn_users where name_key = k) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if ek is not null and exists (select 1 from learn_contacts where email_key = ek) then return jsonb_build_object('ok', false, 'error', 'emailtaken'); end if;
  if exists (select 1 from learn_contacts where phone_key = pk) then return jsonb_build_object('ok', false, 'error', 'phonetaken'); end if;
  insert into learn_users(name, name_key, pin_hash, data) values (btrim(p_name), k, crypt(p_pin, gen_salt('bf', 8)), coalesce(p_data, '{}'::jsonb)) returning id into uid;
  insert into learn_contacts(user_id, email, email_key, phone, phone_key) values (uid, em, ek, btrim(p_phone), pk);
  return jsonb_build_object('ok', true, 'name', btrim(p_name));
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- ============ 4. đổi liên hệ: số điện thoại bắt buộc, email tuỳ chọn ============
create or replace function learn_contact_set(p_token text, p_pin text, p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; em text := nullif(btrim(coalesce(p_email, '')), ''); ek text := learn_email_key(p_email); pk text := learn_phone_key(p_phone); had boolean; e text;
begin
  select * into u from learn_users where id = uid;
  if em is not null and ek is null then return jsonb_build_object('ok', false, 'error', 'bademail'); end if;
  if learn_is_mii(em) then return jsonb_build_object('ok', false, 'error', 'emailnotallowed'); end if;
  if pk is null then return jsonb_build_object('ok', false, 'error', 'badphone'); end if;
  had := exists (select 1 from learn_contacts where user_id = uid);
  if had then e := learn_check(u.name_key, p_pin); if e is not null then return jsonb_build_object('ok', false, 'error', e); end if; end if;
  if ek is not null and exists (select 1 from learn_contacts where email_key = ek and user_id <> uid) then return jsonb_build_object('ok', false, 'error', 'emailtaken'); end if;
  if exists (select 1 from learn_contacts where phone_key = pk and user_id <> uid) then return jsonb_build_object('ok', false, 'error', 'phonetaken'); end if;
  insert into learn_contacts(user_id, email, email_key, phone, phone_key) values (uid, em, ek, btrim(p_phone), pk)
    on conflict (user_id) do update set email = excluded.email, email_key = excluded.email_key, phone = excluded.phone, phone_key = excluded.phone_key, updated_at = now();
  insert into learn_account_log(user_id, kind) values (uid, case when had then 'contact_change' else 'contact_add' end);
  if had then perform learn_notify(uid, 'security', null, jsonb_build_object('what', 'contact')); end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'emailtaken');
end $$;

-- yêu cầu quên PIN: không lưu email đuôi mii
create or replace function learn_forgot(p_ident text, p_contact text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := learn_resolve(p_ident); uid bigint;
begin
  if char_length(btrim(coalesce(p_ident, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if (select count(*) from learn_pin_requests where lower(ident) = lower(btrim(p_ident)) and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from learn_pin_requests where created_at > now() - interval '1 hour') >= 60 then return jsonb_build_object('ok', true); end if;
  select id into uid from learn_users where name_key = k;
  insert into learn_pin_requests(ident, contact, note, user_id) values (left(learn_strip_mii(btrim(p_ident)), 120), left(learn_strip_mii(btrim(coalesce(p_contact, ''))), 120), left(learn_strip_mii(btrim(coalesce(p_note, ''))), 300), uid);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function learn_is_mii(text), learn_strip_mii(text) from anon, authenticated, public;
grant execute on function learn_register2(text, text, jsonb, text, text), learn_contact_set(text, text, text, text), learn_forgot(text, text, text) to anon, authenticated;

-- kiểm tra sau khi chạy: cả 2 số phải là 0
select (select count(*) from learn_contacts where email ~* '@([a-z0-9-]+\.)*mii') as mii_emails_left,
       (select count(*) from learn_pin_requests where (ident || ' ' || contact || ' ' || note) ~* '@([a-z0-9-]+\.)*mii') as mii_in_pin_requests_left;
notify pgrst, 'reload schema';
