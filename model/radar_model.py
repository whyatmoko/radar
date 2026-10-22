"""
RADAR – Risk-based Alert for Detecting Anomalous Reporting
Model skor risiko kepatuhan pemberi kerja (prototype, data SINTETIS).
Pendekatan: aturan berbasis regulasi + deteksi anomali (Isolation Forest)
terhadap pembanding usaha sejenis (sektor x skala x provinsi). Tanpa label saat melatih.
Label (99_kunci_jawaban) HANYA dipakai untuk evaluasi.
"""
import pandas as pd, numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import roc_auc_score, average_precision_score

CSV = "csv"
END = pd.Timestamp("2026-09-30")
def load(n): return pd.read_csv(f"{CSV}/{n}.csv")
wil, bu, pes, mut, iur, ext, pph, kunci = [load(n) for n in
  ["01_ref_wilayah","02_badan_usaha","03_peserta","04_mutasi","05_iuran_bulanan",
   "06_ext_hubungan_kerja","07_ext_pph21_bu","99_kunci_jawaban"]]
for c in ["tgl_mulai_segmen","tgl_nonaktif"]: pes[c] = pd.to_datetime(pes[c])
for c in ["tgl_efektif","tgl_input"]: mut[c] = pd.to_datetime(mut[c])
for c in ["tgl_mulai_kerja","tgl_selesai_kerja"]: ext[c] = pd.to_datetime(ext[c])
bu = bu.merge(wil[["kab_kota","umk_ilustratif"]], on="kab_kota")

# ---------------- 1. FITUR per badan usaha ----------------
F = bu[["id_bu"]].copy()
ppu = pes[pes.segmen == "PPU"]
ppu_akt = ppu[(ppu.tgl_mulai_segmen <= END) & ppu.tgl_nonaktif.isna()].merge(bu[["id_bu","umk_ilustratif"]], on="id_bu")
g = ppu_akt.groupby("id_bu")
F = F.merge(g.size().rename("n_ppu_aktif"), on="id_bu", how="left").fillna({"n_ppu_aktif": 0})
F = F.merge(g.apply(lambda x: (x.upah_dilaporkan <= 1.03 * x.umk_ilustratif).mean(), include_groups=False).rename("porsi_upah_umk"), on="id_bu", how="left")
F = F.merge(g.upah_dilaporkan.mean().rename("rata_upah_lapor"), on="id_bu", how="left")
F = F.merge(bu[["id_bu","umk_ilustratif","estimasi_tk_oss"]], on="id_bu")
F["rasio_upah_umk"] = F.rata_upah_lapor / F.umk_ilustratif

# internal: PPU dinonaktifkan lalu muncul sebagai PBPU <= 60 hari (indikasi alih segmen)
non = ppu[ppu.tgl_nonaktif.notna()][["nik_samaran","id_bu","tgl_nonaktif"]]
pb = pes[pes.segmen.isin(["PBPU","PBI"])][["nik_samaran","tgl_mulai_segmen"]]
x = non.merge(pb, on="nik_samaran")
x = x[(x.tgl_mulai_segmen >= x.tgl_nonaktif) & ((x.tgl_mulai_segmen - x.tgl_nonaktif).dt.days <= 60)]
F = F.merge(x.groupby("id_bu").nik_samaran.nunique().rename("n_ppu_ke_mandiri"), on="id_bu", how="left").fillna({"n_ppu_ke_mandiri": 0})
F["porsi_ppu_ke_mandiri"] = F.n_ppu_ke_mandiri / (F.n_ppu_aktif + F.n_ppu_ke_mandiri).clip(lower=1)

# internal: backdate nonaktif (tgl_input - tgl_efektif)
mn = mut[mut.jenis_mutasi == "NONAKTIF"].copy()
mn["gap"] = (mn.tgl_input - mn.tgl_efektif).dt.days
F = F.merge(mn.groupby("id_bu").gap.median().rename("median_jeda_input_nonaktif"), on="id_bu", how="left")

# internal: kepatuhan bayar
iur["tidak_tepat"] = iur.status_bayar != "TEPAT WAKTU"
F = F.merge(iur.groupby("id_bu").tidak_tepat.sum().rename("bln_tidak_tepat"), on="id_bu", how="left")

# eksternal: PPh 21
F = F.merge(pph[["id_bu","jumlah_tk_pelaporan_pph21","rata2_penghasilan_bruto_pph21"]], on="id_bu", how="left")
F["rasio_ppu_pph21"] = F.n_ppu_aktif / F.jumlah_tk_pelaporan_pph21
F["rasio_upah_pph21"] = F.rata_upah_lapor / F.rata2_penghasilan_bruto_pph21
F["rasio_ppu_oss"] = F.n_ppu_aktif / F.estimasi_tk_oss
F["selisih_pekerja_pph21"] = (F.jumlah_tk_pelaporan_pph21 - F.n_ppu_aktif).clip(lower=0)

# eksternal: hubungan kerja per pekerja
ext_akt = ext[ext.tgl_selesai_kerja.isna()]
ppu_nik_bu = set(zip(ppu_akt.nik_samaran, ppu_akt.id_bu))
seg_aktif = pes[pes.tgl_nonaktif.isna()].groupby("nik_samaran").segmen.apply(set)
ea = ext_akt.copy()
ea["terdaftar_ppu_di_bu"] = [(n, b) in ppu_nik_bu for n, b in zip(ea.nik_samaran, ea.id_bu)]
ea["tercatat_mandiri"] = [(not t) and bool(seg_aktif.get(n, set()) & {"PBPU","PBI"}) for n, t in zip(ea.nik_samaran, ea.terdaftar_ppu_di_bu)]
ge = ea.groupby("id_bu")
F = F.merge(ge.terdaftar_ppu_di_bu.mean().rename("porsi_pekerja_ext_terdaftar"), on="id_bu", how="left")
F = F.merge(ge.tercatat_mandiri.mean().rename("porsi_pekerja_ext_mandiri"), on="id_bu", how="left")
lag = ppu.merge(ext[["nik_samaran","id_bu","tgl_mulai_kerja"]], on=["nik_samaran","id_bu"])
lag["lag"] = (lag.tgl_mulai_segmen - lag.tgl_mulai_kerja).dt.days
F = F.merge(lag.groupby("id_bu").lag.median().rename("median_jeda_daftar"), on="id_bu", how="left")

F = F.merge(bu[["id_bu","nama_bu","sektor","skala_usaha_oss","kab_kota","provinsi"]], on="id_bu")
F["kelompok_sejenis"] = F.sektor + " | " + F.skala_usaha_oss + " | " + F.provinsi

# ---------------- 2. Arah risiko + normalisasi usaha sejenis ----------------
# setiap indikator diubah menjadi "makin besar = makin berisiko"
RISK = {  # nama_indikator: (kolom, transformasi, sumber)
 "upah_menumpuk_umk":     ("porsi_upah_umk",            lambda s: s,          "internal"),
 "upah_rendah_vs_umk":    ("rasio_upah_umk",            lambda s: -s,         "internal"),
 "alih_ke_mandiri":       ("porsi_ppu_ke_mandiri",      lambda s: s,          "internal"),
 "backdate_nonaktif":     ("median_jeda_input_nonaktif",lambda s: s,          "internal"),
 "tunggakan":             ("bln_tidak_tepat",           lambda s: s,          "internal"),
 "kurang_vs_oss":         ("rasio_ppu_oss",             lambda s: -s,         "eksternal"),
 "kurang_vs_pph21":       ("rasio_ppu_pph21",           lambda s: -s,         "eksternal"),
 "upah_kurang_vs_pph21":  ("rasio_upah_pph21",          lambda s: -s,         "eksternal"),
 "pekerja_tak_terdaftar": ("porsi_pekerja_ext_terdaftar",lambda s: -s,        "eksternal"),
 "pekerja_jadi_mandiri":  ("porsi_pekerja_ext_mandiri", lambda s: s,          "eksternal"),
 "jeda_daftar":           ("median_jeda_daftar",        lambda s: s,          "eksternal"),
}
def peer_z(col):
    v = col.copy()
    med = v.groupby(F.kelompok_sejenis).transform("median")
    mad = (v - med).abs().groupby(F.kelompok_sejenis).transform("median") * 1.4826
    gmad = ((v - v.median()).abs().median() * 1.4826) or 1.0
    mad = mad.where(mad > 1e-9, gmad)
    return ((v - med) / mad).clip(-5, 10)
Z = pd.DataFrame({"id_bu": F.id_bu})
for k, (c, f, src) in RISK.items():
    s = f(F[c].astype(float)).fillna(f(F[c].astype(float)).median())
    Z[k] = peer_z(s)

# ---------------- 3. Aturan berbasis regulasi/proses (transparan) ----------------
def rules(F, mode):
    R = pd.DataFrame({"id_bu": F.id_bu})
    R["R1_upah_umk"] = (F.porsi_upah_umk >= 0.70) & (Z.upah_menumpuk_umk >= 2)
    R["R2_alih_mandiri"] = F.n_ppu_ke_mandiri >= 3
    R["R3_backdate"] = F.median_jeda_input_nonaktif.fillna(0) > 14      # kewajiban lapor <= 7 hari
    R["R4_tunggakan"] = F.bln_tidak_tepat >= 4
    if mode == "lengkap":
        R["R5_kurang_pph21"] = (F.rasio_ppu_pph21 < 0.80) & ((F.jumlah_tk_pelaporan_pph21 - F.n_ppu_aktif) >= 3)
        R["R6_upah_pph21"] = F.rasio_upah_pph21 < 0.90
        R["R7_jadi_mandiri"] = F.porsi_pekerja_ext_mandiri.fillna(0) >= 0.10
        R["R8_jeda_daftar"] = F.median_jeda_daftar.fillna(0) > 60
    return R
W = {"R1_upah_umk":.5,"R2_alih_mandiri":.5,"R3_backdate":.5,"R4_tunggakan":.2,
     "R5_kurang_pph21":.6,"R6_upah_pph21":.5,"R7_jadi_mandiri":.6,"R8_jeda_daftar":.5}

def run(mode):
    # tunggakan hanya sinyal pendukung lewat aturan R4, tidak ikut deteksi anomali
    cols = [k for k,(c,f,src) in RISK.items() if (mode == "lengkap" or src == "internal") and k != "tunggakan"]
    X = Z[cols].clip(lower=0)            # hanya penyimpangan ke arah berisiko
    iso = IsolationForest(n_estimators=300, contamination="auto", random_state=2026).fit(X)
    anom = -iso.score_samples(X)
    anom_pct = pd.Series(anom).rank(pct=True).values
    R = rules(F, mode)
    rc = [c for c in R.columns if c != "id_bu"]
    rule_score = np.minimum(1, sum(R[c].astype(float) * W[c] for c in rc))
    skor = np.round(100 * (0.5 * rule_score + 0.5 * anom_pct), 1)
    return X, R, rc, skor

LABEL = kunci.set_index("id_bu").loc[F.id_bu]
y = LABEL.is_fraud.values
def evaluate(skor):
    order = np.argsort(-skor)
    out = {"AUC-ROC": roc_auc_score(y, skor), "Average Precision": average_precision_score(y, skor)}
    for n in [50, 100, 200]:
        out[f"Presisi@{n}"] = y[order[:n]].mean()
    top = order[:int(0.2*len(y))]
    out["Recall di 20% teratas"] = y[top].sum() / y.sum()
    return out

res = {}
for mode in ["internal", "lengkap"]:
    X, R, rc, skor = run(mode)
    res[mode] = dict(X=X, R=R, rc=rc, skor=skor, ev=evaluate(skor))

# ---------------- 4. Alasan (reason codes) untuk mode lengkap ----------------
TXT = {
 "upah_menumpuk_umk":    lambda r: f"{r.porsi_upah_umk:.0%} pekerja dilaporkan dengan upah ≈ UMK",
 "upah_rendah_vs_umk":   lambda r: f"Rata-rata upah dilaporkan hanya {r.rasio_upah_umk:.2f}× UMK",
 "alih_ke_mandiri":      lambda r: f"{int(r.n_ppu_ke_mandiri)} pekerja dinonaktifkan lalu terdaftar PBPU/PBI ≤60 hari",
 "backdate_nonaktif":    lambda r: f"Tanggal nonaktif rata-rata {r.median_jeda_input_nonaktif:.0f} hari sebelum diinput",
 "tunggakan":            lambda r: f"{int(r.bln_tidak_tepat)} dari 12 bulan iuran tidak tepat waktu",
 "kurang_vs_oss":        lambda r: f"PPU aktif {int(r.n_ppu_aktif)} vs estimasi {int(r.estimasi_tk_oss)} pekerja di data izin usaha",
 "kurang_vs_pph21":      lambda r: f"PPU aktif hanya {r.rasio_ppu_pph21:.0%} dari jumlah pekerja di data PPh 21",
 "selisih_pekerja":      lambda r: f"Selisih {int(r.selisih_pekerja_pph21)} pekerja antara data PPh 21 dan PPU aktif",
 "upah_kurang_vs_pph21": lambda r: f"Upah dilaporkan {r.rasio_upah_pph21:.0%} dari rata-rata penghasilan PPh 21",
 "pekerja_tak_terdaftar":lambda r: f"Hanya {r.porsi_pekerja_ext_terdaftar:.0%} pekerja (data eksternal) terdaftar PPU",
 "pekerja_jadi_mandiri": lambda r: f"{r.porsi_pekerja_ext_mandiri:.0%} pekerja aktif (data eksternal) tercatat PBPU/PBI",
 "jeda_daftar":          lambda r: f"Pekerja baru didaftarkan rata-rata {r.median_jeda_daftar:.0f} hari setelah mulai kerja",
}
MODUS = {"upah_menumpuk_umk":"Upah","upah_rendah_vs_umk":"Upah","upah_kurang_vs_pph21":"Upah",
         "alih_ke_mandiri":"Misklasifikasi","pekerja_jadi_mandiri":"Misklasifikasi",
         "backdate_nonaktif":"Mutasi","jeda_daftar":"Mutasi","tunggakan":"Tunggakan",
         "kurang_vs_oss":"PDUK","kurang_vs_pph21":"PDUK","selisih_pekerja":"PDUK","pekerja_tak_terdaftar":"PDUK"}
L = res["lengkap"]; X = L["X"]
PEER_MED = {RISK[k][0]: F[RISK[k][0]].groupby(F.kelompok_sejenis).transform('median') for k in RISK}
alasan = []
for i in range(len(F)):
    top = X.iloc[i].sort_values(ascending=False)
    top = [k for k in top.index if top[k] >= 2][:3]
    r = F.iloc[i]
    def cmp(k):
        col = RISK[k][0]; med = PEER_MED[col].iloc[i]
        if pd.isna(med): return ""
        if col.startswith("porsi") or col.startswith("rasio"): return f"; usaha sejenis: {med:.0%}" if col.startswith("porsi") or "pph21" in col else f"; usaha sejenis: {med:.2f}"
        return f"; usaha sejenis: {med:.0f}"
    alasan.append([f"{TXT[k](r)}{cmp(k)}" for k in top] + [""] * (3 - len(top)))
alasan = np.array(alasan)

out = F[["id_bu","nama_bu","kab_kota","provinsi","sektor","skala_usaha_oss"]].copy()
out["skor_radar"] = L["skor"]
out["skor_mode_internal"] = res["internal"]["skor"]
out["level"] = pd.cut(out.skor_radar, [-1, 50, 70, 101], labels=["Rendah","Sedang","Tinggi"])
out["peringkat_nasional"] = out.skor_radar.rank(ascending=False, method="first").astype(int)
out["peringkat_di_wilayah"] = out.groupby("kab_kota").skor_radar.rank(ascending=False, method="first").astype(int)
out["modus_terindikasi"] = [", ".join(sorted({MODUS[k] for k in X.iloc[i].index if X.iloc[i][k] >= 2})) for i in range(len(F))]
out["alasan_1"], out["alasan_2"], out["alasan_3"] = alasan[:,0], alasan[:,1], alasan[:,2]
out["aturan_terpicu"] = [", ".join(c for c in L["rc"] if L["R"].iloc[i][c]) for i in range(len(F))]
out = out.sort_values("skor_radar", ascending=False)

# ---------------- 5. Evaluasi per modus ----------------
N = 200
per = []
for m in ["PDUK","UNDER_UPAH","MISKLASIFIKASI","MUTASI"]:
    ids = set(kunci[kunci["flag_"+m.lower()] == 1].id_bu)
    row = dict(modus=m, jumlah_bu_fraud=len(ids))
    for mode in ["internal","lengkap"]:
        sk = pd.Series(np.asarray(res[mode]["skor"]), index=F.id_bu.values).sort_values(ascending=False)
        row[f"recall_top{N}_{mode}"] = len(ids & set(sk.index[:N])) / len(ids)
    per.append(row)
per = pd.DataFrame(per)
ev = pd.DataFrame({"Metrik": list(res["internal"]["ev"]),
                   "Mode internal saja": list(res["internal"]["ev"].values()),
                   "Mode internal + eksternal": list(res["lengkap"]["ev"].values())})
ev.loc[len(ev)] = ["Baseline acak (proporsi fraud)", y.mean(), y.mean()]

if __name__ == "__main__":
    pd.set_option("display.width", 200)
    print(ev.round(3).to_string(index=False)); print(per.round(3).to_string(index=False))
    print(out.head(5)[["id_bu","skor_radar","level","modus_terindikasi","alasan_1"]].to_string(index=False))
    print(out.level.value_counts())
    F.to_pickle("fitur.pkl"); out.to_pickle("skor.pkl"); ev.to_pickle("ev.pkl"); per.to_pickle("per.pkl")
