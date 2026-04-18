// ============================================================
//  data_io.js — Export, Import, and Reset
//  Depends on: app.js (S, save), state.js (recordBackup), AppBridge
// ============================================================

// ── DATA ─────────────────────────────────────────────────────
function exportData(){
  const jsonStr=JSON.stringify({athletes:S.athletes,standards:S.standards,teamName:S.teamName},null,2);
  recordBackup();
  AppBridge.exportJSON(jsonStr,'swim_roster.json');
}
function importData(ev){
  const f=ev.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const d=JSON.parse(e.target.result);
      if(d.athletes)S.athletes=d.athletes;
      if(d.standards)S.standards=d.standards;
      if(d.teamName)S.teamName=d.teamName;
      save();renderRoster();
      AppBridge.showToast('Imported!');
    }catch(e){AppBridge.showToast('Invalid file');}
  };
  r.readAsText(f);
}
function resetData(){
  if(!confirm('Reset ALL data to defaults?'))return;
  localStorage.removeItem('swimApp_v3');
  S.athletes=dc(DEFAULT_ATHLETES);S.standards=dc(DEFAULT_STANDARDS);S.teamName='OCA';S.teamLogo=null;
  const ltxt=document.getElementById('ltxt');const limg=document.getElementById('limg');
  if(ltxt)ltxt.style.display='';if(limg)limg.style.display='none';
  save();renderRoster();renderSettStds();
  AppBridge.showToast('Reset complete.');
}

