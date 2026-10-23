-- desktopchill learn v22 (2026-10-23): quà duel tự động.
-- Người thắng (trận thắng đầu tiên trong ngày) tự nhận 1 hình ngẫu nhiên trong bộ sưu tập của người thua mà mình chưa có;
-- nếu người thua không có hình nào mới → nhận XP. Không còn bước "chọn quà".
-- Chỉ THÊM cột / hàm và cập nhật hàm duel. Không xoá dữ liệu.

alter table learn_duels add column if not exists prize_xp int;

create or replace function learn_duel_prize_xp() returns int language sql immutable as $$ select 150 $$;

-- trao quà cho trận đã có người thắng, có quyền nhận quà và chưa nhận
create or replace function learn_duel_award(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare d learn_duels; l bigint; w int; nm text; x int := learn_duel_prize_xp();
begin
  select * into d from learn_duels where id = p_id for update;
  if not found or d.winner is null or not d.prize or d.pick_wall is not null then return jsonb_build_object('ok', false); end if;
  l := case when d.winner = d.a then d.b else d.a end;
  select name into nm from learn_users where id = l;
  select lw.wall into w from learn_walls lw
    where lw.user_id = l and lw.wall not in (5, 41, 71)
      and not exists (select 1 from learn_walls y where y.user_id = d.winner and y.wall = lw.wall)
    order by random() limit 1;
  if w is not null and learn_give_wall(d.winner, w, 'duel:' || coalesce(nm, 'opponent')) then
    update learn_duels set pick_wall = w, picked_at = now() where id = d.id;
    perform learn_notify(l, 'duel_pick', d.winner, jsonb_build_object('duel', d.id, 'wall', w, 'auto', true));
    return jsonb_build_object('ok', true, 'wall', w);
  end if;
  perform learn_grant_xp(d.winner, x, 'duel:' || coalesce(nm, 'opponent'));
  update learn_duels set pick_wall = 0, prize_xp = x, picked_at = now() where id = d.id;
  return jsonb_build_object('ok', true, 'xp', x);
end $$;

-- trận hết hạn: B không chơi trong 24 giờ → B thua, quà tự trao cho A
create or replace function learn_duel_resolve() returns int language plpgsql security definer set search_path = public, extensions as $$
declare d learn_duels; n int := 0; pz boolean; aw jsonb;
begin
  update learn_duels set state = 'expired' where state = 'a_play' and expires_at < now();
  for d in select * from learn_duels where state = 'b_turn' and expires_at < now() order by expires_at for update skip locked loop
    pz := not learn_duel_prize_used(d.a, learn_vn_day(d.expires_at));
    update learn_duels set state = 'done', winner = d.a, forfeit = true, finished_at = d.expires_at, prize = pz,
      b_res = jsonb_build_object('score', 0, 'correct', 0, 'n', jsonb_array_length(d.questions), 'ms', 0, 'forfeit', true)
      where id = d.id;
    aw := '{}'::jsonb;
    if pz then perform learn_add_bonus(d.a, 5); aw := learn_duel_award(d.id); end if;
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', true, 'forfeit', true, 'prize', pz, 'wall', aw->'wall', 'xp', aw->'xp'));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', false, 'forfeit', true));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function learn_duel_view(d learn_duels, uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'title', d.title, 'lang', d.lang, 'state', d.state, 'random', d.random, 'created_at', d.created_at, 'expires_at', d.expires_at, 'finished_at', d.finished_at,
    'role', case when d.a = uid then 'a' else 'b' end,
    'my_turn', (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn' and d.expires_at > now()),
    'me', case when d.a = uid then d.a_res - 'det' else d.b_res - 'det' end,
    'them', case when d.state = 'done' then (case when d.a = uid then d.b_res else d.a_res end) - 'det' when d.a = uid then null else d.a_res - 'det' end,
    'opp', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vip_level(learn_vip_points(data, vip_bonus))) from learn_users where id = case when d.a = uid then d.b else d.a end),
    'winner', d.winner, 'won', d.winner = uid, 'pick_wall', d.pick_wall, 'prize_xp', d.prize_xp, 'prize', d.prize, 'forfeit', d.forfeit,
    'can_pick', false, 'n', jsonb_array_length(d.questions))
$$;

create or replace function learn_duel_submit(p_token text, p_id bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; r jsonb; w bigint; l bigint; pz boolean; aw jsonb := '{}'::jsonb;
begin
  select * into d from learn_duels where id = p_id and (a = uid or b = uid) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'noduel'); end if;
  r := learn_duel_grade(d.questions, coalesce(p_answers, '[]'::jsonb));
  if d.a = uid and d.state = 'a_play' then
    update learn_duels set a_res = r, state = 'b_turn', expires_at = now() + interval '1 day' where id = d.id returning * into d;
    perform learn_notify(d.b, 'duel', uid, jsonb_build_object('duel', d.id, 'title', d.title));
  elsif d.b = uid and d.state = 'b_turn' and d.expires_at > now() then
    w := case when (r->>'score')::int > (d.a_res->>'score')::int then d.b when (r->>'score')::int < (d.a_res->>'score')::int then d.a
              when (r->>'ms')::int < (d.a_res->>'ms')::int then d.b when (r->>'ms')::int > (d.a_res->>'ms')::int then d.a end;
    l := case when w = d.a then d.b when w = d.b then d.a end;
    pz := w is not null and not learn_duel_prize_used(w, learn_vn_day());
    update learn_duels set b_res = r, state = 'done', winner = w, finished_at = now(), prize = coalesce(pz, false) where id = d.id returning * into d;
    if w is not null and pz then
      perform learn_add_bonus(w, 5); perform learn_add_bonus(l, 1);
      aw := learn_duel_award(d.id);
      select * into d from learn_duels where id = d.id;
    end if;
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', w = d.a, 'draw', w is null, 'prize', pz,
      'wall', case when w = d.a then aw->'wall' end, 'xp', case when w = d.a then aw->'xp' end));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', w = d.b, 'draw', w is null, 'prize', pz, 'silent', true));
  else
    return jsonb_build_object('ok', false, 'error', case when d.state = 'expired' or d.expires_at < now() then 'expired' else 'notyourturn' end);
  end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid), 'det', r->'det', 'questions', case when d.state = 'done' then d.questions end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

-- trận cũ đã thắng nhưng chưa chọn quà: trao tự động luôn
select count(*) as awarded from (select learn_duel_award(id) from learn_duels where state = 'done' and winner is not null and prize and pick_wall is null) t;

grant execute on function learn_duel_submit(text, bigint, jsonb) to anon, authenticated;
revoke all on function learn_duel_award(bigint) from public, anon, authenticated;
