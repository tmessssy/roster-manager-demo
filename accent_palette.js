// ============================================================
//  accent_palette.js — Accent color swatches in Settings
//  Depends on: app.js (S, save, applyAccentColor)
// ============================================================

const ACCENT_COLORS = [
  {color:'#934337',name:'Terracotta'},
  {color:'#c0392b',name:'Crimson'},
  {color:'#e67e22',name:'Amber'},
  {color:'#d4a017',name:'Gold'},
  {color:'#27ae60',name:'Emerald'},
  {color:'#16a085',name:'Teal'},
  {color:'#2980b9',name:'Ocean'},
  {color:'#5b4fcf',name:'Indigo'},
  {color:'#8e44ad',name:'Violet'},
  {color:'#c0185a',name:'Rose'},
];
function renderAccentPalette(){
  const el=document.getElementById('accentPalette');
  if(!el)return;
  const current=S.accentColor||'#934337';
  el.innerHTML=ACCENT_COLORS.map(ac=>`
    <div class="accent-swatch ${ac.color===current?'active':''}"
         data-color="${ac.color}"
         style="background:${ac.color}"
         title="${ac.name}"
         onclick="applyAccentColor('${ac.color}')"></div>
  `).join('');
}


