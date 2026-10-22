-- desktopchill learn v21 (2026-10-23): chỉ thêm/cập nhật, không xoá dữ liệu.
-- 1) Giá mở hình nền bằng XP giảm thêm 40% (960/1920/3840/7680 -> 576/1152/2304/4608).
create or replace function learn_wall_price(p_rarity text) returns int language sql immutable as $$
  select case p_rarity when 'common' then 576 when 'rare' then 1152 when 'epic' then 2304 else 4608 end
$$;
grant execute on function learn_wall_price(text) to anon, authenticated;
-- 2) 22 hình nền mới (72–93) và ô thưởng cho English B1+ / B2+ — sinh bởi learnbuild/walls-extend21.js
insert into learn_wall_catalog(id, name, rarity) values
(72,'Violin Above Earth','legendary'),
(73,'Ink Sword Master','epic'),
(74,'Veiled Princess','epic'),
(75,'Candlelight Lady','rare'),
(76,'Mountain Pavilion','rare'),
(77,'Harbor Sunset Friends','common'),
(78,'Ink Wind Warrior','epic'),
(79,'Deep Blue Encounter','rare'),
(80,'Shadow Mage','rare'),
(81,'Planet Dreamer','rare'),
(82,'Silver Aura Fighter','legendary'),
(83,'Crimson Pagodas','epic'),
(84,'Night Wave','common'),
(85,'Firefly Forest Path','rare'),
(86,'Maple Mountain Lake','common'),
(87,'Neon City Fall','epic'),
(88,'Sakura Blade','legendary'),
(89,'Firefly Cat','rare'),
(90,'Rainy Study Window','common'),
(91,'Leaf Shadow Portrait','rare'),
(92,'Summer Hat Girl','epic'),
(93,'Little Spellreader','rare')
  on conflict (id) do nothing;
insert into learn_wall_slots(slot, walls) values
('en-b1p-1','{81,77}'),
('en-b1p-2','{90,84}'),
('en-b1p-3','{86,90}'),
('en-b1p-4','{76,86}'),
('en-b1p-5','{85,83}'),
('en-b1p-6','{89,81}'),
('en-b1p-7','{80,76}'),
('en-b1p-8','{79,93}'),
('en-b1p-9','{77,75}'),
('en-b1p-10','{75,91}'),
('en-b1p-11','{84,80}'),
('en-b1p-12','{93,91}'),
('boss|en|b1p','{92,72,88}'),
('en-b2p-1','{91,85}'),
('en-b2p-2','{80,89}'),
('en-b2p-3','{85,87}'),
('en-b2p-4','{86,79}'),
('en-b2p-5','{89,92}'),
('en-b2p-6','{84,73}'),
('en-b2p-7','{90,78}'),
('en-b2p-8','{76,73}'),
('en-b2p-9','{75,87}'),
('en-b2p-10','{79,83}'),
('en-b2p-11','{77,74}'),
('en-b2p-12','{93,78}'),
('boss|en|b2p','{72,64,82}')
  on conflict (slot) do nothing;

-- 3) Duel: giữ nhãn chủ đề của câu hỏi (note) để người chơi thứ hai cũng thấy "Science", "Vocabulary · B1+"…
create or replace function learn_duel_clean(p jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; e jsonb; o jsonb; n int; k int := 0;
begin
  if jsonb_typeof(p) <> 'array' then return out; end if;
  for e in select value from jsonb_array_elements(p) limit 15 loop
    if jsonb_typeof(e->'opts') <> 'array' then continue; end if;
    n := jsonb_array_length(e->'opts');
    if n < 2 or n > 4 or coalesce(char_length(e->>'q'), 0) = 0 then continue; end if;
    select jsonb_agg(left(v, 120)) into o from jsonb_array_elements_text(e->'opts') v;
    out := out || jsonb_build_array(jsonb_build_object('q', left(e->>'q', 300), 'opts', o, 'a', least(greatest(coalesce((e->>'a')::int, 0), 0), n - 1),
      'd', least(greatest(coalesce((e->>'d')::int, k / 2), 0), 4), 'zh', coalesce((e->>'zh')::boolean, false))
      || case when coalesce(e->>'note', '') <> '' then jsonb_build_object('note', left(e->>'note', 60)) else '{}'::jsonb end);
    k := k + 1;
  end loop;
  return out;
end $$;

-- 4) thông báo cập nhật tới mọi người (chạy lại cũng không gửi trùng)
select count(*) as notified from (
  select learn_notify(u.id, 'update', null, '{"v":21,"en_levels":["b1p","b2p"],"units":24,"walls":22}'::jsonb)
  from learn_users u
  where not exists (select 1 from learn_notifs n where n.user_id = u.id and n.kind = 'update' and n.payload->>'v' = '21')
) t;
