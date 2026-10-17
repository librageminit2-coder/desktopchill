// Bộ nhớ đệm IndexedDB — lịch sử giá, chỉ số cơ bản, danh mục. Lỗi IDB (ẩn danh, bị chặn) thì chạy không cache.
const DB = 'dct-trading', VER = 1;
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open(DB, VER);
      rq.onupgradeneeded = () => { const d = rq.result; for (const s of ['bars', 'fund', 'meta']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
export async function get(store, key) {
  const d = await open(); if (!d) return undefined;
  return new Promise((res) => { try { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } });
}
export async function getAll(store) {
  const d = await open(); if (!d) return {};
  return new Promise((res) => {
    try {
      const out = {}; const tx = d.transaction(store); const st = tx.objectStore(store);
      const rq = st.openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; rq.onerror = () => res(out);
    } catch (e) { res({}); }
  });
}
export async function put(store, key, val) {
  const d = await open(); if (!d) return;
  return new Promise((res) => { try { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch (e) { res(); } });
}
export async function clearAll() {
  const d = await open(); if (!d) return;
  for (const s of ['bars', 'fund', 'meta']) await new Promise((res) => { try { const tx = d.transaction(s, 'readwrite'); tx.objectStore(s).clear(); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch (e) { res(); } });
}
