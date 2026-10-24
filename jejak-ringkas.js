(() => {
  const $ = id => document.getElementById(id), esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(x,d=0)=>x==null?'–':Number(x).toLocaleString('id-ID',{maximumFractionDigits:d,minimumFractionDigits:d}), pct=x=>x==null?'–':fmt(x*100,2)+'%', money=x=>'Rp'+fmt(x);
  const names=['Proporsi upah ≤103% UMK','Rata-rata upah / UMK','Proporsi alih PPU ke PBPU/PBI','Median jeda input nonaktif','Bulan iuran tidak tepat waktu','PPU aktif / estimasi TK OSS','PPU aktif / jumlah TK PPh 21','Rata-rata upah / penghasilan PPh 21','Pekerja aktif eksternal terdaftar PPU','Pekerja aktif eksternal PBPU/PBI tanpa PPU','Median jeda pendaftaran'];
  let data=[], current=null, step=0, timer=null;
  let resultGroups = {};
  const groupTitles = ["1. Data perusahaan", "2. Indikator dan pembanding", "3A. Aturan R1–R8", "3B. Isolation Forest", "4. Skor prioritas", "5. Uji kunci jawaban", "6. Hasil untuk petugas"];
  const selectedMode=()=>$('sourceMode').value, state=()=>current.modes[selectedMode()], level=s=>s>70?'Tinggi':s>50?'Sedang':'Rendah';
  const value=(i,v)=>[0,2,5,6,7,8,9].includes(i)?pct(v):[3,10].includes(i)?fmt(v,1)+' hari':i===4?fmt(v)+' bulan':fmt(v,2)+' ×';
  const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
  function stop(){clearInterval(timer);timer=null;$('play').textContent='Jalankan otomatis';}
  function calculation(r){const f=current.raw,I=current.indicators;return [pct(I[0].value)+' ≥70% dan z '+fmt(I[0].z,2)+' ≥2',fmt(f.n_ppu_ke_mandiri)+' TK ≥3 TK',value(3,I[3].value)+' >14 hari',value(4,I[4].value)+' ≥4 bulan',fmt(f.n_ppu_aktif)+' ÷ '+fmt(f.jumlah_tk_pelaporan_pph21)+' = '+pct(I[6].value)+' <80%; selisih '+fmt(f.selisih_pekerja_pph21)+' ≥3',money(f.rata_upah_lapor)+' ÷ '+money(f.rata2_penghasilan_bruto_pph21)+' = '+pct(I[7].value)+' <90%',pct(I[9].value)+' ≥10%',value(10,I[10].value)+' >60 hari'][r];}
  function show(s){
    if(!current)return;step=s;const m=state(),f=current.raw,L=level(m.score);
    document.querySelectorAll('[data-stage]').forEach(b=>{const n=Number(b.dataset.stage);b.classList.toggle('active',n===step);b.classList.toggle('complete',n<step);b.classList.toggle('pending',n>step);b.classList.toggle('loading',n>step);b.setAttribute('aria-busy',String(n>step));b.setAttribute('aria-current',n===step?'step':'false');});
    $('prev').disabled=step===0;$('next').disabled=step===6;
    $('dataValue').textContent=fmt(f.n_ppu_aktif)+' PPU';$('indicatorValue').textContent=step>=1?'11':'–';$('rulesValue').textContent=step>=2?m.rules.filter(r=>r.active).length+' aturan aktif':'–';$('aiValue').textContent=step>=3?fmt(m.percentile,4):'–';$('scoreValue').textContent=step>=4?fmt(m.score,1):'–';$('officerValue').textContent=step>=6?L:'Menunggu';
    const checkValue = document.querySelector('[data-stage="5"] .value');
    checkValue.textContent = step>=5 ? (current.truth.flag ? 'Berlabel kasus' : 'Berlabel normal') : '–';
    $('runStatus').textContent='Langkah '+(step+1)+' dari 7 · '+['Data perusahaan','Indikator dan pembanding','Aturan berbobot','Isolation Forest','Perhitungan skor','Uji kunci jawaban','Hasil untuk petugas'][step];
    let h='';
    if(step===0)h='<h2>1. Data perusahaan</h2><p>'+esc(current.name)+' · '+esc(current.region)+'</p><div class="facts">'+[['PPU aktif',fmt(f.n_ppu_aktif)],['TK PPh 21',fmt(f.jumlah_tk_pelaporan_pph21)],['Estimasi TK OSS',fmt(f.estimasi_tk_oss)],['Upah dilaporkan',money(f.rata_upah_lapor)],['Penghasilan PPh 21',money(f.rata2_penghasilan_bruto_pph21)],['UMK ilustratif',money(f.umk_ilustratif)]].map(([k,v])=>'<div class="fact"><b>'+v+'</b><span>'+k+'</span></div>').join('')+'</div><p class="note">Sumber data sintetis: kepesertaan, mutasi, iuran, hubungan kerja eksternal, PPh 21, serta estimasi OSS. Label kunci jawaban belum digunakan pada tahap scoring.</p>';
    if(step===1)h='<h2>2. Hitung 11 indikator dan bandingkan usaha sejenis</h2><p>Kelompok: '+esc(current.peer)+' · '+current.peerCount+' perusahaan.</p>'+table(['Indikator','Perusahaan ini','Median sejenis','Robust z','Masuk AI?'],current.indicators.map((v,i)=>{const used=i!==4&&(selectedMode()==='lengkap'||v.source==='internal');return '<tr><td>'+(i+1)+'. '+names[i]+'</td><td>'+value(i,v.value)+'</td><td>'+value(i,v.median)+'</td><td>'+fmt(v.z,2)+'</td><td>'+(used?'Ya':'Tidak')+'</td></tr>';}))+'<p class="note">Arah indikator disesuaikan ke risiko. Robust z memakai median dan MAD, dibatasi −5 hingga 10. AI menerima nilai z positif saja. Nilai kosong diimputasi median sebelum normalisasi. Iuran tetap dinilai melalui R4.</p>';
    if(step===2)h='<h2>3A. Periksa aturan R1–R8</h2>'+table(['Aturan','Syarat','Angka perusahaan / pemeriksaan','Status','Bobot masuk'],m.rules.map((r,i)=>'<tr class="'+(r.active?'hit':!r.enabled?'off':'')+'"><td><b>R'+(i+1)+'</b> '+esc(r.name)+'</td><td>'+esc(r.condition)+'</td><td>'+calculation(i)+'</td><td>'+(!r.enabled?'Tidak dipakai di mode internal':r.active?'Terpicu':'Tidak terpicu')+'</td><td>'+fmt(r.active?r.weight:0,1)+'</td></tr>'))+'<div class="formula">'+m.rules.map(r=>fmt(r.active?r.weight:0,1)).join(' + ')+' = '+fmt(m.total,1)+'<br>Skor aturan = min(1; '+fmt(m.total,1)+') = <b>'+fmt(m.rule,1)+'</b></div><p class="note">Kolom pemeriksaan menampilkan perbandingan terhadap ambang; status menentukan apakah syarat benar-benar terpenuhi. Ambang dan bobot merupakan parameter prototype.</p>';
    if(step===3)h='<h2>3B. Isolation Forest membaca gabungan pola</h2><p>'+m.features+' indikator AI · 300 pohon · tanpa label kasus. Pola yang lebih cepat terisolasi memiliki nilai anomali lebih tinggi.</p><div class="facts"><div class="fact"><b>'+fmt(m.anomaly,6)+'</b><span>Nilai anomali mentah (−score_samples)</span></div><div class="fact"><b>'+fmt(m.percentile,6)+'</b><span>Persentil dalam seluruh dataset</span></div></div><div class="tree-path" aria-hidden="true">'+Array.from({length:20},(_,i)=>'<i class="'+(i/20<m.percentile?'on':'')+'"></i>').join('')+'</div><p>Persentil '+pct(m.percentile)+' menunjukkan posisi keanehan relatif. Ini bukan probabilitas pelanggaran.</p><p class="note">Animasi memperagakan hasil model tersimpan; halaman tidak melatih pohon secara langsung. Persentil berasal dari seluruh snapshot, bukan hanya hasil pencarian PKBU.</p>';
    if(step===4)h='<h2>4. Gabungkan skor aturan dan AI</h2><div class="formula">100 × (0,5 × '+fmt(m.rule,4)+' + 0,5 × '+fmt(m.percentile,6)+')<br>= '+fmt(50*m.rule,4)+' + '+fmt(50*m.percentile,4)+'<br>Skor setelah pembulatan = <b>'+fmt(m.score,1)+'</b></div><p class="level '+L+'">Risiko '+L+'</p><p>Rendah ≤50 · Sedang >50–70 · Tinggi >70</p>';
    if(step===5){const priority=L!=='Rendah',truth=!!current.truth.flag;h='<h2>5. Uji dengan kunci jawaban sintetis</h2><div class="facts"><div class="fact"><b>'+L+'</b><span>Kategori hasil model</span></div><div class="fact"><b>'+esc(current.truth.label)+'</b><span>Label yang disisipkan generator</span></div></div><p><b>'+(priority?(truth?'Prioritas ini sesuai label sintetis.':'Alarm pada perusahaan berlabel normal. Perlu verifikasi petugas.'):(truth?'Kasus berlabel bermasalah masih berada di kategori rendah.':'Perusahaan berlabel normal berada di kategori rendah.'))+'</b></p><p class="note">Perbandingan ini memakai Sedang/Tinggi sebagai prioritas untuk ilustrasi, bukan metrik Presisi@200. Label tidak masuk fitur AI atau rumus scoring, dan bukan bukti pemeriksaan nyata. Kategori rendah tetap dapat memuat sinyal iuran pendukung.</p>';}
    if(step===6){const active=m.rules.filter(r=>r.active);h='<h2>6. Ringkasan yang diterima petugas</h2><p><b>'+esc(current.id)+' · '+esc(current.name)+'</b></p><div class="level '+L+'">'+fmt(m.score,1)+' · Risiko '+L+'</div><p>'+(L==='Tinggi'?'Prioritaskan verifikasi mendalam.':L==='Sedang'?'Verifikasi data dan klarifikasi awal.':'Pemantauan rutin; tinjau sinyal pendukung bila ada.')+'</p><h3>Alasan berbasis aturan</h3>'+(active.length?'<ul>'+active.map(r=>'<li>'+esc(r.name)+': '+esc(r.condition)+'</li>').join('')+'</ul>':'<p>Tidak ada aturan terpicu. Skor tetap memperhitungkan keanehan pola AI.</p>')+'<div class="result-links"><a href="index.html?pkbu='+encodeURIComponent(current.id)+'">Buka popup PKBU di dasbor</a><a href="tindak-lanjut.html">Tindak lanjut</a><a href="log-harian.html">Log harian</a></div><p class="note">Aturan yang terpicu membantu menjelaskan indikasi, bukan kontribusi individual setiap fitur terhadap AI. Petugas menetapkan tindakan setelah memeriksa bukti; halaman ini tidak otomatis membuat action plan.</p>';}
    const expanded = new Set([...$('stepDetail').querySelectorAll('details[open]')].map(el => Number(el.dataset.group)));
    resultGroups[step] = h.replace(/^<h2>[\s\S]*?<\/h2>/, '');
    $('stepDetail').innerHTML = groupTitles.map((title, i) => '<details class="result-group" data-group="'+i+'" '+(expanded.has(i)?'open':'')+'><summary>'+title+'</summary><div class="result-group-body">'+(resultGroups[i] || '')+'</div></details>').join('');
    $('stepDetail').querySelectorAll('.result-group summary').forEach(summary => summary.addEventListener('click', event => {
      const group = summary.parentElement, n = Number(group.dataset.group);
      if (!resultGroups[n]) { event.preventDefault(); stop(); show(n); const target = $('stepDetail').querySelector('[data-group="'+n+'"]'); if(target)target.open=true; }
    }));
  }
  function choose(){stop();resultGroups={};$("stepDetail").innerHTML="";current=data.find(r=>r.id===$('company').value);if(!current){clearSelection('Pilih PKBU untuk memulai.');return;}['play','prev','next','reset'].forEach(id=>$(id).disabled=false);$('companyMeta').textContent=current.id+' · '+current.name+' · '+current.sector+' · '+current.scale+' · '+current.region;show(0);}
  function clearSelection(message){
    stop();current=null;step=0;resultGroups={};
    $('company').innerHTML='<option value="">Pilih PKBU</option>';
    $('companyMeta').textContent='';$('stepDetail').innerHTML='';
    $('runStatus').textContent=message;
    document.querySelectorAll('[data-stage]').forEach(b=>{b.classList.remove('loading','active','complete','pending');b.setAttribute('aria-busy','false');b.setAttribute('aria-current','false');});
    document.querySelectorAll('[data-stage] .value').forEach(e=>e.textContent='–');
    ['play','prev','next','reset'].forEach(id=>$(id).disabled=true);
  }
  function options(){
    const q=$('searchCompany').value.toLowerCase().trim();
    clearSelection(q?'Pilih PKBU dari hasil pencarian.':'Masukkan kode atau nama PKBU untuk memulai.');
    if(!q)return;
    const filtered=data.filter(r=>(r.id+' '+r.name).toLowerCase().includes(q));
    if(!filtered.length){$('runStatus').textContent='Tidak ada PKBU yang sesuai pencarian.';return;}
    $('company').innerHTML='<option value="">Pilih PKBU ('+filtered.length+' hasil)</option>'+filtered.map(r=>'<option value="'+r.id+'">'+esc(r.id+' · '+r.name)+'</option>').join('');
  }
  $('company').addEventListener('change',choose);$('searchCompany').addEventListener('input',options);$('sourceMode').addEventListener('change',()=>{if(current)choose();});
  $('play').addEventListener('click',()=>{if(!current)return;if(timer){stop();return;}if(step===6)show(0);$('play').textContent='Jeda';timer=setInterval(()=>{if(step>=6){stop();return;}show(step+1);if(step===6)stop();},2200);});
  $('prev').addEventListener('click',()=>{stop();show(Math.max(0,step-1));});$('next').addEventListener('click',()=>{stop();show(Math.min(6,step+1));});$('reset').addEventListener('click',choose);document.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>{stop();show(Number(b.dataset.stage));}));
  fetch('data/hasil/jejak_semua_pkbu.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{data=d.rows;$('searchCompany').disabled=false;$('sourceMode').disabled=false;const id=new URLSearchParams(location.search).get('pkbu');options();if(id&&data.some(r=>r.id===id)){$('company').value=id;choose();}}).catch(()=>{document.querySelectorAll('[data-stage]').forEach(b=>{b.classList.remove('loading');b.setAttribute('aria-busy','false');});$('runStatus').textContent='Data jejak belum tersedia. Jalankan model/export_trace.py atau pembaruan data dari server lokal.';});
})();

(() => {
  const scheme=document.querySelector('.scheme'), group=document.getElementById('flowPaths');
  if(!scheme||!group)return;
  function connect(){
    const root=scheme.getBoundingClientRect();
    const edges=[[0,1],[1,2],[1,3],[2,4],[3,4],[4,5],[5,6]];
    group.innerHTML=edges.map(([a,b])=>{
      const A=scheme.querySelector('[data-stage="'+a+'"]').getBoundingClientRect();
      const target=scheme.querySelector('[data-stage="'+b+'"]');
      const B=target.closest('.stage-unit').getBoundingClientRect();
      let d;
      if(B.left>=A.right-2){const x=A.right-root.left+3,y=A.top+A.height/2-root.top,tx=B.left-root.left-5,ty=B.top+B.height/2-root.top,m=(x+tx)/2;d='M'+x+' '+y+' H'+m+' V'+ty+' H'+tx;}
      else{const x=A.left+A.width/2-root.left,y=A.bottom-root.top+3,tx=B.left+B.width/2-root.left,ty=B.top-root.top-8,m=(y+ty)/2;d='M'+x+' '+y+' V'+m+' H'+tx+' V'+ty;}
      return '<path class="connector" d="'+d+'"/>';
    }).join('');
  }
  new ResizeObserver(connect).observe(scheme);window.addEventListener('resize',connect);connect();
})();
