# desktopchill.com/trading — cài đặt lần đầu

Trang chạy hoàn toàn trên GitHub Pages (web tĩnh). Dữ liệu chứng khoán do trình duyệt của người dùng tự lấy từ KBS, VNDirect, VPS và Simplize. Supabase (dùng chung dự án với /admin và /learn) chỉ lưu tài khoản và nhận định.

## 1. Tạo bảng tài khoản trên Supabase (một lần)

1. Mở https://supabase.com/dashboard → chọn dự án đang dùng cho desktopchill → **SQL Editor** → **New query**.
2. Mở file `trading/setup/trading_setup.sql`, chép toàn bộ, dán vào rồi bấm **Run**.
3. Tạo tài khoản quản trị: chạy riêng câu lệnh sau (thay mật khẩu của bạn, ít nhất 8 ký tự):

```sql
select public.trading_make_admin('librageminit2@gmail.com', 'Tuấn', 'MAT-KHAU-CUA-BAN');
```

Muốn đổi mật khẩu quản trị sau này: chạy lại đúng câu lệnh trên với mật khẩu mới.

## 2. Đưa lên web

Thư mục `trading/` nằm trong repo `desktopchill`. Commit và push như bình thường (GitHub Desktop → Commit to main → Push origin). Khoảng 1 phút sau trang chạy tại https://desktopchill.com/trading/

## 3. Email báo có người đăng ký

Khi có người đăng ký, trang gửi email tới librageminit2@gmail.com qua dịch vụ miễn phí FormSubmit.
- **Lần đầu tiên** FormSubmit gửi một email “Activate Form” — bấm **Activate** một lần là xong. Các lần sau email báo đăng ký tới thẳng hộp thư.
- Dù email có bị trễ, mọi yêu cầu luôn hiện ở mục **Duyệt** trên thanh điều hướng (chỉ tài khoản quản trị thấy).

## 4. Duyệt người dùng

Đăng nhập bằng tài khoản quản trị → **Duyệt** → bấm **Duyệt** / **Từ chối** / **Khóa**. Người được duyệt đăng nhập được ngay; khóa hoặc từ chối sẽ đăng xuất họ khỏi mọi thiết bị.

## Ghi chú kỹ thuật

- Mã nguồn: `trading/js/engine` (phân tích, chạy trong Web Worker), `trading/js/data` (nguồn dữ liệu + bộ nhớ đệm IndexedDB), `trading/js/views` (các trang).
- Kiểm thử bộ phân tích: `node trading/test/engine.test.mjs`.
- Mật khẩu được băm bcrypt trong Postgres; phiên đăng nhập là token ngẫu nhiên 30 ngày (chỉ lưu bản băm SHA-256).
- Vì repo công khai, mã phân tích ai cũng đọc được; đăng nhập bảo vệ trải nghiệm và dữ liệu nhận định riêng của từng người.
