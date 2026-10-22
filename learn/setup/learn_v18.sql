-- learn v18: thêm 106 chủ đề mới (EN 60→100, 中文 61→97, IELTS 52→82).
-- Chỉ THÊM: ô hình nền cho chủ đề mới, hàm đánh dấu đã đọc theo loại, thông báo cập nhật cho mọi người.
-- Không xoá / sửa dữ liệu learn_users. Mốc VIP giữ nguyên (60/61/52) và được chặn trần để điểm VIP của ai cũng không bị tụt.

-- 1) VIP: đếm tối đa bằng số chủ đề mốc của mỗi khoá (học thêm chủ đề mới không làm vượt trần, cũng không làm tụt điểm)
create or replace function learn_vip_points(d jsonb, bonus int) returns int language sql stable as $$
  with u as (
    select k from jsonb_each(case when jsonb_typeof(d->'done') = 'object' then d->'done' else '{}'::jsonb end) t(k, v)
    where jsonb_typeof(v) = 'array' and jsonb_array_length(v) >= 8
      and not exists (select 1 from jsonb_array_elements(v) e where e::text not in ('1', 'true'))
  ), m as (select (select units from learn_course_meta where lang = 'en') en, (select units from learn_course_meta where lang = 'zh') zh, (select units from learn_course_meta where lang = 'ielts') ie)
  select (
    coalesce(round(600.0 * least((select count(*) from u where k like 'en-%'), (select en from m)) / nullif((select en from m), 0)), 0)
  + coalesce(round(1000.0 * least((select count(*) from u where k like 'zh-%'), (select zh from m)) / nullif((select zh from m), 0)), 0)
  + coalesce(round(1000.0 * least((select count(*) from u where k like 'ielts-%'), (select ie from m)) / nullif((select ie from m), 0)), 0)
  + least(greatest(coalesce(bonus, 0), 0), 150))::int
$$;

-- 2) đánh dấu đã đọc mọi thông báo của một loại (dùng khi mở bảng "có gì mới")
create or replace function learn_notifs_read_kind(p_token text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid bigint := learn_uid(p_token);
begin
  update learn_notifs set read_at = now() where user_id = uid and read_at is null and kind = p_kind;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function learn_notifs_read_kind(text, text) to anon, authenticated;

-- 3) ô hình nền cho chủ đề mới
-- sinh tự động bởi learnbuild/walls-extend.js — chỉ THÊM ô cho chủ đề mới, không xoá/đổi ô cũ
insert into learn_wall_slots(slot, walls) values
('en-a1-13','{26,33}'),
('en-a1-14','{61,28}'),
('en-a1-15','{46,11}'),
('en-a1-16','{57,12}'),
('en-a1-17','{59,27}'),
('en-a1-18','{43,60}'),
('en-a1-19','{22,2}'),
('en-a1-20','{24,47}'),
('en-a2-13','{45,58}'),
('en-a2-14','{45,19}'),
('en-a2-15','{26,29}'),
('en-a2-16','{4,37}'),
('en-a2-17','{66,62}'),
('en-a2-18','{48,8}'),
('en-a2-19','{21,34}'),
('en-a2-20','{49,50}'),
('en-b1-13','{44,39}'),
('en-b1-14','{10,54}'),
('en-b1-15','{53,13}'),
('en-b1-16','{49,17}'),
('en-b1-17','{20,68}'),
('en-b1-18','{11,3}'),
('en-b1-19','{10,9}'),
('en-b1-20','{22,31}'),
('en-b2-13','{29,18}'),
('en-b2-14','{44,15}'),
('en-b2-15','{66,42}'),
('en-b2-16','{12,32}'),
('en-b2-17','{60,67}'),
('en-b2-18','{59,52}'),
('en-b2-19','{37,19}'),
('en-b2-20','{21,13}'),
('en-c1-13','{27,53}'),
('en-c1-14','{48,69}'),
('en-c1-15','{28,58}'),
('en-c1-16','{61,62}'),
('en-c1-17','{57,33}'),
('en-c1-18','{23,8}'),
('en-c1-19','{63,40}'),
('en-c1-20','{43,35}'),
('zh-hsk1-12','{26,43}'),
('zh-hsk1-13','{22,12}'),
('zh-hsk1-14','{2,46}'),
('zh-hsk1-15','{45,47}'),
('zh-hsk1-16','{27,21}'),
('zh-hsk1-17','{57,11}'),
('zh-hsk2-11','{63,23}'),
('zh-hsk2-12','{24,44}'),
('zh-hsk2-13','{59,29}'),
('zh-hsk2-14','{61,38}'),
('zh-hsk2-15','{28,19}'),
('zh-hsk2-16','{57,53}'),
('zh-hsk3-11','{33,35}'),
('zh-hsk3-12','{10,39}'),
('zh-hsk3-13','{25,60}'),
('zh-hsk3-14','{30,18}'),
('zh-hsk3-15','{63,62}'),
('zh-hsk3-16','{22,8}'),
('zh-hsk4-11','{45,15}'),
('zh-hsk4-12','{29,17}'),
('zh-hsk4-13','{19,54}'),
('zh-hsk4-14','{44,31}'),
('zh-hsk4-15','{10,69}'),
('zh-hsk4-16','{25,42}'),
('zh-hsk5-11','{33,13}'),
('zh-hsk5-12','{66,52}'),
('zh-hsk5-13','{11,50}'),
('zh-hsk5-14','{21,49}'),
('zh-hsk5-15','{28,38}'),
('zh-hsk5-16','{55,58}'),
('zh-hsk6-11','{59,50}'),
('zh-hsk6-12','{4,60}'),
('zh-hsk6-13','{2,17}'),
('zh-hsk6-14','{20,9}'),
('zh-hsk6-15','{37,42}'),
('zh-hsk6-16','{12,68}'),
('ielts-b4-13','{24,53}'),
('ielts-b4-14','{26,60}'),
('ielts-b4-15','{27,19}'),
('ielts-b4-16','{63,22}'),
('ielts-b4-17','{47,66}'),
('ielts-b4-18','{24,21}'),
('ielts-b5-11','{46,23}'),
('ielts-b5-12','{12,52}'),
('ielts-b5-13','{10,68}'),
('ielts-b5-14','{57,31}'),
('ielts-b5-15','{59,8}'),
('ielts-b5-16','{37,34}'),
('ielts-b6-11','{43,11}'),
('ielts-b6-12','{44,4}'),
('ielts-b6-13','{55,17}'),
('ielts-b6-14','{30,3}'),
('ielts-b6-15','{28,15}'),
('ielts-b6-16','{33,25}'),
('ielts-b7-11','{20,31}'),
('ielts-b7-12','{29,69}'),
('ielts-b7-13','{38,50}'),
('ielts-b7-14','{2,40}'),
('ielts-b7-15','{45,67}'),
('ielts-b7-16','{49,18}'),
('ielts-b8-11','{58,54}'),
('ielts-b8-12','{48,42}'),
('ielts-b8-13','{61,13}'),
('ielts-b8-14','{22,9}'),
('ielts-b8-15','{59,39}'),
('ielts-b8-16','{44,68}')
  on conflict (slot) do nothing;

-- 4) thông báo cập nhật tới mọi người (chạy lại cũng không gửi trùng)
select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":18,"added":106,"en":100,"zh":97,"ielts":82}'::jsonb)
  from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '18')
) t;
