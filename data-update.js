(() => {
  const form = document.getElementById('updateForm');
  if (!form) return;
  const button = document.getElementById('runUpdate'), status = document.getElementById('updateStatus'), info = document.getElementById('snapshotInfo'), log = document.getElementById('updateLog');
  let wasRunning = false, polling;
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  form.elements.generateDate.value = today;
  const date = value => new Date(value).toLocaleString('id-ID', {timeZone:'Asia/Jakarta'});
  async function refresh() {
    try {
      const response = await fetch('api/update', {cache:'no-store'});
      if (!response.ok) throw Error();
      const {job, metadata} = await response.json();
      info.textContent = metadata ? `Terakhir diperbarui ${date(metadata.updatedAt)} WIB · ${metadata.companies.toLocaleString('id-ID')} perusahaan · ${metadata.kind === 'rescore' ? 'hitung ulang CSV' : 'snapshot sintetis'}` : 'Snapshot awal · periode Oktober 2025–September 2026';
      const running = job.status === 'running'; button.disabled = running;
      status.textContent = job.status === 'idle' ? 'Siap memperbarui data.' : job.phase;
      log.textContent = job.log || ''; log.parentElement.hidden = !job.log;
      if (running) { wasRunning = true; if (!polling) polling = setInterval(refresh, 2000); }
      else { clearInterval(polling); polling = null; }
      if (job.status === 'complete') {
        document.getElementById('updateResult').hidden = false;
        if (wasRunning) { wasRunning = false; window.location.replace('data.html?updated=' + encodeURIComponent(job.id)); }
      }
    } catch {
      clearInterval(polling); polling = null; button.disabled = true;
      status.textContent = 'Pembaruan memerlukan server lokal RADAR (node server.cjs). Fitur ini tidak tersedia pada hosting statis.';
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true; status.textContent = 'Menyiapkan pembaruan…';
    try {
      const response = await fetch('api/update', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:form.elements.kind.value, seed:Number(form.elements.generateDate.value.replaceAll("-", "")), generateDate:form.elements.generateDate.value})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Pembaruan gagal');
      wasRunning = true; await refresh();
    } catch (e) { status.textContent = e.message; button.disabled = false; }
  });
  refresh();
})();
