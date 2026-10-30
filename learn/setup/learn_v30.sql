-- desktopchill learn v30 (2026-10-30): Live quiz vui hơn
--  * Phòng quiz công khai (danh sách "Live rooms"), mật khẩu phòng tuỳ chọn (băm bcrypt, không bao giờ trả về trình duyệt)
--  * Tự chạy (auto): máy chủ tự chuyển câu hỏi → đáp án → bảng điểm → câu sau → podium, kể cả khi màn hình host bị đóng
--  * Power-up ngẫu nhiên do máy chủ gán khi tạo ván: x2, x3 (Jackpot), First blood (+500), Mystery box (+100…800), Risky (đúng x2, sai −300), Lightning (nửa thời gian, +300)
--  * Podium: top 10 kèm ảnh đại diện + VIP, thông tin của chính người chơi
-- Chạy lại không sao.
begin;

alter table learn_quiz_games add column if not exists pass_hash text;
alter table learn_quiz_games add column if not exists pass_fails int not null default 0;
alter table learn_quiz_games add column if not exists phase_at timestamptz;
alter table learn_quiz_answers add column if not exists bonus int not null default 0;

-- gán power-up cho câu hỏi (câu 1 không có; ~40% các câu còn lại; câu cuối luôn có nếu ván ≥ 5 câu)
create or replace function learn_quiz_buffs(q jsonb, p_on boolean) returns jsonb language plpgsql volatile as $$
declare out jsonb := '[]'::jsonb; e jsonb; i int := 0; n int := jsonb_array_length(q); r numeric; b text; prev text := null; got int := 0;
begin
  for e in select value from jsonb_array_elements(q) loop
    b := null;
    if p_on and i > 0 and random() < (case when prev is null then 0.45 else 0.2 end) then
      r := random();
      b := case when r < 0.28 then 'x2' when r < 0.38 then 'x3' when r < 0.54 then 'first' when r < 0.72 then 'mystery' when r < 0.86 then 'risky' else 'lightning' end;
    end if;
    if p_on and b is null and i = n - 1 and n >= 5 then b := case when random() < 0.7 then 'x2' else 'x3' end; end if;
    if b is not null then got := got + 1; e := e || jsonb_build_object('buff', b); end if;
    out := out || jsonb_build_array(e); prev := b; i := i + 1;
  end loop;
  -- ván ≥ 4 câu mà chưa có power-up nào → đặt x2 vào 1 câu ngẫu nhiên (không phải câu 1)
  if p_on and got = 0 and n >= 4 then
    i := 1 + floor(random() * (n - 1))::int;
    out := jsonb_set(out, array[i::text, 'buff'], '"x2"'::jsonb, true);
  end if;
  return out;
end $$;

-- thời gian câu hỏi (Lightning = một nửa, tối thiểu 5 giây)
create or replace function learn_quiz_qtime(g learn_quiz_games) returns int language sql immutable as $$
  select greatest(5, coalesce(nullif((g.questions->g.q_index->>'t')::int, 0), nullif((g.settings->>'time')::int, 0), 20)
    / case when g.questions->g.q_index->>'buff' = 'lightning' then 2 else 1 end)
$$;

create or replace function learn_quiz_create(p_token text, p_title text, p_questions jsonb, p_settings jsonb, p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); s jsonb := coalesce(p_settings, '{}'::jsonb) - 'pass'; pw text := nullif(btrim(coalesce(p_settings->>'pass', '')), '');
  q jsonb; pn text; g learn_quiz_games;
begin
  q := learn_quiz_clean(p_questions);
  if jsonb_array_length(q) = 0 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  if p_room is not null and coalesce(learn_room_role(p_room, uid), 'student') = 'student' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if (select count(*) from learn_quiz_games where host_user = uid and created_at > now() - interval '1 hour') >= 30 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  -- quiz nhóm / quiz lớp không hiện trong danh sách công khai
  if s ? 'group' or p_room is not null then s := s || '{"public": false}'::jsonb; pw := null; end if;
  if pw is not null and (char_length(pw) < 3 or char_length(pw) > 20) then return jsonb_build_object('ok', false, 'error', 'badpass'); end if;
  if coalesce(s->>'theme', '') not in ('classic', 'halloween', 'christmas', 'tet', 'party') then s := s || '{"theme": "classic"}'::jsonb; end if;
  s := s || jsonb_build_object('gap', least(greatest(coalesce((s->>'gap')::int, 6), 3), 20));
  q := learn_quiz_buffs(q, coalesce((s->>'buffs')::boolean, false) and coalesce(s->>'points', 'standard') <> 'none');
  update learn_quiz_games set state = 'ended', ended_at = now() where state <> 'ended' and created_at < now() - interval '6 hours';
  loop pn := lpad((floor(random() * 1000000))::int::text, 6, '0'); exit when pn !~ '^0' and not exists (select 1 from learn_quiz_games where pin = pn and state <> 'ended'); end loop;
  insert into learn_quiz_games(pin, host_user, room_id, title, questions, settings, pass_hash, phase_at)
    values (pn, uid, p_room, left(coalesce(nullif(btrim(p_title), ''), 'Quiz'), 80), q, s, case when pw is not null then crypt(pw, gen_salt('bf', 6)) end, now()) returning * into g;
  if p_room is not null then insert into learn_room_posts(room_id, user_id, kind, body) values (p_room, uid, 'system', 'opened a live quiz: ' || g.title || ' — PIN ' || pn); end if;
  return jsonb_build_object('ok', true, 'id', g.id, 'pin', g.pin, 'host_key', g.host_key);
end $$;

create or replace function learn_quiz_answer(p_pkey uuid, p_q int, p_choice int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pl learn_quiz_players; g learn_quiz_games; q jsonb; t int; ms int; ok boolean; pts int := 0; mode text; st int; bf text; bonus int := 0;
begin
  select * into pl from learn_quiz_players where pkey = p_pkey;
  if not found or pl.kicked then return jsonb_build_object('ok', false, 'error', 'noplayer'); end if;
  select * into g from learn_quiz_games where id = pl.game_id;
  if g.state <> 'question' or g.q_index <> p_q then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  q := g.questions->g.q_index; t := learn_quiz_qtime(g); bf := q->>'buff';
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
    if bf = 'x2' or bf = 'risky' then pts := pts * 2;
    elsif bf = 'x3' then pts := pts * 3;
    elsif bf = 'lightning' then bonus := 300;
    elsif bf = 'mystery' then bonus := (1 + floor(random() * 8))::int * 100;
    elsif bf = 'first' and not exists (select 1 from learn_quiz_answers where game_id = g.id and q_index = g.q_index and correct) then bonus := 500;
    end if;
    pts := pts + bonus;
  elsif not ok and mode <> 'none' and bf = 'risky' then
    pts := -least(300, pl.score);
  end if;
  begin
    insert into learn_quiz_answers(game_id, player_id, q_index, choice, correct, ms, points, bonus) values (g.id, pl.id, g.q_index, p_choice, ok, ms, pts, bonus);
  exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'already'); end;
  update learn_quiz_players set score = greatest(0, score + pts), correct = correct + (case when ok then 1 else 0 end),
    streak = case when ok then streak + 1 else 0 end, best_streak = greatest(best_streak, case when ok then streak + 1 else 0 end) where id = pl.id;
  return jsonb_build_object('ok', true);
end $$;

-- tự chạy: chuyển trạng thái khi hết giờ / hết khoảng nghỉ. Gọi từ host_state và play_state (ai hỏi trước thì chuyển; cập nhật có điều kiện nên không chuyển trùng)
create or replace function learn_quiz_tick(p_id bigint) returns void language plpgsql as $$
declare g learn_quiz_games; gap int; t int; np int; na int; n int;
begin
  select * into g from learn_quiz_games where id = p_id;
  if not found or g.state in ('lobby', 'ended') or not coalesce((g.settings->>'auto')::boolean, false) then return; end if;
  gap := least(greatest(coalesce((g.settings->>'gap')::int, 6), 3), 20);
  if g.state = 'question' then
    if now() < g.q_started_at then return; end if;
    t := learn_quiz_qtime(g);
    select count(*) into np from learn_quiz_players where game_id = g.id and not kicked;
    select count(*) into na from learn_quiz_answers a join learn_quiz_players p on p.id = a.player_id where a.game_id = g.id and a.q_index = g.q_index and not p.kicked;
    if now() >= g.q_started_at + make_interval(secs => t + 1.5) or (np > 0 and na >= np) then
      update learn_quiz_games set state = 'reveal', phase_at = now() where id = g.id and state = 'question' and q_index = g.q_index;
      get diagnostics n = row_count;
      if n > 0 then
        update learn_quiz_players p set streak = 0 where p.game_id = g.id and not exists (select 1 from learn_quiz_answers a where a.game_id = g.id and a.player_id = p.id and a.q_index = g.q_index);
      end if;
    end if;
  elsif g.state = 'reveal' and now() >= coalesce(g.phase_at, now()) + make_interval(secs => gap) then
    update learn_quiz_games set state = 'board', phase_at = now() where id = g.id and state = 'reveal' and q_index = g.q_index;
  elsif g.state = 'board' and now() >= coalesce(g.phase_at, now()) + make_interval(secs => gap) then
    if g.q_index + 1 >= jsonb_array_length(g.questions) then
      update learn_quiz_games set state = 'ended', ended_at = now(), phase_at = now() where id = g.id and state = 'board';
      get diagnostics n = row_count;
      if n > 0 then perform learn_quiz_award(g.id); end if;
    else
      update learn_quiz_games set state = 'question', q_index = g.q_index + 1, q_started_at = now() + interval '4 seconds', phase_at = now() where id = g.id and state = 'board' and q_index = g.q_index;
    end if;
  end if;
end $$;

create or replace function learn_quiz_host_action(p_key uuid, p_action text, p_arg jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games;
begin
  select * into g from learn_quiz_games where host_key = p_key for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  if p_action = 'start' and g.state = 'lobby' then
    update learn_quiz_games set state = 'question', q_index = 0, q_started_at = now() + interval '4 seconds', phase_at = now() where id = g.id;
  elsif p_action = 'reveal' and g.state = 'question' then
    update learn_quiz_players p set streak = 0 where p.game_id = g.id and not exists (select 1 from learn_quiz_answers a where a.game_id = g.id and a.player_id = p.id and a.q_index = g.q_index);
    update learn_quiz_games set state = 'reveal', phase_at = now() where id = g.id;
  elsif p_action = 'board' and g.state = 'reveal' then
    update learn_quiz_games set state = 'board', phase_at = now() where id = g.id;
  elsif p_action = 'next' and g.state in ('reveal', 'board') then
    if g.q_index + 1 >= jsonb_array_length(g.questions) then
      update learn_quiz_games set state = 'ended', ended_at = now(), phase_at = now() where id = g.id;
      perform learn_quiz_award(g.id);
    else
      update learn_quiz_games set state = 'question', q_index = g.q_index + 1, q_started_at = now() + interval '4 seconds', phase_at = now() where id = g.id;
    end if;
  elsif p_action = 'end' then
    update learn_quiz_games set state = 'ended', ended_at = now(), phase_at = now() where id = g.id;
    if g.state <> 'lobby' and g.q_index + 1 >= jsonb_array_length(g.questions) then perform learn_quiz_award(g.id); else update learn_quiz_games set awarded = true where id = g.id; end if;
  elsif p_action = 'kick' then
    update learn_quiz_players set kicked = true where game_id = g.id and id = (p_arg->>'id')::bigint;
  elsif p_action = 'lock' then
    update learn_quiz_games set locked = not locked where id = g.id;
  elsif p_action = 'auto' then
    update learn_quiz_games set settings = settings || jsonb_build_object('auto', not coalesce((settings->>'auto')::boolean, false)), phase_at = coalesce(phase_at, now()) where id = g.id;
  end if;
  return learn_quiz_host_state(p_key);
end $$;

-- top 10 cho podium (ảnh đại diện + VIP của người có tài khoản)
create or replace function learn_quiz_podium(p_game bigint) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by rn), '[]'::jsonb) from (
    select row_number() over (order by p.score desc, p.correct desc, p.joined_at) rn,
      jsonb_build_object('id', p.id, 'nick', p.nick, 'score', p.score, 'correct', p.correct, 'best_streak', p.best_streak,
        'avatar', case when u.id is not null and char_length(coalesce(u.avatar, '')) < 40000 then coalesce(u.avatar, '') end,
        'vip', case when u.id is not null then learn_vipc(u.c_vpts, u.vip_bonus) end, 'member', p.user_id is not null) x
    from learn_quiz_players p left join learn_users u on u.id = p.user_id
    where p.game_id = p_game and not p.kicked order by p.score desc, p.correct desc, p.joined_at limit 10) s
$$;

create or replace function learn_quiz_host_state(p_key uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; q jsonb; gid bigint;
begin
  select id into gid from learn_quiz_games where host_key = p_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  perform learn_quiz_tick(gid);
  select * into g from learn_quiz_games where id = gid;
  q := case when g.q_index >= 0 then g.questions->g.q_index end;
  return jsonb_build_object('ok', true, 'id', g.id, 'pin', g.pin, 'title', g.title, 'state', g.state, 'q_index', g.q_index, 'total', jsonb_array_length(g.questions),
    'settings', g.settings, 'locked', g.locked, 'room', g.room_id, 'now', now(), 'has_pass', g.pass_hash is not null,
    'question', q, 'time', case when q is not null then learn_quiz_qtime(g) end,
    'elapsed_ms', case when g.q_started_at is not null then (extract(epoch from now() - g.q_started_at) * 1000)::int end,
    'phase_ms', case when g.phase_at is not null then (extract(epoch from now() - g.phase_at) * 1000)::int end,
    'next_buff', case when g.state in ('reveal', 'board') then g.questions->(g.q_index + 1)->>'buff' end,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nick', nick, 'score', score, 'member', user_id is not null) order by joined_at), '[]'::jsonb) from learn_quiz_players where game_id = g.id and not kicked),
    'answered', (select count(*) from learn_quiz_answers a join learn_quiz_players p on p.id = a.player_id where a.game_id = g.id and a.q_index = g.q_index and not p.kicked),
    'counts', case when g.state in ('reveal', 'board', 'ended') and q is not null then (select jsonb_agg((select count(*) from learn_quiz_answers a where a.game_id = g.id and a.q_index = g.q_index and a.choice = i)) from generate_series(0, jsonb_array_length(q->'opts') - 1) i) end,
    'bonuses', case when g.state in ('reveal', 'board') and q ? 'buff' then (select coalesce(jsonb_agg(jsonb_build_object('nick', p.nick, 'bonus', a.bonus, 'points', a.points) order by a.bonus desc, a.points desc), '[]'::jsonb)
        from learn_quiz_answers a join learn_quiz_players p on p.id = a.player_id where a.game_id = g.id and a.q_index = g.q_index and not p.kicked and (a.bonus > 0 or a.points < 0)) end,
    'board', case when g.state in ('board', 'ended', 'reveal') then learn_quiz_board(g.id, 10) end,
    'podium', case when g.state = 'ended' then learn_quiz_podium(g.id) end);
end $$;

create or replace function learn_quiz_play_state(p_pin text, p_pkey uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; pl learn_quiz_players; q jsonb; my learn_quiz_answers; rk int; showq boolean;
begin
  select p.* into pl from learn_quiz_players p where p.pkey = p_pkey;
  if not found then return jsonb_build_object('ok', false, 'error', 'noplayer'); end if;
  if pl.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  perform learn_quiz_tick(pl.game_id);
  select * into g from learn_quiz_games where id = pl.game_id;
  select * into pl from learn_quiz_players where id = pl.id;
  q := case when g.q_index >= 0 then g.questions->g.q_index end;
  showq := coalesce((g.settings->>'show_q')::boolean, true);
  select * into my from learn_quiz_answers where game_id = g.id and player_id = pl.id and q_index = g.q_index;
  select count(*) + 1 into rk from learn_quiz_players where game_id = g.id and not kicked and (score > pl.score);
  return jsonb_build_object('ok', true, 'title', g.title, 'state', g.state, 'q_index', g.q_index, 'total', jsonb_array_length(g.questions),
    'nick', pl.nick, 'score', pl.score, 'streak', pl.streak, 'rank', rk, 'players', (select count(*) from learn_quiz_players where game_id = g.id and not kicked),
    'correct', pl.correct, 'best_streak', pl.best_streak, 'theme', coalesce(g.settings->>'theme', 'classic'), 'auto', coalesce((g.settings->>'auto')::boolean, false),
    'n_opts', case when q is not null then jsonb_array_length(q->'opts') end,
    'buff', case when q is not null and g.state <> 'lobby' then q->>'buff' end,
    'q', case when q is not null and g.state <> 'lobby' and showq then q->>'q' end,
    'opts', case when q is not null and g.state <> 'lobby' and showq then q->'opts' end,
    'time', case when q is not null then learn_quiz_qtime(g) end,
    'elapsed_ms', case when g.q_started_at is not null then (extract(epoch from now() - g.q_started_at) * 1000)::int end,
    'answered', my.choice is not null, 'choice', my.choice,
    'result', case when g.state in ('reveal', 'board', 'ended') and q is not null then jsonb_build_object('correct', coalesce(my.correct, false), 'points', coalesce(my.points, 0), 'bonus', coalesce(my.bonus, 0), 'buff', q->>'buff', 'a', (q->>'a')::int, 'note', q->>'note', 'fun', q->>'fun', 'answered', my.choice is not null) end,
    'board', case when g.state = 'board' then learn_quiz_board(g.id, 5) end,
    'podium', case when g.state = 'ended' then learn_quiz_podium(g.id) end,
    'award', case when g.state = 'ended' and pl.user_id is not null then (select payload from learn_notifs where user_id = pl.user_id and kind = 'quiz_win' and payload->>'title' = g.title and created_at > g.created_at order by created_at desc limit 1) end);
end $$;

-- danh sách phòng đang live (không bao giờ trả PIN hay mật khẩu)
create or replace function learn_quiz_live() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x order by (x->>'players')::int desc, x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', g.id, 'title', g.title, 'host', coalesce(u.name, 'Host'), 'state', g.state, 'q_index', g.q_index, 'total', jsonb_array_length(g.questions),
      'players', (select count(*) from learn_quiz_players p where p.game_id = g.id and not p.kicked), 'has_pass', g.pass_hash is not null,
      'theme', coalesce(g.settings->>'theme', 'classic'), 'auto', coalesce((g.settings->>'auto')::boolean, false), 'buffs', coalesce((g.settings->>'buffs')::boolean, false),
      'guests', coalesce((g.settings->>'guests')::boolean, true), 'created_at', g.created_at) x
    from learn_quiz_games g left join learn_users u on u.id = g.host_user
    where g.state <> 'ended' and not g.locked and coalesce((g.settings->>'public')::boolean, false) and g.room_id is null
      and (g.state = 'lobby' or coalesce((g.settings->>'late')::boolean, true))
      and ((g.state = 'lobby' and g.created_at > now() - interval '2 hours') or (g.state <> 'lobby' and coalesce(g.phase_at, g.q_started_at) > now() - interval '20 minutes'))
    order by g.created_at desc limit 40) s
$$;

-- vào phòng từ danh sách (kiểm tra mật khẩu nếu có), trả về PIN để chơi như bình thường
create or replace function learn_quiz_join_room(p_game bigint, p_pass text, p_nick text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; j jsonb;
begin
  select * into g from learn_quiz_games where id = p_game and state <> 'ended' and coalesce((settings->>'public')::boolean, false) and room_id is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  if g.pass_hash is not null then
    if g.pass_fails >= 60 then return jsonb_build_object('ok', false, 'error', 'toomany'); end if;
    if p_pass is null or crypt(btrim(p_pass), g.pass_hash) <> g.pass_hash then
      update learn_quiz_games set pass_fails = pass_fails + 1 where id = g.id;
      return jsonb_build_object('ok', false, 'error', 'badpass');
    end if;
  end if;
  j := learn_quiz_join(g.pin, p_nick, p_token);
  if (j->>'ok')::boolean then j := j || jsonb_build_object('pin', g.pin); end if;
  return j;
end $$;

select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":29,"quiz":"live-rooms"}'::jsonb) from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '29')
) t;
revoke execute on function learn_quiz_buffs(jsonb, boolean), learn_quiz_tick(bigint), learn_quiz_podium(bigint) from public, anon, authenticated;
grant execute on function learn_quiz_live(), learn_quiz_join_room(bigint, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
