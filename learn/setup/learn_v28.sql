-- learn v28 (30/10/2026): MỌI bảng xếp hạng trả thưởng lúc 16:00 thứ SÁU (giờ Hà Nội), không còn thứ Hai.
-- Duel chỉ tính điểm từ 05:00 thứ Hai tới 16:00 thứ Sáu (cuối tuần đánh vẫn có XP nhưng không vào bảng Duel).
-- Tuần chuyển tiếp: '2026-10-26' = 16:00 thứ Hai 26/10 → 16:00 thứ Sáu 30/10 (trả thưởng chiều nay).
-- Từ đó tuần mang ngày thứ Sáu bắt đầu: 16:00 thứ Sáu → 16:00 thứ Sáu tuần sau.

create or replace function learn_week_of(t timestamptz) returns date language sql stable as $$
  select case
    when t >= (date '2026-10-26' + time '16:00') at time zone 'Asia/Ho_Chi_Minh' and t < (date '2026-10-30' + time '16:00') at time zone 'Asia/Ho_Chi_Minh' then date '2026-10-26'
    when t < (date '2026-10-26' + time '16:00') at time zone 'Asia/Ho_Chi_Minh' then date_trunc('week', (t at time zone 'Asia/Ho_Chi_Minh') - interval '16 hours')::date
    else (date_trunc('week', (t at time zone 'Asia/Ho_Chi_Minh') - interval '16 hours' - interval '4 days') + interval '4 days')::date
  end
$$;
-- hết tuần (thời điểm trả thưởng)
create or replace function learn_week_end(p_week date) returns timestamptz language sql immutable as $$
  select case when p_week = date '2026-10-26' then (date '2026-10-30' + time '16:00') at time zone 'Asia/Ho_Chi_Minh' else learn_week_start(p_week) + interval '7 days' end
$$;
create or replace function learn_week_end_day(p_week date) returns date language sql immutable as $$
  select (learn_week_end(p_week) at time zone 'Asia/Ho_Chi_Minh')::date
$$;
-- Duel bắt đầu tính điểm: 05:00 thứ Hai trong tuần (tuần thứ Sáu: ngày + 3); tuần cũ / chuyển tiếp: từ đầu tuần
create or replace function learn_duel_from(p_week date) returns timestamptz language sql immutable as $$
  select case when extract(isodow from p_week) = 5 then ((p_week + 3) + time '05:00') at time zone 'Asia/Ho_Chi_Minh' else learn_week_start(p_week) end
$$;

create or replace function learn_duel_board(p_week date) returns table(uid bigint, pts int, wins int, played int, last_at timestamptz) language sql stable as $$
  with lo as (select learn_duel_from(p_week) t0, learn_week_end(p_week) t1),
  d as (select * from learn_duels, lo where state = 'done' and finished_at >= lo.t0 and finished_at < lo.t1),
  r as (select a as u, winner, finished_at t from d where a_scored union all select b as u, winner, finished_at t from d where b_scored and not forfeit)
  select r.u, sum(case when winner = r.u then 3 when winner is null then 1 else 0 end)::int, count(*) filter (where winner = r.u)::int, count(*)::int, max(t)
  from r join learn_users x on x.id = r.u where not x.banned
  group by r.u
$$;

create or replace function learn_week_settle() returns int language plpgsql security definer set search_path = public, extensions as $$
declare wk date := date '2026-10-26'; b text; r record; n int := 0; k int; ok int;
begin
  -- đã chốt kể từ lần trả thưởng gần nhất → thoát nhanh
  if exists (select 1 from learn_week_tickets where board = 'bestie' and settled_at >= learn_week_start(learn_week_of(now()))) then return 0; end if;
  perform learn_duel_settle();
  while learn_week_end(wk) <= now() loop
    foreach b in array learn_week_boards() loop
      insert into learn_week_tickets(week, board) values (wk, b) on conflict do nothing;
      get diagnostics ok = row_count;
      if ok = 0 then continue; end if;
      if b in ('en', 'zh', 'ielts') then update learn_rank_meta set refreshed_at = now() - interval '1 hour' where lang = b; perform learn_rank_refresh(b); end if;
      k := 0;
      for r in select * from learn_board_rows(b, wk) x where x.rk <= 10 order by x.rk loop
        k := k + 1;
        if b in ('en', 'zh', 'ielts') then perform learn_rank_award(r.uid, b, r.rk::int, r.score); end if;
        perform learn_gacha_give(r.uid, 1, 'week:' || b || ':' || to_char(wk, 'DD/MM'));
        perform learn_notify(r.uid, 'rank_ticket', null, jsonb_build_object('board', b, 'week', wk, 'rank', r.rk));
      end loop;
      update learn_week_tickets set n = k where week = wk and board = b;
      n := n + k;
    end loop;
    wk := learn_week_of(learn_week_end(wk));
  end loop;
  return n;
end $$;

create or replace function learn_duel_settle() returns int language plpgsql security definer set search_path = public, extensions as $$
declare wk date := date '2026-10-19'; r record; k int; w int; x int; n int := 0;
begin
  while learn_week_end(wk) <= now() loop
    if not exists (select 1 from learn_duel_weeks where week = wk) then
      begin
        insert into learn_duel_weeks(week) values (wk);
      exception when unique_violation then wk := learn_week_of(learn_week_end(wk)); continue;
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
    wk := learn_week_of(learn_week_end(wk));
  end loop;
  return n;
end $$;

create or replace function learn_duel_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid bigint := learn_uid(p_token); wk date := learn_week_of(now()); c jsonb;
begin
  perform learn_duel_resolve();
  c := learn_duel_counts(v_uid);
  return jsonb_build_object('ok', true,
    'items', coalesce((select jsonb_agg(learn_duel_view(d, v_uid) order by d.created_at desc) from (select * from learn_duels where a = v_uid or b = v_uid order by created_at desc limit 40) d), '[]'::jsonb),
    'today', c->'sent', 'per_day', 10, 'sent_left', c->'sent_left', 'recv_left', c->'recv_left', 'ticket_today', c->'ticket_today',
    'duel_today', false, 'prize_today', c->'ticket_today', 'pick_today', c->'ticket_today',
    'wins', (select count(*) from learn_duels where winner = v_uid), 'played', (select count(*) from learn_duels where (a = v_uid or b = v_uid) and state = 'done'),
    'week', (select jsonb_build_object('pts', b.pts, 'wins', b.wins, 'played', b.played) from learn_duel_board(wk) b where b.uid = v_uid),
    'week_end', learn_week_end_day(wk), 'duel_from', learn_duel_from(wk), 'duel_open', now() >= learn_duel_from(wk),
    'pool', (select count(*) from learn_users where id <> v_uid and not banned and last_seen > now() - interval '3 days'));
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
  return jsonb_build_object('ok', true, 'board', p_board, 'items', items, 'me', me, 'week', wk, 'week_end', learn_week_end_day(wk), 'duel_from', learn_duel_from(wk),
    'mine', case when v_uid is null or p_board not in ('en', 'zh', 'ielts') then '[]'::jsonb else coalesce((select jsonb_agg(rank order by rank) from learn_rank_rewards where user_id = v_uid and lang = p_board), '[]'::jsonb) end);
end $$;

revoke execute on function learn_week_end(date), learn_week_end_day(date), learn_duel_from(date), learn_duel_board(date), learn_week_settle(), learn_duel_settle() from public, anon, authenticated;

-- lịch chốt tự động: 16:00 thứ Sáu giờ Hà Nội = 09:00 UTC thứ Sáu (+ lần thử lại 09:10)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('learn-week-settle', 'learn-week-settle-retry');
    perform cron.schedule('learn-week-settle', '0 9 * * 5', 'select public.learn_week_settle()');
    perform cron.schedule('learn-week-settle-retry', '10 9 * * 5', 'select public.learn_week_settle()');
  end if;
end $$;
