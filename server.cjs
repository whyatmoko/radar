const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {spawn} = require('child_process');
const root = __dirname, runs = path.join(root, '.runs');
const python = process.env.RADAR_PYTHON || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
let job = {status:'idle'};
const json = (res, code, data) => { res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
function start(options) {
  if(options.kind === "rescore") options.seed = fs.existsSync(path.join(root,"data/update-meta.json")) ? JSON.parse(fs.readFileSync(path.join(root,"data/update-meta.json"),"utf8")).seed : 2026;
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const stage = path.join(runs, id, 'stage'), backup = path.join(runs, id, 'backup');
  fs.mkdirSync(stage, {recursive:true});
  for (const name of ['model','templates','data']) fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
  job = {id,status:'running',phase:'Menyiapkan data',seed:options.seed,kind:options.kind,startedAt:new Date().toISOString(),log:''};
  const child = spawn(python,['-u',path.join(stage,'model/build_web.py')],{cwd:stage,windowsHide:true,env:{...process.env,PYTHONPATH:path.join(root,'.runtime-packages'),PYTHONIOENCODING:'utf-8',RADAR_SEED:String(options.seed),RADAR_SKIP_GENERATE:options.kind==='rescore'?'1':'0'}});
  const append = chunk => { job.log = (job.log + chunk.toString()).slice(-10000); if(job.log.includes('[2]'))job.phase='Membangun halaman dan hasil evaluasi'; else if(job.log.includes('[1]'))job.phase='Menghitung indikator dan skor model'; };
  child.stdout.on('data',append); child.stderr.on('data',append);
  child.on('error',e=>{job.status='failed';job.phase='Gagal menjalankan Python';job.log+=e.message;});
  child.on('close',code=>{
    if(code!==0){job.status='failed';job.phase='Pembaruan gagal. Data aktif tetap digunakan.';return;}
    const names=['jejak-ringkas.html','index.html','jejak.html','data.html','tindak-lanjut.html','log-harian.html','data/csv','data/hasil','data/update-meta.json'];
    try {
      for(const name of names){const old=path.join(root,name);if(fs.existsSync(old)){fs.mkdirSync(path.dirname(path.join(backup,name)),{recursive:true});fs.cpSync(old,path.join(backup,name),{recursive:true});}}
      for(const name of names){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.cpSync(path.join(stage,name),path.join(root,name),{recursive:true});}
      job.status='complete';job.phase='Data dan skor terbaru sudah aktif';job.finishedAt=new Date().toISOString();
    } catch(e) {
      for(const name of names)if(fs.existsSync(path.join(backup,name)))fs.cpSync(path.join(backup,name),path.join(root,name),{recursive:true});
      job.status='failed';job.phase='Publikasi gagal; data sebelumnya dipulihkan';job.log+='\n'+e.message;
    }
  });
}
http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')) {
    if(url.pathname==='/api/update'&&req.method==='GET')return json(res,200,{job,metadata:fs.existsSync(path.join(root,'data/update-meta.json'))?JSON.parse(fs.readFileSync(path.join(root,'data/update-meta.json'),'utf8')):null});
    if(url.pathname==='/api/update'&&req.method==='POST'){
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Origin tidak diizinkan'});
      if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'Gunakan JSON'});
      if(job.status==='running')return json(res,409,{error:'Pembaruan masih berjalan'});
      let body='';req.on('data',c=>{body+=c;if(body.length>2048)req.destroy();});req.on('end',()=>{try{const options=JSON.parse(body);if(!['generate','rescore'].includes(options.kind)||!Number.isInteger(options.seed)||options.seed<1||options.seed>2147483647)return json(res,400,{error:'Parameter tidak valid'});start(options);json(res,202,{job});}catch(e){json(res,500,{error:e.message});}});return;
    }
    return json(res,404,{error:'API tidak ditemukan'});
  }
  let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname));}catch{return json(res,400,{error:'URL tidak valid'});}
  const rel=path.relative(root,file);if(rel.startsWith('..')||path.isAbsolute(rel)||rel.split(path.sep).some(p=>p.startsWith('.')))return json(res,403,{error:'Akses ditolak'});
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  fs.readFile(file,(e,body)=>{if(e){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.csv':'text/csv'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);});
}).listen(Number(process.env.PORT||8781),'127.0.0.1',()=>console.log('RADAR http://127.0.0.1:'+(process.env.PORT||8781)));
