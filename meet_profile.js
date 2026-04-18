// ============================================================
//  meet_profile.js
//  Adds a "Meet History" tab to the athlete profile page.
//
//  Features:
//   • 5th profile tab: "Meets" (after Overview, Cut Roadmap,
//     Nearest Cut, Attendance)
//   • Summary cards: total swims, PBs, SBs, meets attended
//   • Event selector — pick any event the athlete has swum
//   • Per-event across-meet timeline: visual progress chart
//     showing each result chronologically with delta indicators
//   • Full meet-by-meet result list — every meet the athlete
//     appeared in, with all their swims, place, PB/SB flags,
//     and a delta vs previous best
//   • Tapping a meet card navigates to that meet's detail page
//
//  Requires: meets.js (getAthleteResults, timeDelta, formatDate,
//            getAthleteEventHistory, getBestCut, t2s)
//            profile_roadmap.js (buildRoadmapSelector,
//            setRoadmapMode, rerenderTimesGrid, _roadmapMode)
//  Load after meets.js and profile_roadmap.js.
// ============================================================

// ── State ────────────────────────────────────────────────────
let _mpSelectedEvent = null;   // currently selected event in event timeline

// ── Main builder ─────────────────────────────────────────────
function buildMeetProfileTab(athleteId) {
  const a = S.athletes.find(x => x.id === athleteId);
  if (!a) return '';

  initMeets();
  const allResults = getAthleteResults(athleteId);

  if (!allResults.length) {
    return `
    <div style="text-align:center;padding:40px 16px;">
      <div style="font-size:40px;margin-bottom:10px;">🏟️</div>
      <div style="font-weight:700;font-size:15px;color:var(--txt);margin-bottom:6px;">No meet results yet</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">
        Add results from the Meets tab or import a HY-TEK file.
      </div>
      <button class="btn bp bsm" onclick="showPage('meets')">Go to Meets</button>
    </div>`;
  }

  // Summary stats
  const totalSwims  = allResults.length;
  const totalPBs    = allResults.filter(r => r.isPersonalBest).length;
  const totalSBs    = allResults.filter(r => r.isSeasonBest).length;
  const meetsSwum   = new Set(allResults.map(r => r.meet.id)).size;

  // Events this athlete has results in (unique, sorted by stroke)
  const eventSet = [...new Set(allResults.map(r => r.event))];
  const sortedEvents = EVENTS.filter(e => eventSet.includes(e)); // keeps canonical order

  // Default selected event
  if (!_mpSelectedEvent || !sortedEvents.includes(_mpSelectedEvent)) {
    _mpSelectedEvent = sortedEvents[0];
  }

  return `
  <div style="padding-bottom:30px;">

    <!-- ── Summary strip ── -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
      ${mpStatChip(totalSwims, 'Swims',  'var(--acc)')}
      ${mpStatChip(meetsSwum,  'Meets',  'var(--acc2)')}
      ${mpStatChip(totalPBs,   'PBs',    'var(--gold)')}
      ${mpStatChip(totalSBs,   'SBs',    '#a78bfa')}
    </div>

    <!-- ── Event Timeline section ── -->
    <div class="ctitle" style="margin-bottom:10px;">Event Progression</div>

    <!-- Event selector pills -->
    <div id="mpEventPills" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
      ${sortedEvents.map(ev => {
        const isActive = ev === _mpSelectedEvent;
        const cut = getBestCut(a, ev);
        const color = cut ? cut.color : 'var(--acc)';
        return `<button
          onclick="mpSelectEvent('${ev}','${athleteId}')"
          style="padding:5px 10px;border-radius:20px;border:1.5px solid ${isActive ? color : 'var(--bdr)'};
                 background:${isActive ? color + '22' : 'var(--sur2)'};
                 color:${isActive ? color : 'var(--muted)'};
                 font-family:var(--font);font-size:11px;font-weight:${isActive ? '800' : '600'};
                 cursor:pointer;transition:all .15s;white-space:nowrap;"
        >${ev}</button>`;
      }).join('')}
    </div>

    <!-- Timeline chart for selected event -->
    <div id="mpEventChart">${buildEventTimeline(athleteId, _mpSelectedEvent)}</div>

    <!-- ── Meet-by-meet results ── -->
    <div class="ctitle" style="margin-top:20px;margin-bottom:10px;">Meet by Meet</div>
    <div id="mpMeetList">${buildMeetByMeetList(athleteId, allResults)}</div>

  </div>`;
}

// ── Stat chip ─────────────────────────────────────────────────
function mpStatChip(value, label, color) {
  return `
  <div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:var(--r);
              padding:10px 8px;text-align:center;">
    <div style="font-size:22px;font-weight:900;color:${color};line-height:1;">${value}</div>
    <div style="font-size:10px;color:var(--muted);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">${label}</div>
  </div>`;
}

// ── Event timeline chart ──────────────────────────────────────
function buildEventTimeline(athleteId, event) {
  if (!event) return '';
  const a = S.athletes.find(x => x.id === athleteId);
  if (!a) return '';

  const history = getAthleteEventHistory(athleteId, event);
  if (!history.length) {
    return `<div style="color:var(--muted);font-size:12px;padding:12px 0;text-align:center;">No results for ${event}</div>`;
  }

  const cut = getBestCut(a, event);
  const accentColor = cut ? cut.color : 'var(--acc)';

  // Times in seconds for scaling
  const times = history.map(r => t2s(r.time)).filter(Boolean);
  const minT   = Math.min(...times);
  const maxT   = Math.max(...times);
  const range  = maxT - minT || 0.5;

  // Best ever time
  const sbResult = history.reduce((b, r) => {
    const bt = t2s(b.time), rt = t2s(r.time);
    return (rt !== null && (bt === null || rt < bt)) ? r : b;
  });

  // Previous best tracker for delta calc
  let runningBest = null;

  const dots = history.map((r, i) => {
    const ts = t2s(r.time);
    const pct = ts ? ((maxT - ts) / range) * 80 + 10 : 50; // 10%-90% range
    const isSB = r.id === sbResult.id;
    const delta = runningBest !== null ? timeDelta(r.time, String(runningBest.toFixed ? runningBest.toFixed(2) : runningBest)) : null;
    const deltaColor = delta && delta.startsWith('-') ? '#4ade80' : delta ? '#f87171' : 'var(--muted)';
    const dotColor = isSB ? 'var(--gold)' : r.isPersonalBest ? '#4ade80' : accentColor;
    const meetShort = r.meet.name.length > 12 ? r.meet.name.slice(0, 11) + '…' : r.meet.name;

    if (runningBest === null || (ts !== null && ts < runningBest)) runningBest = ts;

    return { r, pct, isSB, delta, deltaColor, dotColor, meetShort, ts };
  });

  // Chart HTML
  const chartH = 110;
  const colW   = Math.max(52, Math.floor(300 / Math.max(history.length, 1)));

  const dotsHtml = dots.map((d, i) => `
    <div style="display:flex;flex-direction:column;align-items:center;min-width:${colW}px;flex-shrink:0;position:relative;">
      <!-- vertical track -->
      <div style="position:relative;width:100%;height:${chartH}px;display:flex;align-items:center;justify-content:center;">
        <!-- connector line to next dot -->
        ${i < dots.length - 1 ? `<div style="position:absolute;top:50%;left:50%;width:100%;height:2px;
          background:linear-gradient(90deg,${d.dotColor},${dots[i+1].dotColor});opacity:.3;z-index:0;"></div>` : ''}
        <!-- dot -->
        <div style="position:absolute;bottom:${d.pct}%;left:50%;transform:translateX(-50%);
             width:${d.isSB ? 14 : 10}px;height:${d.isSB ? 14 : 10}px;border-radius:50%;
             background:${d.dotColor};z-index:1;
             box-shadow:0 0 0 3px ${d.dotColor}33;
             ${d.isSB ? 'border:2px solid var(--bg);' : ''}">
        </div>
        <!-- time label -->
        <div style="position:absolute;bottom:calc(${d.pct}% + ${d.isSB ? 18 : 14}px);left:50%;
             transform:translateX(-50%);font-size:10px;font-weight:800;
             color:${d.dotColor};white-space:nowrap;text-align:center;">
          ${d.r.time}
          ${d.isSB ? '<br><span style="font-size:9px;color:var(--gold);">★ SB</span>' : ''}
          ${d.r.isPersonalBest && !d.isSB ? '<br><span style="font-size:9px;color:#4ade80;">PB</span>' : ''}
        </div>
        <!-- delta label below dot -->
        ${d.delta ? `<div style="position:absolute;bottom:calc(${d.pct}% - 22px);left:50%;
             transform:translateX(-50%);font-size:9px;font-weight:700;
             color:${d.deltaColor};white-space:nowrap;">${d.delta}</div>` : ''}
      </div>
      <!-- meet name label below chart -->
      <div style="font-size:9px;color:var(--muted);text-align:center;line-height:1.2;
                  margin-top:4px;max-width:${colW - 4}px;overflow:hidden;
                  text-overflow:ellipsis;white-space:nowrap;" title="${d.r.meet.name}">
        ${d.meetShort}
      </div>
      <div style="font-size:8px;color:var(--bdr);text-align:center;">${d.r.meet.date.slice(5).replace('-','/')}</div>
    </div>`
  ).join('');

  return `
  <div style="background:var(--sur2);border:1.5px solid var(--bdr);border-radius:var(--r);padding:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
      <div style="font-size:12px;font-weight:800;color:var(--txt);">${event}</div>
      <div style="display:flex;gap:10px;align-items:center;font-size:10px;color:var(--muted);">
        <span>SB: <b style="color:var(--gold);">${sbResult.time}</b></span>
        ${cut ? `<span style="color:${cut.color};font-weight:700;">● ${cut.name}</span>` : ''}
        <span>${history.length} swim${history.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
    <!-- scrollable dot chart -->
    <div style="display:flex;min-width:${dots.length * colW}px;align-items:flex-end;padding:8px 0 4px;">
      ${dotsHtml}
    </div>
  </div>`;
}

// ── Meet-by-meet result list ──────────────────────────────────
function buildMeetByMeetList(athleteId, allResults) {
  const a = S.athletes.find(x => x.id === athleteId);
  if (!a) return '';

  // Group by meet, sorted newest first
  const meetIds = [...new Set(allResults.map(r => r.meet.id))];
  const meets   = meetIds
    .map(id => S.meets.find(m => m.id === id))
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!meets.length) return `<div style="color:var(--muted);font-size:12px;padding:12px 0;">No meets found</div>`;

  return meets.map(meet => {
    const meetResults = allResults
      .filter(r => r.meet.id === meet.id)
      .sort((a, b) => EVENTS.indexOf(a.event) - EVENTS.indexOf(b.event));

    const pbCount = meetResults.filter(r => r.isPersonalBest).length;
    const sbCount = meetResults.filter(r => r.isSeasonBest).length;

    const cells = meetResults.map(r => {
      const cut = getBestCut(a, r.event);

      // Compute delta vs all prior results for this event
      const prior = getAthleteEventHistory(athleteId, r.event)
        .filter(pr => pr.meet.date < meet.date ||
                     (pr.meet.date === meet.date && pr.meet.id !== meet.id));
      const baseTime = a.times[r.event];
      const prevBestTime = prior.length
        ? prior.reduce((b, pr) => {
            const pt = t2s(pr.time), bt = t2s(b);
            return (pt !== null && (bt === null || pt < bt)) ? pr.time : b;
          }, baseTime)
        : baseTime;
      const delta = prevBestTime ? timeDelta(r.time, prevBestTime) : null;
      const deltaColor = delta && delta.startsWith('-') ? '#4ade80' : delta ? '#f87171' : 'var(--muted)';
      const borderColor = cut ? cut.color : 'var(--bdr)';
      const bgColor     = cut ? cut.color + '18' : 'var(--sur2)';

      return `
      <div class="tcell" style="background:${bgColor};border-color:${borderColor};position:relative;">
        <div class="tev">${r.event}</div>
        <div class="tval" style="${r.isPersonalBest ? 'color:var(--gold)' : ''}">${r.time}</div>
        ${delta ? `<div class="tstd" style="color:${deltaColor};font-weight:700;">${delta}</div>` : ''}
        ${r.isPersonalBest
          ? `<div class="tstd" style="color:var(--gold);">★ PB</div>`
          : r.isSeasonBest
            ? `<div class="tstd" style="color:#a78bfa;">↑ SB</div>`
            : ''}
        ${cut ? `<div class="tstd" style="color:${cut.color};">● ${cut.name}</div>` : ''}
        ${r.place ? `<div class="tstd" style="color:var(--muted);">${ordinal(r.place)} place</div>` : ''}
      </div>`;
    }).join('');

    // Badge strip
    const badges = [];
    if (pbCount) badges.push(`<span style="background:var(--gold);color:#1a1000;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;">★ ${pbCount} PB${pbCount>1?'s':''}</span>`);
    if (sbCount) badges.push(`<span style="background:#a78bfa22;color:#a78bfa;border:1px solid #a78bfa55;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;">↑ ${sbCount} SB${sbCount>1?'s':''}</span>`);

    return `
    <div class="card" style="margin-bottom:9px;padding:12px 14px;">
      <!-- Meet header — tappable to go to meet detail -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;
                  cursor:pointer;margin-bottom:9px;"
           onclick="showMeetDetail('${meet.id}')">
        <div>
          <div style="font-weight:800;font-size:14px;line-height:1.2;">${meet.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            ${formatDate(meet.date)}${meet.location ? ' · ' + meet.location : ''} · ${meet.course}
          </div>
          ${badges.length ? `<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">${badges.join('')}</div>` : ''}
        </div>
        <div style="color:var(--acc);font-size:18px;flex-shrink:0;padding-top:2px;">→</div>
      </div>
      <!-- Result cells -->
      <div class="tgrid">${cells}</div>
    </div>`;
  }).join('');
}

// ── Ordinal helper ─────────────────────────────────────────────
function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Event selection handler ──────────────────────────────────
function mpSelectEvent(event, athleteId) {
  _mpSelectedEvent = event;
  // Update pill active states
  const pills = document.querySelectorAll('#mpEventPills button');
  const a = S.athletes.find(x => x.id === athleteId);
  pills.forEach(btn => {
    const ev    = btn.textContent.trim();
    const isAct = ev === event;
    const cut   = a ? getBestCut(a, ev) : null;
    const color = cut ? cut.color : 'var(--acc)';
    btn.style.borderColor  = isAct ? color : 'var(--bdr)';
    btn.style.background   = isAct ? color + '22' : 'var(--sur2)';
    btn.style.color        = isAct ? color : 'var(--muted)';
    btn.style.fontWeight   = isAct ? '800' : '600';
  });
  // Swap chart
  const chart = document.getElementById('mpEventChart');
  if (chart) chart.innerHTML = buildEventTimeline(athleteId, event);
}

// ── Hook into profile_roadmap.js ──────────────────────────────
// We inject the Meets tab button by patching buildRoadmapProfileContent
// (the top-level builder) to append our button into the mode row.
// This avoids chained regex fragility on buildRoadmapSelector.

document.addEventListener('DOMContentLoaded', function () {

  // ── 1. Inject "Meets" button via buildRoadmapProfileContent ─
  if (typeof buildRoadmapProfileContent === 'function') {
    const _origBuildContent = buildRoadmapProfileContent;
    buildRoadmapProfileContent = function (a) {
      const base = _origBuildContent(a);
      // Append our Meets button just before the closing of rm-mode-row div.
      // The rm-mode-row always ends with </div> followed by whitespace then
      // <!-- Sub-menu (or closing rm-selector-wrap if no sub-menu shown).
      // We target the first </div> that follows the last rm-mode-btn.
      return base.replace(
        /(id="rmBtnNearest"[\s\S]*?<\/button>)([\s\S]*?)(<\/div>[\s\n\r]*<!-- Sub-menu)/,
        (match, nearestBtn, between, tail) => {
          // Only inject once — guard against double injection
          if (match.includes('rmBtnMeets')) return match;
          return nearestBtn + between +
            `\n      <button class="rm-mode-btn" id="rmBtnMeets"
        onclick="setRoadmapMode('meets','${a.id}')">
        <span class="rm-mode-icon material-symbols-outlined" aria-hidden="true">emoji_events</span>
        Meets
      </button>` + tail;
        }
      );
    };
  }

  // ── 2. Patch rerenderTimesGrid to handle 'meets' mode ───────
  if (typeof rerenderTimesGrid === 'function') {
    const _origRerender = rerenderTimesGrid;
    rerenderTimesGrid = function (athId) {
      if (_roadmapMode === 'meets') {
        const container = document.getElementById('rmTimesContainer');
        if (container) {
          container.innerHTML = buildMeetProfileTab(athId);
          return;
        }
      }
      _origRerender(athId);
    };
  }

  // ── 3. Patch setRoadmapMode to handle 'meets' mode ──────────
  if (typeof setRoadmapMode === 'function') {
    const _origSetMode = setRoadmapMode;
    setRoadmapMode = function (mode, athleteId) {
      if (mode === 'meets') {
        _profileAthId = athleteId;
        _roadmapMode  = 'meets';

        // Deactivate all other mode buttons
        document.querySelectorAll('.rm-mode-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('rmBtnMeets');
        if (btn) btn.classList.add('active');

        // Hide standard sub-row
        const stdRow = document.getElementById('rmStdRow');
        if (stdRow) stdRow.style.display = 'none';

        // Clear active label
        const lbl = document.getElementById('rmActiveLabel');
        if (lbl) lbl.textContent = '';

        // Render meet tab
        const container = document.getElementById('rmTimesContainer');
        if (container) container.innerHTML = buildMeetProfileTab(athleteId);
        return;
      }
      _origSetMode(mode, athleteId);
    };
  }

});

console.log('[meet_profile.js] Loaded ✓');
