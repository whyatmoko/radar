"""
build_web.py - membangun ulang seluruh isi situs prototype RADAR.

Urutan kerja:
  1. generate_data_sintetis.py  -> data/csv/*.csv   (data sintetis, seed 2026)
  2. radar_model.py             -> skor, indikator, evaluasi
  3. hasil model                -> data/hasil/*.csv
  4. templates/*.template.html  -> index.html, jejak.html, data.html

Jalankan dari folder mana saja:
    python model/build_web.py

Seluruh data FIKTIF. Tidak ada data peserta JKN riil.
"""
import csv, html, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "model"))
os.chdir(DATA)                      # skrip model membaca/menulis folder "csv" relatif
(DATA / "csv").mkdir(exist_ok=True)
(DATA / "hasil").mkdir(exist_ok=True)

import numpy as np, pandas as pd

# ---------- 1. Data sintetis ----------
import generate_data_sintetis as G
for name, df in G.TABLES.items():
    df.to_csv(DATA / "csv" / f"{name}.csv", index=False)
print("[1] data sintetis:", {k: len(v) for k, v in G.TABLES.items()})

# ---------- 2. Model ----------
import radar_model as M
from sklearn.ensemble import IsolationForest
F, Z, out, kunci = M.F, M.Z, M.out, M.kunci
L = M.res["lengkap"]; X = L["X"]; R = L["R"]; rc = L["rc"]
iso = IsolationForest(n_estimators=300, contamination="auto", random_state=2026).fit(X)
anom = -iso.score_samples(X)
pct = pd.Series(anom).rank(pct=True).values
rule = np.minimum(1, sum(R[c].astype(float) * M.W[c] for c in rc))
assert np.allclose(np.round(100 * (0.5 * rule + 0.5 * pct), 1), L["skor"])
print("[2] model:", out.level.value_counts().to_dict())

# ---------- 3. Hasil model sebagai CSV ----------
out.to_csv(DATA / "hasil" / "skor_radar.csv", index=False)
F.drop(columns=["kelompok_sejenis"]).assign(kelompok_sejenis=F.kelompok_sejenis).to_csv(DATA / "hasil" / "indikator_per_bu.csv", index=False)
M.ev.round(4).to_csv(DATA / "hasil" / "evaluasi_model.csv", index=False)
M.per.round(4).to_csv(DATA / "hasil" / "evaluasi_per_modus.csv", index=False)

def nz(v, d=3):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else round(v, d)

# ---------- 4a. Data dasbor ----------
RULE_LABEL = {"R1_upah_umk": "Upah menumpuk di UMK", "R2_alih_mandiri": "Pekerja dialihkan ke PBPU/PBI",
    "R3_backdate": "Nonaktif diinput terlambat >14 hari", "R4_tunggakan": "Tunggakan ≥4 bulan",
    "R5_kurang_pph21": "PPU <80% pekerja PPh 21", "R6_upah_pph21": "Upah <90% penghasilan PPh 21",
    "R7_jadi_mandiri": "≥10% pekerja aktif tercatat mandiri", "R8_jeda_daftar": "Pekerja baru didaftarkan >60 hari"}
IND = {"umk": "porsi_upah_umk", "pph": "rasio_ppu_pph21", "mandiri": "porsi_pekerja_ext_mandiri",
       "jeda": "median_jeda_daftar", "backdate": "median_jeda_input_nonaktif", "telat": "bln_tidak_tepat"}
idx = {b: i for i, b in enumerate(F.id_bu)}
DP = {"umk": 3, "pph": 3, "mandiri": 3, "jeda": 0, "backdate": 0, "telat": 0}   # angka hari/bulan dibulatkan
PM = {c: F[c].groupby(F.kelompok_sejenis).transform("median") for c in IND.values()}
rows = []
for _, o in out.iterrows():
    i = idx[o.id_bu]; f = F.iloc[i]
    rows.append({"id": o.id_bu, "sek": o.sektor, "sk": o.skala_usaha_oss, "kab": o.kab_kota,
        "s": float(o.skor_radar), "si": float(o.skor_mode_internal), "lv": str(o.level),
        "md": [m for m in o.modus_terindikasi.split(", ") if m],
        "al": [a for a in (o.alasan_1, o.alasan_2, o.alasan_3) if a],
        "ru": [RULE_LABEL[c] for c in rc if R.iloc[i][c]],
        "n": int(f.n_ppu_aktif),
        "ind": {k: [nz(f[c], DP[k]), nz(PM[c].iloc[i], DP[k])] for k, c in IND.items()},
        "nm": f.nama_bu})
ev = M.ev.set_index("Metrik")
EV = {k: [round(float(ev.loc[k].iloc[0]), 3), round(float(ev.loc[k].iloc[1]), 3)] for k in ev.index}
dash = {"rows": rows, "ev": EV}

# ---------- 4b. Data Jejak Skor ----------
tr = pd.DataFrame(G.truth_rows)
akt = tr[tr.end.isna()]
upah_riil = akt.groupby("id_bu").upah_riil.mean()
n_riil = akt.groupby("id_bu").size()
EX = ["BU00365", "BU00849", "BU00986", "BU00610"]
grp = F.set_index("id_bu").loc[EX[0], "kelompok_sejenis"]
gid = F[F.kelompok_sejenis == grp].id_bu.tolist()
osr = out.set_index("id_bu"); ku = kunci.set_index("id_bu")
ind = []
for k, (c, fn, src) in M.RISK.items():
    ind.append(dict(k=k, col=c, src=src, med=nz(F[F.kelompok_sejenis == grp][c].median(), 4),
        peer=[[b, nz(F.loc[idx[b], c], 4), round(float(Z.loc[idx[b], k]), 2)] for b in gid]))
ex = {}
for b in EX:
    i = idx[b]; r = F.iloc[i]
    ex[b] = dict(nm=r.nama_bu, kab=r.kab_kota, sek=r.sektor, sk=r.skala_usaha_oss,
        label=ku.loc[b, "jenis_fraud"], H=int(ku.loc[b, "jumlah_tk_riil"]), H_aktif=int(n_riil.get(b, 0)),
        upah_riil=nz(upah_riil.get(b, np.nan), 1), umk=int(r.umk_ilustratif), n_ppu=int(r.n_ppu_aktif),
        upah_lapor=nz(r.rata_upah_lapor, 1), pph_n=int(r.jumlah_tk_pelaporan_pph21),
        pph_upah=int(r.rata2_penghasilan_bruto_pph21), oss=int(r.estimasi_tk_oss),
        raw={k: nz(r[c], 4) for k, (c, f_, s_) in M.RISK.items()},
        z={k: round(float(Z.loc[i, k]), 2) for k in M.RISK},
        rules={c: bool(R.loc[i, c]) for c in rc}, rule=round(float(rule[i]), 2),
        anom=round(float(anom[i]), 4), pct=round(float(pct[i]), 4), skor=float(L["skor"][i]),
        lv=str(osr.loc[b, "level"]), alasan=[a for a in osr.loc[b, ["alasan_1", "alasan_2", "alasan_3"]] if a],
        modus=osr.loc[b, "modus_terindikasi"], n_ppu_mandiri=int(r.n_ppu_ke_mandiri))
pts = [[round(float(X.loc[i, "upah_menumpuk_umk"]), 2), round(float(X.loc[i, "kurang_vs_pph21"]), 2),
        round(float(X.loc[i, "pekerja_jadi_mandiri"]), 2), round(float(pct[i]), 3), float(L["skor"][i]),
        int(ku.loc[F.id_bu[i], "is_fraud"])] for i in range(len(F))]
flow = dict(grp=grp, ngrp=len(gid), ind=ind, ex=ex, pts=pts,
    tables={k: list(v.shape) for k, v in G.TABLES.items()},
    modus=kunci.jenis_fraud.str.split("|").explode().value_counts().to_dict(),
    nfraud=int(kunci.is_fraud.sum()), ntung=int(kunci.pola_tunggakan.sum()),
    lv=out.level.value_counts().to_dict(), ev=EV)

def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

T = ROOT / "templates"
(ROOT / "index.html").write_text((T / "dashboard.template.html").read_text(encoding="utf-8").replace("__DATA__", js(dash)), encoding="utf-8")
(ROOT / "jejak.html").write_text((T / "jejak.template.html").read_text(encoding="utf-8").replace("__DATA__", js(flow)), encoding="utf-8")

# ---------- 4c. Halaman data ----------
DESC = {
 "01_ref_wilayah": ("Referensi 12 kab/kota Jateng–DIY dan UMK ilustratif.", "internal"),
 "02_badan_usaha": ("Profil 1.200 badan usaha fiktif: sektor, wilayah, tanggal daftar, skala dan estimasi pekerja menurut izin usaha (OSS).", "internal"),
 "03_peserta": ("Kepesertaan per pekerja: segmen (PPU/PBPU/PBI), tanggal mulai dan nonaktif, upah yang dilaporkan, status hubungan kerja.", "internal"),
 "04_mutasi": ("Mutasi daftar baru dan nonaktif, lengkap dengan tanggal efektif dan tanggal input.", "internal"),
 "05_iuran_bulanan": ("Tagihan dan pembayaran iuran 12 bulan (Okt 2025–Sep 2026) per badan usaha.", "internal"),
 "06_ext_hubungan_kerja": ("Simulasi data hubungan kerja per pekerja dari sumber eksternal (cakupan 90%).", "eksternal"),
 "07_ext_pph21_bu": ("Simulasi ringkasan pelaporan PPh 21 per badan usaha: jumlah pekerja dan rata-rata penghasilan (gangguan ±5%).", "eksternal"),
 "99_kunci_jawaban": ("Label modus per badan usaha. Tidak dipakai melatih model; hanya untuk evaluasi.", "kunci jawaban"),
}
HASIL = {
 "skor_radar.csv": "Skor RADAR, level, peringkat, modus terindikasi, 3 alasan, dan aturan terpicu per badan usaha.",
 "indikator_per_bu.csv": "Nilai 11 indikator mentah per badan usaha beserta kelompok usaha sejenisnya.",
 "evaluasi_model.csv": "Metrik evaluasi: AUC-ROC, presisi 50/100/200 teratas, recall 20% teratas, baseline acak.",
 "evaluasi_per_modus.csv": "Recall 200 teratas per modus, mode internal saja vs internal + eksternal.",
}
def kb(p):
    s = p.stat().st_size
    return f"{s/1048576:.1f} MB" if s > 1048576 else f"{max(1, round(s/1024))} KB"
def preview(path, n=5):
    with open(path, encoding="utf-8") as fh:
        rd = csv.reader(fh); head = next(rd); body = [r for _, r in zip(range(n), rd)]
    th = "".join(f"<th>{html.escape(h)}</th>" for h in head)
    tb = "".join("<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in r) + "</tr>" for r in body)
    return head, f'<div class="scroll"><table><thead><tr>{th}</tr></thead><tbody>{tb}</tbody></table></div>'
cards = []
for name, (desc, src) in DESC.items():
    p = DATA / "csv" / f"{name}.csv"; head, pv = preview(p)
    cls = {"internal": "int", "eksternal": "ext", "kunci jawaban": "key"}[src]
    cards.append(f'''<section class="card"><div class="ch"><h3><a href="data/csv/{name}.csv" download>{name}.csv</a></h3><span class="src {cls}">{src}</span></div>
<p>{html.escape(desc)}</p><p class="meta">{len(G.TABLES[name]):,} baris · {len(head)} kolom · {kb(p)}</p>{pv}</section>'''.replace(f"{len(G.TABLES[name]):,} baris", f"{len(G.TABLES[name]):,} baris".replace(",", ".")))
hasil = "".join(f'<li><a href="data/hasil/{f}" download>{f}</a> <span class="meta">· {kb(DATA / "hasil" / f)}</span><br>{html.escape(d)}</li>' for f, d in HASIL.items())
xl = "".join(f'<li><a href="data/{f}" download>{f}</a> <span class="meta">· {kb(DATA / f)}</span></li>' for f in sorted(os.listdir(DATA)) if f.endswith(".xlsx"))
page = (T / "data.template.html").read_text(encoding="utf-8")
page = page.replace("__CARDS__", "\n".join(cards)).replace("__HASIL__", hasil).replace("__XLSX__", xl or "<li>(tidak ada)</li>")
(ROOT / "data.html").write_text(page, encoding="utf-8")
print("[4] index.html, jejak.html, data.html ditulis ulang")
