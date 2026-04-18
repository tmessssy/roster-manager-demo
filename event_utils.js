// ============================================================
//  event_utils.js  — Shared event name normalization
//
//  Previously, both hytek_importer.js and meetmobile_bridge.js
//  had their own copy of event normalization logic that diverged
//  over time. This is now the single source of truth.
//
//  Load: after app.js (needs EVENTS), before meets.js,
//        meetmobile_bridge.js, and hytek_importer.js
// ============================================================

// ── Stroke keyword → canonical stroke name ────────────────────
const STROKE_KEYWORDS = [
  { keywords: ['individual medley', ' im ', '/im', 'im/'],  stroke: 'IM'     },
  { keywords: ['butterfly', ' fly'],                         stroke: 'Fly'    },
  { keywords: ['breaststroke', 'breast'],                    stroke: 'Breast' },
  { keywords: ['backstroke', 'back'],                        stroke: 'Back'   },
  { keywords: ['freestyle', 'free'],                         stroke: 'Free'   },
];

// ── LCM equivalent distance for SCY events ───────────────────
// When course is LCM, some SCY distances have LCM counterparts
// with different numbers (e.g. 1650 → 1500).
const LCM_DISTANCE_MAP = {
  Free:   { 500: 400, 1000: 800, 1650: 1500 },
  Back:   {},
  Breast: {},
  Fly:    {},
  IM:     {},
};

/**
 * Normalize a raw event string from HY-TEK or Meet Mobile to
 * match an entry in the app's EVENTS array.
 *
 * @param {string} rawEvent   — e.g. "200 Yard Individual Medley", "100 Back", "50 Free"
 * @param {string} course     — "SCY" | "LCM" | "SCM"
 * @returns {string|null}     — matching EVENTS entry, or null if not recognized
 *
 * Examples:
 *   normalizeEvent("100 Yard Freestyle", "SCY")  → "100 Free SCY"
 *   normalizeEvent("200 IM", "LCM")              → "200 IM LCM"
 *   normalizeEvent("1650 Free", "SCY")            → "1650 Free SCY"
 *   normalizeEvent("1500 Free", "LCM")            → "1500 Free LCM"
 *   normalizeEvent("500 Free", "LCM")             → "400 Free LCM"  (LCM equiv)
 */
function normalizeEvent(rawEvent, course) {
  if (!rawEvent) return null;

  const r = rawEvent.toLowerCase().trim();

  // ── Extract distance ──────────────────────────────────────
  const distMatch = r.match(/(\d+)/);
  if (!distMatch) return null;
  let dist = parseInt(distMatch[1]);

  // ── Identify stroke ───────────────────────────────────────
  let stroke = null;
  for (const { keywords, stroke: s } of STROKE_KEYWORDS) {
    if (keywords.some(kw => r.includes(kw))) {
      stroke = s;
      break;
    }
  }
  if (!stroke) return null;

  // ── Apply LCM distance remapping ──────────────────────────
  // HY-TEK files from SCY teams sometimes include LCM distances
  // using SCY terminology (e.g. "1650 Free LCM").
  if (course === 'LCM') {
    const map = LCM_DISTANCE_MAP[stroke];
    if (map && map[dist] !== undefined) {
      dist = map[dist];
    }
  }

  // ── Build candidate and look up in EVENTS ─────────────────
  const candidate = `${dist} ${stroke} ${course}`;
  if (typeof EVENTS !== 'undefined' && EVENTS.includes(candidate)) {
    return candidate;
  }

  // ── Fallback: try without course suffix in case EVENTS uses
  //    a different format (defensive, shouldn't be needed) ───
  const candidateNoCourse = `${dist} ${stroke}`;
  if (typeof EVENTS !== 'undefined') {
    const match = EVENTS.find(e => e.startsWith(candidateNoCourse));
    if (match) return match;
  }

  return null;
}

/**
 * Like normalizeEvent() but also handles the case where the
 * raw string already contains a course suffix ("SCY", "LCM").
 * Useful when importing from sources that vary in formatting.
 */
function normalizeEventFull(rawEvent, defaultCourse) {
  if (!rawEvent) return null;
  const upper = rawEvent.toUpperCase();

  // Detect embedded course
  let course = defaultCourse || 'SCY';
  if (upper.includes('LCM')) course = 'LCM';
  else if (upper.includes('SCM')) course = 'SCM';
  else if (upper.includes('SCY')) course = 'SCY';

  return normalizeEvent(rawEvent, course);
}

/**
 * Given an athlete gender and event key (e.g. "100 Free SCY"),
 * return the correct times key for standards objects.
 */
function timesKey(gender) {
  return gender === 'female' ? 'timesF' : 'timesM';
}

/**
 * Attempt to match an athlete by name using fuzzy logic:
 *  1. Exact full name match (case-insensitive)
 *  2. Last name + first initial match
 *  3. Last name only (if unique)
 *
 * @param {string} rawName
 * @returns {object|null} athlete from S.athletes
 */
function matchAthleteByName(rawName) {
  if (!rawName || typeof S === 'undefined') return null;
  const name = rawName.trim().toLowerCase();

  // 1. Exact match
  let match = S.athletes.find(a => a.name.toLowerCase() === name);
  if (match) return match;

  // 2. "Last, First" HY-TEK format → "First Last"
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    const normalized = first + ' ' + last;
    match = S.athletes.find(a => a.name.toLowerCase() === normalized);
    if (match) return match;

    // Last name + first initial
    const firstInitial = first ? first[0] : '';
    match = S.athletes.find(a => {
      const parts = a.name.toLowerCase().split(' ');
      const aLast = parts[parts.length - 1];
      const aFirst = parts[0] || '';
      return aLast === last && aFirst[0] === firstInitial;
    });
    if (match) return match;
  }

  // 3. Space-separated "First Last" — last name + first initial
  const parts = name.split(' ');
  if (parts.length >= 2) {
    const first = parts[0];
    const last  = parts[parts.length - 1];
    match = S.athletes.find(a => {
      const ap = a.name.toLowerCase().split(' ');
      return ap[ap.length - 1] === last && ap[0][0] === first[0];
    });
    if (match) return match;

    // 4. Last name only (unique)
    const byLast = S.athletes.filter(a =>
      a.name.toLowerCase().split(' ').slice(-1)[0] === last
    );
    if (byLast.length === 1) return byLast[0];
  }

  return null;
}
