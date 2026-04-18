// ============================================================
//  analytics.js — Four analytics views for the swim app
//
//  1. Scatter Plot  — team best times per event, initials labels
//  2. Cut Heatmap   — who has cut what, per standard
//  3. Stroke Radar  — compare two athletes across strokes
//  4. Team Depth    — how many athletes hold cuts per event
//
//  Requires: Chart.js 4.x loaded in HTML before this file
//  Usage: add <script src="analytics.js"></script> after app.js
// ============================================================

// ── Chart.js availability guard ──────────────────────────────
// If Chart.js failed to load (CDN down, slow network, offline)
// we show a friendly fallback instead of crashing.
function _chartJsAvailable() {
  return typeof Chart !== 'undefined';
}

function _chartJsFallback(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;">
      <div style="font-size:28px;margin-bottom:8px;">📊</div>
      <div style="font-weight:700;margin-bottom:4px;">Chart.js not loaded</div>
      <div>Check your internet connection — this view requires the Chart.js library.</div>
      <button class="btn bsm bs" style="margin-top:12px;"
        onclick="location.reload()">Retry</button>
    </div>`;
}

let _analyticsTab    = 'scatter';
let _scGender        = 'all';
let _scEvent         = null;
let _hmGender        = 'female';
let _hmStdId         = null;
let _dpGender        = 'all';
let _dpStdId         = null;
let _scChart         = null;
let _rdChart         = null;

// ── Initials builder with de-duplication logic ───────────────
// Default: "F.L" (first initial + last initial)
// If two athletes share the same "F.L", both get "F.La" (first 2 of last name)
function buildInitialsMap(athletes) {
  const fi = n => n.split(' ')[0][0].toUpperCase();
  const li = n => n.split(' ').slice(-1)[0][0].toUpperCase();
  const li2 = n => n.split(' ').slice(-1)[0].slice(0, 2);
  li2.charAt = (n, i) => li2(n)[i] || '';

  // Count collisions on simple "F.L"
  const count = {};
  athletes.forEach(a => {
    const k = fi(a.name) + '.' + li(a.name);
    count[k] = (count[k] || 0) + 1;
  });

  const result = {};
  athletes.forEach(a => {
    const k = fi(a.name) + '.' + li(a.name);
    if (count[k] > 1) {
      // Use first 2 letters of last name to disambiguate
      const last2 = a.name.split(' ').slice(-1)[0].slice(0, 2);
      result[a.id] = fi(a.name) + '.' + last2;
    } else {
      result[a.id] = fi(a.name) + '.' + li(a.name);
    }
  });
  return result;
}

// ── Seconds → formatted time string ─────────────────────────
function _s2t(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '—';
  sec = Math.abs(sec);
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2);
  return m > 0 ? `${m}:${String(s).padStart(5, '0')}` : parseFloat(s).toFixed(2);
}

// ── Stroke score: 0-100 relative to rest of same-gender team ─
function _strokeScore(athlete, stroke) {
  const evs = EVENTS.filter(e => e.includes(stroke) && athlete.times[e]);
  if (!evs.length) return 0;
  const best = Math.min(...evs.map(e => t2s(athlete.times[e])).filter(Boolean));
  if (best === null) return 0;

  const peers = S.athletes.filter(a => a.gender === athlete.gender);
  const peerBests = peers.map(a => {
    const pEvs = EVENTS.filter(e => e.includes(stroke) && a.times[e]);
    if (!pEvs.length) return null;
    return Math.min(...pEvs.map(e => t2s(a.times[e])).filter(Boolean));
  }).filter(Boolean);

  if (peerBests.length < 2) return 50;
  const mn = Math.min(...peerBests), mx = Math.max(...peerBests);
  if (mn === mx) return 50;
  return Math.round(100 - (best - mn) / (mx - mn) * 100);
}

// ── Render the analytics page ─────────────────────────────────
function renderAnalyticsPage() {
  const container = document.getElementById('analyticsPageContent');
  if (!container) return;

  // Warn (but don't block) if Chart.js didn't load — heatmap/depth still work
  if (!_chartJsAvailable()) {
    const warn = document.createElement('div');
    warn.style.cssText = 'background:#7c2d12;color:#fde68a;font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:10px;';
    warn.innerHTML = '⚠️ Chart.js failed to load — Scatter and Radar views need an internet connection. Heatmap and Team Depth still work.';
    container.prepend(warn);
  }

  const stdOpts = S.standards
    .sort((a, b) => a.priority - b.priority)
    .map(s => `<option value="${s.id}">${s.name}</option>`)
    .join('');

  const evOpts = EVENTS.map(e => `<option value="${e}">${e}</option>`).join('');

  const athOpts = S.athletes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join('');

  container.innerHTML = `
    <div class="stabs" id="analytTabs" style="margin-bottom:13px;">
      <button class="stab active" onclick="switchAnalyticsTab('scatter')">Scatter</button>
      <button class="stab" onclick="switchAnalyticsTab('heatmap')">Cut Heatmap</button>
      <button class="stab" onclick="switchAnalyticsTab('radar')">Radar</button>
      <button class="stab" onclick="switchAnalyticsTab('depth')">Team Depth</button>
      <button class="stab" onclick="switchAnalyticsTab('bubble')">On the Bubble</button>
    </div>

    <!-- ── SCATTER ── -->
    <div id="analytScatter">
      <div class="fbar">
        <select class="fi" id="analytEvSel" style="flex:1;min-width:140px;" onchange="_scEvent=this.value;drawAnalyticsScatter()">
          ${evOpts}
        </select>
        <div class="gtog">
          <button class="gbtn aa" id="asgAll" onclick="setAScatterGender('all')">All</button>
          <button class="gbtn"    id="asgM"   onclick="setAScatterGender('male')">Men</button>
          <button class="gbtn"    id="asgF"   onclick="setAScatterGender('female')">Women</button>
        </div>
      </div>
      <div class="sgrid" id="analytScStats"></div>
      <div class="card">
        <div id="analytScLegend" class="brow" style="margin-bottom:11px;font-size:11px;color:var(--muted);"></div>
        <div style="position:relative;width:100%;height:340px;">
          <canvas id="analytScCanvas" role="img" aria-label="Scatter plot of team best times with athlete initials as labels">No chart data.</canvas>
        </div>
      </div>
    </div>

    <!-- ── HEATMAP ── -->
    <div id="analytHeatmap" style="display:none;">
      <div class="fbar">
        <div class="gtog">
          <button class="gbtn af" id="ahmgF" onclick="setAHeatmapGender('female')">Women</button>
          <button class="gbtn"    id="ahmgM" onclick="setAHeatmapGender('male')">Men</button>
        </div>
        <select class="fi" id="analytHmStd" style="flex:1;" onchange="_hmStdId=this.value;drawAnalyticsHeatmap()">
          ${stdOpts}
        </select>
      </div>
      <div class="card" style="overflow-x:auto;padding:10px 6px;">
        <div id="analytHmContainer"></div>
      </div>
    </div>

    <!-- ── RADAR ── -->
    <div id="analytRadar" style="display:none;">
      <div class="fbar">
        <select class="fi" id="analytRdAth1" style="flex:1;" onchange="drawAnalyticsRadar()">${athOpts}</select>
        <select class="fi" id="analytRdAth2" style="flex:1;" onchange="drawAnalyticsRadar()">${athOpts}</select>
      </div>
      <div class="card">
        <div style="position:relative;width:100%;height:300px;">
          <canvas id="analytRdCanvas" role="img" aria-label="Radar chart comparing two athletes across five strokes">No data.</canvas>
        </div>
      </div>
      <div class="card">
        <div class="ctitle">Stroke Breakdown</div>
        <div id="analytRdBreakdown" style="display:grid;grid-template-columns:1fr 1fr;gap:7px;"></div>
      </div>
    </div>

    <!-- ── DEPTH ── -->
    <div id="analytDepth" style="display:none;">
      <div class="fbar">
        <select class="fi" id="analytDpStd" style="flex:1;" onchange="_dpStdId=this.value;drawAnalyticsDepth()">
          ${stdOpts}
        </select>
        <div class="gtog">
          <button class="gbtn aa" id="adpgAll" onclick="setADepthGender('all')">All</button>
          <button class="gbtn"    id="adpgM"   onclick="setADepthGender('male')">Men</button>
          <button class="gbtn"    id="adpgF"   onclick="setADepthGender('female')">Women</button>
        </div>
      </div>
      <div class="sgrid" id="analytDpStats" style="grid-template-columns:repeat(3,minmax(0,1fr));"></div>
      <div class="card">
        <div id="analytDpContainer"></div>
      </div>
    </div>


    <!-- ── BUBBLE ── -->
    <div id="analytBubble" style="display:none;">
      <div class="fbar">
        <div class="gtog">
          <button class="gbtn aa" id="bbgAll" onclick="setBubbleG('all')">All</button>
          <button class="gbtn" id="bbgM" onclick="setBubbleG('male')">Men</button>
          <button class="gbtn" id="bbgF" onclick="setBubbleG('female')">Women</button>
        </div>
        <div style="font-size:10px;color:var(--muted);" id="bubbleThresholdNote"></div>
      </div>
      <div class="card">
        <div id="bubbleList"></div>
      </div>
    </div>

  `;

  // Set defaults
  if (!_scEvent) _scEvent = EVENTS[0];
  document.getElementById('analytEvSel').value = _scEvent;

  if (!_hmStdId && S.standards.length) _hmStdId = S.standards.sort((a,b) => a.priority - b.priority)[0].id;
  document.getElementById('analytHmStd').value = _hmStdId;

  if (!_dpStdId && S.standards.length) _dpStdId = S.standards.sort((a,b) => a.priority - b.priority)[0].id;
  document.getElementById('analytDpStd').value = _dpStdId;

  // Set second athlete to a different person
  const ath2Sel = document.getElementById('analytRdAth2');
  if (S.athletes.length > 1) ath2Sel.value = S.athletes[1].id;

  drawAnalyticsScatter();
}

function switchAnalyticsTab(tab) {
  _analyticsTab = tab;
  ['scatter','heatmap','radar','depth','bubble'].forEach(t => {
    const el = document.getElementById('analyt' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#analytTabs .stab').forEach((b, i) => {
    b.classList.toggle('active', ['scatter','heatmap','radar','depth','bubble'][i] === tab);
  });
  if (tab === 'scatter') drawAnalyticsScatter();
  if (tab === 'heatmap') drawAnalyticsHeatmap();
  if (tab === 'radar')   drawAnalyticsRadar();
  if (tab === 'depth')   drawAnalyticsDepth();
  if (tab === 'bubble') {
    if (typeof renderBubbleThresholdNote === 'function') renderBubbleThresholdNote();
    if (typeof renderBubbleWidget === 'function') renderBubbleWidget(typeof bubbleGender !== 'undefined' ? bubbleGender : 'all');
  }
}

function setAScatterGender(g) {
  _scGender = g;
  ['All','M','F'].forEach(x => document.getElementById('asg'+x)?.classList.remove('active'));
  const map = {all:'All',male:'M',female:'F'};
  document.getElementById('asg'+map[g])?.classList.add('active');
  drawAnalyticsScatter();
}
function setAHeatmapGender(g) {
  _hmGender = g;
  document.getElementById('ahmgF')?.classList.toggle('active', g === 'female');
  document.getElementById('ahmgM')?.classList.toggle('active', g === 'male');
  drawAnalyticsHeatmap();
}
function setADepthGender(g) {
  _dpGender = g;
  ['All','M','F'].forEach(x => document.getElementById('adpg'+x)?.classList.remove('active'));
  const map = {all:'All',male:'M',female:'F'};
  document.getElementById('adpg'+map[g])?.classList.add('active');
  drawAnalyticsDepth();
}

// ── SCATTER ─────────────────────────────────────────────────
function drawAnalyticsScatter() {
  if (!_chartJsAvailable()) { _chartJsFallback('analytScCanvas'); return; }
  const ev = _scEvent || EVENTS[0];

  const pool = S.athletes.filter(a => {
    if (_scGender === 'male'   && a.gender !== 'male')   return false;
    if (_scGender === 'female' && a.gender !== 'female') return false;
    return t2s(a.times[ev]) !== null;
  });

  const initMap = buildInitialsMap(pool);

  const pts = pool
    .map(a => ({ id: a.id, name: a.name, gender: a.gender, t: t2s(a.times[ev]), raw: a.times[ev], lbl: initMap[a.id] }))
    .filter(p => p.t !== null)
    .sort((a, b) => a.t - b.t)
    .map((p, i) => ({ ...p, x: i + 1 }));

  // Stats
  const statsEl = document.getElementById('analytScStats');
  if (statsEl && pts.length) {
    const avg = pts.reduce((s, p) => s + p.t, 0) / pts.length;
    const spread = pts[pts.length - 1].t - pts[0].t;
    statsEl.innerHTML = `
      <div class="scard"><div class="snum">${pts.length}</div><div class="slbl">Athletes</div></div>
      <div class="scard"><div class="snum" style="font-size:17px;">${pts[0].raw}</div><div class="slbl">Fastest</div><div style="font-size:10px;color:var(--txt);margin-top:1px;">${pts[0].name.split(' ')[0]}</div></div>
      <div class="scard"><div class="snum" style="font-size:17px;">${_s2t(avg)}</div><div class="slbl">Team avg</div></div>
      <div class="scard"><div class="snum" style="font-size:17px;">${_s2t(spread)}</div><div class="slbl">Spread</div></div>`;
  } else if (statsEl) {
    statsEl.innerHTML = `<div class="scard" style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:12px;">No times for this event</div>`;
  }

  // Legend
  const legendEl = document.getElementById('analytScLegend');
  if (legendEl) {
    const hasMen   = pts.some(p => p.gender === 'male');
    const hasWomen = pts.some(p => p.gender === 'female');
    let legHtml = '';
    if (hasMen)   legHtml += `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);"><span style="width:10px;height:10px;border-radius:50%;background:rgba(74,128,196,.85);flex-shrink:0;"></span>Men</span>`;
    if (hasWomen) legHtml += `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);margin-left:10px;"><span style="width:10px;height:10px;background:rgba(196,90,144,.85);flex-shrink:0;transform:rotate(45deg);display:inline-block;"></span>Women</span>`;
    S.standards.forEach(s => {
      const tk = a => a.gender === 'female' ? 'timesF' : 'timesM';
      const hasCut = S.standards.length && (s.timesM[ev] || s.timesF[ev]);
      if (hasCut) legHtml += `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;margin-left:10px;"><span style="width:16px;height:0;border-top:2px dashed ${s.color};display:inline-block;"></span><span style="color:${s.color};font-weight:700;">${s.name}</span></span>`;
    });
    legendEl.innerHTML = legHtml;
  }

  if (!pts.length) { if (_scChart) { _scChart.destroy(); _scChart = null; } return; }

  const yVals = pts.map(p => p.t);
  const yMin  = Math.min(...yVals), yMax = Math.max(...yVals);
  const pad   = (yMax - yMin) * 0.22 || 2;

  const mPts = pts.filter(p => p.gender === 'male');
  const fPts = pts.filter(p => p.gender === 'female');

  const datasets = [];
  if (mPts.length) datasets.push({ label:'Men',   data:mPts, backgroundColor:'rgba(0,0,0,0)', parsing:{xAxisKey:'x',yAxisKey:'t'} });
  if (fPts.length) datasets.push({ label:'Women', data:fPts, backgroundColor:'rgba(0,0,0,0)', parsing:{xAxisKey:'x',yAxisKey:'t'} });

  if (_scChart) _scChart.destroy();

  _scChart = new Chart(document.getElementById('analytScCanvas'), {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 200 },
      layout: { padding: { right: 10, top: 16, bottom: 8 } },
      scales: {
        x: {
          min: 0, max: pts.length + 1,
          title: { display: true, text: 'Rank — fastest to slowest', color: 'rgba(255,255,255,.35)', font: { size: 10 } },
          ticks: { color: 'rgba(255,255,255,.35)', stepSize: 1, precision: 0, font: { size: 10 } },
          grid:  { color: 'rgba(255,255,255,.05)' },
        },
        y: {
          reverse: true,
          min: yMin - pad, max: yMax + pad,
          title: { display: true, text: 'Time', color: 'rgba(255,255,255,.35)', font: { size: 10 } },
          ticks: { color: 'rgba(255,255,255,.35)', callback: v => _s2t(v), font: { size: 10 } },
          grid:  { color: 'rgba(255,255,255,.05)' },
        },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
    plugins: [{
      id: 'initialsLabels',
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        datasets.forEach(ds => {
          const isFemale = ds.label === 'Women';
          const fill = isFemale ? 'rgba(196,90,144,0.9)' : 'rgba(74,128,196,0.9)';
          ds.data.forEach(p => {
            const xPx = scales.x.getPixelForValue(p.x);
            const yPx = scales.y.getPixelForValue(p.t);
            ctx.save();
            ctx.font = 'bold 9px Inter,sans-serif';
            const tw = ctx.measureText(p.lbl).width;
            const pw = tw + 9, ph = 16;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.roundRect(xPx - pw / 2, yPx - ph / 2, pw, ph, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.lbl, xPx, yPx);
            ctx.restore();
          });
        });
      },
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        S.standards.forEach(s => {
          const showGenders = _scGender === 'all'
            ? [{ key:'timesM', label:' M' }, { key:'timesF', label:' W' }]
            : _scGender === 'male'
              ? [{ key:'timesM', label:'' }]
              : [{ key:'timesF', label:'' }];

          showGenders.forEach(({ key, label }) => {
            const v = t2s(s[key][ev]);
            if (!v) return;
            const yPx = scales.y.getPixelForValue(v);
            if (yPx < chartArea.top || yPx > chartArea.bottom) return;
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.moveTo(chartArea.left, yPx); ctx.lineTo(chartArea.right, yPx); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;
            ctx.font = '600 9px Inter,sans-serif';
            const lbl = s.name + label;
            const tw = ctx.measureText(lbl).width;
            const px = chartArea.right - tw - 10, py = yPx - 8;
            ctx.fillStyle = s.color + 'cc';
            ctx.beginPath(); ctx.roundRect(px - 3, py, tw + 6, 13, 3); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
            ctx.fillText(lbl, px, py + 2);
            ctx.restore();
          });
        });
      }
    }]
  });
}

// ── HEATMAP ─────────────────────────────────────────────────
function drawAnalyticsHeatmap() {
  const std = S.standards.find(s => s.id === _hmStdId) || S.standards[0];
  if (!std) return;
  const tk  = _hmGender === 'female' ? 'timesF' : 'timesM';
  const gk  = _hmGender === 'female' ? 'female' : 'male';

  const athletes = S.athletes.filter(a => a.gender === gk);
  const evs = EVENTS.filter(e => std[tk][e]);

  // Sort athletes by number of cuts achieved descending
  athletes.sort((a, b) => {
    const ac = evs.filter(e => { const ts = t2s(a.times[e]), cs = t2s(std[tk][e]); return ts && cs && ts <= cs; }).length;
    const bc = evs.filter(e => { const ts = t2s(b.times[e]), cs = t2s(std[tk][e]); return ts && cs && ts <= cs; }).length;
    return bc - ac;
  });

  let html = `<table style="border-collapse:collapse;width:100%;font-size:11px;">
    <thead><tr>
      <th style="text-align:left;padding:5px 8px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--bdr);white-space:nowrap;">Athlete</th>`;
  evs.forEach(e => {
    const short = e.replace(' SCY','').replace(' LCM','').replace('Freestyle','Fr').replace('Free','Fr').replace('Backstroke','Bk').replace('Back','Bk').replace('Breaststroke','Br').replace('Breast','Br').replace('Butterfly','Fl').replace('Fly','Fl');
    html += `<th style="padding:5px 5px;color:var(--muted);font-weight:600;text-align:center;border-bottom:1px solid var(--bdr);white-space:nowrap;font-size:9px;min-width:40px;">${short}</th>`;
  });
  html += `<th style="padding:5px 8px;color:${std.color};font-weight:700;border-bottom:1px solid var(--bdr);text-align:right;">Cuts</th></tr></thead><tbody>`;

  athletes.forEach(a => {
    const firstName = a.name.split(' ')[0];
    const lastInit  = a.name.split(' ').slice(-1)[0][0] + '.';
    html += `<tr><td style="padding:5px 8px;font-weight:700;white-space:nowrap;border-bottom:1px solid rgba(67,63,60,.3);">${firstName} ${lastInit}</td>`;

    let cutCount = 0;
    evs.forEach(e => {
      const ts  = t2s(a.times[e]);
      const cs  = t2s(std[tk][e]);
      const raw = a.times[e];
      if (!ts || !cs) {
        html += `<td style="padding:5px 5px;text-align:center;border-bottom:1px solid rgba(67,63,60,.3);color:var(--muted);font-size:10px;">—</td>`;
        return;
      }
      const achieved = ts <= cs;
      const pct = Math.abs((ts - cs) / cs * 100);
      let bg = '', col = '', fw = '400';
      if (achieved)     { bg = std.color + '44'; col = std.color; fw = '700'; cutCount++; }
      else if (pct < 2) { bg = 'rgba(251,146,60,.22)'; col = '#fb923c'; }
      else if (pct < 6) { bg = 'rgba(251,146,60,.08)'; col = 'rgba(255,255,255,.5)'; }
      else              { bg = 'transparent'; col = 'rgba(255,255,255,.22)'; }
      html += `<td style="padding:5px 3px;text-align:center;border-bottom:1px solid rgba(67,63,60,.3);background:${bg};color:${col};font-weight:${fw};font-size:10px;">${raw}</td>`;
    });

    html += `<td style="padding:5px 8px;text-align:right;border-bottom:1px solid rgba(67,63,60,.3);font-weight:800;color:${cutCount > 0 ? std.color : 'var(--muted)'};">${cutCount}</td></tr>`;
  });

  html += `</tbody></table>`;
  const c = document.getElementById('analytHmContainer');
  if (c) c.innerHTML = html;
}

// ── RADAR ────────────────────────────────────────────────────
function drawAnalyticsRadar() {
  if (!_chartJsAvailable()) { _chartJsFallback('analytRdCanvas'); return; }
  const id1 = document.getElementById('analytRdAth1')?.value;
  const id2 = document.getElementById('analytRdAth2')?.value;
  const a1  = S.athletes.find(a => a.id === id1);
  const a2  = S.athletes.find(a => a.id === id2);
  if (!a1 || !a2) return;

  const labels = STROKES;
  const d1 = labels.map(s => _strokeScore(a1, s));
  const d2 = labels.map(s => _strokeScore(a2, s));

  if (_rdChart) _rdChart.destroy();
  _rdChart = new Chart(document.getElementById('analytRdCanvas'), {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: a1.name, data: d1, borderColor: 'rgba(74,128,196,.9)',  backgroundColor: 'rgba(74,128,196,.12)',  borderWidth: 2, pointRadius: 4, pointBackgroundColor: 'rgba(74,128,196,.9)' },
        { label: a2.name, data: d2, borderColor: 'rgba(196,90,144,.9)',  backgroundColor: 'rgba(196,90,144,.12)',  borderWidth: 2, pointRadius: 4, pointBackgroundColor: 'rgba(196,90,144,.9)' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: {
        min: 0, max: 100,
        ticks: { display: false, stepSize: 25 },
        grid:         { color: 'rgba(255,255,255,.08)' },
        angleLines:   { color: 'rgba(255,255,255,.08)' },
        pointLabels:  { color: 'rgba(255,255,255,.65)', font: { size: 12, weight: '700' } },
      }},
      plugins: { legend: { display: false } },
    }
  });

  const bkd = document.getElementById('analytRdBreakdown');
  if (bkd) {
    bkd.innerHTML = STROKES.map(s => {
      const s1 = _strokeScore(a1, s), s2 = _strokeScore(a2, s);
      const w1 = s1 > s2, w2 = s2 > s1;
      return `<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:7px;padding:9px;">
        <div style="font-size:9px;font-weight:700;color:var(--muted);margin-bottom:5px;letter-spacing:.5px;text-transform:uppercase;">${s}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:5px;">
          <span style="font-size:12px;font-weight:700;color:${w1?'rgba(74,128,196,.9)':'var(--muted)'};">${a1.name.split(' ')[0]} ${s1}</span>
          <span style="font-size:10px;color:var(--muted);">vs</span>
          <span style="font-size:12px;font-weight:700;color:${w2?'rgba(196,90,144,.9)':'var(--muted)'};">${a2.name.split(' ')[0]} ${s2}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:5px;">
          <div style="height:4px;background:var(--sur3);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${s1}%;background:rgba(74,128,196,.7);border-radius:2px;"></div></div>
          <div style="height:4px;background:var(--sur3);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${s2}%;background:rgba(196,90,144,.7);border-radius:2px;"></div></div>
        </div>
      </div>`;
    }).join('');
  }
}

// ── TEAM DEPTH ───────────────────────────────────────────────
function drawAnalyticsDepth() {
  const std = S.standards.find(s => s.id === _dpStdId) || S.standards[0];
  if (!std) return;

  const pool = S.athletes.filter(a => {
    if (_dpGender === 'male'   && a.gender !== 'male')   return false;
    if (_dpGender === 'female' && a.gender !== 'female') return false;
    return true;
  });

  const evData = EVENTS.map(ev => {
    const count = pool.filter(a => {
      const tk = a.gender === 'female' ? 'timesF' : 'timesM';
      const ts = t2s(a.times[ev]);
      const cs = t2s(std[tk][ev]);
      return ts && cs && ts <= cs;
    }).length;
    return { ev, count, pct: pool.length ? Math.round(count / pool.length * 100) : 0 };
  }).filter(d => d.count > 0).sort((a, b) => b.count - a.count);

  const totalCuts = pool.reduce((sum, a) => {
    const tk = a.gender === 'female' ? 'timesF' : 'timesM';
    return sum + EVENTS.filter(e => {
      const ts = t2s(a.times[e]), cs = t2s(std[tk][e]);
      return ts && cs && ts <= cs;
    }).length;
  }, 0);
  const avgCuts = pool.length ? (totalCuts / pool.length).toFixed(1) : '0';
  const top = evData[0];

  const dpStats = document.getElementById('analytDpStats');
  if (dpStats) {
    dpStats.innerHTML = `
      <div class="scard"><div class="snum">${pool.length}</div><div class="slbl">Athletes</div></div>
      <div class="scard"><div class="snum">${avgCuts}</div><div class="slbl">Avg cuts / athlete</div></div>
      <div class="scard"><div class="snum">${top ? top.count : 0}</div><div class="slbl">Deepest event</div><div style="font-size:9px;color:var(--txt);margin-top:2px;">${top ? top.ev.replace(' SCY','').replace(' LCM','') : '—'}</div></div>`;
  }

  const mx = Math.max(...evData.map(d => d.count), 1);
  const dpContainer = document.getElementById('analytDpContainer');
  if (dpContainer) {
    dpContainer.innerHTML = `<div style="display:flex;flex-direction:column;gap:5px;">
      ${evData.map(d => `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:115px;font-size:11px;font-weight:600;color:var(--txt);flex-shrink:0;">${d.ev.replace(' SCY','').replace(' LCM','')}</div>
          <div style="flex:1;height:20px;background:var(--sur3);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${(d.count/mx*100).toFixed(0)}%;background:${std.color};border-radius:4px;display:flex;align-items:center;padding-left:5px;">
              ${d.count >= 2 ? `<span style="font-size:9px;font-weight:700;color:#fff;">${d.count}</span>` : ''}
            </div>
          </div>
          <div style="width:32px;text-align:right;font-size:11px;font-weight:700;color:${std.color};">${d.pct}%</div>
        </div>`).join('')}
    </div>`;
  }
}
