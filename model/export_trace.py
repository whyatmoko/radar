"""Export jejak hitungan seluruh PKBU tanpa menggunakan label sebagai fitur AI."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

def export_trace(M, root):
    specs = [
        ('R1_upah_umk', 'Upah dekat UMK', 'Proporsi ≥70% dan robust z ≥2', .5),
        ('R2_alih_mandiri', 'Alih segmen', '≥3 TK alih PPU ke PBPU/PBI dalam ≤60 hari', .5),
        ('R3_backdate', 'Input nonaktif', 'Median jeda input >14 hari', .5),
        ('R4_tunggakan', 'Iuran', '≥4 bulan iuran tidak tepat waktu', .2),
        ('R5_kurang_pph21', 'Jumlah pekerja', 'PPU/PPh 21 <80% dan selisih ≥3 TK', .6),
        ('R6_upah_pph21', 'Upah', 'Rata-rata upah/PPh 21 <90%', .5),
        ('R7_jadi_mandiri', 'Status pekerja', '≥10% pekerja aktif eksternal PBPU/PBI tanpa PPU', .6),
        ('R8_jeda_daftar', 'Pendaftaran', 'Median jeda pendaftaran >60 hari', .5),
    ]
    def number(v):
        return None if pd.isna(v) else float(v)
    modes = {}
    for mode, result in M.res.items():
        iso = IsolationForest(n_estimators=300, contamination='auto', random_state=2026).fit(result['X'])
        anom = -iso.score_samples(result['X'])
        pct = pd.Series(anom).rank(pct=True).values
        modes[mode] = (anom, pct)
    labels = M.kunci.set_index('id_bu')
    medians = {k: M.F[c].groupby(M.F.kelompok_sejenis).transform('median') for k, (c, _, _) in M.RISK.items()}
    rows = []
    for i, f in M.F.iterrows():
        item = dict(id=f.id_bu, name=f.nama_bu, region=f.kab_kota, sector=f.sektor, scale=f.skala_usaha_oss,
                    peer=f.kelompok_sejenis, peerCount=int((M.F.kelompok_sejenis == f.kelompok_sejenis).sum()),
                    raw={c: number(f[c]) for c in ['n_ppu_aktif','umk_ilustratif','rata_upah_lapor','jumlah_tk_pelaporan_pph21','rata2_penghasilan_bruto_pph21','estimasi_tk_oss','n_ppu_ke_mandiri','selisih_pekerja_pph21']},
                    indicators=[dict(key=k, value=number(f[c]), median=number(medians[k].loc[i]), z=number(M.Z.loc[i,k]), source=src) for k,(c,_,src) in M.RISK.items()],
                    truth=dict(flag=int(labels.loc[f.id_bu,'is_fraud']), label=str(labels.loc[f.id_bu,'jenis_fraud'])), modes={})
        for mode, result in M.res.items():
            rules = [dict(code=code, name=name, condition=condition, weight=weight,
                          enabled=code in result['rc'], active=bool(result['R'].loc[i,code]) if code in result['rc'] else False)
                     for code,name,condition,weight in specs]
            total = sum(r['weight'] for r in rules if r['active'])
            ai, pct = modes[mode]
            item['modes'][mode] = dict(rules=rules, total=total, rule=min(1,total), anomaly=float(ai[i]), percentile=float(pct[i]),
                                       score=float(result['skor'][i]), features=len(result['X'].columns))
        rows.append(item)
    target = Path(root) / 'data/hasil/jejak_semua_pkbu.json'
    target.write_text(json.dumps(dict(rows=rows),ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8')
    return target

if __name__ == '__main__':
    import os
    root = Path(__file__).resolve().parent.parent
    os.chdir(root / 'data')
    import radar_model as M
    print(export_trace(M, root))
