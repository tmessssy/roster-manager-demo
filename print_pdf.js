// ============================================================
//  print_pdf.js — Roster, Standards, and Chart PDF printing
//  Depends on: app.js (S, EVENTS, getBestCut),
//              roster_card.js, standards_card.js, AppBridge
// ============================================================

// ── PRINT / PDF ──────────────────────────────────────────────
function printRoster(gender){
  const aths=S.athletes.filter(a=>a.gender===gender);
  const gL=gender==='female'?"Women's":"Men's";
  const evs=EVENTS.filter(ev=>aths.some(a=>a.times[ev]));
  let html=`<!DOCTYPE html><html><head><title>${S.teamName} ${gL} Roster</title><style>body{font-family:Inter,Arial,sans-serif;font-size:9px;margin:8px;}h1{font-size:15px;margin-bottom:3px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:2px 4px;text-align:center;white-space:nowrap;}th:first-child,td:first-child{text-align:left;font-weight:bold;}th{background:#f5f0ed;font-size:8px;writing-mode:vertical-rl;height:55px;vertical-align:bottom;}th:first-child{writing-mode:horizontal-tb;height:auto;}.leg{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;}.li{display:flex;align-items:center;gap:3px;font-size:8px;}.ld{width:9px;height:9px;border-radius:50%;}</style></head><body><h1>${S.teamName} — ${gL} Roster</h1><div class="leg">${S.standards.map(s=>`<div class="li"><div class="ld" style="background:${s.color}"></div>${s.name}</div>`).join('')}</div><table><thead><tr><th>Athlete</th>`;
  evs.forEach(ev=>html+=`<th>${ev}</th>`);html+='</tr></thead><tbody>';
  aths.forEach(a=>{html+=`<tr><td>${a.name}</td>`;evs.forEach(ev=>{const t=a.times[ev];const c=t?getBestCut(a,ev):null;html+=`<td style="${c?`background:${c.color}33;color:${c.color};font-weight:bold;`:''}">${t||'—'}</td>`;});html+='</tr>';});
  const gLabel=gender==='female'?'womens_roster':'mens_roster';
  const filename=S.teamName.replace(/\s+/g,'_')+'_'+gLabel+'.pdf';
  if(AppBridge.printHtml(html+'</tbody></table></body></html>',filename,{downloadName:S.teamName.replace(/\s+/g,'_')+'_'+gLabel+'.html'})){return;}
  const full=html+'</tbody></table><scr'+'ipt>window.onload=function(){window.print();}</'+'script></body></html>';
  const blob=new Blob([full],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a2=document.createElement('a');a2.href=url;a2.download=S.teamName.replace(/\s+/g,'_')+'_'+gLabel+'.html';a2.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  alert('Downloaded! Open in Chrome → File → Print → Save as PDF.');
}

function printStds(){
  let html=`<!DOCTYPE html><html><head><title>${S.teamName} Standards</title><style>body{font-family:Inter,Arial,sans-serif;font-size:9px;margin:8px;}h1{font-size:15px;}h3{font-size:11px;margin:14px 0 5px;}table{border-collapse:collapse;width:100%;margin-bottom:16px;}th,td{border:1px solid #ccc;padding:2px 5px;text-align:center;}th:first-child,td:first-child{text-align:left;}th{background:#f5f0ed;font-size:8px;}</style></head><body><h1>${S.teamName} — Time Standards</h1>`;
  ['Women','Men'].forEach(g=>{
    const tk=g==='Women'?'timesF':'timesM';html+=`<h3>${g}'s Standards</h3><table><thead><tr><th>Event</th>`;
    S.standards.forEach(s=>html+=`<th style="color:${s.color}">${s.name}</th>`);html+='</tr></thead><tbody>';
    EVENTS.forEach(ev=>{if(!S.standards.some(s=>s[tk][ev]))return;html+=`<tr><td>${ev}</td>`;S.standards.forEach(s=>{const t=s[tk][ev];html+=`<td style="color:${t?s.color:'#ccc'}">${t||'—'}</td>`;});html+='</tr>';});html+='</tbody></table>';
  });
  const filename=S.teamName.replace(/\s+/g,'_')+'_standards.pdf';
  if(AppBridge.printHtml(html+'</body></html>',filename,{downloadName:S.teamName.replace(/\s+/g,'_')+'_standards.html'})){return;}
  const full=html+'<scr'+'ipt>window.onload=function(){window.print();}</'+'script></body></html>';
  const blob=new Blob([full],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a2=document.createElement('a');a2.href=url;a2.download=S.teamName.replace(/\s+/g,'_')+'_standards.html';a2.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  alert('Downloaded! Open in Chrome → File → Print → Save as PDF.');
}

// ── Chart tab: context-aware Save PDF ────────────────────────
// Reads the current subtab and selection, triggers the right printer.
function printChartsView(){
  if(_chartsSubtab==='standards'){
    // Standards card — use the polished laminate-style card
    if(typeof printStandardsCard==='function') printStandardsCard();
    return;
  }

  // Roster chart — determine which athletes are currently in view
  let athleteList;
  let label;

  if(_chartSelectedAths.length>0){
    // Specific athletes hand-picked by the user
    athleteList=S.athletes.filter(a=>_chartSelectedAths.includes(a.id));
    label=athleteList.length+' Selected Athletes';
  } else if(chartG==='female'){
    athleteList=S.athletes.filter(a=>a.gender==='female');
    label="Women's Roster";
  } else if(chartG==='male'){
    athleteList=S.athletes.filter(a=>a.gender==='male');
    label="Men's Roster";
  } else {
    athleteList=S.athletes;
    label='Full Roster';
  }

  if(!athleteList.length){AppBridge.showToast('No athletes in current view');return;}

  // Build using the polished roster_card layout, passing filtered athletes
  if(typeof buildRosterCardHTML==='function'){
    // _rcColors may not be set if user hasn't opened the modal — seed defaults
    if(!Object.keys(_rcColors||{}).length){
      _rcColors={};
      S.standards.forEach(s=>{_rcColors[s.id]=s.color;});
    }
    const html=buildRosterCardHTML('name',true,true,athleteList);
    const fn=(S.teamName||'Roster').replace(/\s+/g,'_')+'_'+label.replace(/\s+/g,'_')+'.pdf';
    if(AppBridge.printHtml(html,fn,{downloadName:fn.replace(/\.pdf$/,'.html')})) return;
    const win=window.open('','_blank');
    if(win){win.document.write(html);win.document.close();}
    else{
      const blob=new Blob([html],{type:'text/html'});
      const url=URL.createObjectURL(blob);
      const a2=document.createElement('a');a2.href=url;a2.download=fn.replace(/\.pdf$/,'.html');a2.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    }
  }
}
