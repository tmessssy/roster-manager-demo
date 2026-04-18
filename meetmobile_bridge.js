// ============================================================
//  meetmobile_bridge.js
//  Plugs into your Roster Manager app.
//  Polls the local receiver every 5 seconds during a meet,
//  auto-matches results to your roster athletes,
//  and inserts them as meet results in real time.
// ============================================================

const BRIDGE_URL    = 'http://localhost:2525';
const POLL_INTERVAL = 5000;   // 5 seconds — snappy during a meet

let _bridgePollTimer   = null;
let _bridgeActiveMeet  = null;
let _bridgeConnected   = false;
let _bridgeResultCount = 0;

// ── Public API ────────────────────────────────────────────────

function startBridge(meetId) {
  if (_bridgePollTimer) stopBridge();
  _bridgeActiveMeet  = meetId;
  _bridgeResultCount = 0;

  // Push current roster to receiver so it can match names
  syncRosterToBridge();

  // Poll immediately, then on interval
  pollBridge();
  _bridgePollTimer = setInterval(pollBridge, POLL_INTERVAL);

  renderBridgeStatus();
  showNotification('📡 Meet Mobile bridge started');
  console.log('[Bridge] Started for meet', meetId);
}

function stopBridge() {
  if (_bridgePollTimer) { clearInterval(_bridgePollTimer); _bridgePollTimer = null; }
  _bridgeActiveMeet = null;
  _bridgeConnected  = false;
  renderBridgeStatus();
  showNotification('⏹ Bridge stopped');
}

function isBridgeRunning() { return !!_bridgePollTimer; }

// ── Sync roster to receiver ───────────────────────────────────
async function syncRosterToBridge() {
  try {
    await fetch(`${BRIDGE_URL}/roster`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ athletes: S.athletes }),
    });
    console.log('[Bridge] Roster synced to receiver');
  } catch (e) {
    console.warn('[Bridge] Could not sync roster:', e.message);
  }
}

// ── Poll for pending results ──────────────────────────────────
async function pollBridge() {
  if (!_bridgeActiveMeet) return;

  try {
    const res  = await fetch(`${BRIDGE_URL}/pending/roster`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const results = await res.json();
    _bridgeConnected = true;

    if (results.length > 0) {
      console.log(`[Bridge] ${results.length} new result(s) received`);
      results.forEach(r => ingestBridgeResult(r));
    }

    renderBridgeStatus();

  } catch (e) {
    _bridgeConnected = false;
    renderBridgeStatus();
    // Don't spam console — only log occasionally
    if (Math.random() < 0.1) console.warn('[Bridge] Offline:', e.message);
  }
}

// ── Ingest a result from the bridge ──────────────────────────
function ingestBridgeResult(bridgeResult) {
  if (!_bridgeActiveMeet) return;

  const meet = S.meets.find(m => m.id === _bridgeActiveMeet);
  if (!meet) return;

  // Find athlete on roster
  let athlete = null;
  if (bridgeResult.athleteId) {
    athlete = S.athletes.find(a => a.id === bridgeResult.athleteId);
  }
  if (!athlete && bridgeResult.athleteName) {
    // matchAthleteByName() is defined in event_utils.js
    athlete = matchAthleteByName(bridgeResult.athleteName);
  }
  if (!athlete) {
    console.log(`[Bridge] No roster match for: ${bridgeResult.rawName}`);
    return;
  }

  // Normalize event name to match your app's EVENTS list
  const event = bridgeResult.event || normalizeEventForRoster(
    bridgeResult.rawEvent, meet.course || 'SCY'
  );
  if (!event || !EVENTS.includes(event)) {
    console.warn(`[Bridge] Unknown event: "${bridgeResult.event}" / "${bridgeResult.rawEvent}"`);
    return;
  }

  const time = bridgeResult.time;

  // Deduplicate: same athlete + event + time already in this meet?
  const exists = meet.results.some(r =>
    r.athleteId === athlete.id && r.event === event && r.time === time
  );
  if (exists) return;

  // PB / SB detection
  const isPB = isPersonalBest(athlete.id, event, time, meet.date);
  const sb    = getSeasonBest(athlete.id, event);
  const isSB  = !isPB && sb && t2s(time) < t2s(sb.time);

  // Auto-update athlete's best time if PB
  if (isPB) athlete.times[event] = time;

  const result = {
    id:            `mm_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    athleteId:     athlete.id,
    event:         event,
    time:          time,
    place:         null,           // Meet Mobile doesn't always include place in notification
    isPersonalBest: isPB,
    isSeasonBest:  !!isSB,
    addedAt:       bridgeResult.receivedAt || new Date().toISOString(),
    source:        'meetmobile',
    eventNum:      bridgeResult.eventNum || null,
  };

  meet.results.push(result);
  _bridgeResultCount++;
  save();

  // Re-render live if on meets or profile page
  if (typeof currentMeetId !== 'undefined' && currentMeetId === _bridgeActiveMeet) {
    showMeetDetail(_bridgeActiveMeet);
  }
  if (typeof renderMeetsPage === 'function') renderMeetsPage();
  if (typeof renderRoster === 'function') renderRoster();

  // Notification with PB callout
  const pbStr = isPB ? ' 🌟 PB!' : isSB ? ' ↑ SB' : '';
  showNotification(`🏊 ${athlete.name} — ${event}: ${time}${pbStr}`);
  console.log(`[Bridge] ✅ ${athlete.name} | ${event} | ${time}${pbStr}`);
}

// ── Event normalizer ──────────────────────────────────────────
// Delegated to event_utils.js (normalizeEvent) — single source of truth.
// Kept as a thin alias so existing call-sites don't need changes.
function normalizeEventForRoster(rawEvent, course) {
  return normalizeEvent(rawEvent, course);
}

// ── Status UI ─────────────────────────────────────────────────
function renderBridgeStatus() {
  const el = document.getElementById('bridgeStatusBar');
  if (!el) return;

  if (!isBridgeRunning()) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';
  el.innerHTML = `
    <div class="bridge-dot ${_bridgeConnected ? 'connected' : 'disconnected'}"></div>
    <div style="flex:1;min-width:0;">
      <span style="font-weight:700;font-size:13px;">
        📡 Meet Mobile Bridge ${_bridgeConnected ? '— LIVE' : '— Connecting…'}
      </span>
      <span style="font-size:11px;color:rgba(255,255,255,.6);margin-left:7px;">
        ${_bridgeResultCount} result${_bridgeResultCount !== 1 ? 's' : ''} received
      </span>
    </div>
    <button class="btn bsm" style="background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);"
      onclick="stopBridge()">Stop</button>
  `;
}

// ── Auto-start helpers ────────────────────────────────────────
// Call openBridgeForMeet(meetId) from your meets page "Start Bridge" button
function openBridgeForMeet(meetId) {
  const meet = S.meets.find(m => m.id === meetId);
  if (!meet) return;

  if (isBridgeRunning()) {
    if (!confirm(`Bridge is already running for another meet. Switch to "${meet.name}"?`)) return;
    stopBridge();
  }

  startBridge(meetId);
}
