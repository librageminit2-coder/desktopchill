# desktopchill 🖥️

Website giới thiệu dịch vụ **cài đặt & customize hình nền động (live wallpaper)** cho máy tính.
Khách xem các mẫu shop đã làm rồi liên hệ **Zalo** / **TikTok** để được cài.

> Web tĩnh, miễn phí 100%, không cần server, không cần đăng nhập. Chạy tốt trên **GitHub Pages**.

---

## 📁 Có gì trong thư mục này

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Trang web chính |
| `assets/css/style.css` | Giao diện (màu, bố cục) |
| `assets/js/app.js` | Xử lý hiển thị, lọc, lightbox, đổi ngôn ngữ/theme |
| `assets/js/i18n.js` | **Câu chữ VI/EN + thông tin liên hệ** (Zalo, TikTok) |
| `data/wallpapers.json` | **Danh sách hình nền** (tên, danh mục) |
| `media/preview/` | Clip preview nhẹ (chạy trên web) |
| `media/poster/` | Ảnh tĩnh của mỗi mẫu |
| `scripts/build-media.mjs` | Script tự tạo preview + poster từ video gốc |
| Các file `1.mp4`, `2.mp4`… | **Video GỐC** — giữ ở máy, KHÔNG đăng lên web |

---

## ▶️ Xem thử web ở máy

Mở terminal ngay trong thư mục này rồi chạy:

```bash
python -m http.server 8080
```

Sau đó mở trình duyệt vào địa chỉ: **http://localhost:8080**
(Nhấn `Ctrl + C` trong terminal để tắt.)

> Phải xem qua địa chỉ `http://localhost` như trên, **không** mở trực tiếp file `index.html` (mở trực tiếp sẽ không tải được danh sách hình).

---

## ➕ Thêm mẫu hình nền mới (quan trọng nhất)

Mỗi khi bạn custom được mẫu mới:

1. Chép video mới vào **thư mục gốc** này, đặt tên bằng **số tiếp theo**.
   Ví dụ đang có tới `33.mp4` thì mẫu mới đặt tên `34.mp4`.
2. Chạy lệnh:
   ```bash
   node scripts/build-media.mjs
   ```
   Script sẽ tự nén preview + tạo ảnh poster + thêm mẫu mới vào danh sách.
3. Xong! Mở lại web để xem. Muốn đặt tên/đổi danh mục đẹp hơn thì xem mục dưới.

> Cần cài **ffmpeg** một lần (miễn phí). Nếu chưa có, chạy: `winget install Gyan.FFmpeg`
> rồi **mở lại terminal** và chạy lại lệnh trên. Script tự tìm ffmpeg, bạn không cần chỉnh gì thêm.

---

## ✏️ Sửa tên / danh mục của mẫu

Mở file `data/wallpapers.json`. Mỗi mẫu là một khối như sau:

```json
{
  "id": "34",
  "source": "34.mp4",
  "title": { "vi": "Tên tiếng Việt", "en": "English name" },
  "category": "anime",
  "poster": "media/poster/34.jpg",
  "preview": "media/preview/34.mp4",
  "w": 1920,
  "h": 1080
}
```

- Sửa `title.vi` / `title.en` để đổi tên hiển thị.
- Sửa `category` thành 1 trong: `anime`, `girl`, `phongcanh`, `thucung`, `truutuong`, `game`, `khac`.

> Chạy lại `node scripts/build-media.mjs` **không** làm mất tên/danh mục bạn đã sửa — nó giữ nguyên.

---

## 📞 Đổi thông tin liên hệ (Zalo / TikTok)

Mở `assets/js/i18n.js`, tìm gần cuối file khối `CONTACT` và sửa:

```js
export const CONTACT = {
  zaloPhone: '0339903166',
  zaloUrl: 'https://zalo.me/0339903166',
  tiktokHandle: '@desktopchill',
  tiktokUrl: 'https://www.tiktok.com/@desktopchill',
};
```

---

## 🚀 Đưa web lên mạng bằng GitHub Pages (miễn phí)

Làm **một lần** để có địa chỉ web công khai. Xem hướng dẫn từng bước ở file
**[HUONG-DAN-DEPLOY.md](HUONG-DAN-DEPLOY.md)**.

Tóm tắt: tạo repo tên `desktopchill` trên GitHub → đẩy code lên → bật **Settings → Pages** →
web sẽ chạy tại `https://<tên-github-của-bạn>.github.io/desktopchill`.

Sau này mỗi lần thêm mẫu mới, chỉ cần đẩy code lên lại là web tự cập nhật.
