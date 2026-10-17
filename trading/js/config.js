// Cấu hình chung — Supabase dùng chung dự án với /admin và /learn.
export const SB_URL = 'https://phcmbgaozkaibqsttonc.supabase.co';
export const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY21iZ2FvemthaWJxc3R0b25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzODk3NTgsImV4cCI6MjEwNDk2NTc1OH0.Hvs0Gxebog5gcKILnSdT3g6nz6-GI0CEepmMJM0gCxo';
// Email nhận thông báo khi có người đăng ký (gửi qua FormSubmit — lần đầu cần bấm kích hoạt trong email)
export const ADMIN_EMAIL = 'librageminit2@gmail.com';
export const NOTIFY_URL = 'https://formsubmit.co/ajax/' + ADMIN_EMAIL;
export const SITE_URL = 'https://desktopchill.com/trading/';
// Nhịp cập nhật (ms)
export const POLL_LIVE = 15000;      // trong giờ giao dịch
export const POLL_IDLE = 5 * 60000;  // ngoài giờ
export const HISTORY_DAYS = 860;     // ~2,3 năm lịch sử ngày (đủ MA200 + 1 năm khung tuần)
export const FUND_TTL = 3 * 86400000;
