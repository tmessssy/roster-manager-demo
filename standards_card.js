// ============================================================
//  standards_card.js  v2
//  Generates a polished dark-themed Time Standards card
//  matching the app's laminated standards sheet layout.
//
//  Load after app.js:
//    <script src="standards_card.js"></script>
//
//  Call:  printStandardsCard()
//  from a button in Settings > Printable Charts
// ============================================================

function printStandardsCard() {
  const html = buildStandardsCardHTML();

  if (AppBridge.isNativeHost()) {
    const fn = (S.teamName || 'Standards').replace(/\s+/g,'_') + '_Standards.pdf';
    AppBridge.printHtml(html, fn, { downloadName: 'StandardsCard.html' });
    return;
  }

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else {
    const blob = new Blob([html], {type:'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'StandardsCard.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
}

// ── Row definitions ───────────────────────────────────────────
// Each row group: stroke label, rows within it
const STD_ROW_GROUPS = [
  {
    stroke: 'FREESTYLE',
    rows: [
      { label:'50',   dist:'50',   scy:'50 Free SCY',   lcm:'50 Free LCM'   },
      { label:'100',  dist:'100',  scy:'100 Free SCY',  lcm:'100 Free LCM'  },
      { label:'200',  dist:'200',  scy:'200 Free SCY',  lcm:'200 Free LCM'  },
      { label:'500',  dist:'500/400', scy:'500 Free SCY',  lcm:'400 Free LCM'  },
      { label:'1000', dist:'1000/800',scy:'1000 Free SCY', lcm:'800 Free LCM'  },
      { label:'1650', dist:'1650/1500',scy:'1650 Free SCY',lcm:'1500 Free LCM' },
    ]
  },
  {
    stroke: 'BACKSTROKE',
    rows: [
      { label:'50',  dist:'50',  scy:'50 Back SCY',  lcm:'50 Back LCM'  },
      { label:'100', dist:'100', scy:'100 Back SCY', lcm:'100 Back LCM' },
      { label:'200', dist:'200', scy:'200 Back SCY', lcm:'200 Back LCM' },
    ]
  },
  {
    stroke: 'BREASTSTROKE',
    rows: [
      { label:'50',  dist:'50',  scy:'50 Breast SCY',  lcm:'50 Breast LCM'  },
      { label:'100', dist:'100', scy:'100 Breast SCY', lcm:'100 Breast LCM' },
      { label:'200', dist:'200', scy:'200 Breast SCY', lcm:'200 Breast LCM' },
    ]
  },
  {
    stroke: 'BUTTERFLY',
    rows: [
      { label:'50',  dist:'50',  scy:'50 Fly SCY',  lcm:'50 Fly LCM'  },
      { label:'100', dist:'100', scy:'100 Fly SCY', lcm:'100 Fly LCM' },
      { label:'200', dist:'200', scy:'200 Fly SCY', lcm:'200 Fly LCM' },
    ]
  },
  {
    stroke: 'IM',
    rows: [
      { label:'200', dist:'200', scy:'200 IM SCY', lcm:'200 IM LCM' },
      { label:'400', dist:'400', scy:'400 IM SCY', lcm:'400 IM LCM' },
    ]
  },
];

// ── Core HTML builder ─────────────────────────────────────────
function buildStandardsCardHTML() {
  const teamName  = S.teamName || 'Swim Team';
  const logoSrc   = S.teamLogo || null;
  const year      = new Date().getFullYear();

  // Sort standards by priority (1 = easiest, highest = hardest)
  const stds = [...S.standards].sort((a, b) => a.priority - b.priority);
  // Women: easiest → hardest (left to right)
  // Men: hardest → easiest (left to right, mirrored like your card)
  const womenCols = stds;                          // priority ascending
  const menCols   = [...stds].reverse();           // priority descending

  // Logo
  const initials = teamName.split(' ').map(w=>w[0]).join('').slice(0,4).toUpperCase();
  const logoEl = logoSrc
    ? `<img src="${logoSrc}" style="height:48px;max-width:110px;object-fit:contain;">`
    : `<div style="width:46px;height:46px;border-radius:50%;background:#934337;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;font-family:Arial Black,Arial,sans-serif;">${initials}</div>`;

  // Helper: get time from a standard for an event key
  function getTime(std, evKey, gender) {
    const tk = gender === 'F' ? 'timesF' : 'timesM';
    return std[tk]?.[evKey] || '';
  }

  // ── Column header for a standard ──────────────────────────
  function stdHeader(std) {
    const words = std.name.toUpperCase().split(/\s+/);
    // Break into 2-3 lines for the vertical header
    const lines = words.map(w => `<div>${w}</div>`).join('');
    return `<th style="
      background:${std.color};
      color:#fff;
      font-size:7px;
      font-weight:900;
      font-family:Arial Black,Arial,sans-serif;
      padding:4px 1px;
      text-align:center;
      border:1px solid #000;
      width:52px;
      min-width:52px;
      line-height:1.2;
      letter-spacing:.3px;
      text-transform:uppercase;
    ">${lines}</th>`;
  }

  // ── Single data cell ──────────────────────────────────────
  function timeCell(std, evKey, gender, isAlt) {
    const t   = getTime(std, evKey, gender);
    const bg  = isAlt ? '#1a1a1a' : '#111';
    const clr = t ? std.color : '#333';
    const fw  = t ? '700'     : '400';
    return `<td style="
      background:${bg};
      color:${clr};
      font-size:7.8px;
      font-weight:${fw};
      font-family:'Arial Narrow',Arial,sans-serif;
      padding:2px 2px;
      text-align:center;
      border:1px solid #000;
      white-space:nowrap;
    ">${t || '—'}</td>`;
  }

  // ── Build one side's table (Women or Men) ─────────────────
  function buildSideTable(gender, cols, titleLabel) {
    const titleColor = gender === 'F' ? '#e879a0' : '#60a5fa';

    // Header row
    let headerCells = '';
    cols.forEach(s => { headerCells += stdHeader(s); });

    // Rows for each stroke group
    let rowsHtml = '';
    let globalRowIdx = 0;

    STD_ROW_GROUPS.forEach(group => {
      const strokeRowCount = group.rows.length * 2; // SCY + LCM per distance

      group.rows.forEach((row, rowInGroup) => {
        const isAlt = globalRowIdx % 2 === 1;
        const bg    = isAlt ? '#1a1a1a' : '#111';

        // SCY row
        let scyCells = '';
        // Stroke label cell (rowspan = total rows in group * 2, only on first SCY of first dist)
        let strokeCell = '';
        if (rowInGroup === 0) {
          strokeCell = `<td rowspan="${strokeRowCount}" style="
            writing-mode:vertical-rl;
            transform:rotate(180deg);
            font-size:7px;
            font-weight:900;
            font-family:Arial Black,Arial,sans-serif;
            letter-spacing:2px;
            color:#555;
            text-transform:uppercase;
            background:#0a0a0a;
            border:1px solid #000;
            text-align:center;
            padding:3px 1px;
          ">${group.stroke}</td>`;
        }

        // Distance label cell (rowspan=2 for SCY+LCM)
        const distCell = `<td rowspan="2" style="
          background:#0a0a0a;
          color:#fff;
          font-size:${row.dist.length > 4 ? '8':'13'}px;
          font-weight:900;
          font-family:Arial Black,Arial,sans-serif;
          text-align:center;
          border:1px solid #000;
          padding:2px 1px;
          white-space:nowrap;
          min-width:28px;
        ">${row.dist}</td>`;

        // SCY label
        const scyLabel = `<td style="background:#0a0a0a;color:#888;font-size:6px;font-weight:700;font-family:Arial,sans-serif;text-align:center;border:1px solid #000;padding:1px;white-space:nowrap;">SCY</td>`;

        cols.forEach(s => { scyCells += timeCell(s, row.scy, gender, isAlt); });

        rowsHtml += `<tr>${strokeCell}${distCell}${scyLabel}${scyCells}</tr>`;

        // LCM row (same distance, just different course)
        const lcmLabel = `<td style="background:#0a0a0a;color:#888;font-size:6px;font-weight:700;font-family:Arial,sans-serif;text-align:center;border:1px solid #000;padding:1px;white-space:nowrap;">LCM</td>`;
        let lcmCells = '';
        cols.forEach(s => {
          const t   = getTime(s, row.lcm, gender);
          const bg2 = isAlt ? '#1a1a1a' : '#111';
          const clr = t ? s.color : '#333';
          const fw  = t ? '600'   : '400';
          lcmCells += `<td style="background:${bg2};color:${clr};font-size:7.2px;font-weight:${fw};font-family:'Arial Narrow',Arial,sans-serif;padding:1.5px 2px;text-align:center;border:1px solid #000;white-space:nowrap;">${t||'—'}</td>`;
        });
        rowsHtml += `<tr>${lcmLabel}${lcmCells}</tr>`;

        globalRowIdx++;
      });
    });

    return `
      <div style="flex:1;min-width:0;">
        <div style="font-size:22px;font-weight:900;font-style:italic;color:${titleColor};font-family:Arial Black,Arial,sans-serif;text-align:center;letter-spacing:2px;padding:4px 0;text-transform:uppercase;">${titleLabel}</div>
        <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
          <thead>
            <tr>
              <th style="background:#000;border:1px solid #000;width:16px;"></th>
              <th style="background:#000;border:1px solid #000;width:30px;"></th>
              <th style="background:#000;border:1px solid #000;width:20px;"></th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  }

  const womenTable = buildSideTable('F', womenCols, 'WOMEN');
  const menTable   = buildSideTable('M', menCols,   'MEN');

  const yr2 = year + 1;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${teamName} — ${year} Time Standards</title>
<style>
@page { size: 11in 8.5in landscape; margin: 0.2in; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Arial Narrow', Arial, sans-serif;
  background: #000;
  color: #fff;
}
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
<div style="width:100%;min-height:calc(8.5in - 0.4in);display:flex;flex-direction:column;background:#000;">

  <!-- Header bar -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#000;border-bottom:2px solid #333;margin-bottom:4px;">
    <div style="flex-shrink:0;">${logoEl}</div>
    <div style="text-align:center;flex:1;">
      <div style="font-size:11px;font-weight:900;letter-spacing:6px;color:#fff;text-transform:uppercase;font-family:Arial Black,Arial,sans-serif;">${year}–${yr2} TIME STANDARDS</div>
      <div style="font-size:7px;letter-spacing:4px;color:#666;text-transform:uppercase;margin-top:1px;">${teamName}</div>
    </div>
    <div style="flex-shrink:0;">${logoEl}</div>
  </div>

  <!-- Main content: Women left, divider, Men right -->
  <div style="display:flex;gap:6px;flex:1;align-items:flex-start;">
    ${womenTable}

    <!-- Center divider with EVENTS label -->
    <div style="flex-shrink:0;width:40px;display:flex;flex-direction:column;align-items:center;padding-top:32px;gap:0;">
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:7px;font-weight:900;letter-spacing:3px;color:#444;text-transform:uppercase;font-family:Arial Black,Arial,sans-serif;margin-bottom:6px;">EVENTS</div>
      <div style="width:1px;flex:1;background:#333;"></div>
    </div>

    ${menTable}
  </div>

  <!-- Footer -->
  <div style="display:flex;align-items:center;justify-content:center;gap:14px;padding:3px 10px;border-top:2px solid #333;margin-top:4px;">
    ${logoEl}
    <span style="color:#444;font-size:6px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">${teamName} — ${year} Time Standards — Printed ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'}).toUpperCase()}</span>
    ${logoEl}
  </div>

</div>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };<\/script>
</body>
</html>`;
}
