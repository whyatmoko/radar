# RADAR · Prototype

**Risk-based Alert for Detecting Anomalous Reporting**
Tim SMILE · Healthkathon 2026 · Kategori Efisiensi Risiko pada Pemberi Kerja

> Dari pemeriksaan acak menjadi pemeriksaan tepat sasaran.

> ⚠️ **Seluruh data di repositori ini sintetis (fiktif).** Data dibuat oleh skrip dengan seed 2026 dan tidak berasal dari data peserta JKN atau perusahaan mana pun. UMK yang dipakai bersifat ilustratif.

## Isi situs

| Halaman | Isi |
|---|---|
| `index.html` | **Dasbor RADAR**: radar risiko 1.200 badan usaha, filter wilayah/modus, antrean Tinggi–Sedang–Rendah, pop-up alasan, tindak lanjut + action plan, log harian, unduh CSV |
| `jejak.html` | **Jejak Skor**: 7 tahap dari data sintetis → 11 indikator → pembanding usaha sejenis → 8 aturan → AI (Isolation Forest) → skor & level → uji dengan kunci jawaban |
| `data.html` | **Data sintetis**: 8 tabel CSV dengan pratinjau, hasil model, versi Excel |

Tindak lanjut dan log harian di dasbor disimpan di **localStorage browser** masing-masing pengguna. Data itu tidak dikirim ke server mana pun.

## Struktur folder

```
index.html, jejak.html, data.html   halaman situs (hasil build, jangan diedit langsung)
.nojekyll                           agar GitHub Pages menyajikan file apa adanya
data/csv/                           8 tabel data sintetis
data/hasil/                         skor, indikator, dan evaluasi model
data/*.xlsx                         versi Excel (seed 2026)
model/generate_data_sintetis.py     generator data sintetis
model/radar_model.py                indikator, pembanding, aturan R1–R8, Isolation Forest, skor
model/build_web.py                  menjalankan semuanya dan menulis ulang ketiga halaman
templates/                          kerangka HTML halaman (edit tampilan di sini)
```

## Menerbitkan di GitHub Pages

1. Buat repositori **public** baru di GitHub, misalnya `radar-healthkathon`.
2. Unggah **seluruh isi** folder ini ke root repositori (Add file → Upload files, atau `git push`). Pastikan `index.html` dan `.nojekyll` ada di root.
3. Buka **Settings → Pages**. Di *Build and deployment*, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
4. Tunggu 1–2 menit. Situs tersedia di `https://<username>.github.io/radar-healthkathon/`.

Tautan untuk slide dan form panitia:
- Prototype: `https://<username>.github.io/radar-healthkathon/`
- Repositori: `https://github.com/<username>/radar-healthkathon`

## Membangun ulang data dan situs

Perlu Python 3.10+.

```bash
pip install -r model/requirements.txt
python model/build_web.py
```

Perintah ini menjalankan ulang generator data, model, dan ekspor hasil, lalu menulis ulang `index.html`, `jejak.html`, dan `data.html`. Karena seed tetap (2026), hasilnya selalu sama sampai skrip diubah.

Yang biasanya diubah:
- **UMK**: daftar `WILAYAH` di `model/generate_data_sintetis.py`.
- **Ambang dan bobot aturan**: fungsi `rules()` dan `W` di `model/radar_model.py`.
- **Batas level** (Tinggi > 70, Sedang 50–70): `pd.cut` di `model/radar_model.py`, plus fungsi `lvOf` di `templates/dashboard.template.html`.

Setelah build ulang, commit dan push. GitHub Pages akan memperbarui situs otomatis. File Excel di `data/` tidak ikut dibangun ulang.

## Metode singkat

- **Pembanding usaha sejenis:** robust z = (nilai − median kelompok) ÷ (MAD × 1,4826), per sektor × skala × provinsi, dipotong −5..10, hanya ke arah berisiko.
- **Aturan:** R1–R8 berbobot, skor aturan = min(1, Σ bobot).
- **AI:** Isolation Forest (300 pohon, random_state 2026) pada 10 indikator, tanpa label → persentil anomali.
- **Skor:** 100 × (0,5 × skor aturan + 0,5 × persentil AI). Rendah ≤ 50 · Sedang 50–70 · Tinggi > 70.
- **Evaluasi:** kunci jawaban (`99_kunci_jawaban.csv`) hanya dipakai di akhir. Hasilnya presisi 200 teratas 91,5% vs acak 17,7%, dengan AUC 0,971. Karena datanya sintetis, angka ini dianggap batas atas.

## Pembaruan melalui halaman Data sintetis

Jalankan `node server.cjs`, lalu buka http://127.0.0.1:8781/data.html.

- **Simulasikan snapshot data baru** menjalankan generator dengan seed pilihan, dilanjutkan indikator, scoring, evaluasi, dan build halaman. Seed 2026 mereproduksi data awal; seed berbeda menghasilkan populasi sintetis berbeda, bukan pembaruan transaksi perusahaan yang sama.
- **Hitung ulang dari CSV yang tersedia** membaca delapan tabel `data/csv` tanpa menjalankan generator. Perbarui tabel-tabel tersebut secara konsisten sebelum menjalankannya. Kunci jawaban harus cocok untuk evaluasi. Nilai kebenaran upah/TK aktif tidak tersedia pada Jejak Skor dalam mode ini.
- Periode observasi tetap Oktober 2025–September 2026. Waktu pembaruan adalah waktu snapshot diproses, bukan periode observasi baru atau sinkronisasi data nyata.
- Proses berjalan di `.runs/<versi>/stage`, dengan cadangan hasil aktif di `.runs/<versi>/backup`. Hasil baru disalin setelah build sukses. Proses yang gagal tidak memublikasikan hasil build sebagian.
- Metadata ada di `data/update-meta.json`. CSV, skor, dan halaman diperbarui; Excel tetap arsip awal. Action plan browser tetap tersimpan dan perlu ditinjau jika mengganti populasi sintetis.

Server memakai Python runtime Codex secara default. Untuk Python lain, set `RADAR_PYTHON` ke executable yang memiliki dependensi `model/requirements.txt`. Paket lokal tambahan berada di `.runtime-packages`. Fitur pembaruan memerlukan server Node ini dan tidak berjalan di GitHub Pages/hosting statis.
