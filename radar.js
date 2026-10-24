
const EV = DATA.ev;
let mode = "s", selected = null;
let S = 0, dots = [], visible = new Set();
const PAGE_SIZE = 8;
const pages = {Tinggi:1, Sedang:1, Rendah:1};
const LV = ["Tinggi","Sedang","Rendah"];
const lvOf = v => v > 70 ? "Tinggi" : v > 50 ? "Sedang" : "Rendah";
const pct = x => x == null ? "–" : (x * 100).toFixed(0) + "%";
const num = x => x == null ? "–" : Math.round(x).toString();
const $ = id => document.getElementById(id);
/* ---------- Tindak lanjut: penyimpanan ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const TL = {verif:{label:"Verifikasi data", hari:7}, klar:{label:"Klarifikasi ke pemberi kerja", hari:14}, periksa:{label:"Pemeriksaan lapangan", hari:30}, aman:{label:"Tidak ada masalah", hari:0}};
const MOD_STEP = {PDUK:"Cocokkan jumlah pekerja terdaftar dengan data pembanding (pajak, izin usaha)", Upah:"Bandingkan upah dilaporkan dengan UMK dan data penghasilan", Misklasifikasi:"Telusuri pekerja aktif yang tercatat PBPU/PBI", Mutasi:"Periksa tanggal masuk/keluar pekerja dan tanggal input", Tunggakan:"Cek riwayat pembayaran iuran 12 bulan"};
const MOD_DOC = {PDUK:"daftar seluruh pekerja", Upah:"bukti pembayaran upah", Misklasifikasi:"status hubungan kerja pekerja", Mutasi:"data mutasi masuk/keluar", Tunggakan:"bukti setor iuran"};
function genSteps(jenis, md){
  const m = md.filter(x => MOD_STEP[x]);
  if (jenis === "verif") return ["Tinjau ulang data kepesertaan, upah, dan mutasi di sistem", ...m.map(x => MOD_STEP[x]), "Simpulkan: lanjut klarifikasi atau tidak ada masalah"];
  if (jenis === "klar") return ["Kirim permintaan klarifikasi tertulis ke pemberi kerja", "Terima dokumen: " + (m.map(x => MOD_DOC[x]).join(", ") || "data pekerja dan upah"), "Cocokkan dokumen dengan temuan RADAR", "Susun berita acara klarifikasi", "Tetapkan hasil: koreksi data atau pemeriksaan lapangan"];
  if (jenis === "periksa") return ["Jadwalkan kunjungan, koordinasi dengan pengawas ketenagakerjaan bila perlu", ...m.map(x => MOD_STEP[x]), "Susun berita acara pemeriksaan", "Pantau koreksi data dan pembayaran iuran"];
  return ["Catat alasan tidak ada masalah sebagai umpan balik model"];
}
const STEP_LBL = {belum:"Belum", jalan:"Berjalan", selesai:"Selesai", kendala:"Kendala"};
function planStatus(p){ const s = p.steps.map(x => x.s); if (s.every(x => x === "selesai")) return "Selesai"; if (s.includes("kendala")) return "Kendala"; if (s.some(x => x !== "belum")) return "Berjalan"; return "Rencana"; }
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const fmtDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {day:"numeric", month:"short", year:"numeric"});
const store = {mode:"local", plans:{}, db:null, uid:null, user:null, dl:null, names:{}, chains:{}};
try { store.plans = JSON.parse(localStorage.getItem("radar-tl") || "{}") || {}; } catch (e) { store.plans = {}; }
function saveLocal(){ try { localStorage.setItem("radar-tl", JSON.stringify(store.plans)); } catch (e) {} }
const me = () => store.uid || "saya";
function who(id){ if (!id || id === "saya") return "Saya"; if (id === store.uid) return (store.names[id] ? store.names[id] + " (saya)" : "Saya"); return store.names[id] || "Petugas"; }
function toast(msg){ const el = $("toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2600); }
function planOf(bu){ return Object.values(store.plans).find(p => p.bu === bu); }
function savePlan(p){
  p = JSON.parse(JSON.stringify(p)); store.plans[p.id] = p; refreshAll();
  if (store.mode !== "db") { saveLocal(); return; }
  const prev = store.chains[p.id] || Promise.resolve();
  store.chains[p.id] = prev.then(() => store.db.doc("tl/" + p.id).set(store.plans[p.id] || p)).catch(e => toast("Gagal menyimpan: " + (e && e.code || "coba lagi")));
}
function deletePlan(id){
  delete store.plans[id]; refreshAll();
  if (store.mode !== "db") { saveLocal(); return; }
  store.db.doc("tl/" + id).delete().catch(() => toast("Gagal menghapus, coba lagi"));
}
function logAdd(p, txt, kind){ p.log = p.log || []; p.log.push({ts: new Date().toISOString(), by: me(), txt, kind: kind || ""}); }
const kabs = [...new Set(DATA.rows.map(r => r.kab))].sort();
kabs.forEach(k => { const o = document.createElement("option"); o.textContent = k; $("fKab")?.appendChild(o); });


function rows(){
  const kab = $("fKab").value, md = $("fMd").value, q = $("fQ").value.trim().toUpperCase();
  return DATA.rows.map(r => ({...r, sc: r[mode], L: lvOf(r[mode])}))
    .sort((a, b) => b.sc - a.sc).map((r, i) => ({...r, rank: i + 1}))
    .filter(r => (!kab || r.kab === kab) && (!md || r.md.includes(md)) && (!q || r.id.includes(q) || r.nm.toUpperCase().includes(q)));
}
function companyTlComplete(id){
  const plans = Object.values(store.plans).filter(p => p.bu === id);
  return plans.length > 0 && plans.every(p => planStatus(p) === "Selesai");
}
let completedProgressPage = 1, completedProgressFilter = "";
function renderProgress(filteredRows){
  if (!$("progressTotal")) return;
  const today = new Date();
  $("progressToday").textContent = today.toLocaleDateString("id-ID", {day:"numeric", month:"long", year:"numeric", timeZone:"Asia/Jakarta"});
  $("progressToday").dateTime = new Intl.DateTimeFormat("en-CA", {year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Jakarta"}).format(today);
  const filterKey = [mode, $("fKab").value, $("fMd").value, $("fQ").value].join("|");
  if (filterKey !== completedProgressFilter) { completedProgressPage = 1; completedProgressFilter = filterKey; }
  const included = new Set(filteredRows.map(r => r.id)), byCompany = new Map(), priority = {Selesai:0,Rencana:1,Berjalan:2,Kendala:3};
  Object.values(store.plans).forEach(p => { if (!included.has(p.bu)) return; const status=planStatus(p), prev=byCompany.get(p.bu); if (!prev || priority[status]>priority[prev]) byCompany.set(p.bu,status); });
  $("progressTotal").textContent = byCompany.size.toLocaleString("id-ID");
  ["Rencana","Berjalan","Kendala","Selesai"].forEach(status => {
    const ids=[...byCompany].filter(([,s])=>s===status).map(([id])=>id).sort(), box=$("progressList-"+status);
    $("progressCount-"+status).textContent=ids.length.toLocaleString("id-ID");
    const totalPages = Math.max(1, Math.ceil(ids.length / 10));
    if (status === "Selesai") completedProgressPage = Math.max(1, Math.min(completedProgressPage, totalPages));
    const displayed = status === "Selesai" ? ids.slice((completedProgressPage - 1) * 10, completedProgressPage * 10) : ids;
    box.innerHTML=ids.length?displayed.map(id=>'<li><button type="button" class="progress-code" data-company="'+esc(id)+'">'+esc(id)+'</button></li>').join(''):'<li class="progress-empty">–</li>';
    box.querySelectorAll('[data-company]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.company)));
    if (status === "Selesai") {
      let pager = $("completedProgressPager");
      if (!pager) { pager = document.createElement("div"); pager.id = "completedProgressPager"; pager.className = "completed-progress-pager"; box.after(pager); }
      pager.hidden = ids.length <= 10;
      pager.innerHTML = '<button type="button" data-direction="-1" aria-label="Halaman selesai sebelumnya" '+(completedProgressPage===1?'disabled':'')+'>‹</button><span>'+completedProgressPage+'/'+totalPages+'</span><button type="button" data-direction="1" aria-label="Halaman selesai berikutnya" '+(completedProgressPage===totalPages?'disabled':'')+'>›</button>';
      pager.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { completedProgressPage += Number(button.dataset.direction); renderProgress(filteredRows); }));
    }
  });
}
function render(){
  if (!$("nAll")) return;
  const R = rows();
  renderProgress(R);
  $("nAll").textContent = R.length.toLocaleString("id-ID");
  $("profileScope").textContent = "Dari " + DATA.rows.length.toLocaleString("id-ID") + " perusahaan dalam dataset";
  $("accuracySource").textContent = "Sumber: " + (mode === "s" ? "Internal + Eksternal" : "Internal saja");
  const top = R.slice(0, 200), hasLabels = top.every(r => r.y === 0 || r.y === 1);
  $("prec").textContent = !top.length ? "–" : hasLabels ? pct(top.reduce((sum, r) => sum + r.y, 0) / top.length) : pct(EV["Presisi@200"][mode === "s" ? 1 : 0]);
  $("prec").title = !top.length ? "Tidak ada perusahaan sesuai filter" : hasLabels ? "Uji sintetis: " + top.reduce((sum, r) => sum + r.y, 0) + " dari " + top.length + " prioritas teratas sesuai filter" + (top.length < 200 ? " (tersedia kurang dari 200)" : "") : "Evaluasi seluruh dataset; tidak dihitung ulang menurut filter";
  const sectors = [...new Set(DATA.rows.map(r => r.sek))].sort();
  const counts = (values, field) => {
    const totals = values.map(value => ({value, count:R.filter(r => r[field] === value).length}));
    const max = Math.max(1, ...totals.map(x => x.count));
    return totals.map(({value, count}) => '<div class="profile-count" title="' + esc(value) + ': ' + count + ' perusahaan"><span>' + esc(value) + '</span><b>' + count.toLocaleString("id-ID") + '</b><div class="profile-bar" aria-hidden="true"><i style="width:' + (count / max * 100).toFixed(2) + '%"></i></div></div>').join('');
  };
  $("sectorCounts").innerHTML = counts(sectors, "sek");
  $("scaleCounts").innerHTML = counts(["Kecil", "Menengah", "Besar"], "sk");
  $("sectorTotal").textContent = new Set(R.map(r => r.sek)).size;
  $("scaleTotal").textContent = new Set(R.map(r => r.sk)).size;
  LV.forEach(L => {
    const g = R.filter(r => r.L === L && !companyTlComplete(r.id)), sisa = g.filter(r => !planOf(r.id)).length;
    $("sisa-" + L).textContent = sisa.toLocaleString("id-ID");
    $("sub-" + L).textContent = `sisa beban, dari ${g.length.toLocaleString("id-ID")} badan usaha`;
    const ul = $("list-" + L); ul.innerHTML = "";
    if (!g.length) ul.innerHTML = `<li class="empty">Tidak ada badan usaha di level ini untuk filter yang dipilih.</li>`;
    const totalPages = Math.max(1, Math.ceil(g.length / PAGE_SIZE));
    pages[L] = Math.max(1, Math.min(pages[L], totalPages));
    const start = (pages[L] - 1) * PAGE_SIZE;
    g.slice(start, start + PAGE_SIZE).forEach((r, i) => {
      const li = document.createElement("li"), b = document.createElement("button");
      const pl = planOf(r.id);
      b.type = "button"; b.className = "row" + (pl ? " done" : "");
      b.innerHTML = `<span class="row-num">${start + i + 1}</span><span><b>${r.id}</b> <span class="nm">${r.nm}</span><small>${r.sek} · ${r.kab}</small>${pl ? `<span class="st">${TL[pl.jenis].label} · ${planStatus(pl)}</span>` : ""}</span><span class="sc">${Math.floor(r.sc)}</span>`;
      b.addEventListener("click", () => openModal(r.id));
      li.appendChild(b); ul.appendChild(li);
    });
    $("range-" + L).textContent = g.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, g.length)} dari ${g.length}` : "0 badan usaha";
    $("page-" + L).textContent = `${pages[L]} / ${totalPages}`;
    document.querySelectorAll(`.pager button[data-lv="${L}"]`).forEach(b => { b.disabled = Number(b.dataset.step) < 0 ? pages[L] === 1 : pages[L] === totalPages; });
  });
  visible = new Set(R.map(r => r.id));
  const cntF = L => R.filter(r => r.L === L).length;
  $("lgHi").textContent = cntF("Tinggi").toLocaleString("id-ID");
  $("lgMid").textContent = cntF("Sedang").toLocaleString("id-ID");
  $("lgLo").textContent = cntF("Rendah").toLocaleString("id-ID");
  const modus = ["PDUK", "Upah", "Misklasifikasi", "Mutasi", "Tunggakan"];
  const modusIcons = {
    PDUK: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    Upah: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h1M18 15h1"/>',
    Misklasifikasi: '<path d="M3 3h7l11 11-7 7L3 10Z"/><circle cx="7" cy="7" r="1"/><path d="m12 11 4 4m0-4-4 4"/>',
    Mutasi: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
    Tunggakan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-9 3v3m0 2h.01"/>'
  };

  $("modusCounts").innerHTML = modus.map(m => '<div class="modus-count"><span class="modus-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + modusIcons[m] + '</svg>' + esc(m) + '</span><b>' + R.filter(r => r.md.includes(m)).length.toLocaleString("id-ID") + '</b></div>').join("");
  const aktif = [$("fKab").value, $("fMd").value, $("fQ").value.trim() ? "ID " + $("fQ").value.trim().toUpperCase() : ""].filter(Boolean);
  $("radNote").textContent = aktif.length ? `Menampilkan ${R.length.toLocaleString("id-ID")} dari ${DATA.rows.length.toLocaleString("id-ID")} badan usaha sesuai filter: ${aktif.join(", ")}.` : "";
  if (typeof buildDots === "function" && S) { buildDots(); if (reduce) draw(0); }
}
function openModal(id){
  const fresh = selected !== id || !$("modal").open;
  selected = id;
  const r0 = DATA.rows.find(r => r.id === id); if (!r0) return;
  const sc = r0[mode], L = lvOf(sc);
  const rank = [...DATA.rows].sort((a, b) => b[mode] - a[mode]).findIndex(r => r.id === id) + 1;
  const I = r0.ind;
  const rowsInd = [
    ["Pekerja dengan upah ≈ UMK", pct(I.umk[0]), pct(I.umk[1]), I.umk[0] != null && I.umk[0] - I.umk[1] > .25],
    ["PPU aktif ÷ pekerja di data PPh 21", pct(I.pph[0]), pct(I.pph[1]), I.pph[0] != null && I.pph[0] < .8],
    ["Pekerja aktif (data eksternal) tercatat PBPU/PBI", pct(I.mandiri[0]), pct(I.mandiri[1]), I.mandiri[0] != null && I.mandiri[0] >= .1],
    ["Jeda pendaftaran pekerja baru (hari)", num(I.jeda[0]), num(I.jeda[1]), I.jeda[0] != null && I.jeda[0] > 60],
    ["Jeda input nonaktif (hari)", num(I.backdate[0]), num(I.backdate[1]), I.backdate[0] != null && I.backdate[0] > 14],
    ["Bulan iuran tidak tepat waktu (dari 12)", num(I.telat[0]), num(I.telat[1]), I.telat[0] != null && I.telat[0] >= 4],
  ];
  $("mBody").innerHTML = `
    <div class="dhead"><div><h2 id="mTitle">${r0.id}</h2><p class="mnm">${r0.nm}</p><p>${r0.sek} · skala ${r0.sk.toLowerCase()} · ${r0.kab}<br>${r0.n} pekerja PPU aktif · peringkat ${rank} dari ${DATA.rows.length.toLocaleString("id-ID")}</p></div>
      <div class="big" style="margin-right:40px"><b class="lv-${L}">${Math.floor(sc)}</b><span class="lv-${L}">Risiko ${L.toLowerCase()}</span></div></div>
    <h3>Mengapa diprioritaskan</h3>
    ${r0.al.length ? `<ol class="reasons">${r0.al.map(a => `<li>${a}</li>`).join("")}</ol>` : `<p class="hint">Tidak ada indikator yang menyimpang jauh dari usaha sejenis.</p>`}
    <h3>Dibandingkan dengan usaha sejenis</h3>
    <div class="tbl"><table><thead><tr><th>Indikator</th><th>Badan usaha ini</th><th>Median sejenis</th></tr></thead>
    <tbody>${rowsInd.map(x => `<tr><td>${x[0]}</td><td class="${x[3] ? "flag" : ""}">${x[1]}</td><td>${x[2]}</td></tr>`).join("")}</tbody></table></div>
    <h3>Aturan yang terpicu</h3>
    <div class="chips">${r0.ru.length ? r0.ru.map(x => `<span class="chip">${x}</span>`).join("") : `<span class="hint">Tidak ada</span>`}</div>
    <div style="margin-top:16px"><button class="btn small" id="showTk" type="button" aria-expanded="false" aria-controls="tkEvidence">Tampilkan TK terkait indikasi</button></div>
    <section id="tkEvidence" hidden aria-label="Rincian indikasi tenaga kerja"></section>
    <h3>Tindak lanjut</h3>
    <div id="tlSlot"></div>
    <p class="hint">Skor hanya menentukan urutan. Petugas memverifikasi sebelum menghubungi pemberi kerja. Badan usaha yang sudah punya action plan tidak dihitung lagi dalam sisa beban.</p>
    ${mode === "si" ? `<p class="hint">Mode internal saja: indikator eksternal tetap ditampilkan untuk perbandingan, tetapi tidak ikut menghitung skor.</p>` : ""}`;
  $("showTk").addEventListener("click", () => { const box = $("tkEvidence"), button = $("showTk"); const expanded = button.getAttribute("aria-expanded") === "true"; button.setAttribute("aria-expanded", String(!expanded)); button.textContent = expanded ? "Tampilkan TK terkait indikasi" : "Sembunyikan rincian TK"; if (expanded) box.hidden = true; else tkDetails.show(r0, mode, box); });
  renderTlSlot(r0);
  if (fresh) $("mBody").scrollTop = 0;
  const m = $("modal"); if (!m.open) { if (m.showModal) m.showModal(); else m.setAttribute("open", ""); }
}
$("mClose").addEventListener("click", () => $("modal").close());
$("modal").addEventListener("click", e => { if (e.target === $("modal")) $("modal").close(); });
$("modal").addEventListener("close", () => { selected = null; if (reduce) draw(0); });
document.querySelectorAll(".mode-switch button").forEach(b => b.addEventListener("click", () => {
  mode = b.dataset.mode; document.querySelectorAll(".mode-switch button").forEach(x => x.setAttribute("aria-pressed", x === b));
  LV.forEach(L => pages[L] = 1); render();
}));
["fKab","fMd"].forEach(id => $(id)?.addEventListener("change", () => { LV.forEach(L => pages[L] = 1); render(); }));
$("fQ")?.addEventListener("input", () => { LV.forEach(L => pages[L] = 1); render(); });
document.querySelectorAll(".pager button[data-lv]").forEach(b => b.addEventListener("click", () => { pages[b.dataset.lv] += Number(b.dataset.step); render(); }));

/* ---------- Tindak lanjut: tampilan ---------- */
function completionDateLabel(p){
  if (planStatus(p) !== "Selesai") return "";
  const logs = (p.log || []).filter(l => l.kind === "selesai" || l.kind === "step-selesai").map(l => l.ts);
  const candidates = p.completedAt ? [p.completedAt] : [...logs, ...p.steps.map(step => step.upd)];
  const times = candidates.filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  if (!times.length) return "Tanggal selesai belum tercatat";
  return "Selesai pada " + new Date(Math.max(...times)).toLocaleDateString("id-ID", {day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta"});
}
function renderTlSlot(r0){
  const slot = $("tlSlot"); if (!slot) return;
  const pl = planOf(r0.id);
  if (pl) {
    const done = pl.steps.filter(s => s.s === "selesai").length;
    slot.innerHTML = `<div class="planbox"><div class="ph" style="display:flex;justify-content:space-between;gap:8px"><b>${TL[pl.jenis].label}</b><span class="pill st-${planStatus(pl)}">${planStatus(pl)}</span></div>
      <div class="pbar"><i style="width:${Math.round(done / pl.steps.length * 100)}%"></i></div>
      <small class="hint" style="margin:0">${done} dari ${pl.steps.length} langkah selesai${pl.target ? " · target " + fmtDate(pl.target) : ""}</small>
      ${planStatus(pl) === "Selesai" ? `<small class="hint" style="display:block;margin:4px 0;color:var(--green)">${completionDateLabel(pl)}</small>` : ""}
      <div><button class="btn primary" type="button" id="goPlan">Buka di log tindak lanjut</button></div></div>`;
    $("goPlan").addEventListener("click", () => { $("modal").close(); if (document.body.dataset.view !== "plan") { window.location.href = "tindak-lanjut.html#plan-" + encodeURIComponent(pl.id); return; } showTab("plan"); const el = document.getElementById("plan-" + pl.id); if (el) { el.scrollIntoView({behavior: reduce ? "auto" : "smooth", block: "center"}); el.querySelector("button")?.focus(); } });
    return;
  }
  slot.innerHTML = `<div class="tlpick" role="group" aria-label="Pilih jenis tindak lanjut">${Object.entries(TL).map(([k, v]) => `<button class="btn" type="button" data-tl="${k}" aria-pressed="false">${v.label}</button>`).join("")}</div><div id="tlForm"></div>`;
  slot.querySelectorAll("[data-tl]").forEach(b => b.addEventListener("click", () => {
    slot.querySelectorAll("[data-tl]").forEach(x => x.setAttribute("aria-pressed", x === b));
    const k = b.dataset.tl, steps = genSteps(k, r0.md);
    $("tlForm").innerHTML = `<div class="tlform">
      ${k !== "aman" ? `<label>Target selesai<input type="date" id="tlTarget" value="${addDays(TL[k].hari)}" min="${todayISO()}"></label>` : ""}
      <label>${k === "aman" ? "Alasan tidak ada masalah" : "Catatan awal (opsional)"}<textarea id="tlNote" rows="2" placeholder="${k === "aman" ? "mis. upah sesuai bukti pembayaran, data pajak belum diperbarui" : "mis. kontak HRD, nomor surat"}"></textarea></label>
      <div><small class="hint" style="margin:0">Langkah yang akan dibuat otomatis:</small><ol>${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>
      <div><button class="btn primary" type="button" id="tlGo">${k === "aman" ? "Tutup sebagai tidak ada masalah" : "Buat action plan"}</button></div></div>`;
    $("tlGo").addEventListener("click", () => {
      const note = $("tlNote").value.trim();
      if (k === "aman" && !note) { $("tlNote").focus(); toast("Isi alasan singkat dulu"); return; }
      const now = new Date().toISOString();
      const p = {id: r0.id + "-" + Date.now().toString(36), bu: r0.id, nm: r0.nm, kab: r0.kab, sek: r0.sek, sk: Math.floor(r0[mode]), lv: lvOf(r0[mode]), md: r0.md,
        jenis: k, target: k === "aman" ? todayISO() : ($("tlTarget").value || addDays(TL[k].hari)), catatan: note, by: me(), at: now,
        steps: steps.map(s => ({t: s, s: k === "aman" ? "selesai" : "belum", note: "", upd: k === "aman" ? now : "", by: k === "aman" ? me() : ""})), log: []};
      logAdd(p, `Membuat action plan: ${TL[k].label}` + (note ? ` (${note})` : ""), "buat");
      if (k === "aman") logAdd(p, "Ditutup: tidak ada masalah", "step-selesai");
      savePlan(p); toast(k === "aman" ? "Ditutup sebagai tidak ada masalah" : "Action plan dibuat dan masuk log");
      openModal(r0.id);
    });
  }));
}

let tab = document.body.dataset.view === "log" ? "log" : "plan";
function showTab(t){ tab = t; document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === t)); $("tlPlans").hidden = t !== "plan"; $("tlLog").hidden = t !== "log"; renderTl(); }
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
Object.entries(TL).forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v.label; $("fJn")?.appendChild(o); });
["fSt","fJn"].forEach(i => $(i)?.addEventListener("change", renderTl));

function companyTlSummary(plans){
  const byCompany = new Map(), priority = {Selesai:0, Rencana:1, Berjalan:2, Kendala:3};
  plans.forEach(p => { if (!p.bu) return; const status = planStatus(p), previous = byCompany.get(p.bu); if (!previous || priority[status] > priority[previous]) byCompany.set(p.bu, status); });
  const result = {total:byCompany.size, Rencana:0, Berjalan:0, Kendala:0, Selesai:0};
  byCompany.forEach(status => result[status]++); return result;
}
function renderTl(){
  if (!$("tlpanel")) return;
  const plans = Object.values(store.plans).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const today = todayISO();
  if ($("tlCompanyTotal")) { const summary = companyTlSummary(plans); $("tlCompanyTotal").textContent = summary.total.toLocaleString("id-ID"); ["Rencana","Berjalan","Kendala","Selesai"].forEach(status => $("tlCompany" + status).textContent = summary[status].toLocaleString("id-ID")); }
  $("cAktif").textContent = plans.filter(p => planStatus(p) !== "Selesai").length;
  $("cKendala").textContent = plans.filter(p => planStatus(p) === "Kendala").length;
  $("cLate").textContent = plans.filter(p => planStatus(p) !== "Selesai" && p.target && p.target < today).length;
  $("cHari").textContent = plans.reduce((n, p) => n + (p.log || []).filter(l => l.kind === "step-selesai" && l.ts.slice(0,10) === today).length, 0);
  const fs = $("fSt").value, fj = $("fJn").value;
  const shownPlans = plans.filter(p => (!fs || planStatus(p) === fs) && (!fj || p.jenis === fj));
  if (tab === "plan") {
    const box = $("tlPlans");
    if (!plans.length) { box.innerHTML = `<p class="empty">Belum ada action plan. Buka badan usaha dari radar atau antrean, lalu pilih jenis tindak lanjut.</p>`; return; }
    if (!shownPlans.length) { box.innerHTML = `<p class="empty">Tidak ada action plan untuk filter ini.</p>`; return; }
    box.innerHTML = shownPlans.map(p => {
      const st = planStatus(p), done = p.steps.filter(s => s.s === "selesai").length, late = st !== "Selesai" && p.target && p.target < today;
      return `<article class="plan" id="plan-${esc(p.id)}" data-id="${esc(p.id)}">
        <div class="ph"><div><b>${esc(p.bu)}</b> ${esc(p.nm)}<small>${esc(p.kab)} · skor ${p.sk} · risiko ${esc((p.lv || "").toLowerCase())}</small></div><span class="pill st-${st}">${st}</span></div>
        <p class="pmeta">${TL[p.jenis].label} · target ${fmtDate(p.target)}${late ? ` · <span class="late">lewat target</span>` : ""}<br>Dibuat ${who(p.by)}, ${new Date(p.at).toLocaleDateString("id-ID", {day:"numeric", month:"short"})}</p>
        <div class="pbar" aria-hidden="true"><i style="width:${Math.round(done / p.steps.length * 100)}%"></i></div>
        <small class="hint" style="margin:0">${done} dari ${p.steps.length} langkah selesai</small>
        <ol class="steps">${p.steps.map((s, i) => `<li class="${s.s === "selesai" ? "done" : ""}"><span class="t">${esc(s.t)}</span>
          <div class="sx"><span class="ss ss-${s.s}">${STEP_LBL[s.s]}</span>${s.upd ? `<small class="hint" style="margin:0">${who(s.by)} · ${new Date(s.upd).toLocaleString("id-ID", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})}</small>` : ""}
          ${p.jenis !== "aman" ? `${s.s !== "jalan" && s.s !== "selesai" ? `<button class="btn small" type="button" data-step="${i}" data-act="jalan">Mulai</button>` : ""}${s.s !== "selesai" ? `<button class="btn small" type="button" data-step="${i}" data-act="selesai">Selesai</button>` : `<button class="btn small" type="button" data-step="${i}" data-act="belum">Batalkan</button>`}${s.s !== "kendala" && s.s !== "selesai" ? `<button class="btn small warn" type="button" data-step="${i}" data-act="kendala">Kendala</button>` : ""}` : ""}</div>
          ${s.note ? `<small class="hint" style="margin:2px 0 0">${esc(s.note)}</small>` : ""}</li>`).join("")}</ol>
        <div class="addnote"><input type="text" aria-label="Catatan progres" placeholder="Catatan progres hari ini…" maxlength="300"><button class="btn small" type="button" data-note="1">Tambah catatan</button></div>
        <div class="pfoot"><button class="btn small" type="button" data-open="${esc(p.bu)}">Lihat detail badan usaha</button><button class="btn small warn" type="button" data-del="1">Hapus</button></div>
      </article>`; }).join("");
    box.querySelectorAll(".plan").forEach(card => {
      const id = card.dataset.id;
      card.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => {
        const p = JSON.parse(JSON.stringify(store.plans[id])); if (!p) return;
        const i = +b.dataset.step, act = b.dataset.act, inp = card.querySelector(".addnote input"), note = inp.value.trim();
        if (act === "kendala" && !note) { inp.focus(); toast("Tulis kendalanya di kolom catatan, lalu klik Kendala lagi"); return; }
        const before = planStatus(p);
        Object.assign(p.steps[i], {s: act, upd: new Date().toISOString(), by: me()}); if (note) p.steps[i].note = note;
        logAdd(p, `Langkah ${i + 1} → ${STEP_LBL[act]}: ${p.steps[i].t}` + (note ? ` (${note})` : ""), act === "selesai" ? "step-selesai" : "step");
        if (planStatus(p) === "Selesai" && before !== "Selesai") logAdd(p, "Action plan selesai", "selesai");
        if (planStatus(p) === "Selesai" && before !== "Selesai") p.completedAt = new Date().toISOString();
        else if (planStatus(p) !== "Selesai") delete p.completedAt;
        savePlan(p);
      }));
      card.querySelector("[data-note]").addEventListener("click", () => {
        const inp = card.querySelector(".addnote input"), note = inp.value.trim(); if (!note) { inp.focus(); return; }
        const p = JSON.parse(JSON.stringify(store.plans[id])); logAdd(p, "Catatan: " + note, "catatan"); savePlan(p); toast("Catatan masuk log harian");
      });
      card.querySelector("[data-open]").addEventListener("click", e => openModal(e.currentTarget.dataset.open));
      const del = card.querySelector("[data-del]");
      del.addEventListener("click", () => { if (del.dataset.armed) { deletePlan(id); toast("Action plan dihapus"); } else { del.dataset.armed = "1"; del.textContent = "Klik lagi untuk hapus"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Hapus"; } }, 3000); } });
    });
  } else {
    const rows = [];
    shownPlans.forEach(p => (p.log || []).forEach(l => rows.push({...l, p})));
    rows.sort((a, b) => b.ts.localeCompare(a.ts));
    if (!rows.length) { $("tlLog").innerHTML = `<p class="empty">Belum ada aktivitas tercatat.</p>`; return; }
    const groups = {};
    rows.forEach(r => { const d = new Date(r.ts); const key = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); (groups[key] = groups[key] || []).push(r); });
    const yest = addDays(-1);
    $("tlLog").innerHTML = Object.keys(groups).sort().reverse().map(k => `<div class="logday"><h3>${k === today ? "Hari ini" : k === yest ? "Kemarin" : ""} ${fmtDate(k)} · ${groups[k].length} aktivitas</h3>
      ${groups[k].map(r => `<div class="logrow"><time>${new Date(r.ts).toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit"})}</time><div><b>${esc(r.p.bu)}</b> ${esc(r.p.nm)} <small>· ${TL[r.p.jenis].label} · ${who(r.by)}</small><div>${esc(r.txt)}</div></div></div>`).join("")}</div>`).join("");
  }
}
$("btnCsv")?.addEventListener("click", async () => {
  const rows = [["tanggal","jam","petugas","id_bu","nama_bu","jenis_tindak_lanjut","status_action_plan","aktivitas"]];
  Object.values(store.plans).forEach(p => (p.log || []).forEach(l => { const d = new Date(l.ts); rows.push([d.toLocaleDateString("sv-SE"), d.toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit"}), who(l.by), p.bu, p.nm, TL[p.jenis].label, planStatus(p), l.txt]); }));
  rows.splice(1, rows.length, ...rows.slice(1).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])));
  const csv = "\ufeff" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const fn = "log_tindak_lanjut_RADAR_" + todayISO() + ".csv";
  if (store.dl) { try { await store.dl.save({filename: fn, data: csv}); } catch (e) { if (e && e.code === "unavailable") $("btnCsv").hidden = true; } return; }
  const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"})); const a = document.createElement("a"); a.href = url; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function resolveNames(){
  if (!store.user) return;
  const ids = new Set(); Object.values(store.plans).forEach(p => { ids.add(p.by); (p.log || []).forEach(l => ids.add(l.by)); p.steps.forEach(s => s.by && ids.add(s.by)); });
  ids.delete("saya"); ids.delete(""); ids.delete(undefined);
  const need = [...ids].filter(i => !(i in store.names)); if (!need.length) return;
  try { const ps = await store.user.profiles(need); need.forEach(i => store.names[i] = (ps[i] && ps[i].name) || ""); renderTl(); } catch (e) {}
}
function refreshAll(){ render(); renderTl(); if (selected && $("modal").open) renderTlSlot(DATA.rows.find(r => r.id === selected)); resolveNames(); }
(async () => {
  if (!window.claude || typeof window.claude.use !== "function") return;
  const [db, user, dl] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("downloads")]);
  store.user = user; store.dl = dl;
  if (dl) $("btnCsv").hidden = false;
  if (user) { try { store.uid = await user.id(); } catch (e) {} }
  if (db) {
    store.db = db;
    db.collection("tl").onSnapshot(snap => {
      const m = {}; snap.docs.forEach(d => { if (d.exists) m[d.id] = d.data(); });
      store.mode = "db"; store.plans = m; $("storeNote").textContent = "Tersimpan bersama: semua petugas yang membuka dasbor ini melihat log yang sama."; refreshAll();
    }, () => { store.mode = "local"; $("storeNote").textContent = "Tersimpan di perangkat ini."; });
  }
  refreshAll();
})();

/* ---------- Radar ---------- */
const cv = $("scope"), ctx = cv?.getContext("2d"), tip = $("tip");
const COL = {Tinggi:[255,107,61], Sedang:[242,193,78], Rendah:[43,182,115]};
const BAND = {Tinggi:[0.07,0.34,70,100], Sedang:[0.36,0.63,50,70], Rendah:[0.65,0.97,0,50]};
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function hash(s){ let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

function layout(){
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth;
  cv.width = w * dpr; cv.height = w * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); S = w;
  buildDots();
}
function buildDots(){
  const c = S / 2, R = S / 2 - 100, step = 2 * Math.PI / kabs.length;
  const rk = {};
  ["Tinggi","Sedang","Rendah"].forEach(L => { const g = DATA.rows.filter(r => lvOf(r[mode]) === L).sort((p, q) => q[mode] - p[mode]); g.forEach((r, i) => rk[r.id] = g.length > 1 ? i / (g.length - 1) : 0.5); });
  dots = DATA.rows.map(r => {
    const sc = r[mode], L = lvOf(sc), [a, b] = BAND[L];
    const f = rk[r.id];
    const rad = R * (a + (b - a) * (0.15 + 0.7 * f) + (hash(r.id + "r") - .5) * 0.05);
    const ang = kabs.indexOf(r.kab) * step - Math.PI / 2 + (hash(r.id) - .5) * step * 0.82;
    return {id: r.id, L, sc, ang: (ang + 4 * Math.PI) % (2 * Math.PI), x: c + rad * Math.cos(ang), y: c + rad * Math.sin(ang)};
  });
}
function draw(t){
  const c = S / 2, R = S / 2 - 100;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "#0B2430"; ctx.beginPath(); ctx.arc(c, c, R + 10, 0, 2 * Math.PI); ctx.fill();
  const labCol = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#56666C";
  // bands
  [["Tinggi",.34],["Sedang",.63],["Rendah",.97]].forEach(([L, f], i) => {
    ctx.beginPath(); ctx.arc(c, c, R * f, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(${COL[L].join(",")},0.45)`; ctx.lineWidth = 1.5; ctx.stroke();
  });
  ctx.fillStyle = "rgba(255,107,61,0.07)"; ctx.beginPath(); ctx.arc(c, c, R * .34, 0, 2 * Math.PI); ctx.fill();
  // sector lines + wilayah labels
  const step = 2 * Math.PI / kabs.length;
  ctx.font = "600 12px 'Plus Jakarta Sans', system-ui, sans-serif"; ctx.textBaseline = "middle";
  kabs.forEach((k, i) => {
    const a0 = i * step - Math.PI / 2 - step / 2;
    ctx.strokeStyle = "rgba(143,179,193,0.12)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + R * Math.cos(a0), c + R * Math.sin(a0)); ctx.stroke();
    const am = i * step - Math.PI / 2, lx = c + (R + 18) * Math.cos(am), ly = c + (R + 18) * Math.sin(am);
    const lab = k.replace("Kota ", "").replace("Kab. ", "");
    ctx.textAlign = Math.abs(Math.cos(am)) < .2 ? "center" : (Math.cos(am) > 0 ? "left" : "right");
    ctx.fillStyle = labCol; ctx.fillText(lab, lx, ly);
  });
  // ring labels
  ctx.textAlign = "left"; ctx.font = "700 11px 'Plus Jakarta Sans', system-ui, sans-serif";
  [["Tinggi",.34],["Sedang",.63],["Rendah",.97]].forEach(([L, f]) => { ctx.fillStyle = `rgba(${COL[L].join(",")},0.9)`; ctx.fillText(L, c + 6, c - R * f + 11); });
  // sweep
  const sw = reduce ? null : ((t || 0) / 4000 * 2 * Math.PI) % (2 * Math.PI);
  if (sw !== null) {
    const g = ctx.createConicGradient ? ctx.createConicGradient(sw - 0.9, c, c) : null;
    if (g) { g.addColorStop(0, "rgba(43,182,115,0)"); g.addColorStop(0.143, "rgba(43,182,115,0.28)"); g.addColorStop(0.144, "rgba(43,182,115,0)"); g.addColorStop(1, "rgba(43,182,115,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, sw - 0.9, sw); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = "rgba(43,182,115,0.9)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + R * Math.cos(sw), c + R * Math.sin(sw)); ctx.stroke();
  }
  // dots
  const order = ["Rendah","Sedang","Tinggi"];
  order.forEach(L => dots.filter(d => d.L === L).forEach(d => {
    const on = visible.has(d.id);
    let glow = 1;
    if (sw !== null) { const dl = (sw - d.ang + 2 * Math.PI) % (2 * Math.PI); glow = Math.exp(-dl / 1.4); }
    const base = L === "Tinggi" ? .55 : L === "Sedang" ? .4 : .22;
    const al = on ? Math.min(1, base + (1 - base) * glow) : 0.06;
    const rr = L === "Tinggi" ? 3.6 : L === "Sedang" ? 3 : 2.3;
    ctx.fillStyle = `rgba(${COL[L].join(",")},${al})`;
    ctx.beginPath(); ctx.arc(d.x, d.y, rr + (on && L === "Tinggi" ? glow * 1.8 : 0), 0, 2 * Math.PI); ctx.fill();
  }));
  // selected
  const sel = dots.find(d => d.id === selected);
  if (sel) { ctx.strokeStyle = "#F7FAF6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sel.x, sel.y, 9, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.fillStyle = "#2BB673"; ctx.beginPath(); ctx.arc(c, c, 4, 0, 2 * Math.PI); ctx.fill();
}
function loop(t){ draw(t); if (!reduce) requestAnimationFrame(loop); }
function nearest(ev){
  const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  let best = null, bd = 12;
  dots.forEach(d => { if (!visible.has(d.id)) return; const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } });
  return {best, x, y};
}
if (cv) {
cv.addEventListener("mousemove", ev => { const {best, x, y} = nearest(ev);
  if (best) { const r = DATA.rows.find(q => q.id === best.id); tip.textContent = `${best.id} ${r.nm} · skor ${Math.floor(best.sc)} · ${r.kab}`; tip.style.left = x + "px"; tip.style.top = y + "px"; tip.style.opacity = 1; }
  else tip.style.opacity = 0; });
cv.addEventListener("mouseleave", () => tip.style.opacity = 0);
cv.addEventListener("click", ev => { const {best} = nearest(ev); if (best) openModal(best.id); });
new ResizeObserver(() => { layout(); if (reduce) draw(0); }).observe(cv);
render();
layout();
if (reduce) draw(0); else requestAnimationFrame(loop);

}
if ($("tlpanel")) showTab(tab);
window.addEventListener("storage", e => { if (e.key === "radar-tl") { try { store.plans = JSON.parse(e.newValue || "{}"); refreshAll(); } catch {} } });

if (document.body.dataset.view === "plan" && window.location.hash) { const card = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); if (card) card.scrollIntoView({block:"center"}); }

// Native disclosure supports mouse hover, keyboard focus and touch click.
document.querySelectorAll('.profile-detail').forEach(panel => {
  panel.addEventListener('mouseenter', () => { panel.open = true; });
  panel.addEventListener('mouseleave', () => { if (!panel.contains(document.activeElement)) panel.open = false; });
  panel.addEventListener('focusin', () => { panel.open = true; });
  panel.addEventListener('focusout', e => { if (!panel.contains(e.relatedTarget)) panel.open = false; });
});

const requestedCompany = new URLSearchParams(window.location.search).get('pkbu');
if (requestedCompany && document.getElementById('scope')) openModal(requestedCompany);

if (document.getElementById("progressToday")) setInterval(() => renderProgress(rows()), 60000);
