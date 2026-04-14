// ============================================================
//  bubble_threshold_fix.js
//  Replace your existing getBubbleThreshold() and
//  getOnTheBubble() functions with these.
//
//  Threshold logic: fixed seconds window per event distance,
//  so a 0.8s gap in the 50 Free and a 12s gap in the 1650
//  both feel equally "on the bubble" to a coach.
// ============================================================

// ── Per-distance thresholds (seconds) ────────────────────────
// Keyed on the numeric distance prefix of the event name.
const BUBBLE_THRESHOLDS = {
  50:   0.8,
  100:  1.5,
  200:  3.0,
  400:  5.0,
  500:  5.0,
  800:  8.0,
  1000: 8.0,
  1500: 12.0,
  1650: 12.0,
};

function getBubbleThreshold(eventName) {
  const match = eventName.match(/^(\d+)/);
  if (!match) return 2.0;
  const dist = parseInt(match[1]);
  return BUBBLE_THRESHOLDS[dist] ?? 2.0;
}

// ── Main bubble finder ────────────────────────────────────────
// Returns array of { athlete, event, time, cutName, cutTime,
//                    diffSec, threshold, pctOfCut }
// sorted by diffSec ascending (closest first).
function getOnTheBubble(genderFilter) {
  const results = [];

  S.athletes.forEach(a => {
    if (genderFilter === 'male'   && a.gender !== 'male')   return;
    if (genderFilter === 'female' && a.gender !== 'female') return;

    const tk = a.gender === 'female' ? 'timesF' : 'timesM';
    const sortedStds = [...S.standards].sort((x, y) => x.priority - y.priority);

    EVENTS.forEach(ev => {
      const ats = t2s(a.times[ev]);
      if (ats === null) return;

      const threshold = getBubbleThreshold(ev);

      // Find the next unachieved cut for this event
      const unachieved = sortedStds.filter(s => {
        const cv = s[tk][ev];
        if (!cv) return false;
        const cs = t2s(cv);
        return cs !== null && ats > cs; // athlete is slower than this cut
      });

      if (!unachieved.length) return;

      const target = unachieved[0]; // easiest unachieved
      const cts    = t2s(target[tk][ev]);
      const diff   = ats - cts; // positive = needs to go faster by this many seconds

      // Only include if within the distance-scaled threshold
      if (diff > 0 && diff <= threshold) {
        results.push({
          athlete:   a,
          event:     ev,
          time:      a.times[ev],
          cutName:   target.name,
          cutColor:  target.color,
          cutTime:   target[tk][ev],
          diffSec:   diff,
          threshold: threshold,
          // percentage within the threshold window (100% = right on the line, 0% = at the edge)
          proximity: ((threshold - diff) / threshold) * 100,
          // raw pct from cut (for display)
          pctOfCut:  (diff / cts * 100),
        });
      }
    });
  });

  // Sort: closest first (smallest diffSec)
  return results.sort((a, b) => a.diffSec - b.diffSec);
}

// ── Render the widget ─────────────────────────────────────────
// Call this wherever you render the Overview page bubble section.
// Expects a container element with id="bubbleList"
// and a gender state variable (or pass it in).
function renderBubbleWidget(genderFilter) {
  const container = document.getElementById('bubbleList');
  if (!container) return;

  const items = getOnTheBubble(genderFilter || 'all');

  if (!items.length) {
    container.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0;">No athletes within threshold of a cut right now.</div>`;
    return;
  }

  container.innerHTML = items.slice(0, 20).map(item => {
    const a   = item.athlete;
    const ini = a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const bar = Math.round(item.proximity);
    const diffStr = item.diffSec.toFixed(2);
    const pctStr  = item.pctOfCut.toFixed(1);

    return `
      <div class="bubble-row">
        <div class="av ${a.gender}">${ini}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:13px;">${a.name}</span>
            <span style="font-size:11px;color:var(--muted);">${item.event}</span>
          </div>
          <div style="margin-top:4px;background:var(--sur3);border-radius:4px;height:5px;width:100%;">
            <div style="height:5px;border-radius:4px;width:${bar}%;background:${item.cutColor};transition:width .3s;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:3px;">
            <span style="font-size:10px;color:var(--muted);">${item.time} → <span style="color:${item.cutColor};font-weight:700;">${item.cutName}</span> ${item.cutTime}</span>
            <span style="font-size:10px;font-weight:700;color:#fb923c;">−${diffStr}s (${pctStr}%)</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── HTML to add to your Overview page card ────────────────────
// Add this card inside your page-overview div:
//
// <div class="card">
//   <div class="sechdr">
//     <div class="ctitle" style="margin-bottom:0">On the Bubble</div>
//     <div class="gtog">
//       <button class="gbtn aa" id="bbgAll" onclick="setBubbleG('all')">All</button>
//       <button class="gbtn"    id="bbgM"   onclick="setBubbleG('male')">Men</button>
//       <button class="gbtn"    id="bbgF"   onclick="setBubbleG('female')">Women</button>
//     </div>
//   </div>
//   <div style="font-size:10px;color:var(--muted);margin-bottom:11px;" id="bubbleThresholdNote"></div>
//   <div id="bubbleList"></div>
// </div>
//
// And add this JS alongside your other page functions:
//
// let bubbleGender = 'all';
// function setBubbleG(g) {
//   bubbleGender = g;
//   ['All','M','F'].forEach(x => document.getElementById('bbg'+x).className='gbtn');
//   document.getElementById('bbg'+{all:'All',male:'M',female:'F'}[g]).className='gbtn '+ {all:'aa',male:'am',female:'af'}[g];
//   renderBubbleThresholdNote();
//   renderBubbleWidget(g);
// }
// function renderBubbleThresholdNote() {
//   const el = document.getElementById('bubbleThresholdNote');
//   if (el) el.textContent = 'Thresholds: 50s < 0.8s · 100s < 1.5s · 200s < 3.0s · 500s < 5.0s · 1000s < 8.0s · 1650s < 12.0s';
// }
//
// Then call renderBubbleWidget(bubbleGender) inside renderOverview().
