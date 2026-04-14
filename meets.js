// ============================================================
//  meets.js — Meet Results, Season Progress & Live Poller
//  Plugs into the existing Roster Manager app (S, save, t2s, etc.)
// ============================================================

// ── Meet Data Structure ──────────────────────────────────────
// S.meets = [
//   {
//     id: "m_...",
//     name: "PNS Champs 2025",
//     date: "2025-02-14",
//     location: "King County Aquatics",
//     course: "SCY",
//     liveUrl: "http://...",        // HY-TEK live results URL (optional)
//     results: [
//       {
//         athleteId: "f1",
//         event: "100 Free SCY",
//         time: "53.42",
//         place: 3,
//         heat: 2,
//         lane: 4,
//         splits: [],
//         isPersonalBest: true,
//         isSeasonBest: true,
//         addedAt: "2025-02-14T14:23:00Z",
//         source: "manual" | "live" | "scraped"
//       }
//     ]
//   }
// ]

// ── Init meets array in state ────────────────────────────────
function initMeets() {
  if (!S.meets) S.meets = [];
  if (!S.livePollers) S.livePollers = {};
}

// ── Helpers ──────────────────────────────────────────────────
function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// Get all results for an athlete across all meets
function getAthleteResults(athleteId) {
  initMeets();
  const results = [];
  for (const meet of S.meets) {
    for (const r of meet.results || []) {
      if (r.athleteId === athleteId) {
        results.push({ ...r, meet });
      }
    }
  }
  return results.sort((a, b) => new Date(a.meet.date) - new Date(b.meet.date));
}

// Get all results for an athlete in a specific event, sorted by date
function getAthleteEventHistory(athleteId, event) {
  return getAthleteResults(athleteId)
    .filter(r => r.event === event)
    .sort((a, b) => new Date(a.meet.date) - new Date(b.meet.date));
}

// Season best for an athlete/event
function getSeasonBest(athleteId, event) {
  const res = getAthleteEventHistory(athleteId, event);
  if (!res.length) return null;
  return res.reduce((best, r) => {
    const ts = t2s(r.time), tb = t2s(best.time);
    return (ts !== null && (tb === null || ts < tb)) ? r : best;
  });
}

// Determine if a result is a PB compared to pre-season times
function isPersonalBest(athleteId, event, timeStr, meetDate) {
  const athlete = S.athletes.find(a => a.id === athleteId);
  if (!athlete) return false;
  const ts = t2s(timeStr);
  if (ts === null) return false;
  // Check all prior meet results
  const prior = getAthleteEventHistory(athleteId, event)
    .filter(r => r.meet.date < meetDate);
  // Also check the "base" time in athlete.times (pre-app times)
  const baseTime = t2s(athlete.times[event]);
  const priorBest = prior.reduce((best, r) => {
    const rt = t2s(r.time);
    return (rt !== null && (best === null || rt < best)) ? rt : best;
  }, baseTime);
  return priorBest === null || ts < priorBest;
}

// Delta string: "-1.23" or "+0.45"
function timeDelta(newTime, oldTime) {
  const nt = t2s(newTime), ot = t2s(oldTime);
  if (nt === null || ot === null) return null;
  const d = nt - ot;
  const abs = Math.abs(d);
  const sign = d < 0 ? '-' : '+';
  const mins = Math.floor(abs / 60);
  const secs = (abs % 60).toFixed(2);
  if (mins > 0) return sign + mins + ':' + secs.padStart(5, '0');
  return sign + parseFloat(secs).toFixed(2);
}

// ── MEETS PAGE ───────────────────────────────────────────────
function renderMeetsPage() {
  initMeets();
  const container = document.getElementById('meetsPageContent');
  if (!container) return;

  const activePoll = Object.keys(S.livePollers || {}).find(id => S.livePollers[id]?.active);

  let html = '';

  // Live poll status banner
  if (activePoll) {
    const meet = S.meets.find(m => m.id === activePoll);
    html += `<div class="live-banner">
      <div class="live-dot"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">LIVE: ${meet ? meet.name : 'Meet'}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Polling every 90s · Last: ${timeAgo(S.livePollers[activePoll]?.lastPoll)}</div>
      </div>
      <button class="btn bsm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.25);" onclick="stopLivePoller('${activePoll}')">Stop</button>
    </div>`;
  }

  // Meets list
  if (!S.meets.length) {
    html += `<div class="nd"><div class="ndi">🏟️</div>No meets yet.<br><span style="font-size:11px;">Add a meet to start tracking results.</span></div>`;
  } else {
    const sorted = [...S.meets].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(meet => {
      const resultCount = (meet.results || []).length;
      const athletes = [...new Set((meet.results || []).map(r => r.athleteId))];
      const pbs = (meet.results || []).filter(r => r.isPersonalBest).length;
      const hasPoller = S.livePollers?.[meet.id]?.active;

      html += `<div class="meet-card" onclick="showMeetDetail('${meet.id}')">
        <div class="meet-card-hdr">
          <div style="flex:1;min-width:0;">
            <div class="meet-name">${meet.name}</div>
            <div class="meet-meta">${formatDate(meet.date)}${meet.location ? ' · ' + meet.location : ''} · ${meet.course}</div>
          </div>
          <div style="display:flex;gap:5px;align-items:center;">
            ${hasPoller ? '<span class="live-pill">LIVE</span>' : ''}
            <button class="btn bsm bs" onclick="event.stopPropagation();openEditMeet('${meet.id}')">✏️</button>
            <button class="btn bsm bd" onclick="event.stopPropagation();deleteMeet('${meet.id}')">🗑️</button>
          </div>
        </div>
        <div class="meet-stats-row">
          <div class="meet-stat"><span class="meet-stat-n">${resultCount}</span><span class="meet-stat-l">Swims</span></div>
          <div class="meet-stat"><span class="meet-stat-n">${athletes.length}</span><span class="meet-stat-l">Athletes</span></div>
          <div class="meet-stat"><span class="meet-stat-n" style="color:var(--gold)">${pbs}</span><span class="meet-stat-l">PBs</span></div>
        </div>
        ${meet.liveUrl ? `<button class="btn bsm bs" style="margin-top:8px;width:100%;justify-content:center;" onclick="event.stopPropagation();${hasPoller?`stopLivePoller('${meet.id}')`:`startLivePoller('${meet.id}')`}">
          ${hasPoller ? '⏹ Stop Live Feed' : '📡 Start Live Feed'}
        </button>` : ''}
      </div>`;
    });
  }

  container.innerHTML = html;
}

// ── MEET DETAIL ──────────────────────────────────────────────
let currentMeetId = null;

function showMeetDetail(meetId) {
  currentMeetId = meetId;
  const meet = S.meets.find(m => m.id === meetId);
  if (!meet) return;

  const content = document.getElementById('meetDetailContent');
  if (!content) return;

  // Group results by athlete
  const byAthlete = {};
  (meet.results || []).forEach(r => {
    if (!byAthlete[r.athleteId]) byAthlete[r.athleteId] = [];
    byAthlete[r.athleteId].push(r);
  });

  let html = `<div class="meet-detail-hdr">
    <div>
      <div style="font-weight:800;font-size:20px;line-height:1;">${meet.name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:3px;">${formatDate(meet.date)}${meet.location ? ' · ' + meet.location : ''} · ${meet.course}</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn bsm bp" onclick="openAddResult('${meetId}')">+ Add Result</button>
      <button class="btn bsm bs" onclick="openHytekImporter('${meetId}')">Import HY-TEK File</button>
    </div>
  </div>`;

  if (!Object.keys(byAthlete).length) {
    html += `<div class="nd" style="padding:30px 0;"><div class="ndi">🏊</div>No results yet.<br><span style="font-size:11px;">Add results manually or start the live feed.</span></div>`;
  } else {
    Object.entries(byAthlete).forEach(([athId, results]) => {
      const ath = S.athletes.find(a => a.id === athId);
      if (!ath) return;
      const ini = ath.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      html += `<div class="card" style="margin-bottom:9px;">
        <div class="ahdr" style="margin-bottom:9px;cursor:pointer;" onclick="showProfile('${athId}')">
          <div class="av ${ath.gender}">${ini}</div>
          <div><div class="aname">${ath.name}</div><div class="ameta">${results.length} swim${results.length !== 1 ? 's' : ''}</div></div>
        </div>
        <div class="tgrid">${results.map(r => renderResultCell(r, ath, meet)).join('')}</div>
      </div>`;
    });
  }

  content.innerHTML = html;
  showPage('meetDetail');
}

function renderResultCell(r, ath, meet) {
  const cut = r.time ? getBestCut(ath, r.event) : null;
  // Compute delta vs prior best
  const priorResults = getAthleteEventHistory(ath.id, r.event)
    .filter(pr => pr.meet.date < meet.date || (pr.meet.date === meet.date && pr.meet.id !== meet.id));
  const basetime = ath.times[r.event];
  const prevBest = priorResults.length
    ? priorResults.reduce((b, pr) => {
        const pt = t2s(pr.time), bt = t2s(b);
        return (pt !== null && (bt === null || pt < bt)) ? pr.time : b;
      }, basetime)
    : basetime;
  const delta = prevBest ? timeDelta(r.time, prevBest) : null;
  const deltaColor = delta && delta.startsWith('-') ? '#4ade80' : delta ? '#f87171' : 'var(--muted)';

  return `<div class="tcell result-cell" style="background:${cut ? cut.color + '22' : 'var(--sur2)'};border-color:${cut ? cut.color : 'var(--bdr)'}">
    <div class="tev">${r.event}</div>
    <div class="tval">${r.time || '—'}</div>
    ${delta ? `<div class="tstd" style="color:${deltaColor}">${delta}</div>` : ''}
    ${r.isPersonalBest ? `<div class="tstd" style="color:var(--gold)">★ PB</div>` : (r.isSeasonBest ? `<div class="tstd" style="color:#a78bfa">↑ SB</div>` : '')}
    ${cut ? `<div class="tstd" style="color:${cut.color}">● ${cut.name}</div>` : ''}
    ${r.place ? `<div class="tstd" style="color:var(--muted)">Place: ${r.place}</div>` : ''}
    <button class="result-del-btn" onclick="deleteResult('${currentMeetId}','${r.id}')" title="Remove">×</button>
  </div>`;
}

// ── ADD / EDIT MEET ──────────────────────────────────────────
let editMeetId = null;

function openAddMeet() {
  editMeetId = null;
  document.getElementById('meetModalTitle').textContent = 'Add Meet';
  document.getElementById('mMeetName').value = '';
  document.getElementById('mMeetDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('mMeetLocation').value = '';
  document.getElementById('mMeetCourse').value = 'SCY';
  document.getElementById('mMeetUrl').value = '';
  openModal('mMeet');
}

function openEditMeet(id) {
  const meet = S.meets.find(m => m.id === id);
  if (!meet) return;
  editMeetId = id;
  document.getElementById('meetModalTitle').textContent = 'Edit Meet';
  document.getElementById('mMeetName').value = meet.name;
  document.getElementById('mMeetDate').value = meet.date;
  document.getElementById('mMeetLocation').value = meet.location || '';
  document.getElementById('mMeetCourse').value = meet.course || 'SCY';
  document.getElementById('mMeetUrl').value = meet.liveUrl || '';
  openModal('mMeet');
}

function saveMeet() {
  const name = document.getElementById('mMeetName').value.trim();
  if (!name) return alert('Enter a meet name');
  const date = document.getElementById('mMeetDate').value;
  const location = document.getElementById('mMeetLocation').value.trim();
  const course = document.getElementById('mMeetCourse').value;
  const liveUrl = document.getElementById('mMeetUrl').value.trim();

  if (editMeetId) {
    const meet = S.meets.find(m => m.id === editMeetId);
    if (meet) { meet.name = name; meet.date = date; meet.location = location; meet.course = course; meet.liveUrl = liveUrl || null; }
  } else {
    S.meets.push({ id: genId('meet'), name, date, location, course, liveUrl: liveUrl || null, results: [] });
  }
  save(); closeModal('mMeet'); renderMeetsPage();
}

function deleteMeet(id) {
  if (!confirm('Delete this meet and all its results?')) return;
  stopLivePoller(id);
  S.meets = S.meets.filter(m => m.id !== id);
  save(); renderMeetsPage();
}

// ── ADD RESULT ───────────────────────────────────────────────
let addResultMeetId = null;

function openAddResult(meetId) {
  addResultMeetId = meetId;
  const meet = S.meets.find(m => m.id === meetId);
  // Populate athlete select
  const sel = document.getElementById('mResultAthlete');
  sel.innerHTML = S.athletes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  // Populate event select
  const eSel = document.getElementById('mResultEvent');
  eSel.innerHTML = EVENTS.map(e => `<option value="${e}">${e}</option>`).join('');
  // Default course filter
  if (meet) {
    const courseEvs = EVENTS.filter(e => e.includes(meet.course));
    if (courseEvs.length) eSel.value = courseEvs[0];
  }
  document.getElementById('mResultTime').value = '';
  document.getElementById('mResultPlace').value = '';
  openModal('mResult');
}

function saveResult() {
  const meetId = addResultMeetId;
  const meet = S.meets.find(m => m.id === meetId);
  if (!meet) return;
  const athleteId = document.getElementById('mResultAthlete').value;
  const event = document.getElementById('mResultEvent').value;
  const time = document.getElementById('mResultTime').value.trim();
  const place = document.getElementById('mResultPlace').value.trim();
  if (!time) return alert('Enter a time');

  const isPB = isPersonalBest(athleteId, event, time, meet.date);
  const sb = getSeasonBest(athleteId, event);
  const isSB = !isPB && (!sb || t2s(time) < t2s(sb.time));

  const result = {
    id: genId('res'),
    athleteId,
    event,
    time,
    place: place ? parseInt(place) : null,
    isPersonalBest: isPB,
    isSeasonBest: isSB,
    addedAt: new Date().toISOString(),
    source: 'manual'
  };

  // Optionally update athlete's best time
  const ath = S.athletes.find(a => a.id === athleteId);
  if (ath && isPB) {
    ath.times[event] = time;
  }

  meet.results.push(result);
  save();
  closeModal('mResult');

  // Re-render wherever we are
  if (currentMeetId === meetId) showMeetDetail(meetId);
  renderMeetsPage();
  renderRoster();
}

function deleteResult(meetId, resultId) {
  if (!confirm('Remove this result?')) return;
  const meet = S.meets.find(m => m.id === meetId);
  if (!meet) return;
  meet.results = meet.results.filter(r => r.id !== resultId);
  save();
  showMeetDetail(meetId);
}

// ── SEASON PROGRESS (per athlete, per event) ─────────────────
function renderSeasonProgress(athleteId) {
  const ath = S.athletes.find(a => a.id === athleteId);
  if (!ath) return '';

  const allResults = getAthleteResults(athleteId);
  if (!allResults.length) {
    return `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">No meet results recorded yet.</div>`;
  }

  // Group by event
  const byEvent = {};
  allResults.forEach(r => {
    if (!byEvent[r.event]) byEvent[r.event] = [];
    byEvent[r.event].push(r);
  });

  let html = '';

  // Show meets timeline
  html += `<div class="section-label">Meet Results This Season</div>`;

  // Per-event progression charts
  Object.entries(byEvent).forEach(([event, entries]) => {
    if (entries.length < 1) return;
    const sorted = entries.sort((a, b) => new Date(a.meet.date) - new Date(b.meet.date));
    const best = sorted.reduce((b, r) => t2s(r.time) < t2s(b.time) ? r : b);
    const cut = getBestCut(ath, event);

    // Find min/max for chart scaling
    const times = sorted.map(r => t2s(r.time)).filter(Boolean);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const range = maxT - minT || 1;

    html += `<div class="prog-event-card">
      <div class="prog-event-hdr">
        <div>
          <span class="prog-event-name">${event}</span>
          ${cut ? `<span class="prog-cut-badge" style="background:${cut.color}22;border-color:${cut.color}55;color:${cut.color}">● ${cut.name}</span>` : ''}
        </div>
        <div class="prog-best">SB ${best.time}</div>
      </div>
      <div class="prog-chart">
        ${sorted.map((r, i) => {
          const ts = t2s(r.time);
          const pct = ts ? (1 - (ts - minT) / range) * 100 : 50;
          const isPB = r.isPersonalBest;
          return `<div class="prog-dot-wrap" title="${r.meet.name}: ${r.time}${r.place ? ' · Place ' + r.place : ''}">
            <div class="prog-dot ${isPB ? 'pb' : ''}" style="bottom:${Math.max(5, Math.min(95, pct))}%;background:${cut ? cut.color : 'var(--acc)'}"></div>
            <div class="prog-dot-label">${r.time}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="prog-meets-row">
        ${sorted.map(r => `<div class="prog-meet-name">${r.meet.name.split(' ')[0]}</div>`).join('')}
      </div>
    </div>`;
  });

  // Full meet history list
  html += `<div class="section-label" style="margin-top:16px;">Full History</div>`;
  const meets = [...new Set(allResults.map(r => r.meet.id))]
    .map(id => S.meets.find(m => m.id === id))
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  meets.forEach(meet => {
    const meetResults = allResults.filter(r => r.meet.id === meet.id);
    html += `<div class="card" style="margin-bottom:9px;">
      <div class="sechdr" onclick="showMeetDetail('${meet.id}')" style="cursor:pointer;">
        <div>
          <div style="font-weight:700;font-size:14px;">${meet.name}</div>
          <div style="font-size:11px;color:var(--muted);">${formatDate(meet.date)} · ${meet.course}</div>
        </div>
        <div style="color:var(--acc);font-size:12px;">→</div>
      </div>
      <div class="tgrid" style="margin-top:9px;">
        ${meetResults.map(r => {
          const cut = getBestCut(ath, r.event);
          return `<div class="tcell" style="background:${cut ? cut.color + '22' : 'var(--sur2)'};border-color:${cut ? cut.color : 'var(--bdr)'}">
            <div class="tev">${r.event}</div>
            <div class="tval">${r.time}</div>
            ${r.isPersonalBest ? `<div class="tstd" style="color:var(--gold)">★ PB</div>` : r.isSeasonBest ? `<div class="tstd" style="color:#a78bfa">↑ SB</div>` : ''}
            ${cut ? `<div class="tstd" style="color:${cut.color}">● ${cut.name}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  return html;
}

// ── LIVE POLLER ──────────────────────────────────────────────
// Polls HY-TEK Live Results URL and matches results to roster athletes.
// The live results page lists swimmer names + events + times.
// We match names against the roster (fuzzy) and auto-insert results.

function startLivePoller(meetId) {
  initMeets();
  const meet = S.meets.find(m => m.id === meetId);
  if (!meet || !meet.liveUrl) return alert('No live results URL set for this meet. Edit the meet to add one.');

  if (!S.livePollers) S.livePollers = {};
  S.livePollers[meetId] = { active: true, lastPoll: null, intervalId: null };

  // Poll immediately then every 90 seconds
  pollLiveResults(meetId);
  const intervalId = setInterval(() => pollLiveResults(meetId), 90000);
  S.livePollers[meetId].intervalId = intervalId;

  renderMeetsPage();
  showNotification('📡 Live polling started for ' + meet.name);
}

function stopLivePoller(meetId) {
  if (!S.livePollers?.[meetId]) return;
  const poller = S.livePollers[meetId];
  if (poller.intervalId) clearInterval(poller.intervalId);
  poller.active = false;
  renderMeetsPage();
  showNotification('⏹ Live polling stopped');
}

async function pollLiveResults(meetId) {
  const meet = S.meets.find(m => m.id === meetId);
  if (!meet?.liveUrl) return;

  try {
    // Use a CORS proxy to fetch the live results page
    // In production, replace with your own backend proxy
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(meet.liveUrl)}`;
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);

    const data = await resp.json();
    const html = data.contents;
    const results = parseLiveResults(html, meet);

    if (results.length) {
      let newCount = 0;
      results.forEach(r => {
        // Avoid duplicates: same athlete + event + time in this meet
        const exists = meet.results.some(mr =>
          mr.athleteId === r.athleteId && mr.event === r.event && mr.time === r.time
        );
        if (!exists) {
          meet.results.push(r);
          newCount++;
        }
      });
      if (newCount) {
        save();
        if (currentMeetId === meetId) showMeetDetail(meetId);
        renderMeetsPage();
        showNotification(`📊 ${newCount} new result${newCount !== 1 ? 's' : ''} from ${meet.name}`);
      }
    }

    if (S.livePollers[meetId]) {
      S.livePollers[meetId].lastPoll = new Date().toISOString();
    }
  } catch (err) {
    console.warn('Live poll error:', err.message);
    if (S.livePollers[meetId]) {
      S.livePollers[meetId].lastPoll = new Date().toISOString();
    }
  }
}

// ── HY-TEK Results Parser ────────────────────────────────────
// HY-TEK Live Results pages have a fairly consistent structure.
// This parses the HTML and returns matched results for YOUR roster only.
function parseLiveResults(html, meet) {
  const results = [];
  if (!html) return results;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // HY-TEK uses <table class="results"> or similar
  // Each row has: Name, Age, Team, Seed, Finals, Place
  // We'll scan ALL table rows for recognizable swim data

  const rows = doc.querySelectorAll('tr');
  let currentEvent = null;

  rows.forEach(row => {
    const text = row.innerText || row.textContent || '';

    // Detect event header rows (e.g. "Event 4  Women 100 Yard Freestyle")
    const evMatch = text.match(/Event\s+\d+\s+(.+)/i);
    if (evMatch) {
      currentEvent = normalizeEventName(evMatch[1].trim(), meet.course);
      return;
    }

    // Try to parse a result row — must have a time-like value
    const timeMatch = text.match(/\b(\d+:)?\d{1,2}\.\d{2}\b/);
    if (!timeMatch) return;

    const timeStr = timeMatch[0];
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;

    // First text cell is usually the name
    const nameCell = Array.from(cells).find(c => /[A-Z][a-z]/.test(c.textContent));
    if (!nameCell) return;
    const rawName = nameCell.textContent.trim();

    // Match to roster
    const ath = matchAthleteByName(rawName);
    if (!ath) return; // Not one of our athletes

    // Determine event
    const event = currentEvent || guessEventFromRow(text, meet.course);
    if (!event) return;

    const placeMatch = text.match(/^\s*(\d+)\s/);

    const isPB = isPersonalBest(ath.id, event, timeStr, meet.date);
    const sb = getSeasonBest(ath.id, event);
    const isSB = !isPB && sb && t2s(timeStr) < t2s(sb.time);

    // Auto-update athlete best time if PB
    if (isPB) ath.times[event] = timeStr;

    results.push({
      id: genId('res'),
      athleteId: ath.id,
      event,
      time: timeStr,
      place: placeMatch ? parseInt(placeMatch[1]) : null,
      isPersonalBest: isPB,
      isSeasonBest: !!isSB,
      addedAt: new Date().toISOString(),
      source: 'live'
    });
  });

  return results;
}

// Match a raw imported meet name to a roster athlete
function matchAthleteByName(rawName) {
  const cleaned = rawName.toLowerCase().replace(/[^a-z\s]/g, '').trim();

  // Direct match
  let match = S.athletes.find(a => a.name.toLowerCase() === cleaned);
  if (match) return match;

  // Last, First → First Last
  const commaMatch = cleaned.match(/^([a-z]+),\s*([a-z]+)/);
  if (commaMatch) {
    const flipped = commaMatch[2] + ' ' + commaMatch[1];
    match = S.athletes.find(a => a.name.toLowerCase() === flipped);
    if (match) return match;
  }

  // Fuzzy: check if both first and last name appear
  const parts = cleaned.split(/\s+/);
  match = S.athletes.find(a => {
    const aparts = a.name.toLowerCase().split(/\s+/);
    return parts.every(p => aparts.some(ap => ap.startsWith(p) || p.startsWith(ap)));
  });

  return match || null;
}

// Convert "Women 100 Yard Freestyle" → "100 Free SCY"
function normalizeEventName(raw, course) {
  const r = raw.toLowerCase();
  let dist = (r.match(/\d+/) || [''])[0];
  let stroke = '';
  if (r.includes('free')) stroke = 'Free';
  else if (r.includes('back')) stroke = 'Back';
  else if (r.includes('breast')) stroke = 'Breast';
  else if (r.includes('fly') || r.includes('butterfly')) stroke = 'Fly';
  else if (r.includes('medley') || r.includes(' im')) stroke = 'IM';
  else return null;

  // Distance normalization for LCM
  if (course === 'LCM') {
    if (dist === '200' && stroke === 'Free' && r.includes('400')) dist = '400';
    if (dist === '500' && stroke === 'Free') dist = '400';
    if (dist === '1000' && stroke === 'Free') dist = '800';
    if (dist === '1650' && stroke === 'Free') dist = '1500';
  }

  const courseSuffix = course || 'SCY';
  const candidate = `${dist} ${stroke} ${courseSuffix}`;
  return EVENTS.includes(candidate) ? candidate : null;
}

function guessEventFromRow(text, course) {
  // If no currentEvent header, try to guess from row text
  for (const ev of EVENTS) {
    const [dist, stroke] = ev.split(' ');
    if (text.includes(dist) && text.toLowerCase().includes(stroke.toLowerCase())) {
      return ev;
    }
  }
  return null;
}

// ── NOTIFICATION ─────────────────────────────────────────────
function showNotification(msg) {
  let el = document.getElementById('appNotification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appNotification';
    el.className = 'app-notification';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ── WIRE INTO PROFILE PAGE ───────────────────────────────────
// Call this at the end of showProfile() in app.js to inject the season progress tab
function injectSeasonProgressIntoProfile(athleteId) {
  const pc = document.getElementById('profileContent');
  if (!pc) return;
  const existing = pc.querySelector('.season-section');
  if (existing) existing.remove();

  const section = document.createElement('div');
  section.className = 'season-section';
  section.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:11px;margin-top:11px;">
      <button class="stab active" id="profTabTimes" onclick="switchProfileTab('times')">Times</button>
      <button class="stab" id="profTabSeason" onclick="switchProfileTab('season')">Season Progress</button>
    </div>
    <div id="profTimesContent"></div>
    <div id="profSeasonContent" style="display:none;"></div>
  `;
  pc.appendChild(section);

  // Move existing times content into tab
  const timesContent = pc.querySelector('[data-times-content]');
  if (timesContent) {
    document.getElementById('profTimesContent').appendChild(timesContent);
  }

  document.getElementById('profSeasonContent').innerHTML = renderSeasonProgress(athleteId);
}

function switchProfileTab(tab) {
  document.getElementById('profTimesContent').style.display = tab === 'times' ? '' : 'none';
  document.getElementById('profSeasonContent').style.display = tab === 'season' ? '' : 'none';
  document.getElementById('profTabTimes').classList.toggle('active', tab === 'times');
  document.getElementById('profTabSeason').classList.toggle('active', tab === 'season');
  if (tab === 'season') {
    // Re-render in case new results came in
    const athId = document.getElementById('profileContent')?.dataset?.athleteId;
    if (athId) document.getElementById('profSeasonContent').innerHTML = renderSeasonProgress(athId);
  }
}
