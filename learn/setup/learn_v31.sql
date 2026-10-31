-- desktopchill learn v31 (2026-10-31)
--  * Bỏ power-up Jackpot ×3 (hên xui, không công bằng). Câu cuối của ván ≥ 5 câu luôn là ×2.
--  * Bảng xếp hạng sống: host_state / play_state trả thêm "top" (10 người đầu) suốt các câu hỏi
-- Chạy lại không sao.
begin;

create or replace function learn_quiz_buffs(q jsonb, p_on boolean) returns jsonb language plpgsql volatile as $$
declare out jsonb := '[]'::jsonb; e jsonb; i int := 0; n int := jsonb_array_length(q); r numeric; b text; prev text := null; got int := 0;
begin
  for e in select value from jsonb_array_elements(q) loop
    b := null;
    if p_on and i > 0 and random() < (case when prev is null then 0.45 else 0.2 end) then
      r := random();
      b := case when r < 0.32 then 'x2' when r < 0.50 then 'first' when r < 0.70 then 'mystery' when r < 0.85 then 'risky' else 'lightning' end;
    end if;
    if p_on and b is null and i = n - 1 and n >= 5 then b := 'x2'; end if;
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

-- v31: bảng xếp hạng sống suốt ván (podium mini + top 4–10). Khi câu hỏi đang mở thì trừ điểm của câu đó để không lộ ai trả lời đúng.
create or replace function learn_quiz_top(p_game bigint, p_hide int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by rn), '[]'::jsonb) from (
    select row_number() over (order by s.sc desc, s.joined_at) rn,
      jsonb_build_object('id', s.id, 'nick', s.nick, 'score', s.sc, 'member', s.user_id is not null,
        'avatar', case when u.id is not null and char_length(coalesce(u.avatar, '')) <= 64 then coalesce(u.avatar, '') end,
        'vip', case when u.id is not null then learn_vipc(u.c_vpts, u.vip_bonus) end) x
    from (select p.id, p.nick, p.user_id, p.joined_at,
            greatest(0, p.score - coalesce((select a.points from learn_quiz_answers a where a.game_id = p.game_id and a.player_id = p.id and a.q_index = p_hide), 0)) sc
          from learn_quiz_players p where p.game_id = p_game and not p.kicked) s
    left join learn_users u on u.id = s.user_id
    order by s.sc desc, s.joined_at limit 10) t
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
    'podium', case when g.state = 'ended' then learn_quiz_podium(g.id) end,
    'top', case when g.state in ('question', 'reveal', 'board') then learn_quiz_top(g.id, case when g.state = 'question' then g.q_index else -1 end) end);
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
    'top', case when g.state in ('question', 'reveal', 'board') then learn_quiz_top(g.id, case when g.state = 'question' then g.q_index else -1 end) end,
    'top_rank', case when g.state in ('reveal', 'board') then rk end,
    'award', case when g.state = 'ended' and pl.user_id is not null then (select payload from learn_notifs where user_id = pl.user_id and kind = 'quiz_win' and payload->>'title' = g.title and created_at > g.created_at order by created_at desc limit 1) end);
end $$;

revoke execute on function learn_quiz_buffs(jsonb, boolean), learn_quiz_top(bigint, int) from public, anon, authenticated;
grant execute on function learn_quiz_host_state(uuid), learn_quiz_play_state(text, uuid) to anon, authenticated;

-- thông báo bản cập nhật
select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":30,"quiz":"live-board","vip":"frames"}'::jsonb) from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '30')
) t;
notify pgrst, 'reload schema';
commit;
