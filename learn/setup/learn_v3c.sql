-- v3c: đổi XP lấy hình nền. Giá theo độ hiếm: common 1200, rare 2400, epic 4800, legendary 9600 XP.
-- XP còn dùng được = tổng XP trong tiến trình (data.xp) − XP đã đổi (nguồn 'xp:<giá>' trong learn_walls). Cấp độ người chơi không bị giảm.
create or replace function learn_wall_price(p_rarity text) returns int language sql immutable as $$
  select case p_rarity when 'common' then 1200 when 'rare' then 2400 when 'epic' then 4800 else 9600 end
$$;

create or replace function learn_xp_left(p_uid bigint) returns int language sql stable as $$
  select greatest(0, coalesce((select case when jsonb_typeof(data->'xp') = 'number' then (data->>'xp')::int else 0 end from learn_users where id = p_uid), 0)
    - coalesce((select sum(nullif(split_part(source, ':', 2), '')::int) from learn_walls where user_id = p_uid and source ~ '^xp:[0-9]+$'), 0))::int
$$;

create or replace function learn_wall_buy(p_token text, p_wall int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); r text; cost int; have int;
begin
  select rarity into r from learn_wall_catalog where id = p_wall;
  if r is null then return jsonb_build_object('ok', false, 'error', 'nowall'); end if;
  if exists (select 1 from learn_walls where user_id = uid and wall = p_wall) then return jsonb_build_object('ok', false, 'error', 'owned'); end if;
  cost := learn_wall_price(r);
  perform 1 from learn_users where id = uid for update;
  have := learn_xp_left(uid);
  if have < cost then return jsonb_build_object('ok', false, 'error', 'notenough', 'have', have, 'cost', cost); end if;
  perform learn_give_wall(uid, p_wall, 'xp:' || cost);
  return jsonb_build_object('ok', true, 'cost', cost, 'left', have - cost);
end $$;

revoke execute on function learn_xp_left(bigint) from anon, authenticated, public;
grant execute on function learn_wall_buy(text, int), learn_wall_price(text) to anon, authenticated;
