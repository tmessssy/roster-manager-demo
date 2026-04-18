// ============================================================
//  roster_card.js  v5
//  Unified column grid — roster + standards share identical
//  columns for perfect vertical alignment.
//
//  Layout order:
//    Header
//    Legend strip
//    WOMEN — BEST TIMES   (divider row)
//      one row per female athlete
//    MEN — BEST TIMES     (divider row)
//      one row per male athlete
//    WOMEN — TIME STANDARDS  (divider row)
//      one row per standard, women's cuts only
//    MEN — TIME STANDARDS    (divider row)
//      one row per standard, men's cuts only
//    Footer
//
//  No gender symbols anywhere. Cut times shown in white on the
//  standard's color background so they're always legible.
// ============================================================

let _rcColors = {};

function openRosterCardModal() {
  _rcColors = {};
  S.standards.forEach(s => { _rcColors[s.id] = s.color; });

  const sorted = [...S.standards].sort((a, b) => a.priority - b.priority);
  const rows = sorted.map(s => `
    <div class="rc-color-row">
      <div class="rc-color-swatch"
           id="rcsw_${s.id}"
           style="background:${s.color}"
           onclick="openColorPicker('${s.color.replace('#','')}', col => {
             _rcColors['${s.id}'] = col;
             document.getElementById('rcsw_${s.id}').style.background = col;
             document.getElementById('rchex_${s.id}').value = col.replace('#','');
           })"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;">${s.name}</div>
        <div style="font-size:10px;color:var(--muted);">Priority ${s.priority}</div>
      </div>
      <div style="display:flex;align-items:center;gap:5px;">
        <span style="font-size:12px;color:var(--muted);">#</span>
        <input type="text" class="fi"
               id="rchex_${s.id}"
               value="${s.color.replace('#','')}"
               maxlength="6"
               style="width:72px;font-size:12px;padding:5px 8px;font-family:monospace;"
               oninput="
                 const c='#'+this.value;
                 _rcColors['${s.id}']=c;
                 document.getElementById('rcsw_${s.id}').style.background=c;
               ">
      </div>
    </div>
  `).join('');

  document.getElementById('rcColorList').innerHTML = rows;
  document.getElementById('rcSortSel').value = 'name';
  openModal('mRosterCard');
}

function doRosterCardPrint() {
  const sortBy  = document.getElementById('rcSortSel').value;
  const inclSCY = document.getElementById('rcIncSCY').checked;
  const inclLCM = document.getElementById('rcIncLCM').checked;
  const html    = buildRosterCardHTML(sortBy, inclSCY, inclLCM);

  if (AppBridge.isNativeHost()) {
    const fn = (S.teamName || 'Roster').replace(/\s+/g,'_') + '_RosterCard.pdf';
    AppBridge.printHtml(html, fn, { downloadName: 'RosterCard.html' });
    closeModal('mRosterCard');
    return;
  }

  closeModal('mRosterCard');
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else {
    const blob = new Blob([html], {type:'text/html'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'RosterCard.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

function rcResetColors() {
  S.standards.forEach(s => {
    _rcColors[s.id] = s.color;
    const sw = document.getElementById('rcsw_' + s.id);
    const hx = document.getElementById('rchex_' + s.id);
    if (sw) sw.style.background = s.color;
    if (hx) hx.value = s.color.replace('#','');
  });
}

// ── Shared column definitions ─────────────────────────────────
// Every column appears in both roster rows and standards rows
// so they align perfectly. The 100 IM column is marked stdBlank
// because no standard defines a 100 IM cut — it shows normally
// for athletes but is blacked out in the standards section.
const RC_COLUMNS = [
  { label:'50 FR',        pairs:[{c:'SCY',e:'50 Free SCY'},{c:'LCM',e:'50 Free LCM'}] },
  { label:'100 FR',       pairs:[{c:'SCY',e:'100 Free SCY'},{c:'LCM',e:'100 Free LCM'}] },
  { label:'200 FR',       pairs:[{c:'SCY',e:'200 Free SCY'},{c:'LCM',e:'200 Free LCM'}] },
  { label:'500/400 FR',   pairs:[{c:'SCY',e:'500 Free SCY'},{c:'LCM',e:'400 Free LCM'}] },
  { label:'1000/800 FR',  pairs:[{c:'SCY',e:'1000 Free SCY'},{c:'LCM',e:'800 Free LCM'}] },
  { label:'1650/1500 FR', pairs:[{c:'SCY',e:'1650 Free SCY'},{c:'LCM',e:'1500 Free LCM'}] },
  { label:'50 BK',        pairs:[{c:'SCY',e:'50 Back SCY'},{c:'LCM',e:'50 Back LCM'}] },
  { label:'100 BK',       pairs:[{c:'SCY',e:'100 Back SCY'},{c:'LCM',e:'100 Back LCM'}] },
  { label:'200 BK',       pairs:[{c:'SCY',e:'200 Back SCY'},{c:'LCM',e:'200 Back LCM'}] },
  { label:'50 BR',        pairs:[{c:'SCY',e:'50 Breast SCY'},{c:'LCM',e:'50 Breast LCM'}] },
  { label:'100 BR',       pairs:[{c:'SCY',e:'100 Breast SCY'},{c:'LCM',e:'100 Breast LCM'}] },
  { label:'200 BR',       pairs:[{c:'SCY',e:'200 Breast SCY'},{c:'LCM',e:'200 Breast LCM'}] },
  { label:'50 FL',        pairs:[{c:'SCY',e:'50 Fly SCY'},{c:'LCM',e:'50 Fly LCM'}] },
  { label:'100 FL',       pairs:[{c:'SCY',e:'100 Fly SCY'},{c:'LCM',e:'100 Fly LCM'}] },
  { label:'200 FL',       pairs:[{c:'SCY',e:'200 Fly SCY'},{c:'LCM',e:'200 Fly LCM'}] },
  { label:'100 IM',       pairs:[{c:'SCY',e:'100 IM SCY'}], stdBlank:true },
  { label:'200 IM',       pairs:[{c:'SCY',e:'200 IM SCY'},{c:'LCM',e:'200 IM LCM'}] },
  { label:'400 IM',       pairs:[{c:'SCY',e:'400 IM SCY'},{c:'LCM',e:'400 IM LCM'}] },
];

// ── Core HTML builder ─────────────────────────────────────────
function buildRosterCardHTML(sortBy = 'name', inclSCY = true, inclLCM = true, athleteOverride = null) {
  const teamName  = S.teamName || 'Swim Team';
  const logoSrc   = S.teamLogo || null;
  const standards = [...S.standards].sort((a, b) => a.priority - b.priority);
  const stdColors = {};
  standards.forEach(s => { stdColors[s.id] = (_rcColors[s.id] || s.color); });

  // Filter columns by course selection; preserve stdBlank flag
  const cols = RC_COLUMNS.map(col => ({
    ...col,
    pairs: col.pairs.filter(p => (p.c === 'SCY' ? inclSCY : inclLCM))
  })).filter(col => col.pairs.length > 0);

  // +1 for the name/label column only (no gender symbol column)
  const totalCols = cols.reduce((s, c) => s + c.pairs.length, 0) + 1;

  // Use override list if provided, otherwise fall back to full roster
  const allAthletes = athleteOverride || S.athletes;

  function sortAthletes(arr) {
    return [...arr].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'last')
        return a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0]);
      return 0;
    });
  }

  const females = sortAthletes(allAthletes.filter(a => a.gender === 'female'));
  const males   = sortAthletes(allAthletes.filter(a => a.gender === 'male'));

  const initials = teamName.split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase();
  const logoImg  = logoSrc
    ? `<img src="${logoSrc}" style="height:44px;max-width:95px;object-fit:contain;display:block;">`
    : `<div style="width:42px;height:42px;border-radius:50%;background:#934337;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">${initials}</div>`;

  // ── Best cut for an athlete cell (for background color) ────
  function cellCut(athlete, eventName) {
    const t = athlete.times[eventName]; if (!t) return null;
    const ts = t2s(t); if (ts === null) return null;
    const tk = athlete.gender === 'female' ? 'timesF' : 'timesM';
    let best = null;
    for (const std of standards) {
      const sv = std[tk][eventName]; if (!sv) continue;
      const ss = t2s(sv); if (ss === null) continue;
      if (ts <= ss) best = std;
    }
    return best;
  }

  // ── Shared column header (used once at top of table) ───────
  function colHeaders() {
    let r1 = `<th rowspan="2" style="text-align:left;white-space:nowrap;padding:2px 5px;font-size:7px;background:#111;color:#fff;border:1px solid #2a2a2a;min-width:82px;">ATHLETE / STANDARD</th>`;
    cols.forEach(col => {
      const dimmed = col.stdBlank;
      r1 += `<th colspan="${col.pairs.length}" style="font-size:6px;font-weight:700;padding:2px 1px;background:${dimmed?'#1a1a1a':'#222'};color:${dimmed?'#3a3a3a':'#fff'};border:1px solid #2a2a2a;white-space:nowrap;">${col.label}</th>`;
    });
    let r2 = '';
    cols.forEach(col => {
      col.pairs.forEach(p => {
        r2 += `<th style="font-size:5.5px;font-weight:700;padding:1px;background:${col.stdBlank?'#111':'#2a2a2a'};color:${col.stdBlank?'#2a2a2a':'#bbb'};border:1px solid #2a2a2a;">${p.c === 'SCY' ? 'Y' : 'M'}</th>`;
      });
    });
    return `<thead><tr>${r1}</tr><tr>${r2}</tr></thead>`;
  }
    function colHeaders2() {
      let r1 = `<th rowspan="2" style="text-align:left;white-space:nowrap;padding:2px 5px;font-size:7px;background:#111;color:#fff;border:1px solid #2a2a2a;min-width:82px;">ATHLETE / STANDARD</th>`;
      cols.forEach(col => {
        const dimmed = col.stdBlank;
        r1 += `<th style="font-size:5.5px;font-weight:700;padding:1px;background:${col.stdBlank?'#111':'#2a2a2a'};color:${col.stdBlank?'#2a2a2a':'#bbb'};border:1px solid #2a2a2a;">${p.c === 'SCY' ? 'Y' : 'M'}</th>`;
      });
      let r2 = '';
      cols.forEach(col => {
        col.pairs.forEach(p => {
          r2 += `<th colspan="${col.pairs.length}" style="font-size:6px;font-weight:700;padding:2px 1px;background:${dimmed?'#1a1a1a':'#222'};color:${dimmed?'#3a3a3a':'#fff'};border:1px solid #2a2a2a;white-space:nowrap;">${col.label}</th>`;
        });
      });
      return `<thead><tr>${r1}</tr><tr>${r2}</tr></thead>`;
  }
  // ── Athlete data row ───────────────────────────────────────
  function athleteRow(a, i) {
    const bg = i % 2 === 0 ? '#fff' : '#f7f7f7';
    let cells = `<td style="font-size:7px;font-weight:700;padding:2px 5px;white-space:nowrap;background:${bg};border:1px solid #e8e8e8;text-align:left;">${a.name}</td>`;
    cols.forEach(col => {
      col.pairs.forEach(p => {
        const t   = a.times[p.e];
        const cut = t ? cellCut(a, p.e) : null;
        const clr = cut ? stdColors[cut.id] : null;
        // Athlete cells: tinted background + matching text color
        const cellBg  = clr ? clr + '40' : bg;
        const cellTxt = clr ? clr         : '#777';
        const cellFW  = clr ? '700'       : '400';
        cells += `<td style="font-size:6.8px;font-weight:${cellFW};padding:2px 1px;text-align:center;background:${cellBg};color:${cellTxt};border:1px solid #e8e8e8;white-space:nowrap;">${t || '—'}</td>`;
      });
    });
    return `<tr>${cells}</tr>`;
  }

  // ── Section divider row ────────────────────────────────────
  function dividerRow(label, bgColor, textColor, borderColor, topBorderPx) {
    return `<tr>
      <td colspan="${totalCols}" style="background:${bgColor};border-top:${topBorderPx}px solid ${borderColor};border-bottom:1px solid ${borderColor};padding:3px 6px;font-size:7px;font-weight:900;letter-spacing:2px;color:${textColor};text-transform:uppercase;font-family:Arial Black,Arial,sans-serif;">${label}</td>
    </tr>`;
  }

  // ── One standards row (single gender) ─────────────────────
  // The standard name cell gets the standard's color as bg with
  // white text. Cut times are white on the standard's color bg.
  // Missing cuts are a muted dark cell. Blacked-out columns
  // (100 IM) are solid #000.
  function standardRow(std, gender, rowIndex) {
    const tk    = gender === 'F' ? 'timesF' : 'timesM';
    const color = stdColors[std.id];
    const altBg = rowIndex % 2 === 1 ? '#181818' : '#111';

    // Name / label cell — solid standard color, white text
    let cells = `<td style="background:${color};color:#fff;font-size:7px;font-weight:900;font-family:Arial Black,Arial,sans-serif;padding:2px 5px;border:1px solid #000;white-space:nowrap;text-align:left;vertical-align:middle;line-height:1.25;">${std.name.toUpperCase().split(' ').map(w=>`<div>${w}</div>`).join('')}</td>`;

    cols.forEach(col => {
      col.pairs.forEach(p => {
        if (col.stdBlank) {
          // 100 IM — no standard has this cut, black it out
          cells += `<td style="background:#000;border:1px solid #000;padding:2px 1px;"></td>`;
        } else {
          const t = std[tk]?.[p.e] || '';
          if (t) {
            // Has a cut — solid standard color bg, white text for maximum legibility
            cells += `<td style="background:${color};color:#fff;font-size:6.8px;font-weight:700;font-family:Arial Narrow,Arial,sans-serif;padding:2px 1px;text-align:center;border:1px solid #000;white-space:nowrap;">${t}</td>`;
          } else {
            // No cut defined for this event — dark muted cell
            cells += `<td style="background:${altBg};color:#2a2a2a;font-size:6.8px;font-weight:400;font-family:Arial Narrow,Arial,sans-serif;padding:2px 1px;text-align:center;border:1px solid #000;white-space:nowrap;">—</td>`;
          }
        }
      });
    });

    return `<tr>${cells}</tr>`;
  }

  // ── Legend strip ───────────────────────────────────────────
  const legend = standards.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;">
       <><span style="width:8px;height:8px;border-radius:2px;background:${stdColors[s.id]};display:inline-block;"></span><span style="font-size:6px;font-weight:700;color:#444;font-family:Arial,sans-serif;">${s.name}</span></>
     </span>`
  ).join('');

  const year = new Date().getFullYear();

  // ── Auto-scale to fill the landscape page ─────────────────
  const autoScaleScript = `
  window.onload = function() {
    var el = document.getElementById('content');
    var PAGE_H = 96 * (8.5 - 0.44);
    var h = el.offsetHeight;
    if (h > 0 && h < PAGE_H * 0.94) {
      var scale = Math.min(PAGE_H / h, 1.65);
      el.style.transformOrigin = 'top left';
      el.style.transform = 'scale(' + scale + ')';
      el.style.width = (100 / scale) + '%';
    }
    setTimeout(function(){ window.print(); }, 450);
  };
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${teamName} — Roster and Standards</title>
<style>
@page { size: 11in 8.5in landscape; margin: 0.22in; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Arial', Arial, sans-serif; background: #fff; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div id="content">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:#1a1a1a;border-bottom:3px solid #934337;margin-bottom:3px;">
    ${logoImg}
    <div style="text-align:center;flex:1;padding:0 8px;">
      <div style="font-size:15px;font-weight:900;letter-spacing:2px;color:#fff;text-transform:uppercase;line-height:1;font-family:Arial,sans-serif;">${teamName}</div>
      <div style="font-size:5.5px;letter-spacing:3px;color:#aaa;text-transform:uppercase;margin-top:1px;">Best Times and Time Standards — ${year}–${year+1}</div>
    </div>
    ${logoImg}
  </div>

  <!-- Legend -->
  <div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;padding:2px 6px;margin-bottom:3px;gap:2px;">
    <span style="font-size:5.5px;font-weight:700;color:#555;margin-right:5px;text-transform:uppercase;letter-spacing:.5px;font-family:Arial,sans-serif;">Standards:</span>
    ${legend}
  </div>

  <!-- Unified table -->
  <table style="border-collapse:collapse;width:100%;table-layout:auto;">
    ${colHeaders()}
    <tbody>

      <!-- Women roster -->
      ${dividerRow('Women — Best Times', '#f0e6ec', '#8b2060', '#c45090', 2)}
      ${females.map((a, i) => athleteRow(a, i)).join('')}

      <!-- Men roster -->
      ${dividerRow('Men — Best Times', '#e6ecf5', '#1e4a8a', '#4a80c4', 2)}
      ${males.map((a, i) => athleteRow(a, i)).join('')}

      <!-- Women standards -->
      ${dividerRow('Women — Time Standards', '#111', '#ccc', '#555', 3)}
      ${standards.map((std, i) => standardRow(std, 'F', i)).join('')}

      <!-- Men standards -->
      ${dividerRow('Men — Time Standards', '#111', '#ccc', '#555', 3)}
      ${standards.map((std, i) => standardRow(std, 'M', i)).join('')}

    </tbody>
    ${colHeaders2()}
  </table>

<!-- Legend -->
  <div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;padding:2px 6px;margin-bottom:3px;gap:2px;">
    <span style="font-size:5.5px;font-weight:700;color:#555;margin-right:5px;text-transform:uppercase;letter-spacing:.5px;font-family:Arial,sans-serif;">Standards:</span>
    ${legend}
  </div>

  <!-- Footer -->
  <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:3px 8px;background:#1a1a1a;border-top:2px solid #934337;margin-top:3px;">
    ${logoImg}
    <span style="color:#777;font-size:5.5px;letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif;">${teamName} — ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'}).toUpperCase()}</span>
    ${logoImg}
  </div>

</div>
<script>${autoScaleScript}<\/script>
</body>
</html>`;
}
