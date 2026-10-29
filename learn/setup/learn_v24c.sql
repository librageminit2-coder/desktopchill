-- desktopchill learn v24c (2026-10-29): Lonely Adventure — chơi Vượt ải một mình khi chưa có Bestie. Chạy lại không sao.
begin;

-- ============ v24c: LONELY ADVENTURE — chơi Vượt ải một mình khi chưa có Bestie ============
-- Cùng bản đồ, cùng đề (4 kiểu vòng). Một người giữ cả hai phần:
--   twin  : một câu hỏi, đúng = sát thương đủ; đúng trong 5 giây đầu = "Quick!" ×1.25; sai = −1 tim
--   split : thấy cả gợi ý lẫn đáp án
--   relay : giữ toàn bộ mảnh câu
--   link  : thấy cả cột từ và cột nghĩa, tự nối từng cặp
-- Tiến độ riêng (pair = 'solo-<uid>'), không vào bảng Bestie. Thưởng: XP = 80% trận Bestie (10 trận thắng/ngày),
-- vua vùng lần đầu +1 vé quay, không có hiệu ứng Bestie. Có Bestie rồi thì chơi Bestie Adventure như cũ.
alter table learn_adv_sessions add column if not exists solo boolean not null default false;

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
  if not solo then select jsonb_build_object('rank', x.rk, 'score', x.score) into rk from learn_board_rows('bestie', learn_week_of(now())) x where x.uid = v_uid; end if;
  return jsonb_build_object('ok', true, 'solo', solo, 'nobestie', solo, 'pair', pk,
    'bestie', case when solo then null else learn_bestie_brief(v_uid) end,
    'friends', case when solo then (select count(*) from learn_friends where (a = v_uid or b = v_uid) and status = 'accepted') end,
    'progress', coalesce((select jsonb_object_agg(boss, jsonb_build_object('stars', stars, 'wins', wins)) from learn_adv_progress where pair = pk and map = p_map), '{}'::jsonb),
    'total', (select coalesce(sum(stars), 0) from learn_adv_progress where pair = pk), 'rank', rk,
    'open', case when s.id is not null then jsonb_build_object('id', s.id, 'state', s.state, 'boss', s.boss, 'map', s.map, 'host', s.host, 'mine', s.host = v_uid) end,
    'today_wins', (select count(*) from learn_adv_sessions where pair = pk and state = 'won' and ended_at >= learn_vn_day()::timestamp at time zone 'Asia/Ho_Chi_Minh'));
end $$;

create or replace function learn_adv_start(p_token text, p_boss text, p_rounds jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := learn_bestie_id(uid); pk text; b record; rs jsonb := learn_adv_clean(p_rounds); s learn_adv_sessions; ou learn_users;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into b from learn_adv_parse(p_boss);
  if b.map is null then return jsonb_build_object('ok', false, 'error', 'noboss'); end if;
  if o is null then
    -- Lonely: một mình giữ mọi phần của đề
    pk := 'solo-' || uid;
    if not learn_adv_open(pk, p_boss) then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
    if jsonb_array_length(rs) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
    if not learn_rate('adv:' || uid, 30, 3600) then return jsonb_build_object('ok', false, 'error', 'toomany'); end if;
    rs := (select jsonb_agg(case when e->>'type' = 'relay' then e || jsonb_build_object('own', (select jsonb_agg('h'::text) from jsonb_array_elements(e->'tk'))) else e || jsonb_build_object('clue', 'h', 'side', 'h') end order by i)
           from jsonb_array_elements(rs) with ordinality x(e, i));
    update learn_adv_sessions set state = 'left', ended_at = now() where pair = pk and state in ('invite', 'play');
    insert into learn_adv_sessions(pair, map, boss, host, guest, rounds, solo, state, ridx, r_start, h_seen, g_seen)
      values (pk, b.map, p_boss, uid, uid, rs, true, 'play', 0, now() + interval '3 seconds', now(), now()) returning * into s;
    return jsonb_build_object('ok', true, 'id', s.id, 'solo', true);
  end if;
  pk := learn_pair_key(uid, o);
  if not learn_adv_open(pk, p_boss) then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if jsonb_array_length(rs) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  select * into ou from learn_users where id = o;
  if ou.last_seen is null or ou.last_seen < now() - interval '5 minutes' then return jsonb_build_object('ok', false, 'error', 'offline'); end if;
  update learn_adv_sessions set state = 'expired', ended_at = now() where pair = pk and state in ('invite', 'play');
  insert into learn_adv_sessions(pair, map, boss, host, guest, rounds, h_seen) values (pk, b.map, p_boss, uid, o, rs, now()) returning * into s;
  perform learn_notify(o, 'adv_invite', uid, jsonb_build_object('id', s.id, 'boss', p_boss, 'map', b.map));
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
  if s.solo then
    if xp > 0 then perform learn_grant_xp(s.host, xp, 'adv'); end if;
    if isking and first then tk := true; perform learn_gacha_give(s.host, 1, 'adv:' || s.boss); end if;
  else
    if xp > 0 then perform learn_grant_xp(s.host, xp, 'adv'); perform learn_grant_xp(s.guest, xp, 'adv'); end if;
    if isking or (v_stars = 3 and random() < 0.2) or (first and random() < 0.35) then
      fh := learn_fx_give(s.host, case when isking and reg >= 5 then 'legendary' when isking and reg >= 3 then 'epic' when isking then 'rare' else null end, 'adv:' || s.boss);
      fg := learn_fx_give(s.guest, case when isking and reg >= 5 then 'legendary' when isking and reg >= 3 then 'epic' when isking then 'rare' else null end, 'adv:' || s.boss);
    end if;
    if isking and first then tk := true; perform learn_gacha_give(s.host, 1, 'adv:' || s.boss); perform learn_gacha_give(s.guest, 1, 'adv:' || s.boss); end if;
  end if;
  update learn_adv_sessions set reward = jsonb_build_object('stars', v_stars, 'xp', xp, 'fx_h', fh, 'fx_g', fg, 'ticket', tk, 'first', first, 'king', isking) where id = s.id;
end $$;

-- trạng thái cho từng người (chỉ thấy phần của mình); Lonely thấy mọi phần
create or replace function learn_adv_view(s learn_adv_sessions, me text) returns jsonb language plpgsql stable as $$
declare r jsonb; t text; v jsonb; lv jsonb := s.r_live;
begin
  if s.ridx >= 0 and s.ridx < jsonb_array_length(s.rounds) then
    r := s.rounds->s.ridx; t := r->>'type';
    v := jsonb_build_object('type', t, 'secs', learn_adv_secs(t), 'zh', r->'zh');
    if t = 'twin' then v := v || jsonb_build_object('q', r->'q', 'opts', r->'opts', 'note', r->'note', 'mine', lv->me->'c', 'other_done', lv ? case when me = 'h' then 'g' else 'h' end);
    elsif t = 'split' and s.solo then
      v := v || jsonb_build_object('role', 'solo', 'q', r->'q', 'opts', r->'opts', 'note', r->'note', 'n', jsonb_array_length(r->'opts'), 'picked', lv->'c');
    elsif t = 'split' then
      v := v || jsonb_build_object('role', case when r->>'clue' = me then 'clue' else 'pick' end, 'note', r->'note', 'n', jsonb_array_length(r->'opts'));
      if r->>'clue' = me then v := v || jsonb_build_object('q', r->'q'); else v := v || jsonb_build_object('opts', r->'opts', 'picked', lv->'c'); end if;
    elsif t = 'relay' then
      v := v || jsonb_build_object('vi', r->'vi', 'n', jsonb_array_length(r->'tk'), 'line', coalesce(lv->'line', '[]'::jsonb),
        'line_t', (select coalesce(jsonb_agg(r->'tk'->(x::int) order by o), '[]'::jsonb) from jsonb_array_elements_text(coalesce(lv->'line', '[]'::jsonb)) with ordinality q(x, o)),
        'mine', (select jsonb_agg(jsonb_build_object('i', i, 't', r->'tk'->i) order by md5(s.id || '-' || i)) from generate_series(0, jsonb_array_length(r->'tk') - 1) i where r->'own'->>i = me),
        'theirs', (select count(*) from generate_series(0, jsonb_array_length(r->'tk') - 1) i where r->'own'->>i <> me), 'miss', coalesce(lv->'miss', '0'::jsonb));
    elsif t = 'link' and s.solo then
      v := v || jsonb_build_object('role', 'solo', 'words', r->'words', 'means', r->'means', 'n', jsonb_array_length(r->'words'),
        'ok', coalesce(lv->'ok', '[]'::jsonb), 'okm', (select coalesce(jsonb_agg(r->'a'->(x::int)), '[]'::jsonb) from jsonb_array_elements_text(coalesce(lv->'ok', '[]'::jsonb)) x),
        'bad', coalesce(lv->'bad', '0'::jsonb), 'last', lv->'last');
    elsif t = 'link' then
      v := v || jsonb_build_object('role', case when r->>'side' = me then 'words' else 'means' end,
        'items', case when r->>'side' = me then r->'words' else r->'means' end, 'n', jsonb_array_length(r->'words'),
        'ok', coalesce(lv->'ok', '[]'::jsonb), 'okm', (select coalesce(jsonb_agg(r->'a'->(x::int)), '[]'::jsonb) from jsonb_array_elements_text(coalesce(lv->'ok', '[]'::jsonb)) x),
        'my_pick', lv->'p'->me, 'their_pick', (lv->'p'->(case when me = 'h' then 'g' else 'h' end)) is not null, 'bad', coalesce(lv->'bad', '0'::jsonb), 'last', lv->'last');
    end if;
  end if;
  return jsonb_build_object('id', s.id, 'state', s.state, 'boss', s.boss, 'map', s.map, 'role', me, 'solo', s.solo, 'ridx', s.ridx, 'n', jsonb_array_length(s.rounds),
    'hp', s.hp, 'hearts', s.hearts, 'starts_in_ms', case when s.r_start is not null then (extract(epoch from s.r_start - now()) * 1000)::int end,
    'round', v, 'last', s.log->-1, 'chat', case when s.solo then '[]'::jsonb else s.chat end, 'reward', s.reward,
    'other_seen_ms', case when s.solo then 0 else (extract(epoch from now() - case when me = 'h' then s.g_seen else s.h_seen end) * 1000)::int end,
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
  if s.solo then update learn_adv_sessions set h_seen = now(), g_seen = now() where id = s.id;
  elsif me = 'h' then update learn_adv_sessions set h_seen = now() where id = s.id; else update learn_adv_sessions set g_seen = now() where id = s.id; end if;
  if s.state = 'play' then perform learn_adv_step(s.id, false); end if;
  select * into s from learn_adv_sessions where id = p_id;
  return jsonb_build_object('ok', true, 's', learn_adv_view(s, me));
end $$;

create or replace function learn_adv_act(p_token text, p_id bigint, p_act jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); s learn_adv_sessions; me text; ot text; r jsonb; t text; lv jsonb; a text := p_act->>'t'; i int; line jsonb; nm text; p jsonb; q jsonb; ms bigint; wi int; mi int;
begin
  select * into s from learn_adv_sessions where id = p_id for update;
  if not found or (s.host <> uid and s.guest <> uid) then return jsonb_build_object('ok', false, 'error', 'nosession'); end if;
  me := case when s.host = uid then 'h' else 'g' end; ot := case when me = 'h' then 'g' else 'h' end;
  if a = 'chat' then
    if s.solo then return jsonb_build_object('ok', true); end if;
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
    if (r->>'clue' = me and not s.solo) or lv ? 'c' then return jsonb_build_object('ok', false, 'error', 'notyou'); end if;
    lv := lv || jsonb_build_object('c', (p_act->>'c')::int);
  elsif t = 'relay' and a = 'tile' then
    i := (p_act->>'i')::int; line := coalesce(lv->'line', '[]'::jsonb);
    if i is null or i < 0 or i >= jsonb_array_length(r->'tk') or r->'own'->>i <> me or line @> to_jsonb(i) then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    if r->'tk'->>i = r->'tk'->>jsonb_array_length(line) then lv := lv || jsonb_build_object('line', line || to_jsonb(i));
    else lv := lv || jsonb_build_object('miss', coalesce((lv->>'miss')::int, 0) + 1, 'wrong', jsonb_build_object('by', me, 'i', i, 'at', ms)); end if;
  elsif t = 'link' and a = 'pair' and s.solo then
    -- Lonely: tự nối một cặp (từ wi ↔ nghĩa mi)
    wi := (p_act->>'w')::int; mi := (p_act->>'m')::int;
    if wi is null or mi is null or wi < 0 or mi < 0 or wi >= jsonb_array_length(r->'words') or mi >= jsonb_array_length(r->'words') then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    if (r->'a'->>wi)::int = mi and not coalesce(lv->'ok', '[]'::jsonb) @> to_jsonb(wi) then
      lv := lv || jsonb_build_object('ok', coalesce(lv->'ok', '[]'::jsonb) || to_jsonb(wi), 'last', jsonb_build_object('ok', true, 'w', wi, 'm', mi, 'at', ms));
    else lv := lv || jsonb_build_object('bad', coalesce((lv->>'bad')::int, 0) + 1, 'last', jsonb_build_object('ok', false, 'w', wi, 'm', mi, 'at', ms)); end if;
  elsif t = 'link' and a = 'pick' then
    i := (p_act->>'i')::int;
    if i is null or i < 0 or i >= jsonb_array_length(r->'words') then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    p := coalesce(lv->'p', '{}'::jsonb) || jsonb_build_object(me, jsonb_build_object('i', i, 't', ms));
    q := p->ot;
    if q is not null and abs((q->>'t')::bigint - ms) <= 5000 then
      -- người giữ "từ" là side; nghĩa đúng của từ wi là a[wi]
      wi := case when r->>'side' = me then i else (q->>'i')::int end; mi := case when r->>'side' = me then (q->>'i')::int else i end;
      if (r->'a'->>wi)::int = mi and not coalesce(lv->'ok', '[]'::jsonb) @> to_jsonb(wi) then
        lv := lv || jsonb_build_object('ok', coalesce(lv->'ok', '[]'::jsonb) || to_jsonb(wi), 'last', jsonb_build_object('ok', true, 'w', wi, 'm', mi, 'at', ms));
      else lv := lv || jsonb_build_object('bad', coalesce((lv->>'bad')::int, 0) + 1, 'last', jsonb_build_object('ok', false, 'w', wi, 'm', mi, 'at', ms)); end if;
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
select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":25,"what":"lonely"}'::jsonb) from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '25')
) t;
commit;
notify pgrst, 'reload schema';
