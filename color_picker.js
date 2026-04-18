// ============================================================
//  color_picker.js — HSL color picker widget
//  Load after app.js. Called by openColorPicker(hex, callback)
// ============================================================

let _csCallback=null,_csHue=210;

function openColorPicker(hex,callback){
  _csCallback=callback;
  hex=(hex||'2563eb').replace('#','');
  if(hex.length<6)hex=hex.padEnd(6,'0');
  document.getElementById('csHexIn').value=hex;
  _csHue=_hexToHsl(hex).h;
  document.getElementById('csHue').value=_csHue;
  _csDrawSpectrum(_csHue);
  _csSetPreview('#'+hex);
  document.getElementById('csOverlay').classList.add('open');
}
function closeColorPicker(){document.getElementById('csOverlay').classList.remove('open');_csCallback=null;}
function csConfirm(){const hex='#'+document.getElementById('csHexIn').value.replace('#','');if(_csCallback)_csCallback(hex);closeColorPicker();}
function _csSetPreview(hex){document.getElementById('csPreview').style.background=hex;}
function csUpdateSpectrum(){
  _csHue=parseInt(document.getElementById('csHue').value);
  _csDrawSpectrum(_csHue);
  const rgb=_hslToRgb(_csHue,1,0.5);
  const hex=_rgbToHex(rgb[0],rgb[1],rgb[2]);
  document.getElementById('csHexIn').value=hex;
  _csSetPreview('#'+hex);
}
function csHexTyped(){
  const val=document.getElementById('csHexIn').value.replace('#','');
  if(val.length===6){
    _csSetPreview('#'+val);
    _csHue=_hexToHsl(val).h;
    document.getElementById('csHue').value=_csHue;
    _csDrawSpectrum(_csHue);
  }
}
function _csDrawSpectrum(hue){
  const cv=document.getElementById('csCanvas');
  const ctx=cv.getContext('2d');
  cv.width=cv.offsetWidth||260;cv.height=cv.offsetHeight||170;
  const w=cv.width,h=cv.height;
  const gH=ctx.createLinearGradient(0,0,w,0);
  gH.addColorStop(0,'#fff');gH.addColorStop(1,`hsl(${hue},100%,50%)`);
  ctx.fillStyle=gH;ctx.fillRect(0,0,w,h);
  const gV=ctx.createLinearGradient(0,0,0,h);
  gV.addColorStop(0,'rgba(0,0,0,0)');gV.addColorStop(1,'#000');
  ctx.fillStyle=gV;ctx.fillRect(0,0,w,h);
  cv.onclick=function(e){
    const rc=cv.getBoundingClientRect();
    const px=ctx.getImageData(Math.round((e.clientX-rc.left)*cv.width/rc.width),Math.round((e.clientY-rc.top)*cv.height/rc.height),1,1).data;
    const hex=_rgbToHex(px[0],px[1],px[2]);
    document.getElementById('csHexIn').value=hex;
    _csSetPreview('#'+hex);
  };
}
function _hexToHsl(hex){
  let r=parseInt(hex.slice(0,2),16)/255,g=parseInt(hex.slice(2,4),16)/255,b=parseInt(hex.slice(4,6),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;
  if(mx===mn){h=s=0;}else{
    const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    switch(mx){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;default:h=((r-g)/d+4)/6;}
  }
  return{h:Math.round(h*360),s,l};
}
function _hslToRgb(h,s,l){
  h/=360;let r,g,b;
  if(s===0){r=g=b=l;}else{
    const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
    const f=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    r=f(p,q,h+1/3);g=f(p,q,h);b=f(p,q,h-1/3);
  }
  return[Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}
function _rgbToHex(r,g,b){return[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');}
