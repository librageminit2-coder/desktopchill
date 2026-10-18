// Gắn mã phiên bản (theo nội dung) vào mọi đường dẫn import để trình duyệt/Cloudflare không dùng file JS cũ sau khi cập nhật.
// Chạy trước mỗi lần đưa lên web:  node trading/tools/stamp.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RE = /((?:from\s+|import\s*\(\s*|new URL\(\s*)(['"]))(\.{1,2}\/[^'"?]+\.js)(?:\?v=[a-z0-9]+)?\2/g;
const memo = new Map();

function stamp(file, stack = []) {
  if (memo.has(file)) return memo.get(file);
  if (stack.includes(file)) return 'cycle';
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(RE, (m, pre, q, rel) => {
    const dep = path.resolve(path.dirname(file), rel);
    if (!fs.existsSync(dep)) return m;
    const h = stamp(dep, [...stack, file]);
    return `${pre}${rel}?v=${h}${q}`;
  });
  fs.writeFileSync(file, src);
  const h = crypto.createHash('sha1').update(src).digest('hex').slice(0, 8);
  memo.set(file, h);
  return h;
}

const appHash = stamp(path.join(ROOT, 'js/app.js'));
// các module chỉ được nạp động hoặc qua worker cũng phải được đóng dấu
for (const f of fs.readdirSync(path.join(ROOT, 'js'), { recursive: true })) if (String(f).endsWith('.js')) stamp(path.join(ROOT, 'js', String(f)));
const cssHash = crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'css/trading.css'))).digest('hex').slice(0, 8);
const idx = path.join(ROOT, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace(/js\/app\.js(\?v=[a-z0-9]+)?/, `js/app.js?v=${appHash}`).replace(/css\/trading\.css(\?v=[a-z0-9]+)?/, `css/trading.css?v=${cssHash}`);
fs.writeFileSync(idx, html);
console.log('app', appHash, 'css', cssHash, 'modules', memo.size);
