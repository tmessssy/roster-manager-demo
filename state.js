// ============================================================
//  state.js  — Centralized state management
//
//  Provides:
//   • setState(patch)     — safe, logged state updates
//   • genAthleteId()      — consistent "ath_<timestamp>_<rand>" IDs
//   • Time validation     — validateTime() with user-friendly errors
//   • Auto-backup prompt  — nudges export after 7 days of no backup
//   • Safe deep-clone     — dc() that handles edge cases
//
//  Load: immediately after bridge.js, before app.js
// ============================================================

// ── Safe deep-clone ───────────────────────────────────────────
// JSON.parse/stringify is fast but silently drops Dates and
// undefined values. For this app's data model (plain strings,
// numbers, arrays, objects) it's fine — but we guard explicitly.
function dc(x) {
  if (x === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(x));
  } catch (e) {
    console.error('[state] dc() failed:', e);
    return x; // return original rather than crash
  }
}

// ── Consistent Athlete ID generator ──────────────────────────
// Old code had a mix of "f1", "m1", "a100", "a101" etc.
// New athletes always get "ath_<timestamp>_<rand>".
// Old IDs are preserved as-is so existing data isn't broken.
function genAthleteId() {
  return 'ath_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// ── Time format validation ────────────────────────────────────
// Returns { valid: true } or { valid: false, message: '...' }
// Accepts:  "54.32"   "1:23.45"   "10:02.34"
// Rejects:  "abc"     "1:2:3"     "1:23"  (no hundredths)
const TIME_RE = /^(\d+:)?\d{1,2}\.\d{2}$/;

function validateTime(value) {
  if (!value || !value.trim()) {
    return { valid: true }; // empty = clearing the time, that's fine
  }
  const v = value.trim();
  if (!TIME_RE.test(v)) {
    return {
      valid: false,
      message: `"${v}" isn't a valid time. Use format like 54.32 or 1:23.45`
    };
  }
  // Sanity-check seconds portion ≥ 0 and < 60
  const parts = v.split(':');
  const secs = parseFloat(parts[parts.length - 1]);
  if (secs >= 60) {
    return { valid: false, message: `Seconds must be less than 60 (got ${secs})` };
  }
  return { valid: true };
}

// ── Validate a batch of times, return list of errors ─────────
// Used by saveTimes() to catch all problems at once.
function validateAllTimes(inputElements) {
  const errors = [];
  inputElements.forEach(input => {
    const result = validateTime(input.value);
    if (!result.valid) {
      errors.push({ element: input, event: input.dataset.ev, message: result.message });
    }
  });
  return errors;
}

// ── Show inline validation errors on time inputs ──────────────
function showTimeValidationErrors(errors) {
  // Clear any previous error highlights
  document.querySelectorAll('.tein.invalid, .stiin.invalid').forEach(el => {
    el.classList.remove('invalid');
    const errEl = el.parentElement.querySelector('.time-err');
    if (errEl) errEl.remove();
  });

  errors.forEach(({ element, event: ev, message }) => {
    element.classList.add('invalid');
    const errDiv = document.createElement('div');
    errDiv.className = 'time-err';
    errDiv.textContent = message;
    element.parentElement.appendChild(errDiv);
  });

  // Focus first bad field
  if (errors.length > 0) {
    errors[0].element.focus();
  }
}

// ── setState wrapper ──────────────────────────────────────────
// Merges a patch object into S, then calls save().
// Logs all changes in dev mode so bugs are easy to trace.
//
// Usage:
//   setState({ athletes: updatedAthletes })
//   setState({ teamName: 'New Name' })
//
// For nested mutations (e.g. adding one result to a meet),
// it's still fine to mutate S.meets[i].results.push(...) then
// call save() directly — setState is best for top-level keys.

function setState(patch) {
  if (typeof patch !== 'object' || patch === null) {
    console.warn('[state] setState called with non-object:', patch);
    return;
  }
  Object.keys(patch).forEach(key => {
    const oldVal = S[key];
    S[key] = patch[key];
    // Light-weight change log (only in debug builds / dev tools)
    if (window._stateDebug) {
      console.log(`[state] ${key}:`, oldVal, '→', patch[key]);
    }
  });
  save();
}

// ── Auto-backup prompt ────────────────────────────────────────
// Once per session, if it's been > 7 days since last backup,
// show a non-blocking toast-style prompt encouraging export.
//
// "Last backup" is tracked in localStorage as swimApp_lastBackup.
// It's updated when exportData() is called.

const BACKUP_INTERVAL_DAYS = 7;
const BACKUP_KEY = 'swimApp_lastBackup';

function recordBackup() {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch (e) {}
}

function checkBackupPrompt() {
  try {
    const last = localStorage.getItem(BACKUP_KEY);
    if (!last) {
      // Never backed up — only prompt if there's real data worth saving
      if (!S.athletes || S.athletes.length === 0) return;
      _showBackupPrompt('You haven\'t exported a backup yet. Export your data to keep it safe.');
      return;
    }
    const daysSince = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= BACKUP_INTERVAL_DAYS) {
      const days = Math.floor(daysSince);
      _showBackupPrompt(`It's been ${days} day${days !== 1 ? 's' : ''} since your last backup. Export your data?`);
    }
  } catch (e) {}
}

function _showBackupPrompt(message) {
  // Don't stack prompts
  if (document.getElementById('backupPrompt')) return;

  const el = document.createElement('div');
  el.id = 'backupPrompt';
  el.className = 'backup-prompt';
  el.innerHTML = `
    <div class="backup-prompt-icon">💾</div>
    <div class="backup-prompt-msg">${message}</div>
    <button class="btn bsm bp" onclick="exportData();dismissBackupPrompt()">Export Now</button>
    <button class="btn bsm bs" onclick="dismissBackupPrompt()" style="margin-left:5px;">Later</button>
  `;
  // Insert below the top bar
  const topbar = document.querySelector('.topbar');
  if (topbar && topbar.nextSibling) {
    topbar.parentNode.insertBefore(el, topbar.nextSibling);
  } else {
    document.body.prepend(el);
  }
}

function dismissBackupPrompt() {
  const el = document.getElementById('backupPrompt');
  if (el) el.remove();
}

// ── Notification helper (referenced by meetmobile_bridge.js) ──
// Centralised here so any module can call showNotification().
function showNotification(msg, duration) {
  const ms = duration || 3000;
  let el = document.getElementById('appNotification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appNotification';
    el.className = 'app-notification';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), ms);
}
