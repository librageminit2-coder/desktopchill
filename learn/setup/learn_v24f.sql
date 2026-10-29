-- ============ v24f (2026-10-29): vé quay lần đầu vượt ải ============
-- Bài học: mỗi bài mới hoàn thành trên Journey map có 10% được 1 vé quay.
-- Hình nền lần đầu: vẫn cho mọi boss. Vé quay: chắc chắn ở boss nhỏ đầu tiên (vùng 1, boss 1) và vua vùng; boss nhỏ khác 10%.
alter table learn_adv_firsts add column if not exists ticket boolean not null default true;
-- trao thưởng lần đầu; trả về id hình (0 = hết hình, đã đổi XP), null = người này đã nhận thưởng boss này rồi
-- v24f: vé quay chỉ chắc chắn ở boss nhỏ đầu tiên của bản đồ (vùng 1, boss 1) và vua vùng; boss nhỏ khác: 10% có vé
create or replace function learn_adv_first(p_uid bigint, p_boss text, p_king boolean) returns int language plpgsql as $$
declare w int; ok int; b record; tk boolean;
begin
  if p_uid is null then return null; end if;
  insert into learn_adv_firsts(user_id, boss) values (p_uid, p_boss) on conflict do nothing;
  get diagnostics ok = row_count;
  if ok = 0 then return null; end if;
  select * into b from learn_adv_parse(p_boss);
  tk := p_king or (b.region = 1 and b.n = 1) or random() < 0.10;
  -- v24g: boss nhỏ khác (không phải boss đầu tiên, không phải vua) không tặng hình nền
  if not (p_king or (b.region = 1 and b.n = 1)) then
    update learn_adv_firsts set ticket = tk where user_id = p_uid and boss = p_boss;
    if tk then perform learn_gacha_give(p_uid, 1, 'adv-first:' || p_boss); end if;
    return -1;
  end if;
  w := learn_pick_wall(p_uid, case when p_king then 'rare' end);
  if w is not null and learn_give_wall(p_uid, w, 'adv-first:' || p_boss) then
    update learn_adv_firsts set wall = w, ticket = tk where user_id = p_uid and boss = p_boss;
  else
    w := 0; perform learn_grant_xp(p_uid, 300, 'adv-first');
    update learn_adv_firsts set ticket = tk where user_id = p_uid and boss = p_boss;
  end if;
  if tk then perform learn_gacha_give(p_uid, 1, 'adv-first:' || p_boss); end if;
  return w;
end $$;
revoke all on function learn_adv_first(bigint, text, boolean) from public, anon, authenticated;

-- chấm vòng hiện tại, chuyển vòng / kết thúc trận, trao thưởng (gọi trong khoá dòng)
create or replace function learn_adv_step(p_id bigint, p_force boolean) returns void language plpgsql as $$
declare s learn_adv_sessions; r jsonb; t text; lv jsonb; n int; fdmg numeric; dmg numeric := 0; lost int := 0; okh boolean; okg boolean; th bigint; tg bigint; note text := '';
  ln int; done boolean := false; reg int; b record; v_stars int; xp int; fh text; fg text; tk boolean := false; isking boolean; first boolean; wins_today int; wh int; wg int; tkh boolean := false; tkg boolean := false;
begin
  select * into s from learn_adv_sessions where id = p_id for update;
  if s.state <> 'play' or s.ridx < 0 then return; end if;
  -- một người rời trận quá 30 giây → kết thúc
  if s.h_seen < now() - interval '30 seconds' or (not s.solo and s.g_seen < now() - interval '30 seconds') then
    update learn_adv_sessions set state = 'left', ended_at = now() where id = s.id; return;
  end if;
  if now() < s.r_start then return; end if;
  r := s.rounds->s.ridx; t := r->>'type'; lv := s.r_live; n := jsonb_array_length(s.rounds);
  fdmg := ceil(120.0 / n);
  if t = 'twin' then
    done := case when s.solo then lv ? 'h' else (lv ? 'h' and lv ? 'g') end;
  elsif t = 'split' then done := lv ? 'c';
  elsif t = 'relay' then done := jsonb_array_length(coalesce(lv->'line', '[]'::jsonb)) >= jsonb_array_length(r->'tk');
  elsif t = 'link' then done := jsonb_array_length(coalesce(lv->'ok', '[]'::jsonb)) >= jsonb_array_length(r->'words');
  end if;
  if not done and not p_force and now() < s.r_start + make_interval(secs => learn_adv_secs(t)) then return; end if;
  -- chấm
  if t = 'twin' and s.solo then
    okh := coalesce((lv->'h'->>'c')::int = (r->>'a')::int, false);
    if okh then
      th := (lv->'h'->>'t')::bigint;
      if th - (extract(epoch from s.r_start) * 1000)::bigint <= 5000 then dmg := fdmg * 1.25; note := 'quick'; else dmg := fdmg; note := 'ok'; end if;
    else lost := 1; note := case when lv ? 'h' then 'miss' else 'time' end; end if;
  elsif t = 'twin' then
    okh := (lv->'h'->>'c')::int = (r->>'a')::int; okg := (lv->'g'->>'c')::int = (r->>'a')::int;
    okh := coalesce(okh, false); okg := coalesce(okg, false);
    if okh and okg then
      th := (lv->'h'->>'t')::bigint; tg := (lv->'g'->>'t')::bigint;
      if abs(th - tg) <= 3000 then dmg := fdmg * 1.25; note := 'sync'; else dmg := fdmg; note := 'both'; end if;
    elsif okh or okg then dmg := fdmg * 0.5; note := 'one';
    else lost := 1; note := 'miss'; end if;
  elsif t = 'split' then
    if (lv->>'c')::int = (r->>'a')::int then dmg := fdmg; note := 'ok'; else lost := 1; note := case when lv ? 'c' then 'miss' else 'time' end; end if;
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
  xp := case when wins_today <= 10 then round((8 + 4 * reg) * v_stars * case when isking then 1.5 else 1 end * case when s.solo then 0.8 else 1 end)::int else 0 end;
  -- v24d: lần đầu MỖI NGƯỜI hạ boss này → 1 hình nền ngẫu nhiên (chưa có) + 1 vé quay (vua vùng: ưu tiên hình hiếm)
  wh := learn_adv_first(s.host, s.boss, isking);
  if not s.solo then wg := learn_adv_first(s.guest, s.boss, isking); end if;
  tkh := wh is not null and coalesce((select f.ticket from learn_adv_firsts f where f.user_id = s.host and f.boss = s.boss), false);
  tkg := wg is not null and coalesce((select f.ticket from learn_adv_firsts f where f.user_id = s.guest and f.boss = s.boss), false);
  tk := tkh or tkg;
  if s.solo then
    if xp > 0 then perform learn_grant_xp(s.host, xp, 'adv'); end if;
  else
    if xp > 0 then perform learn_grant_xp(s.host, xp, 'adv'); perform learn_grant_xp(s.guest, xp, 'adv'); end if;
    if isking or (v_stars = 3 and random() < 0.2) or (first and random() < 0.35) then
      fh := learn_fx_give(s.host, case when isking and reg >= 5 then 'legendary' when isking and reg >= 3 then 'epic' when isking then 'rare' else null end, 'adv:' || s.boss);
      fg := learn_fx_give(s.guest, case when isking and reg >= 5 then 'legendary' when isking and reg >= 3 then 'epic' when isking then 'rare' else null end, 'adv:' || s.boss);
    end if;
  end if;
  update learn_adv_sessions set reward = jsonb_build_object('stars', v_stars, 'xp', xp, 'fx_h', fh, 'fx_g', fg, 'ticket', tk, 'first', first, 'king', isking,
    'first_h', wh is not null, 'first_g', wg is not null, 'wall_h', case when wh > 0 then wh end, 'wall_g', case when wg > 0 then wg end, 'xpf_h', wh = 0, 'xpf_g', wg = 0, 'tk_h', tkh, 'tk_g', tkg) where id = s.id;
end $$;



-- ============ mỗi bài học mới hoàn thành trên Journey map: 10% được 1 vé quay ============
-- Đếm số ô "đã học" tăng thêm sau lần lưu (đã qua learn_guard nên không vượt nhịp học hợp lý). Lần lưu đầu tiên (chưa có dữ liệu) không tính.
create or replace function learn_lesson_luck(p_uid bigint, o jsonb, d jsonb) returns int language plpgsql as $$
declare n int; k int := 0; i int;
begin
  if p_uid is null or jsonb_typeof(o) is distinct from 'object' or o = '{}'::jsonb then return 0; end if;
  n := least(20, greatest(0, learn_done_count(d) - learn_done_count(o)));
  for i in 1..n loop
    if random() < 0.10 then k := k + 1; end if;
  end loop;
  if k > 0 then perform learn_gacha_give(p_uid, k, 'lesson'); end if;
  return k;
exception when others then return 0;
end $$;
revoke all on function learn_lesson_luck(bigint, jsonb, jsonb) from public, anon, authenticated;

create or replace function learn_save2(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d jsonb := p_data; o jsonb; lk int := 0;
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
  lk := learn_lesson_luck(uid, o, d);
  return jsonb_build_object('ok', true, 'rv', d->'fix'->'rv', 'data', d, 'lucky', lk);
end $$;
create or replace function learn_save(p_name text, p_pin text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(p_name)); e text; uid bigint; o jsonb; d jsonb; lk int := 0;
begin
  if pg_column_size(p_data) > 300000 then return jsonb_build_object('ok', false, 'error', 'toobig'); end if;
  e := learn_check(k, p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  select id, data into uid, o from learn_users where name_key = k for update;
  if not learn_rate('save:' || uid, 40, 60) then return jsonb_build_object('ok', false, 'error', 'slowdown'); end if;
  d := learn_data_merge(o, p_data);
  if pg_column_size(d) > 400000 then d := p_data; end if;
  d := learn_guard(uid, o, d);
  d := learn_revoke_apply(uid, d);
  update learn_users set data = d, updated_at = now() where id = uid;
  lk := learn_lesson_luck(uid, o, d);
  return jsonb_build_object('ok', true, 'lucky', lk);
end $$;


select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":27}'::jsonb) from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '27')
) t;
