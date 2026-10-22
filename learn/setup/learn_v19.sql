-- learn v19: bảng xếp hạng (học theo sao + duel theo tuần), duel 10 lượt/ngày + xử thua sau 24 giờ,
-- quà XP từ máy chủ, nhắn tin (bạn bè, lớp, quiz), giảm giá đổi XP 20%.
-- Chỉ THÊM bảng / cột / hàm. Không xoá dữ liệu learn_users.

-- ============ quà XP từ máy chủ (trình duyệt nhận và cộng vào tiến trình) ============
create table if not exists learn_xp_grants (
  id bigserial primary key,
  user_id bigint not null references learn_users(id) on delete cascade,
  xp int not null check (xp > 0),
  source text not null default '',
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists learn_xp_grants_user on learn_xp_grants(user_id) where claimed_at is null;
alter table learn_xp_grants enable row level security;

create or replace function learn_grant_xp(p_uid bigint, p_xp int, p_source text) returns void language sql as $$
  insert into learn_xp_grants(user_id, xp, source) values (p_uid, p_xp, left(coalesce(p_source, ''), 80));
$$;

-- hình ngẫu nhiên chưa có, ưu tiên độ hiếm cho trước (rare → epic → legendary → bất kỳ)
create or replace function learn_pick_wall(p_uid bigint, p_rarity text) returns int language sql stable as $$
  select c.id from learn_wall_catalog c
  where not exists (select 1 from learn_walls x where x.user_id = p_uid and x.wall = c.id) and c.id not in (5, 41, 71)
    and (p_rarity is null or c.rarity in ('rare', 'epic', 'legendary'))
  order by case when p_rarity is null then 0 when c.rarity = p_rarity then 0 when c.rarity = 'epic' then 1 when c.rarity = 'legendary' then 2 else 3 end, random()
  limit 1
$$;

-- ============ giá đổi XP: giảm 20% ============
create or replace function learn_wall_price(p_rarity text) returns int language sql immutable as $$
  select case p_rarity when 'common' then 960 when 'rare' then 1920 when 'epic' then 3840 else 7680 end
$$;

-- ============ duel: cột mới ============
alter table learn_duels add column if not exists finished_at timestamptz;
alter table learn_duels add column if not exists prize boolean not null default false;
alter table learn_duels add column if not exists forfeit boolean not null default false;
-- trận cũ đã thắng mà chưa chọn quà vẫn được chọn
update learn_duels set prize = true where state = 'done' and winner is not null and pick_wall is null and not prize;
update learn_duels set finished_at = created_at where state = 'done' and finished_at is null;

create or replace function learn_week_of(t timestamptz) returns date language sql stable as $$
  select date_trunc('week', (t at time zone 'Asia/Ho_Chi_Minh'))::date
$$;

-- người thắng đã nhận quà duel trong ngày này chưa (mỗi ngày tối đa 1 quà)
create or replace function learn_duel_prize_used(p_uid bigint, p_day date) returns boolean language sql stable as $$
  select exists (select 1 from learn_duels where winner = p_uid and prize and learn_vn_day(finished_at) = p_day)
$$;

-- trận hết hạn: B không chơi trong 24 giờ → B thua, quà tự chuyển cho A
create or replace function learn_duel_resolve() returns int language plpgsql security definer set search_path = public, extensions as $$
declare d learn_duels; n int := 0; w int; pz boolean; bn text;
begin
  update learn_duels set state = 'expired' where state = 'a_play' and expires_at < now();
  for d in select * from learn_duels where state = 'b_turn' and expires_at < now() order by expires_at for update skip locked loop
    pz := not learn_duel_prize_used(d.a, learn_vn_day(d.expires_at));
    update learn_duels set state = 'done', winner = d.a, forfeit = true, finished_at = d.expires_at, prize = pz,
      b_res = jsonb_build_object('score', 0, 'correct', 0, 'n', jsonb_array_length(d.questions), 'ms', 0, 'forfeit', true)
      where id = d.id;
    if pz then
      perform learn_add_bonus(d.a, 5);
      w := (select lw.wall from learn_walls lw where lw.user_id = d.b and not exists (select 1 from learn_walls x where x.user_id = d.a and x.wall = lw.wall) order by random() limit 1);
      select name into bn from learn_users where id = d.b;
      if w is not null then
        perform learn_give_wall(d.a, w, 'duel:' || coalesce(bn, 'opponent'));
        update learn_duels set pick_wall = w, picked_at = d.expires_at where id = d.id;
      else
        update learn_duels set pick_wall = 0 where id = d.id; perform learn_add_bonus(d.a, 10);
      end if;
    end if;
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', true, 'forfeit', true, 'wall', case when pz then w end));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', false, 'forfeit', true));
    n := n + 1;
  end loop;
  return n;
end $$;

-- bảng điểm duel của một tuần: thắng 3, hoà 1, thua 0
create or replace function learn_duel_board(p_week date) returns table(uid bigint, pts int, wins int, played int, last_at timestamptz) language sql stable as $$
  with r as (
    select a as u, winner, coalesce(finished_at, created_at) t from learn_duels where state = 'done' and learn_week_of(coalesce(finished_at, created_at)) = p_week
    union all
    select b as u, winner, coalesce(finished_at, created_at) t from learn_duels where state = 'done' and learn_week_of(coalesce(finished_at, created_at)) = p_week
  )
  select r.u, sum(case when winner = r.u then 3 when winner is null then 1 else 0 end)::int, count(*) filter (where winner = r.u)::int, count(*)::int, max(t)
  from r join learn_users x on x.id = r.u where not x.banned
  group by r.u
$$;

-- chốt tuần: top 10 duel nhận XP + 1 hình hiếm ngẫu nhiên (chỉ tính từ tuần ra mắt v19)
create table if not exists learn_duel_weeks (week date primary key, settled_at timestamptz not null default now());
create table if not exists learn_duel_week_rewards (week date not null, user_id bigint not null references learn_users(id) on delete cascade, rank int not null, pts int not null, wall int, xp int not null, primary key (week, user_id));
alter table learn_duel_weeks enable row level security;
alter table learn_duel_week_rewards enable row level security;

create or replace function learn_duel_settle() returns int language plpgsql security definer set search_path = public, extensions as $$
declare wk date := date '2026-10-19'; cur date := learn_week_of(now()); r record; k int; w int; x int; n int := 0;
begin
  while wk < cur loop
    if not exists (select 1 from learn_duel_weeks where week = wk) then
      begin
        insert into learn_duel_weeks(week) values (wk);
      exception when unique_violation then wk := wk + 7; continue;
      end;
      k := 0;
      for r in select * from learn_duel_board(wk) b where b.pts > 0 order by b.pts desc, b.wins desc, b.last_at asc limit 10 loop
        k := k + 1;
        x := case k when 1 then 600 when 2 then 450 when 3 then 350 else 200 end;
        w := learn_pick_wall(r.uid, 'rare');
        if w is not null then perform learn_give_wall(r.uid, w, 'rank:Duel week ' || to_char(wk, 'DD/MM')); else x := x + 300; end if;
        perform learn_grant_xp(r.uid, x, 'duel-week');
        insert into learn_duel_week_rewards(week, user_id, rank, pts, wall, xp) values (wk, r.uid, k, r.pts, w, x) on conflict do nothing;
        perform learn_notify(r.uid, 'rank_reward', null, jsonb_build_object('board', 'duel', 'week', wk, 'rank', k, 'walls', case when w is null then '[]'::jsonb else jsonb_build_array(w) end, 'xp', x));
        n := n + 1;
      end loop;
    end if;
    wk := wk + 7;
  end loop;
  return n;
end $$;

-- ============ duel: 10 lượt / ngày, hết hạn 24 giờ, 1 quà / ngày ============
create or replace function learn_duel_create(p_token text, p_to bigint, p_lang text, p_title text, p_questions jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); o bigint := p_to; q jsonb := learn_duel_clean(p_questions); d learn_duels; rnd boolean := p_to is null;
begin
  if jsonb_array_length(q) < 5 then return jsonb_build_object('ok', false, 'error', 'noquestions'); end if;
  if (select count(*) from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()) >= 10 then return jsonb_build_object('ok', false, 'error', 'duel_today'); end if;
  if o is null then
    select id into o from learn_users x where x.id <> uid and not x.banned and x.last_seen > now() - interval '3 days'
      and not exists (select 1 from learn_duels d2 where d2.state in ('a_play', 'b_turn') and ((d2.a = uid and d2.b = x.id) or (d2.b = uid and d2.a = x.id)))
      order by abs(learn_vip_level(learn_vip_points(x.data, x.vip_bonus)) - learn_user_vip(uid)), random() limit 1;
    if o is null then return jsonb_build_object('ok', false, 'error', 'noone'); end if;
  else
    if o = uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
    if not learn_are_friends(uid, o) then return jsonb_build_object('ok', false, 'error', 'notfriend'); end if;
    if exists (select 1 from learn_duels where state in ('a_play', 'b_turn') and ((a = uid and b = o) or (b = uid and a = o))) then return jsonb_build_object('ok', false, 'error', 'duel_open'); end if;
  end if;
  insert into learn_duels(a, b, lang, title, questions, random, expires_at) values (uid, o, coalesce(nullif(p_lang, ''), 'en'), left(coalesce(nullif(btrim(p_title), ''), 'Duel'), 80), q, rnd, now() + interval '1 day') returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id, 'opponent', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vip_level(learn_vip_points(data, vip_bonus))) from learn_users where id = o),
    'questions', learn_duel_public(d.questions), 'left_today', 10 - (select count(*) from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()));
end $$;

create or replace function learn_duel_view(d learn_duels, uid bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'title', d.title, 'lang', d.lang, 'state', d.state, 'random', d.random, 'created_at', d.created_at, 'expires_at', d.expires_at, 'finished_at', d.finished_at,
    'role', case when d.a = uid then 'a' else 'b' end,
    'my_turn', (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn' and d.expires_at > now()),
    'me', case when d.a = uid then d.a_res - 'det' else d.b_res - 'det' end,
    'them', case when d.state = 'done' then (case when d.a = uid then d.b_res else d.a_res end) - 'det' when d.a = uid then null else d.a_res - 'det' end,
    'opp', (select jsonb_build_object('uid', id, 'name', name, 'avatar', coalesce(avatar, ''), 'vip', learn_vip_level(learn_vip_points(data, vip_bonus))) from learn_users where id = case when d.a = uid then d.b else d.a end),
    'winner', d.winner, 'won', d.winner = uid, 'pick_wall', d.pick_wall, 'prize', d.prize, 'forfeit', d.forfeit,
    'can_pick', d.winner = uid and d.prize and d.pick_wall is null, 'n', jsonb_array_length(d.questions))
$$;

create or replace function learn_duel_get(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels;
begin
  perform learn_duel_resolve();
  select * into d from learn_duels where id = p_id and (a = uid or b = uid);
  if not found then return jsonb_build_object('ok', false, 'error', 'noduel'); end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid),
    'questions', case when (d.a = uid and d.state = 'a_play') or (d.b = uid and d.state = 'b_turn') then learn_duel_public(d.questions) when d.state = 'done' then d.questions end,
    'my_det', case when d.state = 'done' then case when d.a = uid then d.a_res->'det' else d.b_res->'det' end end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

create or replace function learn_duel_submit(p_token text, p_id bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; r jsonb; w bigint; l bigint; opts int; pz boolean;
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
    if w is not null then
      if pz then
        perform learn_add_bonus(w, 5); perform learn_add_bonus(l, 1);
        select count(*) into opts from learn_walls lw where lw.user_id = l and not exists (select 1 from learn_walls x where x.user_id = w and x.wall = lw.wall);
        if opts = 0 then update learn_duels set pick_wall = 0 where id = d.id returning * into d; perform learn_add_bonus(w, 10); end if;
      end if;
    end if;
    perform learn_notify(d.a, 'duel_done', d.b, jsonb_build_object('duel', d.id, 'won', w = d.a, 'draw', w is null, 'prize', pz));
    perform learn_notify(d.b, 'duel_done', d.a, jsonb_build_object('duel', d.id, 'won', w = d.b, 'draw', w is null, 'prize', pz, 'silent', true));
  else
    return jsonb_build_object('ok', false, 'error', case when d.state = 'expired' or d.expires_at < now() then 'expired' else 'notyourturn' end);
  end if;
  return jsonb_build_object('ok', true, 'duel', learn_duel_view(d, uid), 'det', r->'det', 'questions', case when d.state = 'done' then d.questions end,
    'their_det', case when d.state = 'done' then case when d.a = uid then d.b_res->'det' else d.a_res->'det' end end);
end $$;

create or replace function learn_duel_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); wk date := learn_week_of(now());
begin
  perform learn_duel_resolve();
  return jsonb_build_object('ok', true,
    'items', coalesce((select jsonb_agg(learn_duel_view(d, uid) order by d.created_at desc) from (select * from learn_duels where a = uid or b = uid order by created_at desc limit 40) d), '[]'::jsonb),
    'today', (select count(*) from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()), 'per_day', 10,
    'duel_today', (select count(*) from learn_duels where a = uid and learn_vn_day(created_at) = learn_vn_day()) >= 10,
    'prize_today', learn_duel_prize_used(uid, learn_vn_day()),
    'pick_today', learn_duel_prize_used(uid, learn_vn_day()),
    'wins', (select count(*) from learn_duels where winner = uid), 'played', (select count(*) from learn_duels where (a = uid or b = uid) and state = 'done'),
    'week', (select jsonb_build_object('pts', b.pts, 'wins', b.wins, 'played', b.played) from learn_duel_board(wk) b where b.uid = learn_uid(p_token)),
    'pool', (select count(*) from learn_users where id <> uid and not banned and last_seen > now() - interval '3 days'));
end $$;

create or replace function learn_duel_options(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; l bigint;
begin
  select * into d from learn_duels where id = p_id and winner = uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'notwinner'); end if;
  l := case when d.a = uid then d.b else d.a end;
  return jsonb_build_object('ok', true, 'picked', d.pick_wall, 'prize', d.prize, 'walls', coalesce((select jsonb_agg(lw.wall order by lw.wall) from learn_walls lw where lw.user_id = l
    and not exists (select 1 from learn_walls x where x.user_id = uid and x.wall = lw.wall)), '[]'::jsonb), 'pick_today', false);
end $$;

create or replace function learn_duel_pick(p_token text, p_id bigint, p_wall int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); d learn_duels; l bigint; nm text;
begin
  select * into d from learn_duels where id = p_id and winner = uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'notwinner'); end if;
  if not d.prize then return jsonb_build_object('ok', false, 'error', 'noprize'); end if;
  if d.pick_wall is not null then return jsonb_build_object('ok', false, 'error', 'picked'); end if;
  l := case when d.a = uid then d.b else d.a end;
  if not exists (select 1 from learn_walls where user_id = l and wall = p_wall) then return jsonb_build_object('ok', false, 'error', 'notowned'); end if;
  select name into nm from learn_users where id = l;
  if not learn_give_wall(uid, p_wall, 'duel:' || nm) then return jsonb_build_object('ok', false, 'error', 'youhave'); end if;
  update learn_duels set pick_wall = p_wall, picked_at = now() where id = d.id;
  perform learn_notify(l, 'duel_pick', uid, jsonb_build_object('duel', d.id, 'wall', p_wall));
  return jsonb_build_object('ok', true);
end $$;

-- ============ xếp hạng học: tổng sao trong khoá ============
create or replace function learn_course_score(d jsonb, p_lang text) returns int language plpgsql immutable as $$
declare k text; s int := 0; i int; st jsonb; dn jsonb;
begin
  if d is null then return 0; end if;
  for k in select key from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) where key like p_lang || '-%'
    union select key from jsonb_each(case when jsonb_typeof(d->'stars') = 'object' then d->'stars' else '{}'::jsonb end) where key like p_lang || '-%' loop
    st := d->'stars'->k; dn := d->'done'->k;
    for i in 0..7 loop
      if jsonb_typeof(st) = 'array' and jsonb_typeof(st->i) = 'number' and (st->>i)::int > 0 then s := s + least(3, (st->>i)::int);
      elsif jsonb_typeof(dn) = 'array' and (dn->>i) in ('1', 'true') then s := s + 1; end if;
    end loop;
  end loop;
  return s;
end $$;

create table if not exists learn_rank_scores (user_id bigint not null references learn_users(id) on delete cascade, lang text not null, score int not null default 0, reached_at timestamptz not null default now(), primary key (user_id, lang));
create table if not exists learn_rank_rewards (user_id bigint not null references learn_users(id) on delete cascade, lang text not null, rank int not null, walls int[] not null default '{}', xp int not null default 0, created_at timestamptz not null default now(), primary key (user_id, lang, rank));
create table if not exists learn_rank_meta (lang text primary key, refreshed_at timestamptz not null default now());
alter table learn_rank_scores enable row level security;
alter table learn_rank_rewards enable row level security;
alter table learn_rank_meta enable row level security;

-- cập nhật điểm + trao quà theo hạng (mỗi hạng 1 lần / khoá; cần ít nhất 24 sao)
create or replace function learn_rank_refresh(p_lang text) returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record; k int := 0; ws int[]; w int; x int;
begin
  if p_lang not in ('en', 'zh', 'ielts') then return; end if;
  insert into learn_rank_meta(lang, refreshed_at) values (p_lang, now() - interval '1 hour') on conflict do nothing;
  if (select refreshed_at from learn_rank_meta where lang = p_lang) > now() - interval '30 seconds' then return; end if;
  update learn_rank_meta set refreshed_at = now() where lang = p_lang;
  insert into learn_rank_scores(user_id, lang, score, reached_at)
    select u.id, p_lang, learn_course_score(u.data, p_lang), now() from learn_users u where not u.banned and u.last_seen > now() - interval '120 days'
    on conflict (user_id, lang) do update set score = excluded.score, reached_at = case when excluded.score <> learn_rank_scores.score then now() else learn_rank_scores.reached_at end;
  for r in select s.user_id, s.score from learn_rank_scores s join learn_users u on u.id = s.user_id
           where s.lang = p_lang and s.score > 0 and not u.banned order by s.score desc, s.reached_at asc, s.user_id limit 10 loop
    k := k + 1;
    if r.score < 24 then continue; end if;
    if exists (select 1 from learn_rank_rewards where user_id = r.user_id and lang = p_lang and rank = k) then continue; end if;
    ws := '{}'; x := 0;
    if k = 1 then
      w := learn_pick_wall(r.user_id, 'rare'); if w is not null then perform learn_give_wall(r.user_id, w, 'rank:' || p_lang || ' #1'); ws := ws || w; end if;
      w := learn_pick_wall(r.user_id, null); if w is not null then perform learn_give_wall(r.user_id, w, 'rank:' || p_lang || ' #1'); ws := ws || w; end if;
    elsif k = 2 then
      w := learn_pick_wall(r.user_id, 'rare'); if w is not null then perform learn_give_wall(r.user_id, w, 'rank:' || p_lang || ' #2'); ws := ws || w; end if;
    elsif k = 3 then
      w := learn_pick_wall(r.user_id, null); if w is not null then perform learn_give_wall(r.user_id, w, 'rank:' || p_lang || ' #3'); ws := ws || w; end if;
    else
      x := case k when 4 then 300 when 5 then 250 when 6 then 220 when 7 then 190 when 8 then 160 when 9 then 140 else 120 end;
    end if;
    if k <= 3 and coalesce(array_length(ws, 1), 0) = 0 then x := 500; end if;
    if x > 0 then perform learn_grant_xp(r.user_id, x, 'rank-' || p_lang); end if;
    insert into learn_rank_rewards(user_id, lang, rank, walls, xp) values (r.user_id, p_lang, k, ws, x) on conflict do nothing;
    perform learn_notify(r.user_id, 'rank_reward', null, jsonb_build_object('board', p_lang, 'rank', k, 'walls', to_jsonb(ws), 'xp', x));
  end loop;
end $$;

-- bảng xếp hạng: p_board = 'en' | 'zh' | 'ielts' | 'duel'
create or replace function learn_rank_board(p_token text, p_board text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid bigint := case when coalesce(p_token, '') = '' then null else learn_uid(p_token) end; items jsonb; me jsonb; wk date := learn_week_of(now());
begin
  if p_board = 'duel' then
    perform learn_duel_resolve(); perform learn_duel_settle();
    with b as (select * from learn_duel_board(wk)), o as (select b.*, row_number() over (order by b.pts desc, b.wins desc, b.last_at asc) rk from b where b.pts > 0)
    select coalesce(jsonb_agg(jsonb_build_object('rank', o.rk, 'uid', o.uid, 'score', o.pts, 'wins', o.wins, 'played', o.played) order by o.rk) filter (where o.rk <= 10), '[]'::jsonb),
      (select jsonb_build_object('rank', o2.rk, 'score', o2.pts, 'wins', o2.wins, 'played', o2.played) from o o2 where o2.uid = v_uid)
      into items, me from o;
  elsif p_board in ('en', 'zh', 'ielts') then
    perform learn_rank_refresh(p_board);
    with o as (select s.user_id uid, s.score, row_number() over (order by s.score desc, s.reached_at asc, s.user_id) rk from learn_rank_scores s join learn_users u on u.id = s.user_id where s.lang = p_board and s.score > 0 and not u.banned)
    select coalesce(jsonb_agg(jsonb_build_object('rank', o.rk, 'uid', o.uid, 'score', o.score) order by o.rk) filter (where o.rk <= 10), '[]'::jsonb),
      (select jsonb_build_object('rank', o2.rk, 'score', o2.score) from o o2 where o2.uid = v_uid)
      into items, me from o;
  else return jsonb_build_object('ok', false, 'error', 'board'); end if;
  -- thêm tên, ảnh, VIP và quan hệ bạn bè
  select coalesce(jsonb_agg(e || jsonb_build_object('name', u.name, 'avatar', coalesce(u.avatar, ''), 'vip', learn_vip_level(learn_vip_points(u.data, u.vip_bonus)),
      'rel', case when u.id = v_uid then 'me' when f.status = 'accepted' then 'friend' when f.status = 'pending' and f.requester = v_uid then 'sent' when f.status = 'pending' then 'incoming' else 'none' end) order by (e->>'rank')::int), '[]'::jsonb)
    into items
    from jsonb_array_elements(items) e join learn_users u on u.id = (e->>'uid')::bigint
    left join learn_friends f on v_uid is not null and f.a = least(v_uid, u.id) and f.b = greatest(v_uid, u.id);
  return jsonb_build_object('ok', true, 'board', p_board, 'items', items, 'me', me, 'week', wk, 'week_end', wk + 7,
    'mine', case when v_uid is null or p_board = 'duel' then '[]'::jsonb else coalesce((select jsonb_agg(rank order by rank) from learn_rank_rewards where user_id = v_uid and lang = p_board), '[]'::jsonb) end);
end $$;

-- ============ nhịp hỏi máy chủ: xử trận hết hạn, chốt tuần, nhận XP thưởng ============
create or replace function learn_tick(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); g jsonb;
begin
  perform learn_duel_resolve(); perform learn_duel_settle();
  with c as (update learn_xp_grants set claimed_at = now() where user_id = uid and claimed_at is null returning xp, source)
  select coalesce(jsonb_agg(jsonb_build_object('xp', xp, 'source', source)), '[]'::jsonb) into g from c;
  return jsonb_build_object('ok', true, 'grants', g);
end $$;

-- ============ nhắn tin ============
create table if not exists learn_msgs (
  id bigserial primary key,
  chan text not null,
  sender bigint references learn_users(id) on delete set null,
  nick text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists learn_msgs_chan on learn_msgs(chan, id desc);
create index if not exists learn_msgs_sender on learn_msgs(sender, created_at desc);
create table if not exists learn_msg_reads (user_id bigint not null references learn_users(id) on delete cascade, chan text not null, last_id bigint not null default 0, primary key (user_id, chan));
alter table learn_msgs enable row level security;
alter table learn_msg_reads enable row level security;

create or replace function learn_dm_chan(x bigint, y bigint) returns text language sql immutable as $$ select 'dm:' || least(x, y) || ':' || greatest(x, y) $$;

-- người dùng có được vào kênh này không
create or replace function learn_chan_ok(p_uid bigint, p_chan text) returns boolean language plpgsql stable as $$
declare p text[] := string_to_array(p_chan, ':');
begin
  if p_uid is null then return false; end if;
  if p[1] = 'dm' and array_length(p, 1) = 3 then
    return (p[2]::bigint = p_uid or p[3]::bigint = p_uid) and learn_are_friends(p[2]::bigint, p[3]::bigint);
  elsif p[1] = 'room' and array_length(p, 1) = 2 then
    return exists (select 1 from learn_room_members where room_id = p[2]::bigint and user_id = p_uid);
  end if;
  return false;
exception when others then return false;
end $$;

create or replace function learn_msg_rows(p_chan text, p_after bigint) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'from', m.sender, 'name', coalesce(u.name, m.nick), 'avatar', coalesce(u.avatar, ''),
    'vip', case when u.id is not null then learn_vip_level(learn_vip_points(u.data, u.vip_bonus)) end, 'body', m.body, 'at', m.created_at) order by m.id), '[]'::jsonb)
  from (select * from learn_msgs where chan = p_chan and id > coalesce(p_after, 0) order by id desc limit 80) m left join learn_users u on u.id = m.sender
$$;

create or replace function learn_chat_send(p_token text, p_chan text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); b text := left(btrim(coalesce(p_body, '')), 500); nm text; v_id bigint;
begin
  if b = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if not learn_chan_ok(uid, p_chan) then return jsonb_build_object('ok', false, 'error', 'noaccess'); end if;
  if (select count(*) from learn_msgs where sender = uid and created_at > now() - interval '1 minute') >= 20 then return jsonb_build_object('ok', false, 'error', 'slow'); end if;
  select u.name into nm from learn_users u where u.id = uid;
  insert into learn_msgs(chan, sender, nick, body) values (p_chan, uid, nm, b) returning learn_msgs.id into v_id;
  insert into learn_msg_reads(user_id, chan, last_id) values (uid, p_chan, v_id) on conflict (user_id, chan) do update set last_id = greatest(learn_msg_reads.last_id, excluded.last_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function learn_chat_get(p_token text, p_chan text, p_after bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); mx bigint;
begin
  if not learn_chan_ok(uid, p_chan) then return jsonb_build_object('ok', false, 'error', 'noaccess'); end if;
  select max(id) into mx from learn_msgs where chan = p_chan;
  if mx is not null then
    insert into learn_msg_reads(user_id, chan, last_id) values (uid, p_chan, mx) on conflict (user_id, chan) do update set last_id = greatest(learn_msg_reads.last_id, excluded.last_id);
  end if;
  return jsonb_build_object('ok', true, 'items', learn_msg_rows(p_chan, p_after));
end $$;

-- danh sách cuộc trò chuyện: bạn bè + lớp, kèm tin cuối và số tin chưa đọc
create or replace function learn_chat_threads(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(t order by (t->>'last_at') desc nulls last) from (
    select jsonb_build_object('chan', learn_dm_chan(uid, o.id), 'kind', 'dm', 'uid', o.id, 'name', o.name, 'avatar', coalesce(o.avatar, ''), 'vip', learn_vip_level(learn_vip_points(o.data, o.vip_bonus)), 'last_seen', o.last_seen,
      'last', (select left(m.body, 80) from learn_msgs m where m.chan = learn_dm_chan(uid, o.id) order by m.id desc limit 1),
      'last_at', (select m.created_at from learn_msgs m where m.chan = learn_dm_chan(uid, o.id) order by m.id desc limit 1),
      'unread', (select count(*) from learn_msgs m where m.chan = learn_dm_chan(uid, o.id) and m.sender <> uid and m.id > coalesce((select last_id from learn_msg_reads r where r.user_id = uid and r.chan = learn_dm_chan(uid, o.id)), 0))) t
    from learn_friends f join learn_users o on o.id = case when f.a = uid then f.b else f.a end where (f.a = uid or f.b = uid) and f.status = 'accepted'
    union all
    select jsonb_build_object('chan', 'room:' || r.id, 'kind', 'room', 'room', r.id, 'name', r.name, 'code', r.code,
      'last', (select left(m.body, 80) from learn_msgs m where m.chan = 'room:' || r.id order by m.id desc limit 1),
      'last_at', (select m.created_at from learn_msgs m where m.chan = 'room:' || r.id order by m.id desc limit 1),
      'unread', (select count(*) from learn_msgs m where m.chan = 'room:' || r.id and m.sender is distinct from uid and m.id > coalesce((select last_id from learn_msg_reads x where x.user_id = uid and x.chan = 'room:' || r.id), 0))) t
    from learn_room_members mm join learn_rooms r on r.id = mm.room_id where mm.user_id = uid and not r.archived
  ) q(t)), '[]'::jsonb));
end $$;

create or replace function learn_msg_unread(p_uid bigint) returns int language sql stable as $$
  select count(*)::int from learn_msgs m
  where m.sender is distinct from p_uid and m.created_at > now() - interval '30 days'
    and (m.chan in (select learn_dm_chan(p_uid, case when f.a = p_uid then f.b else f.a end) from learn_friends f where (f.a = p_uid or f.b = p_uid) and f.status = 'accepted')
      or m.chan in (select 'room:' || room_id from learn_room_members where user_id = p_uid))
    and m.id > coalesce((select last_id from learn_msg_reads r where r.user_id = p_uid and r.chan = m.chan), 0)
$$;

-- nhắn tin trong ván quiz: người chơi (pkey) và chủ phòng (host_key), kể cả khách chưa có tài khoản
create or replace function learn_game_chat(p_pin text, p_pkey uuid, p_host uuid, p_body text, p_after bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare g learn_quiz_games; pl learn_quiz_players; nk text; uid bigint; b text := left(btrim(coalesce(p_body, '')), 300);
begin
  if p_host is not null then select * into g from learn_quiz_games where host_key = p_host; nk := 'Host';
    if found then uid := g.host_user; end if;
  else
    select q.* into g from learn_quiz_games q join learn_quiz_players p on p.game_id = q.id where p.pkey = p_pkey and q.pin = p_pin order by q.id desc limit 1;
    select * into pl from learn_quiz_players where pkey = p_pkey;
    if pl.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
    nk := pl.nick; uid := pl.user_id;
  end if;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'nogame'); end if;
  if b <> '' then
    if g.ended_at is not null and g.ended_at < now() - interval '2 hours' then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
    if (select count(*) from learn_msgs where chan = 'game:' || g.id and nick = nk and created_at > now() - interval '1 minute') >= 15 then return jsonb_build_object('ok', false, 'error', 'slow'); end if;
    insert into learn_msgs(chan, sender, nick, body) values ('game:' || g.id, uid, nk, b);
  end if;
  return jsonb_build_object('ok', true, 'items', learn_msg_rows('game:' || g.id, p_after), 'me', nk);
end $$;

-- ============ learn_me: thêm số tin nhắn chưa đọc; trận hết hạn được xử thua thay vì bỏ ============
create or replace function learn_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token); u learn_users; pts int;
begin
  select * into u from learn_users where id = uid;
  pts := learn_vip_points(u.data, u.vip_bonus);
  perform learn_duel_resolve();
  return jsonb_build_object('ok', true, 'uid', u.id, 'name', u.name, 'code', u.friend_code, 'avatar', coalesce(u.avatar, ''),
    'vip', learn_vip_level(pts), 'vip_pts', pts, 'bonus', u.vip_bonus,
    'requests', (select count(*) from learn_friends where (a = uid or b = uid) and status = 'pending' and requester <> uid),
    'rooms', (select count(*) from learn_room_members where user_id = uid),
    'unread', (select count(*) from learn_notifs where user_id = uid and read_at is null),
    'duels', (select count(*) from learn_duels where b = uid and state = 'b_turn'),
    'msgs', learn_msg_unread(uid),
    'walls', (select count(*) from learn_walls where user_id = uid));
end $$;

-- ============ quyền ============
revoke all on learn_xp_grants, learn_duel_weeks, learn_duel_week_rewards, learn_rank_scores, learn_rank_rewards, learn_rank_meta, learn_msgs, learn_msg_reads from anon, authenticated;
revoke execute on function learn_grant_xp(bigint, int, text), learn_pick_wall(bigint, text), learn_duel_resolve(), learn_duel_settle(), learn_rank_refresh(text),
  learn_duel_board(date), learn_duel_prize_used(bigint, date), learn_chan_ok(bigint, text), learn_msg_rows(text, bigint), learn_msg_unread(bigint) from anon, authenticated, public;
grant execute on function learn_rank_board(text, text), learn_tick(text), learn_chat_send(text, text, text), learn_chat_get(text, text, bigint), learn_chat_threads(text),
  learn_game_chat(text, uuid, uuid, text, bigint), learn_me(text), learn_duel_create(text, bigint, text, text, jsonb), learn_duel_get(text, bigint), learn_duel_submit(text, bigint, jsonb),
  learn_duel_list(text), learn_duel_options(text, bigint), learn_duel_pick(text, bigint, int), learn_wall_price(text) to anon, authenticated;
