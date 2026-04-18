// ============================================================
//  attendance.js  v1
//  Full Attendance System for Swim Roster Manager
//
//  Features:
//   • Attendance tab in main nav (5th tab, before Standards)
//   • Take Attendance flow: date → type (GYM | SWIM→AM/PM/SAT) → tap athletes
//   • Edit previously logged sessions
//   • Dashboard: recent sessions list + stats table (ALL / GYM / SWIM tabs)
//   • Stats table: combined % and per-subtype breakdowns
//   • Color-coded percentages (green/yellow/red/purple)
//   • Date range filter
//   • Athlete profile → 4th tab "Attendance"
//   • All data saved to localStorage under swimApp_v3 (attendance key)
//   • Nearest Cut analytics view: Team + Individual athlete selector
//
//  Load after app.js, profile_roadmap.js, analytics.js
// ============================================================

// ─────────────────────────────────────────────────────────────
//  DATA HELPERS
// ─────────────────────────────────────────────────────────────

function getAttendance() {
  if (!S.attendance) S.attendance = [];
  return S.attendance;
}

// Returns sessions filtered by optional date range
function getSessionsInRange(from, to) {
  return getAttendance().filter(s => {
    if (from && s.date < from) return false;
    if (to   && s.date > to)   return false;
    return true;
  });
}

// For a given athlete and set of sessions, compute stats
function calcAthleteStats(athleteId, sessions) {
  const totalSessions = sessions.length;
  const attended = sessions.filter(s => s.present.includes(athleteId)).length;

  const gymSessions  = sessions.filter(s => s.type === 'GYM');
  const swimSessions = sessions.filter(s => s.type === 'SWIM');
  const amSessions   = sessions.filter(s => s.type === 'SWIM' && s.subtype === 'AM');
  const pmSessions   = sessions.filter(s => s.type === 'SWIM' && s.subtype === 'PM');
  const satSessions  = sessions.filter(s => s.type === 'SWIM' && s.subtype === 'SAT');

  const gymAttended  = gymSessions.filter(s => s.present.includes(athleteId)).length;
  const swimAttended = swimSessions.filter(s => s.present.includes(athleteId)).length;
  const amAttended   = amSessions.filter(s => s.present.includes(athleteId)).length;
  const pmAttended   = pmSessions.filter(s => s.present.includes(athleteId)).length;
  const satAttended  = satSessions.filter(s => s.present.includes(athleteId)).length;

  const pct = (a, t) => t === 0 ? null : Math.round((a / t) * 100);

  return {
    total:    { attended, total: totalSessions,        pct: pct(attended, totalSessions) },
    gym:      { attended: gymAttended,  total: gymSessions.length,  pct: pct(gymAttended,  gymSessions.length)  },
    swim:     { attended: swimAttended, total: swimSessions.length, pct: pct(swimAttended, swimSessions.length) },
    am:       { attended: amAttended,   total: amSessions.length,   pct: pct(amAttended,   amSessions.length)   },
    pm:       { attended: pmAttended,   total: pmSessions.length,   pct: pct(pmAttended,   pmSessions.length)   },
    sat:      { attended: satAttended,  total: satSessions.length,  pct: pct(satAttended,  satSessions.length)  },
  };
}

// Team-level stats across all athletes
function calcTeamStats(sessions) {
  const athletes = S.athletes;
  const n = athletes.length;
  if (!n) return null;

  const gymSessions  = sessions.filter(s => s.type === 'GYM');
  const swimSessions = sessions.filter(s => s.type === 'SWIM');
  const amSessions   = sessions.filter(s => s.type === 'SWIM' && s.subtype === 'AM');
  const pmSessions   = sessions.filter(s => s.type === 'SWIM' && s.subtype === 'PM');
  const satSessions  = sessions.filter(s => s.type === 'SWIM' && s.subtype === 'SAT');

  function pctFor(slist) {
    if (!slist.length || !n) return null;
    const possible = slist.length * n;
    const attended = slist.reduce((sum, s) => sum + s.present.length, 0);
    return Math.round((attended / possible) * 100);
  }

  const allAttended  = sessions.reduce((sum, s) => sum + s.present.length, 0);
  const allPossible  = sessions.length * n;
  const totalPct     = allPossible ? Math.round((allAttended / allPossible) * 100) : null;

  return {
    total: { pct: totalPct, sessions: sessions.length },
    gym:   { pct: pctFor(gymSessions),  sessions: gymSessions.length },
    swim:  { pct: pctFor(swimSessions), sessions: swimSessions.length },
    am:    { pct: pctFor(amSessions),   sessions: amSessions.length   },
    pm:    { pct: pctFor(pmSessions),   sessions: pmSessions.length   },
    sat:   { pct: pctFor(satSessions),  sessions: satSessions.length  },
  };
}

// ─────────────────────────────────────────────────────────────
//  COLOR HELPERS
// ─────────────────────────────────────────────────────────────

// For session cards (team % on a single practice)
function sessionPctColor(pct) {
  if (pct === null) return 'var(--muted)';
  if (pct >= 80) return '#4ade80';   // green
  if (pct >= 65) return '#facc15';   // yellow
  return '#f87171';                   // red
}

// For athlete overall attendance table
function athletePctColor(pct) {
  if (pct === null) return 'var(--muted)';
  if (pct >= 87)  return '#4ade80';   // green
  if (pct >= 80)  return '#facc15';   // yellow
  if (pct >= 50)  return '#f87171';   // red
  return '#c084fc';                    // purple
}

function pctDisplay(pct) {
  if (pct === null) return '—';
  return pct + '%';
}

// ─────────────────────────────────────────────────────────────
//  ATTENDANCE PAGE STATE
// ─────────────────────────────────────────────────────────────

let _attView         = 'dashboard';   // 'dashboard' | 'take' | 'edit'
let _attTableFilter  = 'all';         // 'all' | 'gym' | 'swim'
let _attDateFrom     = '';
let _attDateTo       = '';
let _attEditId       = null;          // session being edited

// Take-attendance state
let _takeDate        = '';
let _takeType        = '';            // 'GYM' | 'SWIM'
let _takeSubtype     = '';            // 'AM' | 'PM' | 'SAT'
let _takeStep        = 1;            // 1=type, 2=athletes
let _takePresent     = new Set();

// ─────────────────────────────────────────────────────────────
//  MAIN RENDER ENTRY
// ─────────────────────────────────────────────────────────────

function renderAttendancePage() {
  const container = document.getElementById('attendancePageContent');
  if (!container) return;

  if (_attView === 'take') {
    container.innerHTML = buildTakeAttendanceView();
    _initTakeView();
  } else if (_attView === 'edit') {
    container.innerHTML = buildEditSessionView();
    _initEditView();
  } else {
    container.innerHTML = buildDashboardView();
    _bindDashboardEvents();
  }
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────

function buildDashboardView() {
  const sessions = getAttendance().slice().sort((a, b) => b.date.localeCompare(a.date));
  const filtered = getSessionsInRange(_attDateFrom || null, _attDateTo || null)
                   .slice().sort((a, b) => b.date.localeCompare(a.date));

  return `
  <div style="display:flex;flex-direction:column;gap:14px;padding:0 0 80px;">

    <!-- Take Attendance button + date filter row -->
    <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
      <button class="btn bp" style="font-size:14px;font-weight:800;letter-spacing:.5px;padding:11px 20px;"
        onclick="openTakeAttendance()">
        <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor" style="margin-right:6px;vertical-align:-3px;"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-160 0q-17 0-28.5-11.5T280-440q0-17 11.5-28.5T320-480q17 0 28.5 11.5T360-440q0 17-11.5 28.5T320-400Zm320 0q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-160 0q-17 0-28.5-11.5T280-280q0-17 11.5-28.5T320-320q17 0 28.5 11.5T360-280q0 17-11.5 28.5T320-240Zm320 0q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z"/></svg>
        TAKE ATTENDANCE
      </button>
      <!-- Date range filter -->
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="attFrom" class="fi" style="width:130px;font-size:12px;padding:6px 8px;"
          value="${_attDateFrom}" onchange="setAttDateFilter()" placeholder="From">
        <span style="color:var(--muted);font-size:12px;">–</span>
        <input type="date" id="attTo" class="fi" style="width:130px;font-size:12px;padding:6px 8px;"
          value="${_attDateTo}" onchange="setAttDateFilter()" placeholder="To">
        ${(_attDateFrom || _attDateTo) ? `<button class="btn bsm bs" onclick="clearAttDateFilter()" style="font-size:11px;">✕ Clear</button>` : ''}
      </div>
    </div>

    <!-- Two-column layout: sessions list + stats table -->
    <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">

      <!-- Left: Recent Sessions List -->
      <div style="flex:0 0 220px;min-width:180px;max-width:260px;">
        <div class="ctitle" style="margin-bottom:8px;">Recent Sessions</div>
        ${buildSessionsList(filtered)}
      </div>

      <!-- Right: Stats Table -->
      <div style="flex:1;min-width:280px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          <div class="ctitle" style="margin-bottom:0;">Attendance Stats</div>
          <div class="gtog">
            <button class="gbtn ${_attTableFilter==='all'?'aa':''}" onclick="setAttFilter('all')">All</button>
            <button class="gbtn ${_attTableFilter==='gym'?'aa':''}" onclick="setAttFilter('gym')">Gym</button>
            <button class="gbtn ${_attTableFilter==='swim'?'aa':''}" onclick="setAttFilter('swim')">Swim</button>
          </div>
        </div>
        ${buildStatsTable(filtered)}
      </div>

    </div>
  </div>`;
}

function buildSessionsList(sessions) {
  if (!sessions.length) {
    return `<div style="color:var(--muted);font-size:12px;padding:16px 0;text-align:center;">No sessions logged yet</div>`;
  }

  return sessions.slice(0, 30).map((s, i) => {
    const total = S.athletes.length;
    const count = s.present.length;
    const pct   = total ? Math.round((count / total) * 100) : 0;
    const color = sessionPctColor(pct);
    const label = s.type === 'SWIM' && s.subtype
      ? `SWIM – <span style="color:var(--acc);font-weight:800;">${s.subtype}</span>`
      : s.type;
    const dateStr = formatDateDisplay(s.date);

    return `
    <div style="background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);padding:10px 12px;margin-bottom:6px;cursor:pointer;transition:border-color .15s;"
         onclick="editSession('${s.id}')"
         onmouseenter="this.style.borderColor='var(--acc)'"
         onmouseleave="this.style.borderColor='var(--bdr)'">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div>
          <div style="font-weight:800;font-size:13px;">PRACTICE #${sessions.length - i}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px;">${label}</div>
          <div style="font-size:11px;color:var(--muted);">${dateStr}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:900;color:${color};line-height:1;">${pct}%</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${count}/${total} Athletes</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function buildStatsTable(sessions) {
  const athletes = S.athletes;
  if (!athletes.length) {
    return `<div style="color:var(--muted);font-size:12px;padding:16px 0;text-align:center;">No athletes on roster</div>`;
  }
  if (!sessions.length) {
    return `<div style="color:var(--muted);font-size:12px;padding:16px 0;text-align:center;">No sessions in range</div>`;
  }

  const teamStats = calcTeamStats(sessions);
  const filter = _attTableFilter;

  // Sorted athletes: by last name
  const sorted = [...athletes].sort((a, b) =>
    (a.name.split(' ').slice(-1)[0] || '').localeCompare(b.name.split(' ').slice(-1)[0] || ''));

  // Table header
  let headerCols = '';
  let teamRow = '';

  if (filter === 'all') {
    headerCols = `
      <th style="${thStyle()}">Overall %</th>
      <th style="${thStyle()}">GYM</th>
      <th style="${thStyle()}">SWIM</th>`;
    teamRow = `
      <td style="${tdStyle(athletePctColor(teamStats.total.pct),'big')}"><b>${pctDisplay(teamStats.total.pct)}</b></td>
      <td style="${tdStyle(athletePctColor(teamStats.gym.pct))}">${pctDisplay(teamStats.gym.pct)}</td>
      <td style="${tdStyle(athletePctColor(teamStats.swim.pct))}">${pctDisplay(teamStats.swim.pct)}</td>`;
  } else if (filter === 'gym') {
    headerCols = `<th style="${thStyle()}">GYM %</th>`;
    teamRow    = `<td style="${tdStyle(athletePctColor(teamStats.gym.pct),'big')}"><b>${pctDisplay(teamStats.gym.pct)}</b></td>`;
  } else {
    headerCols = `
      <th style="${thStyle()}">SWIM %</th>
      <th style="${thStyle()}">AM</th>
      <th style="${thStyle()}">PM</th>
      <th style="${thStyle()}">SAT</th>`;
    teamRow = `
      <td style="${tdStyle(athletePctColor(teamStats.swim.pct),'big')}"><b>${pctDisplay(teamStats.swim.pct)}</b></td>
      <td style="${tdStyle(athletePctColor(teamStats.am.pct))}">${pctDisplay(teamStats.am.pct)}</td>
      <td style="${tdStyle(athletePctColor(teamStats.pm.pct))}">${pctDisplay(teamStats.pm.pct)}</td>
      <td style="${tdStyle(athletePctColor(teamStats.sat.pct))}">${pctDisplay(teamStats.sat.pct)}</td>`;
  }

  let rows = sorted.map(a => {
    const st = calcAthleteStats(a.id, sessions);
    const ini = a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    let cells = '';

    if (filter === 'all') {
      const overall = st.total;
      cells = `
        <td style="${tdStyle(athletePctColor(overall.pct),'big')}">
          <b style="font-size:15px;">${pctDisplay(overall.pct)}</b>
          <span style="font-size:9px;color:var(--muted);display:block;">${overall.attended}/${overall.total}</span>
        </td>
        <td style="${tdStyle(athletePctColor(st.gym.pct))}">
          ${pctDisplay(st.gym.pct)}
          ${st.gym.total ? `<span style="font-size:9px;color:var(--muted);display:block;">${st.gym.attended}/${st.gym.total}</span>` : ''}
        </td>
        <td style="${tdStyle(athletePctColor(st.swim.pct))}">
          ${pctDisplay(st.swim.pct)}
          ${st.swim.total ? `<span style="font-size:9px;color:var(--muted);display:block;">${st.swim.attended}/${st.swim.total}</span>` : ''}
        </td>`;
    } else if (filter === 'gym') {
      cells = `
        <td style="${tdStyle(athletePctColor(st.gym.pct),'big')}">
          <b style="font-size:15px;">${pctDisplay(st.gym.pct)}</b>
          <span style="font-size:9px;color:var(--muted);display:block;">${st.gym.attended}/${st.gym.total}</span>
        </td>`;
    } else {
      cells = `
        <td style="${tdStyle(athletePctColor(st.swim.pct),'big')}">
          <b style="font-size:15px;">${pctDisplay(st.swim.pct)}</b>
          <span style="font-size:9px;color:var(--muted);display:block;">${st.swim.attended}/${st.swim.total}</span>
        </td>
        <td style="${tdStyle(athletePctColor(st.am.pct))}">
          ${pctDisplay(st.am.pct)}
          ${st.am.total ? `<span style="font-size:9px;color:var(--muted);display:block;">${st.am.attended}/${st.am.total}</span>` : ''}
        </td>
        <td style="${tdStyle(athletePctColor(st.pm.pct))}">
          ${pctDisplay(st.pm.pct)}
          ${st.pm.total ? `<span style="font-size:9px;color:var(--muted);display:block;">${st.pm.attended}/${st.pm.total}</span>` : ''}
        </td>
        <td style="${tdStyle(athletePctColor(st.sat.pct))}">
          ${pctDisplay(st.sat.pct)}
          ${st.sat.total ? `<span style="font-size:9px;color:var(--muted);display:block;">${st.sat.attended}/${st.sat.total}</span>` : ''}
        </td>`;
    }

    return `
      <tr onclick="showProfile('${a.id}')" style="cursor:pointer;" class="att-row">
        <td style="padding:8px 10px;border-bottom:1px solid var(--bdr);white-space:nowrap;">
          <div style="display:flex;align-items:center;gap:7px;">
            <div class="av ${a.gender}" style="width:28px;height:28px;font-size:11px;flex-shrink:0;">${ini}</div>
            <span style="font-weight:600;font-size:12px;">${a.name}</span>
          </div>
        </td>
        ${cells}
      </tr>`;
  }).join('');

  return `
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table style="width:100%;border-collapse:collapse;background:var(--sur);border-radius:var(--r);overflow:hidden;border:1.5px solid var(--bdr);">
      <thead>
        <tr style="background:var(--sur2);">
          <th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1.5px solid var(--bdr);white-space:nowrap;">
            <span style="text-decoration:underline;cursor:default;">NAME</span>
          </th>
          ${headerCols}
        </tr>
        <!-- Team row -->
        <tr style="background:var(--sur3);">
          <td style="padding:8px 10px;font-weight:800;font-size:12px;letter-spacing:.5px;border-bottom:1.5px solid var(--bdr);color:var(--txt);">TEAM</td>
          ${teamRow}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
  <style>
    .att-row:hover td { background: var(--sur2) !important; }
  </style>`;
}

function thStyle() {
  return 'padding:9px 8px;text-align:center;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1.5px solid var(--bdr);border-left:1px solid var(--bdr);white-space:nowrap;min-width:60px;';
}
function tdStyle(color, size) {
  const fs = size === 'big' ? '14px' : '12px';
  return `padding:7px 8px;text-align:center;font-size:${fs};font-weight:700;color:${color};border-bottom:1px solid var(--bdr);border-left:1px solid var(--bdr);vertical-align:middle;`;
}

function formatDateDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function _bindDashboardEvents() {
  // Already bound via inline onclick
}

function setAttFilter(f) {
  _attTableFilter = f;
  renderAttendancePage();
}

function setAttDateFilter() {
  _attDateFrom = document.getElementById('attFrom')?.value || '';
  _attDateTo   = document.getElementById('attTo')?.value   || '';
  renderAttendancePage();
}

function clearAttDateFilter() {
  _attDateFrom = '';
  _attDateTo   = '';
  renderAttendancePage();
}

// ─────────────────────────────────────────────────────────────
//  TAKE ATTENDANCE VIEW
// ─────────────────────────────────────────────────────────────

function openTakeAttendance() {
  _attView     = 'take';
  _attEditId   = null;
  _takeDate    = new Date().toISOString().slice(0, 10);
  _takeType    = '';
  _takeSubtype = '';
  _takeStep    = 1;
  _takePresent = new Set();
  renderAttendancePage();
}

function buildTakeAttendanceView() {
  return `
  <div style="max-width:520px;margin:0 auto;padding-bottom:80px;">
    <button class="bbtn" onclick="cancelTakeAttendance()" style="margin-bottom:14px;">
      ← Back to Attendance
    </button>
    <div class="card" style="padding:18px;">
      <div class="ctitle" style="margin-bottom:14px;">📋 Take Attendance</div>

      <!-- Date picker -->
      <div class="fg">
        <label class="fl">Practice Date</label>
        <input type="date" class="fi" id="takeDateInput" value="${_takeDate}"
          onchange="_takeDate=this.value">
      </div>

      <!-- Step 1: Type selection -->
      <div id="takeTypeSection">
        <label class="fl" style="margin-bottom:8px;">Practice Type</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          <button id="typeBtnGYM"
            class="att-type-btn ${_takeType==='GYM'?'att-type-active':''}"
            onclick="selectTakeType('GYM')">
            💪 GYM
          </button>
          <button id="typeBtnSWIM"
            class="att-type-btn ${_takeType==='SWIM'?'att-type-active':''}"
            onclick="selectTakeType('SWIM')">
            🏊 SWIM
          </button>
        </div>

        <!-- SWIM subtypes -->
        <div id="swimSubtypes" style="display:${_takeType==='SWIM'?'flex':'none'};gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          <label class="fl" style="width:100%;margin-bottom:6px;">Session Time</label>
          <button id="subtypeAM"  class="att-sub-btn ${_takeSubtype==='AM' ?'att-sub-active':''}" onclick="selectSubtype('AM')">☀️ AM</button>
          <button id="subtypePM"  class="att-sub-btn ${_takeSubtype==='PM' ?'att-sub-active':''}" onclick="selectSubtype('PM')">🌆 PM</button>
          <button id="subtypeSAT" class="att-sub-btn ${_takeSubtype==='SAT'?'att-sub-active':''}" onclick="selectSubtype('SAT')">📅 SAT</button>
        </div>
      </div>

      <!-- Divider -->
      <div style="height:1px;background:var(--bdr);margin:4px 0 14px;"></div>

      <!-- Step 2: Athlete roster -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <label class="fl" style="margin-bottom:0;">Mark Present</label>
          <div style="display:flex;gap:6px;">
            <button class="btn bsm bs" onclick="selectAllAthletes()" style="font-size:11px;">All</button>
            <button class="btn bsm bs" onclick="clearAllAthletes()" style="font-size:11px;">None</button>
          </div>
        </div>
        <div id="athleteRosterGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
          ${buildAthleteToggleButtons()}
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--muted);text-align:center;" id="presentCount">
          ${_takePresent.size} of ${S.athletes.length} athletes marked present
        </div>
      </div>

      <!-- Save button -->
      <div style="margin-top:18px;">
        <button class="btn bp bfl" onclick="saveTakeAttendance()" style="font-size:15px;font-weight:800;padding:13px;">
          ✓ Save Attendance
        </button>
      </div>
    </div>
  </div>

  <style>
    .att-type-btn {
      flex: 1; min-width: 100px; padding: 14px 12px;
      border-radius: var(--r); border: 2px solid var(--bdr);
      background: var(--sur2); color: var(--txt);
      font-family: var(--font); font-size: 15px; font-weight: 800;
      cursor: pointer; transition: all .15s; letter-spacing:.5px;
    }
    .att-type-btn:hover { border-color: var(--acc); background: var(--sur); }
    .att-type-active { border-color: var(--acc) !important; background: var(--acc) !important; color: #fff !important; }

    .att-sub-btn {
      padding: 9px 16px; border-radius: var(--r); border: 2px solid var(--bdr);
      background: var(--sur2); color: var(--txt);
      font-family: var(--font); font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all .15s;
    }
    .att-sub-btn:hover { border-color: var(--acc); }
    .att-sub-active { border-color: var(--acc) !important; background: var(--acc) !important; color: #fff !important; }

    .att-ath-btn {
      padding: 9px 10px; border-radius: var(--r); border: 2px solid var(--bdr);
      background: var(--sur2); color: var(--txt);
      font-family: var(--font); font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all .15s; text-align: center;
      display: flex; align-items: center; gap: 7px;
    }
    .att-ath-btn:hover { border-color: var(--acc); }
    .att-ath-present {
      border-color: #4ade80 !important;
      background: #4ade8022 !important;
      color: var(--txt) !important;
    }
    .att-ath-present .att-check { color: #4ade80; }
  </style>`;
}

function buildAthleteToggleButtons() {
  const sorted = [...S.athletes].sort((a, b) =>
    (a.name.split(' ').slice(-1)[0] || '').localeCompare(b.name.split(' ').slice(-1)[0] || ''));

  return sorted.map(a => {
    const isPresent = _takePresent.has(a.id);
    const ini = a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    return `
    <button id="athBtn_${a.id}"
      class="att-ath-btn ${isPresent ? 'att-ath-present' : ''}"
      onclick="toggleAthPresent('${a.id}')">
      <div class="av ${a.gender}" style="width:26px;height:26px;font-size:10px;flex-shrink:0;">${ini}</div>
      <span style="flex:1;text-align:left;font-size:11px;line-height:1.2;">${a.name}</span>
      <span class="att-check" style="font-size:14px;">${isPresent ? '✓' : ''}</span>
    </button>`;
  }).join('');
}

function _initTakeView() {
  // Reflect current state if coming back from step 2
}

function selectTakeType(type) {
  _takeType = type;
  if (type !== 'SWIM') _takeSubtype = '';
  renderAttendancePage();
}

function selectSubtype(sub) {
  _takeSubtype = sub;
  const btns = ['AM', 'PM', 'SAT'];
  btns.forEach(s => {
    const el = document.getElementById('subtype' + s);
    if (el) el.classList.toggle('att-sub-active', s === sub);
  });
}

function toggleAthPresent(id) {
  if (_takePresent.has(id)) {
    _takePresent.delete(id);
  } else {
    _takePresent.add(id);
  }
  const btn = document.getElementById('athBtn_' + id);
  if (btn) {
    btn.classList.toggle('att-ath-present', _takePresent.has(id));
    const check = btn.querySelector('.att-check');
    if (check) check.textContent = _takePresent.has(id) ? '✓' : '';
  }
  const counter = document.getElementById('presentCount');
  if (counter) counter.textContent = `${_takePresent.size} of ${S.athletes.length} athletes marked present`;
}

function selectAllAthletes() {
  S.athletes.forEach(a => _takePresent.add(a.id));
  document.querySelectorAll('.att-ath-btn').forEach(btn => {
    btn.classList.add('att-ath-present');
    const check = btn.querySelector('.att-check');
    if (check) check.textContent = '✓';
  });
  const counter = document.getElementById('presentCount');
  if (counter) counter.textContent = `${_takePresent.size} of ${S.athletes.length} athletes marked present`;
}

function clearAllAthletes() {
  _takePresent.clear();
  document.querySelectorAll('.att-ath-btn').forEach(btn => {
    btn.classList.remove('att-ath-present');
    const check = btn.querySelector('.att-check');
    if (check) check.textContent = '';
  });
  const counter = document.getElementById('presentCount');
  if (counter) counter.textContent = `0 of ${S.athletes.length} athletes marked present`;
}

function saveTakeAttendance() {
  const date = document.getElementById('takeDateInput')?.value || _takeDate;
  if (!date) { AppBridge.showToast('Please select a date'); return; }
  if (!_takeType) { AppBridge.showToast('Please select a practice type'); return; }
  if (_takeType === 'SWIM' && !_takeSubtype) { AppBridge.showToast('Please select AM, PM, or SAT for SWIM'); return; }

  if (!S.attendance) S.attendance = [];

  const session = {
    id:       'att_' + Date.now(),
    date:     date,
    type:     _takeType,
    subtype:  _takeType === 'SWIM' ? _takeSubtype : null,
    present:  Array.from(_takePresent),
    createdAt: new Date().toISOString(),
  };

  S.attendance.push(session);
  save();

  AppBridge.showToast('✓ Attendance saved!');
  _attView = 'dashboard';
  renderAttendancePage();
}

function cancelTakeAttendance() {
  _attView = 'dashboard';
  renderAttendancePage();
}

// ─────────────────────────────────────────────────────────────
//  EDIT SESSION VIEW
// ─────────────────────────────────────────────────────────────

function editSession(id) {
  const s = getAttendance().find(x => x.id === id);
  if (!s) return;
  _attEditId   = id;
  _attView     = 'edit';
  _takeDate    = s.date;
  _takeType    = s.type;
  _takeSubtype = s.subtype || '';
  _takePresent = new Set(s.present);
  renderAttendancePage();
}

function buildEditSessionView() {
  const s = getAttendance().find(x => x.id === _attEditId);
  if (!s) { _attView = 'dashboard'; return buildDashboardView(); }

  // Reuse the take view HTML structure but with Edit title and Delete button
  const base = buildTakeAttendanceView();
  return base
    .replace('📋 Take Attendance', `✏️ Edit Session — ${formatDateDisplay(s.date)}`)
    .replace('← Back to Attendance', '← Back to Attendance')
    .replace('✓ Save Attendance', '✓ Update Attendance')
    .replace('cancelTakeAttendance()', 'cancelEditSession()')
    .replace('saveTakeAttendance()', 'saveEditSession()')
    .replace('</div>\n  <style>', `
      <div style="margin-top:8px;">
        <button class="btn bd bfl" onclick="deleteSession('${s.id}')" style="font-size:13px;">
          🗑️ Delete This Session
        </button>
      </div>
    </div>
  <style>`);
}

function _initEditView() { /* state already set in editSession() */ }

function saveEditSession() {
  const date = document.getElementById('takeDateInput')?.value || _takeDate;
  if (!date) { AppBridge.showToast('Please select a date'); return; }
  if (!_takeType) { AppBridge.showToast('Please select a practice type'); return; }
  if (_takeType === 'SWIM' && !_takeSubtype) { AppBridge.showToast('Please select AM, PM, or SAT'); return; }

  const sessions = getAttendance();
  const idx = sessions.findIndex(x => x.id === _attEditId);
  if (idx === -1) { AppBridge.showToast('Session not found'); return; }

  sessions[idx] = {
    ...sessions[idx],
    date:    date,
    type:    _takeType,
    subtype: _takeType === 'SWIM' ? _takeSubtype : null,
    present: Array.from(_takePresent),
    updatedAt: new Date().toISOString(),
  };

  save();
  AppBridge.showToast('✓ Session updated');
  _attView = 'dashboard';
  renderAttendancePage();
}

function cancelEditSession() {
  _attView = 'dashboard';
  renderAttendancePage();
}

function deleteSession(id) {
  if (!confirm('Delete this practice session? This cannot be undone.')) return;
  S.attendance = getAttendance().filter(x => x.id !== id);
  save();
  AppBridge.showToast('Session deleted');
  _attView = 'dashboard';
  renderAttendancePage();
}

// ─────────────────────────────────────────────────────────────
//  ATHLETE PROFILE — 4th TAB
// ─────────────────────────────────────────────────────────────

function buildProfileAttendanceTab(athleteId) {
  const a = S.athletes.find(x => x.id === athleteId);
  if (!a) return '';

  const sessions = getAttendance().slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) {
    return `<div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px;">
      No attendance data recorded yet.<br>
      <button class="btn bp bsm" style="margin-top:12px;" onclick="openTakeAttendance()">Take Attendance</button>
    </div>`;
  }

  const st = calcAthleteStats(athleteId, sessions);
  const ini = a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  function statBlock(label, data, big) {
    if (data.total === 0) return `
      <div style="background:var(--sur2);border-radius:var(--r);border:1px solid var(--bdr);padding:10px 12px;text-align:center;">
        <div style="font-size:${big?'22px':'16px'};font-weight:800;color:var(--muted);">—</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px;">${label}</div>
      </div>`;
    const color = athletePctColor(data.pct);
    return `
      <div style="background:var(--sur2);border-radius:var(--r);border:1px solid var(--bdr);padding:10px 12px;text-align:center;">
        <div style="font-size:${big?'26px':'18px'};font-weight:900;color:${color};line-height:1;">${data.pct}%</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px;">${data.attended}/${data.total} ${label}</div>
      </div>`;
  }

  // Recent sessions for this athlete
  const recentHtml = sessions.slice(0, 10).map(s => {
    const present = s.present.includes(athleteId);
    const label = s.type === 'SWIM' && s.subtype ? `SWIM – ${s.subtype}` : s.type;
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bdr);">
      <div>
        <div style="font-size:12px;font-weight:700;">${label}</div>
        <div style="font-size:10px;color:var(--muted);">${formatDateDisplay(s.date)}</div>
      </div>
      <div style="font-size:18px;">${present ? '<span style="color:#4ade80;font-weight:900;">✓</span>' : '<span style="color:#f87171;font-weight:900;">✗</span>'}</div>
    </div>`;
  }).join('');

  return `
  <div style="padding:0 0 20px;">
    <!-- Overall stats grid -->
    <div class="ctitle" style="margin-bottom:10px;">Overall Attendance</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
      ${statBlock('Combined',   st.total, true)}
      ${statBlock('Gym',        st.gym,   false)}
      ${statBlock('Swim',       st.swim,  false)}
    </div>
    <div class="ctitle" style="margin-bottom:10px;">Swim Breakdown</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px;">
      ${statBlock('AM',  st.am,  false)}
      ${statBlock('PM',  st.pm,  false)}
      ${statBlock('SAT', st.sat, false)}
    </div>
    <div class="ctitle" style="margin-bottom:8px;">Recent Sessions</div>
    <div>${recentHtml}</div>
    ${sessions.length > 10 ? `<div style="font-size:11px;color:var(--muted);text-align:center;padding:10px 0;">Showing last 10 of ${sessions.length} sessions</div>` : ''}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
//  NEAREST CUT — ANALYTICS ENHANCEMENT
//  State variables used by the enhanced bubble/nearest cut view
// ─────────────────────────────────────────────────────────────

let _bubbleViewMode   = 'team';      // 'team' | 'athlete'
let _bubbleAthId      = null;
let _bubbleTargetStd  = null;        // null = next cut only

function renderAthleteBubble() {
  const container = document.getElementById('bubbleList');
  if (!container) return;

  if (!_bubbleAthId) {
    container.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">Select an athlete above to view their nearest cuts.</div>`;
    return;
  }

  const a = S.athletes.find(x => x.id === _bubbleAthId);
  if (!a) { container.innerHTML = `<div style="color:var(--muted);">Athlete not found</div>`; return; }

  const tk = a.gender === 'female' ? 'timesF' : 'timesM';
  const sortedStds = [...S.standards].sort((x, y) => x.priority - y.priority);

  const results = [];

  EVENTS.forEach(ev => {
    const ats = t2s(a.times[ev]);
    if (ats === null) return;

    let targetStds = [];
    if (_bubbleTargetStd) {
      const std = sortedStds.find(s => s.id === _bubbleTargetStd);
      if (std) targetStds = [std];
    } else {
      // Find the next unachieved cut
      const unachieved = sortedStds.filter(s => {
        const cv = s[tk][ev]; if (!cv) return false;
        const cs = t2s(cv); return cs !== null && ats > cs;
      });
      if (unachieved.length) targetStds = [unachieved[0]];
    }

    if (!targetStds.length) return;

    const target = targetStds[0];
    const cts = t2s(target[tk][ev]);
    if (!cts) return;

    const diff = ats - cts;

    results.push({
      event:    ev,
      time:     a.times[ev],
      cutName:  target.name,
      cutColor: target.color,
      cutTime:  target[tk][ev],
      diffSec:  diff,
      isAchieved: diff <= 0,
    });
  });

  // Sort: unachieved closest first, then achieved
  const unachieved = results.filter(r => !r.isAchieved).sort((a, b) => a.diffSec - b.diffSec);
  const achieved   = results.filter(r => r.isAchieved).sort((a, b) => a.diffSec - b.diffSec);
  const ordered    = [...unachieved, ...achieved];

  if (!ordered.length) {
    container.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">No times recorded for this athlete.</div>`;
    return;
  }

  container.innerHTML = ordered.map(item => {
    if (item.isAchieved) {
      return `
      <div class="bubble-row" style="opacity:.6;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:13px;">${item.event}</span>
            <span style="font-size:11px;color:${item.cutColor};font-weight:700;">✓ ${item.cutName}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">${item.time} ✓ achieved</div>
        </div>
      </div>`;
    }

    const diffStr = item.diffSec.toFixed(2);
    const threshold = typeof getBubbleThreshold === 'function' ? getBubbleThreshold(item.event) : 2.0;
    const onBubble  = item.diffSec <= threshold;

    return `
    <div class="bubble-row" style="${onBubble ? 'background:'+item.cutColor+'11;border-color:'+item.cutColor+'44;' : ''}">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:13px;">${item.event}</span>
          <span style="font-size:11px;color:var(--muted);">→ <span style="color:${item.cutColor};font-weight:700;">${item.cutName}</span></span>
          ${onBubble ? `<span style="font-size:10px;background:${item.cutColor};color:#fff;padding:1px 6px;border-radius:4px;font-weight:700;">ON BUBBLE</span>` : ''}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;align-items:center;">
          <span style="font-size:11px;color:var(--muted);">${item.time} → ${item.cutTime}</span>
          <span style="font-size:11px;font-weight:800;color:#fb923c;">−${diffStr}s</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
//  SAVE / LOAD
//  app.js save() now includes S.attendance (patched at source).
//  SwimRoster.html loadState patch includes S.attendance.
//  We just ensure S.attendance is initialized on startup.
// ─────────────────────────────────────────────────────────────

// Ensure S.attendance is populated on startup
(function initAttendanceData() {
  if (!S.attendance) {
    try {
      const raw = localStorage.getItem('swimApp_v3');
      S.attendance = raw ? (JSON.parse(raw).attendance || []) : [];
    } catch(e) { S.attendance = []; }
  }
})();

// ─────────────────────────────────────────────────────────────
//  PROFILE HOOK — add Attendance as 4th profile tab
//  profile_roadmap.js uses:
//    buildRoadmapSelector() → produces the mode buttons
//    rerenderTimesGrid()    → swaps #rmTimesContainer content
//    setRoadmapMode()       → switches modes
// ─────────────────────────────────────────────────────────────

// 1. Patch buildRoadmapProfileContent to inject Attendance button
//    (same approach as meet_profile.js — targets the content builder
//     rather than the selector sub-function, avoiding regex chaining)
document.addEventListener('DOMContentLoaded', function() {
  if (typeof buildRoadmapProfileContent === 'function') {
    const _origBuildContent = buildRoadmapProfileContent;
    buildRoadmapProfileContent = function(a) {
      const base = _origBuildContent(a);
      // Guard against double-injection
      if (base.includes('rmBtnAttendance')) return base;
      return base.replace(
        /(id="rmBtnNearest"[\s\S]*?<\/button>)([\s\S]*?)(<\/div>[\s\n\r]*<!-- Sub-menu)/,
        (match, nearestBtn, between, tail) => {
          return nearestBtn + between +
            `\n      <button class="rm-mode-btn" id="rmBtnAttendance"
        onclick="setRoadmapMode('attendance','${a.id}')">
        <span class="rm-mode-icon material-symbols-outlined" aria-hidden="true">calendar_month</span>
        Attendance
      </button>` + tail;
        }
      );
    };
  }
});

// 2. Patch rerenderTimesGrid to handle 'attendance' mode
//    (profile_roadmap.js defines this — we wrap it after it loads)
document.addEventListener('DOMContentLoaded', function() {
  if (typeof rerenderTimesGrid === 'function') {
    const _origRerender = rerenderTimesGrid;
    rerenderTimesGrid = function(athId) {
      if (_roadmapMode === 'attendance') {
        const container = document.getElementById('rmTimesContainer');
        if (container) { container.innerHTML = buildProfileAttendanceTab(athId); return; }
      }
      _origRerender(athId);
    };
  }

  // 3. Patch setRoadmapMode to handle 'attendance'
  if (typeof setRoadmapMode === 'function') {
    const _origSetMode = setRoadmapMode;
    setRoadmapMode = function(mode, athleteId) {
      if (mode === 'attendance') {
        _profileAthId = athleteId;
        _roadmapMode  = 'attendance';
        // Deactivate other mode buttons
        ['Overview','Roadmap','Nearest'].forEach(m => {
          const btn = document.getElementById('rmBtn' + m);
          if (btn) btn.classList.remove('active');
        });
        const attBtn = document.getElementById('rmBtnAttendance');
        if (attBtn) attBtn.classList.add('active');
        // Hide standard sub-row
        const stdRow = document.getElementById('rmStdRow');
        if (stdRow) stdRow.style.display = 'none';
        // Render attendance content
        const container = document.getElementById('rmTimesContainer');
        if (container) container.innerHTML = buildProfileAttendanceTab(athleteId);
        return;
      }
      _origSetMode(mode, athleteId);
    };
  }
});

// ─────────────────────────────────────────────────────────────
//  NAV TAB & PAGE HOOKS
//  showPage for 'attendance' is handled in SwimRoster.html's
//  existing showPage override to avoid chaining conflicts.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  ANALYTICS BUBBLE — Enhanced "Nearest Cut" view
//  Replaces the team-only bubble fbar with Team/Athlete toggle
// ─────────────────────────────────────────────────────────────

// Patch switchAnalyticsTab to inject our enhanced controls into
// the analytBubble div when the Bubble tab is activated
const _origSwitchAnalyticsTab = typeof switchAnalyticsTab === 'function' ? switchAnalyticsTab : null;
if (_origSwitchAnalyticsTab) {
  switchAnalyticsTab = function(tab) {
    _origSwitchAnalyticsTab(tab);
    if (tab === 'bubble') {
      // Inject the enhanced view mode controls into #analytBubble
      const bubbleSection = document.getElementById('analytBubble');
      if (bubbleSection && !bubbleSection.querySelector('#nearestCutControls')) {
        // Replace the fbar content with our enhanced controls
        const fbar = bubbleSection.querySelector('.fbar');
        if (fbar) {
          fbar.id = 'nearestCutControls';
          fbar.innerHTML = _buildNearestCutControls();
        }
      }
      // Render the correct view
      _renderNearestCutContent();
    }
  };
}

function _buildNearestCutControls() {
  const athletes = S.athletes;
  const athleteOptions = [...athletes]
    .sort((a, b) => (a.name.split(' ').slice(-1)[0] || '').localeCompare(b.name.split(' ').slice(-1)[0] || ''))
    .map(a => `<option value="${a.id}" ${a.id === _bubbleAthId ? 'selected' : ''}>${a.name}</option>`)
    .join('');

  const stdOptions = [...S.standards]
    .sort((a, b) => a.priority - b.priority)
    .map(s => `<option value="${s.id}" ${s.id === _bubbleTargetStd ? 'selected' : ''}>${s.name}</option>`)
    .join('');

  return `
    <!-- View mode: Team vs Athlete -->
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%;">
      <div class="gtog">
        <button class="gbtn ${_bubbleViewMode==='team'?'aa':''}" onclick="ncSetMode('team')">Team</button>
        <button class="gbtn ${_bubbleViewMode==='athlete'?'aa':''}" onclick="ncSetMode('athlete')">Athlete</button>
      </div>

      ${_bubbleViewMode === 'team' ? `
        <!-- Team: gender filter -->
        <div class="gtog">
          <button class="gbtn aa" id="bbgAll" onclick="setBubbleG('all')">All</button>
          <button class="gbtn" id="bbgM" onclick="setBubbleG('male')">Men</button>
          <button class="gbtn" id="bbgF" onclick="setBubbleG('female')">Women</button>
        </div>
        <div style="font-size:10px;color:var(--muted);" id="bubbleThresholdNote"></div>
      ` : `
        <!-- Athlete: athlete selector + optional cut selector -->
        <select class="fi" id="ncAthSelect" style="flex:1;max-width:200px;font-size:12px;padding:6px 8px;"
          onchange="ncSetAthlete(this.value)">
          <option value="">Select Athlete…</option>
          ${athleteOptions}
        </select>
        ${_bubbleAthId ? `
          <select class="fi" id="ncCutSelect" style="flex:1;max-width:180px;font-size:12px;padding:6px 8px;"
            onchange="ncSetCut(this.value)">
            <option value="">Next Cut (auto)</option>
            ${stdOptions}
          </select>
        ` : ''}
      `}
    </div>`;
}

function ncSetMode(mode) {
  _bubbleViewMode = mode;
  if (mode === 'team') { _bubbleAthId = null; _bubbleTargetStd = null; }
  // Refresh controls
  const fbar = document.getElementById('nearestCutControls');
  if (fbar) fbar.innerHTML = _buildNearestCutControls();
  _renderNearestCutContent();
}

function ncSetAthlete(id) {
  _bubbleAthId = id || null;
  _bubbleTargetStd = null;
  const fbar = document.getElementById('nearestCutControls');
  if (fbar) fbar.innerHTML = _buildNearestCutControls();
  _renderNearestCutContent();
}

function ncSetCut(stdId) {
  _bubbleTargetStd = stdId || null;
  renderAthleteBubble();
}

function _renderNearestCutContent() {
  if (_bubbleViewMode === 'team') {
    if (typeof renderBubbleThresholdNote === 'function') renderBubbleThresholdNote();
    if (typeof renderBubbleWidget === 'function') renderBubbleWidget(typeof bubbleGender !== 'undefined' ? bubbleGender : 'all');
  } else {
    renderAthleteBubble();
  }
}

// Override setBubbleG to also trigger _renderNearestCutContent in athlete mode
const _origSetBubbleG = typeof setBubbleG === 'function' ? setBubbleG : null;
if (_origSetBubbleG) {
  setBubbleG = function(g) {
    _origSetBubbleG(g);
    // Re-sync the team gender buttons if they exist in our controls
    ['All','M','F'].forEach(x => {
      const btn = document.getElementById('bbg'+x);
      if (btn) {
        const gmap = {All:'all', M:'male', F:'female'};
        const cls = {all:'aa', male:'am', female:'af'};
        btn.className = 'gbtn' + (gmap[x] === g ? ' ' + cls[g] : '');
      }
    });
  };
}

// ─────────────────────────────────────────────────────────────
//  LIGHT MODE ACCENT COLOR PICKER FIX
//  The canvas-based picker background defaults to black which
//  makes it invisible in light mode. Patch to force a white bg.
// ─────────────────────────────────────────────────────────────

const _origOpenColorPicker = typeof openColorPicker === 'function' ? openColorPicker : null;
if (_origOpenColorPicker) {
  openColorPicker = function(hex, callback) {
    _origOpenColorPicker(hex, callback);
    // After a tick let the overlay open, then fix canvas bg
    setTimeout(() => {
      const canvas = document.getElementById('csCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        // Re-draw with forced dimensions to avoid invisible 0x0 render
        canvas.width  = canvas.offsetWidth  || 260;
        canvas.height = canvas.offsetHeight || 170;
        // csDrawSpectrum is internal — trigger it by faking a hue update
        const hueInput = document.getElementById('csHue');
        if (hueInput) {
          const ev = new Event('input');
          hueInput.dispatchEvent(ev);
        }
      }
      // Also ensure the overlay itself has a proper bg in light mode
      const overlay = document.getElementById('csOverlay');
      if (overlay) {
        overlay.style.zIndex = '9999';
      }
    }, 50);
  };
}

console.log('[attendance.js] Loaded ✓');
