// Trang Phương pháp: giải thích cách hệ thống đọc thị trường và chấm điểm.
const W = (rows) => `<div class="table-wrap glass" style="margin:10px 0 6px"><table><thead><tr><th>Yếu tố</th><th>Cách đọc</th><th class="r">Trọng số</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><td style="white-space:normal;font-weight:700">${a}</td><td style="white-space:normal" class="dim">${b}</td><td class="r num">${c}</td></tr>`).join('')}</tbody></table></div>`;

export default {
  render(main) {
    main.innerHTML = `<div class="page-title"><div><h1>Phương pháp</h1><p>Hệ thống không đoán giá. Nó kiểm tra lần lượt các nguyên lý kinh điển của phân tích kỹ thuật, dòng tiền và cơ bản, rồi cộng trừ điểm minh bạch. Mọi con số trên trang chi tiết đều truy ngược được về yếu tố tạo ra nó.</p></div></div>
    <div class="grid g-main"><article class="prose">
      <h2>Cách tính điểm</h2>
      <p>Mỗi mã bắt đầu ở 50 điểm (trung tính). Mỗi yếu tố cho một giá trị từ −1 (rất xấu) đến +1 (rất tốt), nhân với trọng số, rồi quy về thang 0–100. Trên trang chi tiết, con số bên phải mỗi lý do là số điểm yếu tố đó đã cộng hoặc trừ.</p>
      <ul><li><b>75–100</b> rất tích cực · <b>60–75</b> tích cực · <b>45–60</b> trung tính · <b>30–45</b> tiêu cực · <b>dưới 30</b> rất tiêu cực.</li>
      <li>Mã có giá trị giao dịch dưới 1 tỷ/phiên bị kéo điểm về gần 50 vì tín hiệu kỹ thuật kém tin cậy khi ít người mua bán.</li></ul>

      <h2>Ngắn hạn · 1–2 tuần</h2>
      ${W([['Xu hướng ngắn', 'Giá so với EMA20, EMA10 cắt EMA20', 14], ['RSI 14', '55–75 là động lượng khỏe; trên 78 là quá mua dễ rung lắc; dưới 30 là quá bán, ưu tiên khi RSI móc lên', 12], ['Thanh khoản', 'Giá tăng kèm giá trị giao dịch ≥ 1,5 lần trung bình 20 phiên = tiền vào; giá giảm kèm thanh khoản lớn = bị bán', 12], ['Breakout', 'Vượt nền tích lũy, cờ tăng, thoát tam giác có khối lượng xác nhận', 12], ['MACD', 'Cắt lên/xuống đường tín hiệu, histogram mở rộng hay thu hẹp', 10], ['Phân kỳ', 'RSI/MACD đi ngược hướng giá ở 2 đáy (dương) hoặc 2 đỉnh (âm) trong 8 phiên gần nhất', 10], ['Lợi nhuận/rủi ro', 'Khoảng cách tới kháng cự gần so với tới hỗ trợ gần', 8], ['Mô hình nến', 'Búa, nhấn chìm, sao mai/sao hôm, marubozu ở phiên gần nhất', 7], ['Thị trường chung', 'Điểm sức khỏe VN-Index', 7], ['CMF, khối ngoại, Stochastic, RS 1 tháng', 'Dòng tiền tích lũy/phân phối, mua bán ròng hôm nay, giao cắt Stochastic ở vùng cực, sức mạnh giá 20 phiên', '5–6']])}

      <h2>Trung hạn · 1–3 tháng</h2>
      ${W([['MA50', 'Giá trên/dưới MA50 và độ dốc MA50', 16], ['RS (Relative Strength)', 'Hiệu suất 3–6–9–12 tháng có trọng số, xếp hạng 1–99 trong toàn sàn (kiểu IBD)', 15], ['Mô hình giá', 'Hai đáy W, hai đỉnh M, vai–đầu–vai (thuận/ngược), tam giác tăng/giảm, nền tích lũy — xác nhận khi vượt/thủng đường viền cổ', 12], ['Gom/xả', 'Tỷ lệ khối lượng ngày tăng / ngày giảm trong 50 phiên, OBV so với giá', 12], ['Cấu trúc sóng', 'Đỉnh sau cao hơn đỉnh trước, đáy sau cao hơn đáy trước (Dow)', 10], ['ADX', 'Xu hướng có lực khi ADX ≥ 22, hướng theo +DI/−DI', 8], ['Fibonacci', 'Vị trí giá trong sóng gần nhất: điều chỉnh về vùng 38,2–61,8% mà vẫn trên MA50 là lành mạnh; mất 78,6% là gãy sóng', 8], ['Phân kỳ thường', 'Như ngắn hạn nhưng chỉ tính phân kỳ thường', 8], ['Khung tuần, ngành, thị trường', 'RSI/MACD tuần, sức mạnh ngành, sức khỏe VN-Index', '5–7'], ['Bollinger co hẹp', 'Biên độ hẹp nhất 15% trong 120 phiên — sắp có biến động mạnh', 4]])}

      <h2>Dài hạn · 6–12 tháng</h2>
      ${W([['MA200', 'Giá trên/dưới MA200 và độ dốc', 16], ['Tăng trưởng lợi nhuận', 'Lợi nhuận 12 tháng gần nhất so với cùng kỳ', 12], ['Khung tuần', 'Cấu trúc đỉnh đáy tuần, MA10 tuần so với MA40 tuần', 10], ['RS, ROE', 'Sức mạnh giá dài hạn; hiệu quả sử dụng vốn (ROE ≥ 20% rất tốt)', 10], ['Định giá', 'P/E so với trung vị ngành (rẻ hơn ngành được cộng điểm), P/B', '4–8'], ['Giao cắt MA50/MA200', 'Giao cắt vàng/tử thần trong 25 phiên', 8], ['Phân kỳ RSI tuần, đỉnh 52 tuần, thanh khoản, sức khỏe tài chính, VN-Index so với MA200', '', '5–8']])}

      <h2>Vùng đáy · tiềm năng hồi phục</h2>
      <p>Chỉ xét mã đã giảm từ 20% trở lên so với đỉnh 52 tuần (hoặc nằm dưới MA200). Thay vì phạt mã vì giá yếu, hệ thống hỏi: bên bán đã cạn chưa, tiền đã bắt đầu gom chưa, doanh nghiệp có còn tốt và có đang bị định giá rẻ không.</p>
      ${W([['Nền giá', 'Bao lâu không tạo đáy mới, biên độ 20 phiên co hẹp, đáy sau cao hơn đáy trước', 14], ['Định giá', 'P/E so với trung vị ngành, P/B dưới 1 (dưới giá trị sổ sách)', 13], ['Dòng tiền gom', 'OBV đi lên khi giá đi ngang, CMF dương, KL ngày tăng > ngày giảm, khối ngoại mua', 12], ['Phân kỳ dương', 'RSI/MACD ngày, đặc biệt RSI tuần', 12], ['Chất lượng doanh nghiệp', 'ROE, tăng trưởng lợi nhuận 12 tháng, sức khỏe tài chính', 12], ['Bắt dao rơi', 'ADX mạnh với −DI áp đảo và vừa tạo đáy mới → trừ điểm', '−12'], ['Động lượng hồi, kiệt sức bên bán, mô hình đảo chiều, RS cải thiện, vị trí giá', '', '6–10']])}
      <p>Giai đoạn: <b>Đang rơi</b> (vừa tạo đáy mới) · <b>Đang tạo đáy</b> (ngừng giảm, chờ xác nhận) · <b>Xác nhận đảo chiều</b> (lấy lại EMA20 kèm đáy cao hơn hoặc MACD cắt lên). Dư địa hồi tính tới mức Fibonacci 38,2% và 61,8% của con sóng giảm từ đỉnh 52 tuần.</p>
      <h3>Trừ điểm mã tăng nóng</h3>
      <p>Ở ba khung thời gian thường, mã đã cách EMA20 quá 10%, MA50 quá 18% hoặc MA200 quá 60% bị trừ điểm vì dư địa còn ít và dễ điều chỉnh về trung bình.</p>

      <h2>Kịch bản thị trường</h2>
      <p>Hệ thống tự nhận diện các nhịp hồi và nhịp giảm của VN-Index (đảo chiều từ 6% trở lên) trong khoảng 2 năm, đo xem mỗi mã và mỗi ngành tăng/giảm hơn chỉ số bao nhiêu trong 10 phiên đầu của các nhịp đó, cùng độ nhạy khi thị trường tăng/giảm (up/down-capture 250 phiên). Kết hợp với tín hiệu kỹ thuật hiện tại để chọn ra mã có khả năng đi trước trong từng kịch bản, kèm mốc chỉ số xác nhận kịch bản.</p>

      <h2>Sức khỏe thị trường</h2>
      <p>Điểm 0–100 của VN-Index tổng hợp: vị trí so với MA20/50/200, cấu trúc sóng, <b>độ rộng</b> (bao nhiêu % cổ phiếu HOSE trên MA50, MA200), số <b>ngày phân phối</b> trong 25 phiên (phiên chỉ số giảm ≥ 0,2% với khối lượng cao hơn phiên trước — cách đếm của William O’Neil), động lượng RSI/MACD, thanh khoản so với trung bình, số mã lập đỉnh/đáy 52 tuần. Giai đoạn: ≥70 xu hướng tăng xác nhận · 57–70 xu hướng tăng (hoặc chịu áp lực nếu ≥ 5 ngày phân phối) · 44–57 đi ngang · 30–44 điều chỉnh · dưới 30 xu hướng giảm.</p>
      <h3>Ngành</h3>
      <p>Điểm ngành = 35% RS trung vị các mã + 25% tỷ lệ mã trên MA50 + 25% hiệu suất 20 phiên + 15% dòng tiền (giá trị giao dịch hôm nay so với trung bình 20 phiên). “Mã dẫn dắt” là các mã có điểm trung hạn cao nhất, ưu tiên thanh khoản lớn.</p>

      <h2>Dữ liệu & tần suất</h2>
      <ul>
        <li>Bảng giá, lịch sử giá đã điều chỉnh (chia cổ tức, phát hành), ngành, nến trong phiên: KBS. Chỉ số realtime: VPS. Khối ngoại theo ngày: VNDirect. Chỉ số cơ bản: Simplize.</li>
        <li>Trong giờ giao dịch (9:00–11:30, 13:00–15:00), bảng giá tự làm mới mỗi 15 giây và toàn bộ điểm số được tính lại. Ngoài giờ, làm mới mỗi 5 phút.</li>
        <li>Lịch sử giá được lưu trong trình duyệt của bạn; lần đầu mở mất khoảng một phút để tải ~400 mã, các lần sau chỉ tải phần mới. Khi có điều chỉnh giá do cổ tức/chia tách, hệ thống tự phát hiện và tải lại mã đó.</li>
        <li>Thanh khoản trong phiên được quy đổi theo thời gian đã trôi qua để so sánh công bằng với trung bình cả phiên.</li>
      </ul>
      <h2>Giới hạn cần biết</h2>
      <ul>
        <li>Đây là công cụ tổng hợp thông tin, không phải khuyến nghị mua bán. Phân tích kỹ thuật cho xác suất, không cho chắc chắn; tin tức bất ngờ có thể vô hiệu mọi tín hiệu.</li>
        <li>Mô hình giá được nhận diện bằng quy tắc hình học trên các đỉnh/đáy — có thể khác cách bạn vẽ bằng mắt.</li>
        <li>Dữ liệu lấy từ API công khai của các công ty chứng khoán; khi một nguồn thay đổi hoặc gián đoạn, trang sẽ báo lỗi ở đầu trang.</li>
      </ul>
      <p class="faint" style="margin-top:20px;font-size:.8rem">Biểu đồ dùng TradingView Lightweight Charts™ — Copyright © 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noopener">tradingview.com</a></p>
    </article>
    <aside><div class="glass panel" style="position:sticky;top:96px"><h3 style="font-weight:800;margin-bottom:8px">Đọc nhanh một mã</h3>
      <ol class="dim" style="padding-left:18px;display:grid;gap:8px;font-size:.88rem">
        <li>Xem điểm sức khỏe thị trường trước: thị trường yếu thì tín hiệu mua của từng mã kém tin cậy hơn.</li>
        <li>Chọn khung thời gian phù hợp với bạn ở trang Cơ hội.</li>
        <li>Mở mã, đọc 5 lý do lớn nhất của từng khung — chú ý lý do trừ điểm.</li>
        <li>Đối chiếu “Vùng giá đáng chú ý”: giá đang sát kháng cự hay vừa bật từ hỗ trợ?</li>
        <li>Lưu nhận định để sau này kiểm chứng.</li>
      </ol></div></aside></div>`;
  },
};
