// ============================================================
//  hytek_importer.js
//  Imports results from a HY-TEK Meet Manager .zip export.
//
//  The zip contains a .HY3 (results) and .CL2 (entries) file.
//  Only the .HY3 is needed. The .zip is unzipped in-browser
//  using JSZip (loaded from CDN when the importer opens).
//
//  Matching: athletes are found by their club code in the HY3,
//  then matched to roster athletes by name.
//
//  Load after meets.js:
//    <script src="hytek_importer.js"></script>
// ============================================================

// ── State ─────────────────────────────────────────────────────
let _hytekMeetId  = null;
let _hytekMatched = [];   // { athlete, event, time, place, keep }

// ── Stroke code map ───────────────────────────────────────────
const HY3_STROKE = { A:'Free', B:'Back', C:'Breast', D:'Fly', E:'IM' };

// ── Entry point ───────────────────────────────────────────────
function openHytekImporter(meetId) {
  _hytekMeetId  = meetId;
  _hytekMatched = [];

  // Pre-fill club code from team name initials
  const defaultCode = (S.teamName || '')
    .split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 5);
  document.getElementById('hytekClubInput').value = defaultCode;
  document.getElementById('hytekFileInput').value = '';
  document.getElementById('hytekStatus').textContent =
    'Upload the .zip file from HY-TEK Meet Manager (File > Export > Results).';
  document.getElementById('hytekPreview').innerHTML = '';
  document.getElementById('hytekImportBtn').style.display = 'none';

  openModal('mHytek');
  _ensureJSZip();
}

// ── Lazy-load JSZip from CDN ──────────────────────────────────
function _ensureJSZip() {
  if (window.JSZip) return;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  document.head.appendChild(s);
}

// ── File selected handler ─────────────────────────────────────
function hytekFileSelected(input) {
  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById('hytekStatus');
  status.textContent = 'Reading file…';
  document.getElementById('hytekPreview').innerHTML = '';
  document.getElementById('hytekImportBtn').style.display = 'none';

  const clubCode = document.getElementById('hytekClubInput').value.trim().toUpperCase();

  const reader = new FileReader();
  reader.onload = function(e) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'zip') {
      _processZip(e.target.result, clubCode);
    } else if (ext === 'hy3') {
      _processHY3Text(e.target.result, clubCode);
    } else {
      status.textContent = 'Unsupported file type. Upload a .zip or .hy3 file.';
    }
  };

  if (file.name.toLowerCase().endsWith('.zip')) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

// ── Unzip and find the .hy3 file ─────────────────────────────
function _processZip(arrayBuffer, clubCode) {
  const status = document.getElementById('hytekStatus');

  if (!window.JSZip) {
    status.textContent = 'Loading JSZip library… please try again in a moment.';
    _ensureJSZip();
    return;
  }

  JSZip.loadAsync(arrayBuffer).then(function(zip) {
    // Find the .hy3 file inside the zip
    const hy3Entry = Object.values(zip.files).find(f =>
      f.name.toLowerCase().endsWith('.hy3') && !f.dir
    );

    if (!hy3Entry) {
      status.textContent = 'No .hy3 file found in the zip. Make sure this is a HY-TEK results export.';
      return;
    }

    status.textContent = 'Parsing ' + hy3Entry.name + '…';

    hy3Entry.async('string').then(function(text) {
      _processHY3Text(text, clubCode);
    });
  }).catch(function(err) {
    status.textContent = 'Could not read zip file: ' + err.message;
  });
}

// ── Parse HY3 text ────────────────────────────────────────────
function _processHY3Text(text, clubCode) {
  const status = document.getElementById('hytekStatus');

  try {
    const lines = text.split(/\r?\n/);

    // ── Pass 1: collect all athletes by numeric ID ──────────
    // C1 records define club codes; D1 records define athletes
    // D1 records immediately follow their club's C1 record block
    const athleteById = {};
    let currentClub = null;

    for (const line of lines) {
      if (line.startsWith('C1')) {
        currentClub = line.slice(2, 7).trim();
      } else if (line.startsWith('D1') && currentClub) {
        const m = line.match(/^D1([MFX])\s*(\d{3,4})/);
        if (m) {
          const id     = m[2];
          const pos    = m[0].length;
          const last   = line.slice(pos,      pos + 20).trim();
          const first  = line.slice(pos + 20, pos + 40).trim();
          athleteById[id] = { last, first, gender: m[1], club: currentClub,
                              fullName: first + ' ' + last };
        }
      }
    }

    // ── Determine which athlete IDs belong to requested club ─
    // If no club code given, match against roster by name instead
    const filterByClub = !!clubCode;
    const clubIds = new Set(
      Object.entries(athleteById)
        .filter(([, a]) => !filterByClub || a.club === clubCode)
        .map(([id]) => id)
    );

    if (!clubIds.size && filterByClub) {
      // Show available clubs so the user can correct the code
      const clubs = [...new Set(Object.values(athleteById).map(a => a.club))].sort();
      status.textContent =
        `Club code "${clubCode}" not found. Clubs in this file: ${clubs.join(', ')}`;
      return;
    }

    // ── Pass 2: collect E1+E2 result pairs ──────────────────
    // E1 = event entry (has athlete ID + event code)
    // E2 = result (has final time + place)
    const rawResults = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('E1')) {
        const m = line.match(/^E1([MFX])\s*(\d{3,4})/);
        if (m && clubIds.has(m[2])) {
          const athId = m[2];

          // Event: 3-4 digit distance + stroke letter somewhere in cols 10-27
          const evM = line.slice(10, 27).match(/\s{0,2}(\d{2,4})([ABCDE])\s/);
          if (evM) {
            const dist   = evM[1].replace(/^0+/, '') || '0';
            const stroke = HY3_STROKE[evM[2]];

            // Find the E2 result on the next few lines
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
              if (lines[j].startsWith('E1') || lines[j].startsWith('D1') ||
                  lines[j].startsWith('C1')) break;

              if (lines[j].startsWith('E2')) {
                const e2 = lines[j];
                // E2 layout: cols 2 = result type (P/F/S/T), cols 3-11 = time, col 11 = course
                const rawTime = e2.slice(3, 12).trim();
                if (!rawTime) break;

                const courseChar = rawTime.slice(-1);
                const course = courseChar === 'L' ? 'LCM'
                             : courseChar === 'M' ? 'SCM'
                             : 'SCY';
                const timeSec = parseFloat(rawTime.replace(/[YLM]$/, ''));
                if (!timeSec || timeSec <= 0) break;

                const timeStr = _secondsToTimeStr(timeSec);

                // Place: after the course char, pattern "0 {place} "
                const placeM = e2.slice(13, 28).match(/0\s+(\d{1,3})\s/);
                const place  = placeM ? parseInt(placeM[1]) : 0;

                // Remap LCM distances to match app event names
                let d = dist;
                if (course === 'LCM') {
                  if (d === '500'  && stroke === 'Free') d = '400';
                  if (d === '1000' && stroke === 'Free') d = '800';
                  if (d === '1650' && stroke === 'Free') d = '1500';
                }

                const eventKey = `${d} ${stroke} ${course}`;
                const athInfo  = athleteById[athId];

                rawResults.push({
                  hy3Id:    athId,
                  hy3Name:  athInfo.fullName,
                  hy3Club:  athInfo.club,
                  gender:   athInfo.gender,
                  event:    eventKey,
                  time:     timeStr,
                  timeSec:  timeSec,
                  place:    place,
                });
                break;
              }
            }
          }
        }
      }
      i++;
    }

    if (!rawResults.length) {
      status.textContent = filterByClub
        ? `No results found for club "${clubCode}". Try leaving the club code blank to match by name only.`
        : 'No results found in this file.';
      return;
    }

    // ── Dedup: keep fastest per hy3Id + event ───────────────
    const bestMap = {};
    for (const r of rawResults) {
      const key = `${r.hy3Id}__${r.event}`;
      if (!bestMap[key] || r.timeSec < bestMap[key].timeSec) bestMap[key] = r;
    }
    const dedupedRaw = Object.values(bestMap);

    // ── Match to roster athletes ─────────────────────────────
    _hytekMatched = [];
    for (const r of dedupedRaw) {
      const athlete = _matchRosterAthlete(r.hy3Name, r.gender);
      if (!athlete) continue;

      // Only include valid EVENTS
      if (typeof EVENTS !== 'undefined' && !EVENTS.includes(r.event)) continue;

      _hytekMatched.push({ ...r, athlete, keep: true });
    }

    if (!_hytekMatched.length) {
      const names = [...new Set(dedupedRaw.map(r => r.hy3Name))].sort().join(', ');
      status.textContent =
        `Found ${dedupedRaw.length} results for club "${clubCode}" but none matched roster athletes. ` +
        `Names in file: ${names}`;
      return;
    }

    _renderHytekPreview();

  } catch (err) {
    document.getElementById('hytekStatus').textContent = 'Parse error: ' + err.message;
    console.error('[HyTek]', err);
  }
}

// ── Convert decimal seconds to mm:ss.xx string ───────────────
function _secondsToTimeStr(secs) {
  if (secs >= 60) {
    const m   = Math.floor(secs / 60);
    const s   = secs - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return secs.toFixed(2);
}

// ── Match a HY3 name to a roster athlete ─────────────────────
function _matchRosterAthlete(hy3Name, gender) {
  const name = hy3Name.toLowerCase().trim();
  const parts = name.split(/\s+/);
  const last  = parts[parts.length - 1];
  const first = parts[0];

  // 1. Exact full name
  let hit = S.athletes.find(a => a.name.toLowerCase() === name);
  if (hit) return hit;

  // 2. Last name + first name exact
  hit = S.athletes.find(a => {
    const ap = a.name.toLowerCase().split(/\s+/);
    return ap[ap.length - 1] === last && ap[0] === first;
  });
  if (hit) return hit;

  // 3. Last name + first initial
  hit = S.athletes.find(a => {
    const ap = a.name.toLowerCase().split(/\s+/);
    return ap[ap.length - 1] === last && ap[0][0] === first[0];
  });
  if (hit) return hit;

  // 4. Last name only (unique match)
  const lastMatches = S.athletes.filter(a => {
    const ap = a.name.toLowerCase().split(/\s+/);
    return ap[ap.length - 1] === last;
  });
  if (lastMatches.length === 1) return lastMatches[0];

  return null;
}

// ── Render the preview checklist ─────────────────────────────
function _renderHytekPreview() {
  const meet      = S.meets.find(m => m.id === _hytekMeetId);
  const existing  = new Set((meet?.results || []).map(r =>
    `${r.athleteId}__${r.event}__${r.time}`));

  const preview   = document.getElementById('hytekPreview');
  const status    = document.getElementById('hytekStatus');
  const importBtn = document.getElementById('hytekImportBtn');

  // Group by athlete
  const byAth = {};
  _hytekMatched.forEach((item, idx) => {
    const id = item.athlete.id;
    if (!byAth[id]) byAth[id] = [];
    byAth[id].push({ ...item, idx });
  });

  let html = '';
  let newCount = 0;

  Object.entries(byAth).forEach(([athId, items]) => {
    const ath = items[0].athlete;
    html += `
      <div style="margin-bottom:11px;">
        <div style="font-size:12px;font-weight:700;padding:4px 0 5px;border-bottom:1px solid var(--bdr);margin-bottom:5px;">${ath.name}
          <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:5px;">${items[0].hy3Club}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">`;

    items.forEach(item => {
      const dupKey    = `${item.athlete.id}__${item.event}__${item.time}`;
      const duplicate = existing.has(dupKey);
      const isPB      = !duplicate && isPersonalBest(item.athlete.id, item.event, item.time, meet?.date);
      if (!duplicate) newCount++;

      html += `
          <label style="display:flex;align-items:center;gap:9px;padding:6px 8px;
                         border-radius:7px;background:var(--sur2);border:1px solid var(--bdr);
                         cursor:${duplicate ? 'default' : 'pointer'};">
            <input type="checkbox"
                   ${item.keep && !duplicate ? 'checked' : ''}
                   ${duplicate ? 'disabled' : ''}
                   onchange="_hytekMatched[${item.idx}].keep=this.checked;_updateHytekBtn()"
                   style="flex-shrink:0;">
            <div style="flex:1;min-width:0;">
              <span style="font-size:12px;font-weight:700;">${item.time}</span>
              <span style="font-size:11px;color:var(--muted);margin-left:5px;">${item.event}</span>
              ${item.place ? `<span style="font-size:10px;color:var(--muted);margin-left:5px;">Place: ${item.place}</span>` : ''}
            </div>
            <span style="font-size:10px;font-weight:700;white-space:nowrap;
                          color:${duplicate ? 'var(--muted)' : isPB ? 'var(--gold)' : '#4ade80'};">
              ${duplicate ? 'Already imported' : isPB ? 'PB' : 'New'}
            </span>
          </label>`;
    });

    html += `</div></div>`;
  });

  preview.innerHTML = html;

  const total = _hytekMatched.length;
  status.textContent =
    `Found ${total} result${total !== 1 ? 's' : ''} for ${Object.keys(byAth).length} ` +
    `athlete${Object.keys(byAth).length !== 1 ? 's' : ''}. ` +
    `${newCount} new, ${total - newCount} already imported.`;

  importBtn.style.display = newCount > 0 ? 'block' : 'none';
  _updateHytekBtn();
}

function _updateHytekBtn() {
  const meet     = S.meets.find(m => m.id === _hytekMeetId);
  const existing = new Set((meet?.results || []).map(r =>
    `${r.athleteId}__${r.event}__${r.time}`));
  const n = _hytekMatched.filter(item => {
    const dup = existing.has(`${item.athlete.id}__${item.event}__${item.time}`);
    return item.keep && !dup;
  }).length;
  const btn = document.getElementById('hytekImportBtn');
  btn.textContent = `Import ${n} Result${n !== 1 ? 's' : ''}`;
  btn.style.display = n > 0 ? 'block' : 'none';
}

// ── Commit import ─────────────────────────────────────────────
function commitHytekImport() {
  const meet = S.meets.find(m => m.id === _hytekMeetId);
  if (!meet) return;

  const existing = new Set((meet.results || []).map(r =>
    `${r.athleteId}__${r.event}__${r.time}`));

  let count = 0;
  _hytekMatched.forEach(item => {
    if (!item.keep) return;
    const dupKey = `${item.athlete.id}__${item.event}__${item.time}`;
    if (existing.has(dupKey)) return;

    const isPB = isPersonalBest(item.athlete.id, item.event, item.time, meet.date);
    const sb   = typeof getSeasonBest === 'function' ? getSeasonBest(item.athlete.id, item.event) : null;
    const isSB = !isPB && sb && typeof t2s === 'function' && t2s(item.time) < t2s(sb.time);

    if (isPB && item.athlete) item.athlete.times[item.event] = item.time;

    meet.results.push({
      id:             genId('hyt'),
      athleteId:      item.athlete.id,
      event:          item.event,
      time:           item.time,
      place:          item.place || null,
      isPersonalBest: isPB,
      isSeasonBest:   !!isSB,
      addedAt:        new Date().toISOString(),
      source:         'hytek',
    });
    count++;
  });

  save();
  closeModal('mHytek');
  showMeetDetail(_hytekMeetId);
  renderMeetsPage();
  if (typeof renderRoster === 'function') renderRoster();

  showNotification(count
    ? `Imported ${count} result${count !== 1 ? 's' : ''} from HY-TEK file`
    : 'No new results to import');
}
