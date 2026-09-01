# 🚀 Hướng dẫn đưa web lên mạng (GitHub Pages) — MIỄN PHÍ

Làm **một lần duy nhất**. Sau này chỉ cần "đẩy code lên lại" là web tự cập nhật.
Bạn sẽ có địa chỉ web dạng: `https://<tên-github>.github.io/desktopchill`

Có 2 cách. **Cách A (GitHub Desktop)** dễ nhất cho người mới — làm theo cách này.

---

## ✅ CÁCH A — Dùng GitHub Desktop (khuyên dùng)

### Bước 1 — Mở GitHub Desktop, đăng nhập
- Mở app **GitHub Desktop** (bạn đã cài sẵn). Đăng nhập tài khoản GitHub của bạn.

### Bước 2 — Thêm thư mục dự án vào GitHub Desktop
- Menu **File → Add local repository…**
- Bấm **Choose…** rồi chọn thư mục:
  `D:\15. Claude\2. Project\13. Desktopchill`
- Bấm **Add repository**.
  *(Dự án đã được tạo sẵn git + commit đầu tiên nên nó sẽ nhận ngay.)*

### Bước 3 — Đăng lên GitHub (Publish)
- Bấm nút **Publish repository** (góc trên bên phải).
- Name: **desktopchill**
- ⚠️ **BỎ TICK** ô **"Keep this code private"** → phải là **public** thì Pages miễn phí mới chạy.
- Bấm **Publish repository**.

### Bước 4 — Bật GitHub Pages
- Mở trình duyệt vào: `https://github.com/<tên-github>/desktopchill`
- Vào tab **Settings** (Cài đặt) → cột trái chọn **Pages**.
- Mục **Build and deployment → Source**: chọn **Deploy from a branch**.
- **Branch**: chọn **main**, thư mục để **/ (root)**, bấm **Save**.

### Bước 5 — Chờ ~1 phút và mở web
- Tải lại trang Settings → Pages. Khi hiện dòng
  **"Your site is live at https://<tên-github>.github.io/desktopchill"** là xong 🎉
- Bấm vào link đó để xem web thật của bạn. Gửi link này cho khách!

### 🔁 Sau này khi thêm mẫu mới
1. Thêm video + chạy `node scripts/build-media.mjs` (xem README).
2. Mở **GitHub Desktop** → nó hiện các thay đổi → ghi vài chữ ở ô **Summary** →
   bấm **Commit to main** → rồi bấm **Push origin**.
3. Chờ ~1 phút, web tự cập nhật. Xong!

---

## 💻 CÁCH B — Dùng dòng lệnh (nếu bạn thích terminal)

Tạo repo tên `desktopchill` trên github.com trước (để **Public**, không thêm README).
Rồi trong thư mục dự án chạy (thay `<tên-github>`):

```bash
git remote add origin https://github.com/<tên-github>/desktopchill.git
git push -u origin main
```

Sau đó làm **Bước 4 + 5** ở Cách A để bật Pages.

Lần sau cập nhật:
```bash
git add -A
git commit -m "Thêm mẫu mới"
git push
```

---

## ❓ Vài lưu ý
- Repo phải để **Public** thì GitHub Pages mới miễn phí (người khác chỉ xem được web, không sửa được).
- Video **gốc nặng không** được đẩy lên (đã thiết lập sẵn) — chúng ở lại máy bạn để giao khách.
- Muốn dùng tên miền riêng (vd `desktopchill.com`) thì mua tên miền rồi trỏ về Pages — nhắn shop/Claude hỗ trợ sau.
