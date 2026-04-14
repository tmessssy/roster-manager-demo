// ============================================================
//  profile_roadmap.js
//  Cut Roadmap / Goals view for athlete profile page.
//  Drop this file in your app folder and load after app.js.
// ============================================================

// ── State ─────────────────────────────────────────────────────
let _roadmapMode   = 'overview';   // 'overview' | 'roadmap' | 'nearest'
let _roadmapStdId  = null;         // which standard is selected in roadmap mode
let _profileAthId  = null;         // current athlete being viewed

function roadmapIcon(symbol, className) {
  return `<span class="${className} material-symbols-outlined rm-ms-icon" aria-hidden="true">${symbol}</span>`;
}

// ── Entry point — call this from showProfile() ────────────────
function initProfileRoadmap(athleteId) {
  _profileAthId  = athleteId;
  _roadmapMode   = 'overview';
  _roadmapStdId  = null;
}

// ── Build the mode selector UI ────────────────────────────────
function buildRoadmapSelector(athleteId) {
  const sorted = [...S.standards].sort((a, b) => a.priority - b.priority);

  return `
  <div class="rm-selector-wrap" id="rmSelectorWrap">

    <!-- Top row: view mode pills -->
    <div class="rm-mode-row">
      <button class="rm-mode-btn active" id="rmBtnOverview"
        onclick="setRoadmapMode('overview','${athleteId}')">
        ${roadmapIcon('dashboard', 'rm-mode-icon')} Overview
      </button>
      <button class="rm-mode-btn" id="rmBtnRoadmap"
        onclick="setRoadmapMode('roadmap','${athleteId}')">
        ${roadmapIcon('track_changes', 'rm-mode-icon')} Cut Roadmap
      </button>
      <button class="rm-mode-btn" id="rmBtnNearest"
        onclick="setRoadmapMode('nearest','${athleteId}')">
        ${roadmapIcon('near_me', 'rm-mode-icon')} Nearest Cut
      </button>
    </div>

    <!-- Sub-menu: standard selector (only visible in roadmap mode) -->
    <div class="rm-std-row" id="rmStdRow" style="display:none;">
      <div class="rm-std-label">Target standard:</div>
      <div class="rm-std-pills" id="rmStdPills">
        ${sorted.map(std => `
          <button class="rm-std-pill" id="rmPill_${std.id}"
            data-stdid="${std.id}"
            style="--pill-color:${std.color}"
            onclick="selectRoadmapStd('${std.id}','${athleteId}')">
            <span class="rm-pill-dot" style="background:${std.color}"></span>
            ${std.name}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Active mode label -->
    <div class="rm-active-label" id="rmActiveLabel"></div>

  </div>`;
}

// ── Mode switcher ─────────────────────────────────────────────
function setRoadmapMode(mode, athleteId) {
  _roadmapMode  = mode;
  _profileAthId = athleteId;

  // Update mode button states
  ['Overview','Roadmap','Nearest'].forEach(m => {
    const btn = document.getElementById(`rmBtn${m}`);
    if (btn) btn.classList.toggle('active', mode === m.toLowerCase());
  });

  const stdRow = document.getElementById('rmStdRow');
  if (stdRow) stdRow.style.display = mode === 'roadmap' ? 'flex' : 'none';

  if (mode === 'roadmap' && !_roadmapStdId) {
    // Auto-select first standard
    const first = [...S.standards].sort((a,b) => a.priority - b.priority)[0];
    if (first) { _roadmapStdId = first.id; _activateStdPill(first.id); }
  }

  _updateActiveLabel();
  rerenderTimesGrid(athleteId);
}

function selectRoadmapStd(stdId, athleteId) {
  _roadmapStdId = stdId;
  _activateStdPill(stdId);
  _updateActiveLabel();
  rerenderTimesGrid(athleteId);
}

function _activateStdPill(stdId) {
  document.querySelectorAll('.rm-std-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.stdid === stdId);
  });
}

function _updateActiveLabel() {
  const el = document.getElementById('rmActiveLabel');
  if (!el) return;

  if (_roadmapMode === 'overview') {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  if (_roadmapMode === 'nearest') {
    el.innerHTML = `<span class="rm-label-badge" style="background:rgba(255,255,255,.08);color:var(--txt)">${roadmapIcon('near_me', 'rm-badge-icon')}Showing: distance from each athlete's next unachieved cut</span>`;
  } else if (_roadmapMode === 'roadmap' && _roadmapStdId) {
    const std = S.standards.find(s => s.id === _roadmapStdId);
    if (std) el.innerHTML = `<span class="rm-label-badge" style="background:${std.color}22;color:${std.color};border-color:${std.color}44">${roadmapIcon('track_changes', 'rm-badge-icon')}Targeting: ${std.name}</span>`;
  }
}

// ── Re-render just the times grid section ────────────────────
function rerenderTimesGrid(athleteId) {
  const a = S.athletes.find(x => x.id === athleteId);
  if (!a) return;

  const container = document.getElementById('rmTimesContainer');
  if (!container) return;

  if (_roadmapMode === 'overview') {
    container.innerHTML = buildOverviewGrid(a);
  } else if (_roadmapMode === 'roadmap') {
    container.innerHTML = buildRoadmapGrid(a, _roadmapStdId);
  } else if (_roadmapMode === 'nearest') {
    container.innerHTML = buildNearestCutGrid(a);
  }
}

// ── OVERVIEW GRID (existing behavior, re-implemented cleanly) ─
function buildOverviewGrid(a) {
  let html = '';
  for (const stroke of STROKES) {
    const evs = EVENTS.filter(e => gStroke(e) === stroke && a.times[e]);
    if (!evs.length) continue;
    html += `<div class="rm-stroke-section">
      <div class="ctitle">${stroke}</div>
      <div class="tgrid">${evs.map(ev => {
        const t = a.times[ev];
        const c = getBestCut(a, ev);
        return `<div class="tcell" style="background:${c ? c.color+'22' : 'var(--sur2)'};border-color:${c ? c.color : 'var(--bdr)'}">
          <div class="tev">${ev}</div>
          <div class="tval">${t}</div>
          ${c ? `<div class="tstd" style="color:${c.color}">● ${c.name}</div>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;
  }
  if (!html) html = `<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">No times recorded yet</div>`;
  return html;
}

// ── ROADMAP GRID (target a specific standard) ─────────────────
function buildRoadmapGrid(a, stdId) {
  if (!stdId) return '<div style="color:var(--muted);padding:20px;text-align:center;">Select a target standard above</div>';

  const std  = S.standards.find(s => s.id === stdId);
  if (!std) return '';
  const tk   = a.gender === 'female' ? 'timesF' : 'timesM';
  const sortedStds = [...S.standards].sort((a,b) => a.priority - b.priority);

  let html = '';

  for (const stroke of STROKES) {
    const evs = EVENTS.filter(e => gStroke(e) === stroke);
    // Only show events where athlete has a time OR the standard has a cut
    const relevant = evs.filter(e => a.times[e] || std[tk][e]);
    if (!relevant.length) continue;

    html += `<div class="rm-stroke-section"><div class="ctitle">${stroke}</div><div class="tgrid">`;

    relevant.forEach(ev => {
      const athleteTime = a.times[ev];
      const cutTime     = std[tk][ev];

      if (!cutTime) {
        // Standard doesn't have a cut for this event — skip
        return;
      }

      if (!athleteTime) {
        // Athlete has no time — show as "no time" placeholder
        html += `<div class="tcell rm-cell rm-no-time">
          <div class="tev">${ev}</div>
          <div class="tval rm-no-time-val">—</div>
          <div class="rm-cut-target" style="color:var(--muted)">Cut: ${cutTime}</div>
          <div class="rm-delta" style="color:var(--muted);font-size:9px;">No time entered</div>
        </div>`;
        return;
      }

      const ats = t2s(athleteTime);
      const cts = t2s(cutTime);
      if (ats === null || cts === null) return;

      const achieved = ats <= cts;
      const diffSec  = ats - cts;           // negative = already under
      const pct      = Math.abs(diffSec / cts * 100);

      // What color highlight does this athlete's best time currently carry?
      const currentBestCut = getBestCut(a, ev);

      let cellBg, cellBorder, progressPct, statusHtml;

      if (achieved) {
        // Achieved — full color
        cellBg     = std.color + '33';
        cellBorder = std.color;
        progressPct = 100;
        const margin = formatTimeDelta(-diffSec);  // how much under
        statusHtml = `
          <div class="rm-achieved-badge" style="background:${std.color}22;border-color:${std.color}55;color:${std.color}">✓ Achieved</div>
          <div class="rm-delta positive">+${margin} · +${pct.toFixed(1)}% under</div>`;
      } else {
        // Not yet achieved — proximity coloring
        // clamp pct to 0–20% range for coloring (within 20% = close)
        const proximity = Math.max(0, Math.min(1, 1 - (pct / 20)));
        cellBg     = _proximityBg(proximity);
        cellBorder = _proximityBorder(proximity);
        progressPct = proximity * 100;
        const need  = formatTimeDelta(Math.abs(diffSec));
        statusHtml = `
          <div class="rm-cut-target" style="color:${std.color}">Cut: ${cutTime}</div>
          <div class="rm-delta negative">−${need} · −${pct.toFixed(1)}%</div>`;
      }

      html += `<div class="tcell rm-cell" style="background:${cellBg};border-color:${cellBorder};position:relative;overflow:hidden;">
        <div class="rm-progress-bar" style="width:${progressPct}%;background:${achieved ? std.color+'44' : cellBorder+'33'}"></div>
        <div class="tev">${ev}</div>
        <div class="tval">${athleteTime}</div>
        ${statusHtml}
      </div>`;
    });

    html += '</div></div>';
  }

  if (!html) html = '<div style="color:var(--muted);padding:20px;text-align:center;">No relevant events found</div>';
  return html;
}

// ── NEAREST CUT GRID ──────────────────────────────────────────
function buildNearestCutGrid(a) {
  const sortedStds = [...S.standards].sort((a,b) => a.priority - b.priority);
  // priority 1 = easiest, highest priority # = hardest
  // We want to find the NEXT cut above what they've already achieved
  const tk = a.gender === 'female' ? 'timesF' : 'timesM';

  let html = '';

  for (const stroke of STROKES) {
    const evs = EVENTS.filter(e => gStroke(e) === stroke && a.times[e]);
    if (!evs.length) continue;

    html += `<div class="rm-stroke-section"><div class="ctitle">${stroke}</div><div class="tgrid">`;

    evs.forEach(ev => {
      const athleteTime = a.times[ev];
      const ats = t2s(athleteTime);
      if (ats === null) return;

      // Find which cuts athlete has already achieved in this event
      const achievedStds = sortedStds.filter(s => {
        const ct = s[tk][ev]; if (!ct) return false;
        return ats <= t2s(ct);
      });

      // Find which cuts exist for this event at all
      const availableStds = sortedStds.filter(s => s[tk][ev]);
      if (!availableStds.length) return;

      // The "next" target = lowest-priority unachieved cut
      // (priority 1 = easiest, so sort ascending)
      const unachieved = availableStds.filter(s => !achievedStds.includes(s));

      let targetStd, diffSec, achieved, beyondAll = false;

      if (unachieved.length > 0) {
        // Athlete has not yet hit this cut — target is the next one
        targetStd = unachieved[0];  // easiest unachieved
        const cts = t2s(targetStd[tk][ev]);
        diffSec   = ats - cts;   // positive = need to go faster, negative = already under
        achieved  = diffSec <= 0;
      } else {
        // Athlete has beaten ALL available cuts — show how far beyond the hardest they are
        beyondAll = true;
        targetStd = availableStds[availableStds.length - 1];  // hardest
        const cts = t2s(targetStd[tk][ev]);
        diffSec   = ats - cts;  // will be negative (they're faster)
      }

      const pct = Math.abs(diffSec / t2s(targetStd[tk][ev]) * 100);

      let cellBg, cellBorder, progressPct, statusHtml;

      if (beyondAll) {
        // They've exceeded all cuts — green celebration cell
        const margin = formatTimeDelta(Math.abs(diffSec));
        cellBg      = '#16a34a22';
        cellBorder  = '#16a34a';
        progressPct = 100;
        statusHtml  = `
          <div class="rm-achieved-badge" style="background:#16a34a22;border-color:#16a34a55;color:#4ade80">✓ All Cuts</div>
          <div class="rm-delta positive">+${margin} · +${pct.toFixed(1)}% beyond ${targetStd.name}</div>`;
      } else if (achieved) {
        // Redundant safety (should be caught above) 
        cellBg      = targetStd.color + '33';
        cellBorder  = targetStd.color;
        progressPct = 100;
        statusHtml  = `<div class="rm-achieved-badge" style="color:${targetStd.color}">✓ ${targetStd.name}</div>`;
      } else {
        // Normal: show distance from next cut
        const proximity = Math.max(0, Math.min(1, 1 - (pct / 20)));
        cellBg      = _proximityBg(proximity);
        cellBorder  = _proximityBorder(proximity);
        progressPct = proximity * 100;
        const need  = formatTimeDelta(Math.abs(diffSec));
        statusHtml  = `
          <div class="rm-cut-target" style="color:${targetStd.color}">→ ${targetStd.name}: ${targetStd[tk][ev]}</div>
          <div class="rm-delta negative">−${need} · −${pct.toFixed(1)}%</div>`;
      }

      // Show current-best-cut badge if any
      const currentCut = getBestCut(a, ev);

      html += `<div class="tcell rm-cell" style="background:${cellBg};border-color:${cellBorder};position:relative;overflow:hidden;">
        <div class="rm-progress-bar" style="width:${progressPct}%;background:${cellBorder}33"></div>
        <div class="tev">${ev}</div>
        <div class="tval">${athleteTime}</div>
        ${currentCut ? `<div class="tstd" style="color:${currentCut.color};margin-bottom:2px">● ${currentCut.name}</div>` : ''}
        ${statusHtml}
      </div>`;
    });

    html += '</div></div>';
  }

  if (!html) html = `<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">No times recorded yet</div>`;
  return html;
}

// ── Helpers ───────────────────────────────────────────────────

// Format raw seconds into "M:SS.ss" or "SS.ss" delta string
function formatTimeDelta(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '—';
  sec = Math.abs(sec);
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2);
  if (m > 0) return `${m}:${String(s).padStart(5,'0')}`;
  return parseFloat(s).toFixed(2);
}

// Proximity 0→1 (0=far, 1=close/achieved) → background color
// Goes from near-dark (far) → amber (getting close) → green (very close)
function _proximityBg(p) {
  if (p < 0.4)  return 'rgba(255,255,255,0.04)';       // far — near-dark
  if (p < 0.65) return 'rgba(251,146,60,0.10)';        // medium — faint orange
  if (p < 0.85) return 'rgba(251,146,60,0.20)';        // close — warmer orange
  return 'rgba(74,222,128,0.15)';                       // very close — green tint
}

function _proximityBorder(p) {
  if (p < 0.4)  return 'rgba(255,255,255,0.10)';
  if (p < 0.65) return 'rgba(251,146,60,0.35)';
  if (p < 0.85) return 'rgba(251,146,60,0.65)';
  return 'rgba(74,222,128,0.65)';
}

// ── Full profile content builder ──────────────────────────────
// Call this instead of the original profile renderer
// (patched in below via showProfile override)
function buildRoadmapProfileContent(a) {
  const st  = getStats(a);
  const ini = a.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  return `
    <!-- Header (unchanged from original) -->
    <div class="phdr">
      <div class="pav ${a.gender}">${ini}</div>
      <div style="flex:1;min-width:0;">
        <div class="pname">${a.name}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
          ${a.gender==='female'?'♀ Female':'♂ Male'}${a.age?' · '+a.age:''} · ${Object.keys(a.times).length} events
        </div>
        <div class="brow">${badges(st,true)}</div>
      </div>
    </div>

    <!-- Action buttons -->
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px;">
      <button class="btn bsm bp" onclick="openEditTimes('${a.id}')">${roadmapIcon('edit_note', 'btn-icon')}Edit Times</button>
      <button class="btn bsm bs" onclick="openEditAth('${a.id}')">${roadmapIcon('person', 'btn-icon')}Edit Info</button>
      <button class="btn bsm bd" onclick="delAth('${a.id}')">${roadmapIcon('delete', 'btn-icon')}Delete</button>
    </div>

    <!-- ── Roadmap Selector ── -->
    ${buildRoadmapSelector(a.id)}

    <!-- ── Times / Roadmap Grid (swapped by mode) ── -->
    <div id="rmTimesContainer">
      ${buildOverviewGrid(a)}
    </div>
  `;
}
