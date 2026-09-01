#!/usr/bin/env node
/**
 * build-media.mjs — Tạo preview (clip nhẹ) + poster (ảnh tĩnh) cho mỗi video,
 * rồi cập nhật danh sách data/wallpapers.json.
 *
 * Cách dùng:  node scripts/build-media.mjs
 *
 * - Quét các file video ở thư mục gốc có tên dạng số: 1.mp4, 2.mp4, ... 29.MOV
 * - Với mỗi video tạo:  media/preview/<id>.mp4  (loop nhẹ, không tiếng)
 *                        media/poster/<id>.jpg   (ảnh xem trước)
 * - Giữ nguyên tiêu đề/danh mục bạn đã chỉnh trong wallpapers.json (không ghi đè).
 * - Video mới sẽ được thêm vào cuối danh sách với danh mục mặc định "khac".
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tìm ffmpeg/ffprobe: ưu tiên PATH, nếu không có thì dò thư mục winget đã cài
function resolveBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  // 1) đã có trên PATH?
  try { execFileSync(exe, ['-version'], { stdio: 'ignore' }); return exe; } catch {}
  // 2) dò trong thư mục winget (Gyan.FFmpeg)
  const base = join(homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const dir of readdirSync(base)) {
      if (!dir.toLowerCase().includes('ffmpeg')) continue;
      const root = join(base, dir);
      for (const build of readdirSync(root)) {
        const cand = join(root, build, 'bin', exe);
        if (existsSync(cand)) return cand;
      }
    }
  } catch {}
  return exe; // để lỗi rõ ràng ở bước kiểm tra bên dưới
}

const FFMPEG = resolveBinary('ffmpeg');
const FFPROBE = resolveBinary('ffprobe');
const ROOT = resolve(__dirname, '..');
const PREVIEW_DIR = join(ROOT, 'media', 'preview');
const POSTER_DIR = join(ROOT, 'media', 'poster');
const DATA_FILE = join(ROOT, 'data', 'wallpapers.json');

const PREVIEW_SECONDS = 8;   // độ dài clip preview
const PREVIEW_HEIGHT = 720;  // chiều cao preview (giữ nguyên tỉ lệ)

for (const d of [PREVIEW_DIR, POSTER_DIR, join(ROOT, 'data')]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

// Kiểm tra ffmpeg/ffprobe
try {
  run(FFMPEG, ['-version']);
  run(FFPROBE, ['-version']);
} catch {
  console.error('\n❌ Không tìm thấy ffmpeg/ffprobe. Hãy cài ffmpeg rồi chạy lại.');
  console.error('   Windows:  winget install Gyan.FFmpeg');
  console.error('   (Sau khi cài, mở lại cửa sổ terminal rồi chạy lại lệnh này.)\n');
  process.exit(1);
}

function probeSize(file) {
  try {
    const out = run(FFPROBE, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x', file,
    ]).trim();
    const [w, h] = out.split('x').map(Number);
    if (w && h) return { w, h };
  } catch {}
  return { w: 1920, h: 1080 };
}

// Tìm các video ở thư mục gốc: tên là số, đuôi mp4/mov
const videos = readdirSync(ROOT)
  .map((name) => {
    const m = name.match(/^(\d+)\.(mp4|mov)$/i);
    return m ? { name, num: parseInt(m[1], 10) } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.num - b.num);

if (videos.length === 0) {
  console.error('❌ Không tìm thấy video nào (vd: 1.mp4) ở thư mục gốc.');
  process.exit(1);
}

// Đọc danh sách cũ để giữ lại tiêu đề/danh mục đã chỉnh
let existing = [];
if (existsSync(DATA_FILE)) {
  try { existing = JSON.parse(readFileSync(DATA_FILE, 'utf8')).wallpapers || []; } catch {}
}
const byId = new Map(existing.map((w) => [w.id, w]));

const result = [];
let idx = 0;
for (const { name, num } of videos) {
  idx++;
  const id = String(num).padStart(2, '0');
  const input = join(ROOT, name);
  const previewOut = join(PREVIEW_DIR, `${id}.mp4`);
  const posterOut = join(POSTER_DIR, `${id}.jpg`);

  process.stdout.write(`[${idx}/${videos.length}] ${name} → id ${id} ... `);

  const { w, h } = probeSize(input);

  // Poster: lấy 1 khung hình ở giây thứ 1
  run(FFMPEG, ['-y', '-ss', '1', '-i', input, '-frames:v', '1',
    '-vf', `scale=-2:${PREVIEW_HEIGHT}`, '-q:v', '3', posterOut]);

  // Preview: clip ngắn, không tiếng, nén gọn
  run(FFMPEG, ['-y', '-i', input, '-t', String(PREVIEW_SECONDS), '-an',
    '-vf', `scale=-2:${PREVIEW_HEIGHT}`,
    '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', previewOut]);

  const prev = byId.get(id);
  result.push({
    id,
    source: name,
    title: prev?.title || { vi: `Mẫu ${id}`, en: `Design ${id}` },
    category: prev?.category || 'khac',
    poster: `media/poster/${id}.jpg`,
    preview: `media/preview/${id}.mp4`,
    w, h,
  });
  console.log('xong');
}

writeFileSync(DATA_FILE, JSON.stringify({ wallpapers: result }, null, 2) + '\n', 'utf8');
console.log(`\n✅ Hoàn tất ${result.length} mẫu → data/wallpapers.json`);
