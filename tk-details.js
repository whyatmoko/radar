/* Bukti tingkat TK dari sumber sintetis yang juga digunakan model. */
const tkDetails = (() => {
  let cache;
  function csv(text) {
    const rows = []; let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === ',' || c === '\n')) { row.push(value.replace(/\r$/, '')); value = ''; if (c === '\n') { rows.push(row); row = []; } }
      else value += c;
    }
    if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
    const head = rows.shift();
    return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }
  async function load() {
    if (!cache) cache = Promise.all(['03_peserta', '04_mutasi', '06_ext_hubungan_kerja', '01_ref_wilayah'].map(async name => {
      const response = await fetch('data/csv/' + name + '.csv');
      if (!response.ok) throw Error('Data tidak dapat dimuat');
      return csv(await response.text());
    })).catch(e => { cache = null; throw e; });
    return cache;
  }
  const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  function evidence(bu, mode, sources) {
    const [pes, mut, ext, wil] = sources, end = '2026-09-30';
    const own = pes.filter(p => p.id_bu === bu.id && p.segmen === 'PPU');
    const active = own.filter(p => p.tgl_mulai_segmen <= end && !p.tgl_nonaktif);
    const activeIds = new Set(active.map(p => p.nik_samaran));
    const segments = new Map();
    pes.forEach(p => { if (!p.tgl_nonaktif && ['PBPU', 'PBI'].includes(p.segmen)) segments.set(p.nik_samaran, p.segmen); });
    const umk = Number(wil.find(w => w.kab_kota === bu.kab)?.umk_ilustratif);
    const found = new Map();
    const add = (nik, segment, reason, source) => {
      if (!found.has(nik)) found.set(nik, {nik, segment, reasons: [], sources: new Set()});
      const r = found.get(nik); if (!r.reasons.includes(reason)) r.reasons.push(reason); r.sources.add(source);
    };
    if (bu.md.includes('Upah') || bu.ru.includes('Upah menumpuk di UMK')) active.forEach(p => {
      if (Number(p.upah_dilaporkan) <= 1.03 * umk) add(p.nik_samaran, 'PPU', 'Upah dilaporkan Rp' + Number(p.upah_dilaporkan).toLocaleString('id-ID') + ' ≤ 103% UMK ilustratif (Rp' + umk.toLocaleString('id-ID') + ')', 'Internal');
    });
    own.filter(p => p.tgl_nonaktif).forEach(p => {
      const next = pes.find(q => q.nik_samaran === p.nik_samaran && ['PBPU', 'PBI'].includes(q.segmen) && days(q.tgl_mulai_segmen, p.tgl_nonaktif) >= 0 && days(q.tgl_mulai_segmen, p.tgl_nonaktif) <= 60);
      if (next) add(p.nik_samaran, next.segmen, 'Alih PPU ke ' + next.segmen + ' dalam ' + days(next.tgl_mulai_segmen, p.tgl_nonaktif) + ' hari setelah nonaktif', 'Internal');
    });
    mut.filter(m => m.id_bu === bu.id && m.jenis_mutasi === 'NONAKTIF' && days(m.tgl_input, m.tgl_efektif) > 14).forEach(m => add(m.nik_samaran, 'PPU nonaktif', 'Input nonaktif terlambat ' + days(m.tgl_input, m.tgl_efektif) + ' hari · efektif ' + m.tgl_efektif + ', input ' + m.tgl_input, 'Internal'));
    if (mode === 's') ext.filter(e => e.id_bu === bu.id).forEach(e => {
      if (!e.tgl_selesai_kerja && !activeIds.has(e.nik_samaran)) add(e.nik_samaran, segments.get(e.nik_samaran) || 'Tidak ada PPU aktif di PKBU', 'Aktif pada hubungan kerja eksternal, tanpa PPU aktif di PKBU ini', 'Internal + eksternal');
      own.filter(p => p.nik_samaran === e.nik_samaran).forEach(p => { const gap = days(p.tgl_mulai_segmen, e.tgl_mulai_kerja); if (gap > 60) add(p.nik_samaran, 'PPU', 'Pendaftaran ' + gap + ' hari setelah mulai kerja · mulai ' + e.tgl_mulai_kerja + ', daftar ' + p.tgl_mulai_segmen, 'Internal + eksternal'); });
    });
    return [...found.values()];
  }
  async function show(bu, mode, box) {
    box.hidden = false; box.textContent = 'Memuat data TK…';
    try {
      const list = evidence(bu, mode, await load()); let page = 1;
      const paint = () => {
        const total = Math.max(1, Math.ceil(list.length / 10)), start = (page - 1) * 10;
        box.innerHTML = '<p class="hint">Data TK sintetis. Temuan ini merupakan bukti untuk verifikasi, bukan penjelasan kontribusi individual pada skor AI. Selisih PPh 21/OSS, rata-rata upah, dan tunggakan perusahaan tidak dapat ditetapkan ke TK tertentu.</p>' +
          (list.length ? '<p class="hint">' + list.length + ' TK dengan indikasi · ' + (mode === 's' ? 'Internal + eksternal' : 'Internal saja') + '</p><div class="tbl"><table><thead><tr><th>No.</th><th>NIK samaran / segmen</th><th>Temuan dan sumber</th></tr></thead><tbody>' + list.slice(start, start + 10).map((r, i) => '<tr><td>' + (start + i + 1) + '</td><td>' + esc(r.nik) + '<br><small>' + esc(r.segment) + '</small></td><td>' + r.reasons.map(esc).join('<br>') + '<br><small>' + esc([...r.sources].join(', ')) + '</small></td></tr>').join('') + '</tbody></table></div><div class="tk-pager"><button class="btn small" data-prev ' + (page === 1 ? 'disabled' : '') + '>Sebelumnya</button><span>' + page + ' / ' + total + '</span><button class="btn small" data-next ' + (page === total ? 'disabled' : '') + '>Berikutnya</button></div>' : '<p class="empty">Tidak ditemukan indikasi pada TK individual untuk mode ini. Risiko dapat berasal dari indikator agregat atau pola anomali perusahaan.</p>');
        box.querySelector('[data-prev]')?.addEventListener('click', () => { page--; paint(); });
        box.querySelector('[data-next]')?.addEventListener('click', () => { page++; paint(); });
      }; paint();
    } catch { box.innerHTML = '<p class="hint">Data TK gagal dimuat. Tutup dan buka kembali rincian untuk mencoba lagi.</p>'; }
  }
  return {show, evidence, csv};
})();
