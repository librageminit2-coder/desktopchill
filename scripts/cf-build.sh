#!/bin/sh
# Tuỳ chọn: đặt lệnh build của Cloudflare Pages là "bash scripts/cf-build.sh" (thư mục xuất: /) để bỏ hẳn tệp nội bộ.
# Hiện tại _redirects đã chặn các đường dẫn này nên chưa bắt buộc.
# Bỏ các tệp nội bộ khỏi bản đăng công khai (SQL máy chủ, ghi chú, công cụ, tệp gốc).
set -e
rm -rf files learn/setup trading/setup trading/test trading/tools reference Library feedback
rm -f README.md HUONG-DAN-DEPLOY.md .gitignore
rm -rf scripts
echo "desktopchill: internal files removed from the public build"
