-- ============ v24d (2026-10-29): ADVENTURE — thưởng lần đầu vượt ải + bảng xếp hạng Adventure ============
-- 1) Lần đầu MỖI NGƯỜI hạ một boss (Bestie hay Lonely đều được): 1 hình nền ngẫu nhiên chưa có + 1 vé quay may mắn.
--    Vua vùng (boss 6) ưu tiên hình hiếm. Đã có đủ hình → +300 XP thay hình. Mỗi người mỗi boss đúng 1 lần.
-- 2) Bảng "Adventure" (khoá cũ 'bestie'): mỗi người một dòng, điểm = tổng sao tốt nhất từng boss
--    (lấy cao nhất giữa trận Lonely của mình và trận với Bestie hiện tại). Người chơi một mình cũng có hạng.
create table if not exists learn_adv_firsts (user_id bigint not null, boss text not null, wall int, created_at timestamptz not null default now(), primary key (user_id, boss));
alter table learn_adv_firsts enable row level security;
revoke all on learn_adv_firsts from anon, authenticated;

-- trao thưởng lần đầu; trả về id hình (0 = hết hình, đã đổi XP), null = người này đã nhận thưởng boss này rồi
create or replace function learn_adv_first(p_uid bigint, p_boss text, p_king boolean) returns int language plpgsql as $$
declare w int; ok int;
begin
  if p_uid is null then return null; end if;
  insert into learn_adv_firsts(user_id, boss) values (p_uid, p_boss) on conflict do nothing;
  get diagnostics ok = row_count;
  if ok = 0 then return null; end if;
  w := learn_pick_wall(p_uid, case when p_king then 'rare' end);
  if w is not null and learn_give_wall(p_uid, w, 'adv-first:' || p_boss) then
    update learn_adv_firsts set wall = w where user_id = p_uid and boss = p_boss;
  else
    w := 0; perform learn_grant_xp(p_uid, 300, 'adv-first');
  end if;
  perform learn_gacha_give(p_uid, 1, 'adv-first:' || p_boss);
  return w;
end $$;
revoke all on function learn_adv_first(bigint, text, boolean) from public, anon, authenticated;

-- chấm vòng hiện tại, chuyển vòng / kết thúc trận, trao thưởng (gọi trong khoá dòng)
create or replace function learn_adv_step(p_id bigint, p_force boolean) returns void language plpgsql as $$
declare s learn_adv_sessions; r jsonb; t text; lv jsonb; n int; fdmg numeric; dmg numeric := 0; lost int := 0; okh boolean; okg boolean; th bigint; tg bigint; note text := '';
  ln int; done boolean := false; reg int; b record; v_stars int; xp int; fh text; fg text; tk boolean := false; isking boolean; first boolean; wins_today int; wh int; wg int;
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
  tk := wh is not null or wg is not null;
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
    'first_h', wh is not null, 'first_g', wg is not null, 'wall_h', nullif(wh, 0), 'wall_g', nullif(wg, 0), 'tk_h', wh is not null, 'tk_g', wg is not null) where id = s.id;
end $$;


-- bảng Adventure: mỗi người một dòng
create or replace function learn_board_rows(p_board text, p_week date) returns table(uid bigint, score int, rk bigint, wins int, played int) language plpgsql stable as $$
begin
  if p_board = 'duel' then
    return query select b.uid, b.pts, row_number() over (order by b.pts desc, b.wins desc, b.last_at asc), b.wins, b.played from learn_duel_board(p_week) b where b.pts > 0;
  elsif p_board = 'col' then
    return query select w.user_id, w.n::int, row_number() over (order by w.n desc, w.last_at asc, w.user_id), null::int, null::int
      from (select lw.user_id, count(*) n, max(lw.created_at) last_at from learn_walls lw join learn_users u on u.id = lw.user_id where not u.banned group by lw.user_id) w;
  elsif p_board = 'bestie' then
    return query with pu as (
        select distinct p.pair pk, substr(p.pair, 6)::bigint u from learn_adv_progress p where p.pair like 'solo-%'
        union all
        select learn_pair_key(bb.a, bb.b), x.u from learn_besties bb cross join lateral (values (bb.a), (bb.b)) x(u) where bb.status = 'accepted'),
      best as (select pu.u, p.map, p.boss, max(p.stars) st, max(p.best_at) la from pu join learn_adv_progress p on p.pair = pu.pk join learn_users us on us.id = pu.u and not us.banned group by pu.u, p.map, p.boss),
      sc as (select best.u, sum(best.st)::int s, max(best.la) la from best group by best.u having sum(best.st) > 0)
      select sc.u, sc.s, row_number() over (order by sc.s desc, sc.la asc, sc.u), null::int, null::int from sc;
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


create or replace function learn_adv_map(p_token text, p_map text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(v_uid); pk text; s learn_adv_sessions; rk jsonb; solo boolean := o is null;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  pk := case when solo then 'solo-' || v_uid else learn_pair_key(v_uid, o) end;
  update learn_adv_sessions set state = 'expired', ended_at = now() where pair = pk and state = 'invite' and created_at < now() - interval '90 seconds';
  -- trận bị bỏ dở (một người không còn mở quá 30 giây) → đóng lại
  update learn_adv_sessions set state = 'left', ended_at = now() where pair = pk and state = 'play' and (h_seen < now() - interval '30 seconds' or g_seen < now() - interval '30 seconds');
  select * into s from learn_adv_sessions where pair = pk and state in ('invite', 'play') order by id desc limit 1;
  select jsonb_build_object('rank', x.rk, 'score', x.score) into rk from learn_board_rows('bestie', learn_week_of(now())) x where x.uid = v_uid;
  return jsonb_build_object('ok', true, 'solo', solo, 'nobestie', solo, 'pair', pk,
    'bestie', case when solo then null else learn_bestie_brief(v_uid) end,
    'friends', case when solo then (select count(*) from learn_friends where (a = v_uid or b = v_uid) and status = 'accepted') end,
    'progress', coalesce((select jsonb_object_agg(boss, jsonb_build_object('stars', stars, 'wins', wins)) from learn_adv_progress where pair = pk and map = p_map), '{}'::jsonb),
    'total', (select coalesce(sum(stars), 0) from learn_adv_progress where pair = pk), 'rank', rk,
    'firsts', coalesce((select jsonb_agg(f.boss) from learn_adv_firsts f where f.user_id = v_uid and f.boss like p_map || '-%'), '[]'::jsonb),
    'open', case when s.id is not null then jsonb_build_object('id', s.id, 'state', s.state, 'boss', s.boss, 'map', s.map, 'host', s.host, 'mine', s.host = v_uid) end,
    'today_wins', (select count(*) from learn_adv_sessions where pair = pk and state = 'won' and ended_at >= learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh'));
end $$;


select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":26}'::jsonb) from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '26')
) t;
