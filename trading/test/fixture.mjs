// Dữ liệu giả lập để kiểm thử offline (danh sách mã + ngành là thật, giá là mô phỏng).
export const SEC_NAMES = {1:"Bán buôn",2:"Bảo hiểm",3:"Bất động sản",5:"Chứng khoán",6:"Công nghệ và thông tin",7:"Bán lẻ",8:"Chăm sóc sức khỏe",10:"Khai khoáng",11:"Ngân hàng",12:"Nông - Lâm - Ngư",15:"SX Thiết bị, máy móc",16:"SX Hàng gia dụng",17:"Sản phẩm cao su",18:"SX Nhựa - Hóa chất",19:"Thực phẩm - Đồ uống",20:"Chế biến Thủy sản",21:"Vật liệu xây dựng",22:"Tiện ích",23:"Vận tải - kho bãi",24:"Xây dựng",25:"Dịch vụ lưu trú, ăn uống, giải trí",26:"SX Phụ trợ",27:"Thiết bị điện",28:"Dịch vụ tư vấn, hỗ trợ",29:"Tài chính khác"};
const G = {
1:"DGW GEL HHS HMC HTL JVC NO1 PET PIT PLX PMG SMA SMC ST8 TDG TLH TNI TSC VFG VID VMD VPG VVS",
7:"CCI COM CTF DMX FRT HAX MWG PNJ SVC", 2:"BIC BMI BVH MIG",
3:"AGG BCE BCM CCL CDC CIG CKG CRE D2D DIG DTA DXG DXS EVG FIR HAR HDC HDG HPX HQC HU1 IJC ITC KBC KDH KHG KOS LDG LGL LHG NBB NHA NLG NTC NTL NVL PDR PTL QCG SCR SGR SJS SZC SZL TAL TCH TDC TDH TIP TN1 VHM VIC VPH VPI VRC VRE",
8:"DBD DBT DCL DHG DMC FIT IMP OPC TNH TRA VDP", 20:"AAM ABT ACL ANV ASM CMX FMC IDI VHC",
5:"AGR APG BSI CTS DSC DSE FTS HCM LPS ORS SSI TCI TCX TVB TVS VCI VCK VDS VIX VND VPX",
6:"CMG CTR ELC FPT ICT ITD SGT", 25:"DAH DSN NVT VNG VPL", 28:"TV2", 10:"BMC C32 DHA DHM KSB MDG NNC PVD TNT",
11:"ACB BID BVB CTG EIB EVF HDB KLB LPB MBB MSB NAB OCB SHB SSB STB TCB TPB VAB VBB VCB VIB VPB",
12:"AAN HAG HPA HSL SSC", 17:"BRC CSM DRC SRC", 16:"AAT ADS EVE GDT GIL HTG KMR MSH NAV RYG SAV SHA STK SVD TCM TTF TVT",
18:"AAA ABS ADP APH BFC BMP CSV DCM DGC DPM DPR ECO GVR HCD HII HRC LIX PHR PLP SFG TDP TNC TPC TRC VPS",
26:"ACG BKG BSR DHC DLG HAP HHP MCP MZG NHT PTB SBV SHI SVT TLD TLG TMT", 15:"NHH SBG", 29:"OGC",
27:"DQC GEE GEX PAC RAL SAM TYA VTB",
19:"AFX ANT BAF BHN DBC KDC LAF LSS MCH MCM MSN NAF PAN SAB SBT SMB VCF VNM",
22:"ASP BTP BWE CHP CNG DRL GAS GEG GHC HID KHP NT2 PGC PGD PGV POW PPC S4A SBA SHP SIP SJD TBC TDM TMP TTA VPD VSH",
23:"ASG AST CLL DVP GMD GSP HAH HTV HVN ILB MHC NCT PDN PDV PJT PVP PVT QNP SCS SGN SKG TCL TCO TCT TMS VIP VJC VNL VNS VOS VSC VTO VTP",
21:"ACC CRC DTL DXV FCM GMH HPG HSG HT1 LBM NKG TCR TEG THG VCA VGC YBM",
24:"C47 CCC CII CTD CTI DC4 DPG FCN HAS HHV HTI HTN HUB HVH L10 LCG LM8 PC1 PHC PTC REE SRF TSA VCG",
};
export const SEC_OF = {}; for (const [k, s] of Object.entries(G)) for (const x of s.split(' ')) SEC_OF[x] = +k;
export const SYMS = Object.keys(SEC_OF).sort();
const PX = {FPT:58200,HPG:20900,VCB:56900,SSI:19450,MWG:73900,VHM:61000,VIC:215000,DGC:32800,GEX:22500,PNJ:18800,KBC:25900,VND:13250,REE:44950,TCB:33200,MBB:19850,CTG:30600,STB:62800,GAS:76100,VNM:57800,MSN:71400};

export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// Sinh chuỗi nến ngày theo các pha (tăng/giảm/đi ngang) — kết thúc tại ngày 2026-10-16
export function genBars(sym, n = 520, end = Date.UTC(2026, 9, 16) / 1000) {
  const r = rng(hash(sym)); const days = [];
  let t = end; while (days.length < n) { const d = new Date(t * 1000).getUTCDay(); if (d !== 0 && d !== 6) days.unshift(t); t -= 86400; }
  const endP = PX[sym] || Math.round((5 + r() * 90) * 1000);
  let p = 100, drift = 0, phaseLeft = 0; const vol0 = 2e5 + r() * 6e6; const sig = 0.012 + r() * 0.018;
  const raw = [];
  for (let i = 0; i < n; i++) {
    if (phaseLeft-- <= 0) { drift = (r() - 0.45) * 0.006; phaseLeft = 20 + Math.floor(r() * 70); }
    const ret = drift + sig * (r() + r() + r() - 1.5) * 1.4;
    const o = p * (1 + (r() - 0.5) * sig * 0.5); p = Math.max(1, p * (1 + ret));
    const h = Math.max(o, p) * (1 + r() * sig * 0.8), l = Math.min(o, p) * (1 - r() * sig * 0.8);
    const v = vol0 * (0.5 + r()) * (1 + Math.abs(ret) * 25) * (ret > 0 ? 1.1 : 0.95);
    raw.push({ o, h, l, c: p, v });
  }
  const k = endP / raw[n - 1].c; const tick = endP >= 50000 ? 100 : endP >= 10000 ? 50 : 10;
  const q = (x) => Math.max(tick, Math.round((x * k) / tick) * tick);
  return raw.map((b, i) => { const o = q(b.o), c = q(b.c), h = Math.max(q(b.h), o, c), l = Math.min(q(b.l), o, c); const v = Math.round(b.v / 100) * 100; return { t: days[i], o, h, l, c, v, va: v * (o + c) / 2 }; });
}
export function genIndex(n = 520) {
  const b = genBars('VNINDEX#', n); const k = 1705.91 / b[n - 1].c;
  return b.map((x) => ({ ...x, o: x.o * k, h: x.h * k, l: x.l * k, c: x.c * k, v: x.v * 120, va: x.va * 120 }));
}
