"""
Generator Data Sintetis - Healthkathon 2026
Kategori: Efisiensi Risiko pada Pemberi Kerja
Seluruh data FIKTIF (dummy). Tidak berasal dari data peserta JKN riil.
Periode observasi: Okt 2025 - Sep 2026 (12 bulan)
"""
import numpy as np, pandas as pd, random
from datetime import date, timedelta

SEED = 2026
rng = np.random.default_rng(SEED); random.seed(SEED)
N_BU = 1200
P_START, P_END = date(2025, 10, 1), date(2026, 9, 30)
BATAS_UPAH = 12_000_000   # batas atas upah perhitungan iuran PPU BU
TARIF = 0.05              # 4% pemberi kerja + 1% pekerja

# UMK ILUSTRATIF (kisaran UMK 2025) -> ganti dengan UMK 2026 resmi sebelum dipakai di slide
WILAYAH = [
 ("Kota Semarang","Jawa Tengah",3_454_000),("Kab. Kendal","Jawa Tengah",2_830_000),
 ("Kab. Demak","Jawa Tengah",2_938_000),("Kab. Kudus","Jawa Tengah",2_680_000),
 ("Kab. Jepara","Jawa Tengah",2_610_000),("Kota Surakarta","Jawa Tengah",2_416_000),
 ("Kab. Klaten","Jawa Tengah",2_389_000),("Kab. Banyumas","Jawa Tengah",2_338_000),
 ("Kab. Cilacap","Jawa Tengah",2_697_000),("Kota Yogyakarta","DI Yogyakarta",2_655_000),
 ("Kab. Sleman","DI Yogyakarta",2_466_000),("Kab. Bantul","DI Yogyakarta",2_360_000)]
SEKTOR = {  # (bobot, multiplier upah rata-rata thd UMK)
 "Industri Pengolahan":(0.28,1.25),"Perdagangan":(0.22,1.10),"Konstruksi":(0.10,1.20),
 "Akomodasi & Makan Minum":(0.12,1.05),"Transportasi & Pergudangan":(0.08,1.30),
 "Jasa Perusahaan":(0.12,1.45),"Pertanian & Perkebunan":(0.08,1.00)}
KATA = ["Maju","Jaya","Sentosa","Abadi","Makmur","Sejahtera","Mandiri","Karya","Sumber",
        "Mulia","Bersama","Indah","Perkasa","Lestari","Utama","Prima","Agung","Tekstil",
        "Garmen","Logam","Kayu","Pangan","Niaga","Bangun","Nusantara","Sinar","Harapan"]

def rdate(a, b):
    return a + timedelta(days=int(rng.integers(0, (b - a).days + 1)))
def r1000(x): return int(round(x / 1000.0) * 1000)
def clip_d(d): return min(d, P_END)

# ---------- 1. Badan usaha + label ----------
bu_rows, label_rows = [], []
sektor_nama = list(SEKTOR); sektor_w = [SEKTOR[s][0] for s in sektor_nama]
JENIS = ["PDUK","UNDER_UPAH","MISKLASIFIKASI","MUTASI"]; JW = [0.35,0.30,0.20,0.15]
for i in range(N_BU):
    id_bu = f"BU{i+1:05d}"
    wil = WILAYAH[rng.integers(len(WILAYAH))]
    sek = rng.choice(sektor_nama, p=sektor_w)
    sk = rng.choice(["Kecil","Menengah","Besar"], p=[0.50,0.42,0.08])
    H = int(rng.integers(5,20)) if sk=="Kecil" else int(rng.integers(20,100)) if sk=="Menengah" else int(rng.integers(100,301))
    fraud = rng.random() < 0.18
    jenis = []
    if fraud:
        jenis = [rng.choice(JENIS, p=JW)]
        if rng.random() < 0.20:
            j2 = rng.choice([j for j in JENIS if j != jenis[0]]); jenis.append(j2)
    tunggak = rng.random() < (0.35 if fraud else 0.12)
    est_oss = max(1, int(round(H * rng.lognormal(0, 0.25))))
    sk_oss = "Kecil" if est_oss < 20 else "Menengah" if est_oss < 100 else "Besar"
    bentuk = "PT" if (sk != "Kecil" or rng.random() < 0.4) else "CV"
    nama = f"{bentuk} {random.choice(KATA)} {random.choice(KATA)} {random.choice(KATA)}"
    bu_rows.append(dict(id_bu=id_bu, nama_bu=nama, bentuk_usaha=bentuk, sektor=sek,
        kab_kota=wil[0], provinsi=wil[1], tgl_daftar_jkn=rdate(date(2014,1,1), date(2024,12,31)),
        skala_usaha_oss=sk_oss, estimasi_tk_oss=est_oss))
    label_rows.append(dict(id_bu=id_bu, is_fraud=int(fraud), jenis_fraud="|".join(jenis) if jenis else "NORMAL",
        pola_tunggakan=int(tunggak), jumlah_tk_riil=H, _umk=wil[2], _mult=SEKTOR[sek][1], _skala=sk,
        _intensitas=float(rng.uniform(0.35,0.70)) if "PDUK" in jenis else None))

bu_lookup = {b["id_bu"]: b for b in bu_rows}

# ---------- 2. Pekerja (kebenaran riil) ----------
peserta_rows, ext_rows, mutasi_rows = [], [], []
nik_used = set()
def new_nik():
    while True:
        n = "S" + "".join(str(x) for x in rng.integers(0,10,12))
        if n not in nik_used: nik_used.add(n); return n

pid = 0; mid = 0
truth_rows = []
for lab in label_rows:
    id_bu, H, umk, mult, sk = lab["id_bu"], lab["jumlah_tk_riil"], lab["_umk"], lab["_mult"], lab["_skala"]
    jenis = lab["jenis_fraud"].split("|")
    p_umk_legit = {"Kecil":0.40,"Menengah":0.20,"Besar":0.10}[sk]
    # proporsi pekerja terdampak per jenis
    p_pduk = lab["_intensitas"] if "PDUK" in jenis else 0.02
    p_under = float(rng.uniform(0.60,0.95)) if "UNDER_UPAH" in jenis else 0.0
    p_miskl = float(rng.uniform(0.30,0.60)) if "MISKLASIFIKASI" in jenis else 0.0
    mutasi_fraud = "MUTASI" in jenis
    for _ in range(H):
        nik = new_nik()
        start = rdate(date(2018,1,1), date(2025,9,30)) if rng.random() < 0.85 else rdate(P_START, date(2026,8,31))
        end = rdate(max(start+timedelta(days=30), P_START), P_END) if rng.random() < 0.12 else None
        if end and end <= start: end = None
        # upah riil
        if rng.random() < p_umk_legit: riil = umk * rng.uniform(1.0, 1.03)
        else: riil = max(umk, umk * mult * rng.lognormal(0, 0.30))
        riil = r1000(riil)
        # upah dilaporkan
        if rng.random() < p_under and riil > umk * 1.05: lapor = r1000(umk * rng.uniform(1.0,1.03))
        elif rng.random() < 0.03: lapor = r1000(riil * rng.uniform(0.85,0.98))
        else: lapor = riil
        truth_rows.append(dict(id_bu=id_bu, upah_riil=riil, start=start, end=end))
        # jeda pendaftaran
        lag = int(rng.integers(60,201)) if mutasi_fraud else (int(rng.integers(0,31)) if rng.random()<0.95 else int(rng.integers(31,61)))
        reg = start + timedelta(days=lag)
        # sumber eksternal (cakupan 90%)
        if rng.random() < 0.90:
            ext_rows.append(dict(nik_samaran=nik, id_bu=id_bu,
                tgl_mulai_kerja=start + timedelta(days=int(rng.integers(-5,6))) if rng.random()<0.05 else start,
                tgl_selesai_kerja=end))
        def add_peserta(segmen, bu, mulai, nonaktif, upah, status):
            global pid
            pid += 1
            peserta_rows.append(dict(id_peserta=f"P{pid:07d}", nik_samaran=nik, segmen=segmen, id_bu=bu,
                kab_kota=bu_lookup[id_bu]["kab_kota"], tgl_mulai_segmen=mulai,
                tgl_nonaktif=nonaktif, upah_dilaporkan=upah, status_hubungan_kerja_dilaporkan=status))
        def add_mutasi(jenis_m, efektif, inp):
            global mid
            if P_START <= inp <= P_END:
                mid += 1
                mutasi_rows.append(dict(id_mutasi=f"M{mid:07d}", nik_samaran=nik, id_bu=id_bu,
                    jenis_mutasi=jenis_m, tgl_efektif=efektif, tgl_input=inp))
        def non_ppu_segment():
            u = rng.random()
            if u < 0.40: return "PBPU"
            if u < 0.65: return "PBI"
            return None
        r = rng.random()
        if r < p_miskl:
            # misklasifikasi: dikeluarkan dari PPU / didorong jadi PBPU padahal masih bekerja
            if rng.random() < 0.5 and start < P_START:
                d_off = rdate(P_START, date(2026,8,31))
                add_peserta("PPU", id_bu, reg, d_off, lapor, rng.choice(["Tetap","Kontrak"]))
                add_mutasi("NONAKTIF", d_off, d_off + timedelta(days=int(rng.integers(0,11))))
                pb = d_off + timedelta(days=int(rng.integers(0,31)))
                add_peserta("PBPU", None, clip_d(pb), None, None, None)
            else:
                pb = start + timedelta(days=int(rng.integers(0,61)))
                if pb <= P_END: add_peserta("PBPU", None, pb, None, None, None)
            continue
        if r < p_miskl + p_pduk * (1 - p_miskl):
            seg = non_ppu_segment()   # PDUK / tidak didaftarkan
            if seg: add_peserta(seg, None, rdate(date(2016,1,1), P_END), None, None, None)
            continue
        if reg > P_END: continue       # belum sempat didaftarkan
        # terdaftar PPU di BU ini
        nonaktif, tgl_in = None, None
        if end:
            if mutasi_fraud and rng.random() < 0.70:
                nonaktif = max(reg, end - timedelta(days=int(rng.integers(20,91))))  # backdate
            else:
                nonaktif = end
            tgl_in = end + timedelta(days=int(rng.integers(0,21)))
        status = rng.choice(["Tetap","Kontrak"], p=[0.55,0.45])
        add_peserta("PPU", id_bu, reg, nonaktif, lapor, status)
        add_mutasi("DAFTAR_BARU", reg, reg + timedelta(days=int(rng.integers(0,4))))
        if nonaktif: add_mutasi("NONAKTIF", nonaktif, tgl_in)

# ---------- 3. Ringkasan eksternal per BU (simulasi pelaporan pajak PPh 21) ----------
ext = pd.DataFrame(ext_rows)
pes = pd.DataFrame(peserta_rows)
mut = pd.DataFrame(mutasi_rows)
# upah riil tidak disimpan per pekerja di tabel yang terlihat; simpan sementara utk agregat

tr = pd.DataFrame(truth_rows)
aktif_akhir = tr[(tr.start <= P_END) & (tr.end.isna())]
agg = aktif_akhir.groupby("id_bu").agg(n=("upah_riil","size"), rata=("upah_riil","mean")).reset_index()
pajak = []
for _, a in agg.iterrows():
    pajak.append(dict(id_bu=a.id_bu, periode_pelaporan="2026-09",
        jumlah_tk_pelaporan_pph21=max(1,int(round(a.n * rng.uniform(0.95,1.05)))),
        rata2_penghasilan_bruto_pph21=r1000(a.rata * rng.uniform(0.95,1.05))))
pajak = pd.DataFrame(pajak)

# ---------- 4. Iuran bulanan ----------
bulan = pd.date_range("2025-10-01", "2026-09-01", freq="MS").date
ppu = pes[pes.segmen == "PPU"].copy()
lab = pd.DataFrame(label_rows).set_index("id_bu")
iur = []
for id_bu, g in ppu.groupby("id_bu"):
    tunggak = lab.loc[id_bu, "pola_tunggakan"] == 1
    for m in bulan:
        m_end = (pd.Timestamp(m) + pd.offsets.MonthEnd(0)).date()
        akt = g[(g.tgl_mulai_segmen <= m_end) & (g.tgl_nonaktif.isna() | (g.tgl_nonaktif > m))]
        if len(akt) == 0: continue
        tot = int(akt.upah_dilaporkan.clip(upper=BATAS_UPAH).sum())
        tag = int(round(tot * TARIF))
        jt = date(m.year, m.month, 10)
        if tunggak and rng.random() < 0.15 and m >= date(2026,5,1):
            tb, tl, st = None, None, "BELUM BAYAR"
        elif tunggak and rng.random() < 0.55:
            tb = jt + timedelta(days=int(rng.integers(11,91))); st = "TERLAMBAT"
        elif rng.random() < 0.05:
            tb = jt + timedelta(days=int(rng.integers(1,11))); st = "TERLAMBAT"
        else:
            tb = date(m.year, m.month, int(rng.integers(1,11))); st = "TEPAT WAKTU"
        if tb and tb > date(2026,10,10): tb, st = None, "BELUM BAYAR"
        tl = (tb - jt).days if tb and tb > jt else (0 if tb else None)
        iur.append(dict(id_bu=id_bu, periode=m.strftime("%Y-%m"), jumlah_tk_ditagih=len(akt),
            total_upah_dilaporkan=tot, iuran_tagihan=tag, iuran_pemberi_kerja_4pct=int(round(tot*0.04)),
            iuran_pekerja_1pct=int(round(tot*0.01)), tgl_jatuh_tempo=jt, tgl_bayar=tb,
            hari_terlambat=tl, status_bayar=st))
iur = pd.DataFrame(iur)

# ---------- 5. Finalisasi tabel ----------
bu = pd.DataFrame(bu_rows)
wil = pd.DataFrame(WILAYAH, columns=["kab_kota","provinsi","umk_ilustratif"])
kunci = pd.DataFrame(label_rows)[["id_bu","is_fraud","jenis_fraud","pola_tunggakan","jumlah_tk_riil"]]
for c in ["PDUK","UNDER_UPAH","MISKLASIFIKASI","MUTASI"]:
    kunci["flag_"+c.lower()] = kunci.jenis_fraud.str.contains(c).astype(int)
pes = pes.sort_values(["id_bu","nik_samaran"], na_position="last").reset_index(drop=True)
ext = ext.rename(columns={}).sort_values(["id_bu","nik_samaran"]).reset_index(drop=True)
mut = mut.sort_values("tgl_input").reset_index(drop=True)

TABLES = {"01_ref_wilayah":wil, "02_badan_usaha":bu, "03_peserta":pes, "04_mutasi":mut,
          "05_iuran_bulanan":iur, "06_ext_hubungan_kerja":ext, "07_ext_pph21_bu":pajak,
          "99_kunci_jawaban":kunci}
if __name__ == "__main__":
    import os
    os.makedirs("csv", exist_ok=True)
    for k, v in TABLES.items():
        v.to_csv(f"csv/{k}.csv", index=False)
    for k, v in TABLES.items(): print(k, v.shape)
