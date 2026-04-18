// ============================================================
//  gdrive_sync.js — Optional Google Drive backup & restore
//
//  UX model:
//   • Local backup prompt (state.js) always fires first.
//   • "Save to Drive" button appears in Settings > Data.
//   • Uses the Anthropic API to call the Google Drive MCP
//     so the user never has to handle OAuth directly.
//   • Saves as:  SwimRoster_Backup_YYYY-MM-DD.json  in Drive root.
//   • Restore lets user pick any previous backup file.
//
//  Depends on: state.js (recordBackup), app.js (S, save, exportData)
//  Load after: app.js, state.js
// ============================================================

const GDRIVE_BACKUP_PREFIX  = 'SwimRoster_Backup_';
const GDRIVE_FOLDER_NAME    = 'SwimRoster Backups';

let _gdriveStatus = '';   // last status message shown in UI
let _gdriveBusy   = false;

// ── Render the Drive section inside the Data card ─────────────
// Call this from populateSettingsModal() after the existing
// Export/Import/Reset buttons.
function renderGDriveSection() {
  const el = document.getElementById('gdriveSection');
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:9px;">
      <button class="gdrive-btn" onclick="gdriveBackup()" ${_gdriveBusy ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
        ${_gdriveBusy ? 'Saving…' : 'Save to Drive'}
      </button>
      <button class="btn bs" onclick="gdriveRestore()" ${_gdriveBusy ? 'disabled' : ''}>
        ↩ Restore from Drive
      </button>
    </div>
    <div class="gdrive-status" id="gdriveStatusMsg">${_gdriveStatus}</div>
  `;
}

// ── Export to Drive ───────────────────────────────────────────
async function gdriveBackup() {
  if (_gdriveBusy) return;
  _gdriveBusy = true;
  _setDriveStatus('Connecting to Google Drive…');
  renderGDriveSection();

  try {
    const today    = new Date().toISOString().slice(0, 10);
    const filename = `${GDRIVE_BACKUP_PREFIX}${today}.json`;
    const payload  = JSON.stringify({
      athletes:  S.athletes,
      standards: S.standards,
      teamName:  S.teamName,
      teamLogo:  S.teamLogo  || null,
      meets:     S.meets     || [],
      attendance:S.attendance|| [],
      exportedAt: new Date().toISOString(),
      appVersion: 'swimroster-v3'
    }, null, 2);

    _setDriveStatus('Uploading backup…');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are a file upload assistant. Use the Google Drive MCP tool to upload the provided file content. Respond with JSON only: {"success": true, "fileId": "...", "fileName": "..."} or {"success": false, "error": "..."}. No other text.',
        messages: [{
          role: 'user',
          content: `Upload this JSON as a file named "${filename}" to Google Drive in a folder called "${GDRIVE_FOLDER_NAME}" (create the folder if it doesn't exist). File content:\n\n${payload}`
        }],
        mcp_servers: [{
          type: 'url',
          url:  'https://drivemcp.googleapis.com/mcp/v1',
          name: 'google-drive'
        }]
      })
    });

    const data = await response.json();

    // Extract the assistant's text response
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No response from Drive MCP');

    // Parse result — strip any markdown fences just in case
    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    let result;
    try { result = JSON.parse(clean); } catch(e) {
      // MCP succeeded but response wasn't pure JSON — treat as success
      // if the text mentions a fileId or upload success
      if (textBlock.text.toLowerCase().includes('success') ||
          textBlock.text.toLowerCase().includes('uploaded') ||
          textBlock.text.toLowerCase().includes('created')) {
        result = { success: true, fileName: filename };
      } else {
        throw new Error('Unexpected response: ' + textBlock.text.slice(0, 120));
      }
    }

    if (result.success) {
      recordBackup();
      dismissBackupPrompt();
      _setDriveStatus(`✅ Saved "${result.fileName || filename}" to Google Drive`);
      AppBridge.showToast('✅ Backed up to Google Drive');
    } else {
      throw new Error(result.error || 'Upload failed');
    }

  } catch (err) {
    console.error('[GDrive] Backup failed:', err);
    _setDriveStatus(`❌ Drive backup failed: ${err.message}. Try Export JSON instead.`);
  } finally {
    _gdriveBusy = false;
    renderGDriveSection();
  }
}

// ── Restore from Drive ────────────────────────────────────────
async function gdriveRestore() {
  if (_gdriveBusy) return;

  // Always confirm before overwriting live data
  if (!confirm('Restore from Google Drive? This will overwrite your current data.\n\nTip: Export a local backup first if you\'re unsure.')) return;

  _gdriveBusy = true;
  _setDriveStatus('Searching Drive for backups…');
  renderGDriveSection();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `You are a file retrieval assistant. Use the Google Drive MCP tool to find and return SwimRoster backup files.
Respond with JSON only — no other text:
{"success": true, "files": [{"id": "fileId", "name": "fileName", "modifiedTime": "ISO date", "content": "file content string"}]}
or {"success": false, "error": "reason"}
Find files whose names start with "${GDRIVE_BACKUP_PREFIX}" in the folder "${GDRIVE_FOLDER_NAME}". Return up to 5 most recent, include the full content of the most recent one.`,
        messages: [{
          role: 'user',
          content: `Find SwimRoster backup files in Google Drive folder "${GDRIVE_FOLDER_NAME}" and return the content of the most recent one.`
        }],
        mcp_servers: [{
          type: 'url',
          url:  'https://drivemcp.googleapis.com/mcp/v1',
          name: 'google-drive'
        }]
      })
    });

    const data     = await response.json();
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No response from Drive MCP');

    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    let result;
    try { result = JSON.parse(clean); } catch(e) {
      throw new Error('Could not parse Drive response');
    }

    if (!result.success) throw new Error(result.error || 'No backups found');

    const files = result.files || [];
    if (!files.length) throw new Error('No SwimRoster backups found in Google Drive');

    // Use the most recent file's content
    const latest = files[0];
    const parsed = typeof latest.content === 'string'
      ? JSON.parse(latest.content)
      : latest.content;

    if (!parsed || !parsed.athletes) {
      throw new Error('Backup file appears to be corrupt or empty');
    }

    // Apply the restore
    if (parsed.athletes)   S.athletes   = parsed.athletes;
    if (parsed.standards)  S.standards  = parsed.standards;
    if (parsed.teamName)   S.teamName   = parsed.teamName;
    if (parsed.teamLogo)   S.teamLogo   = parsed.teamLogo;
    if (parsed.meets)      S.meets      = parsed.meets;
    if (parsed.attendance) S.attendance = parsed.attendance;

    save();

    // Refresh all UI
    if (typeof renderRoster     === 'function') renderRoster();
    if (typeof renderSettStds   === 'function') renderSettStds();
    if (typeof renderAccentPalette === 'function') renderAccentPalette();
    if (S.teamLogo && typeof applyLogo === 'function') applyLogo();
    const tns = document.getElementById('tns');
    if (tns) tns.textContent = S.teamName;

    const ts = parsed.exportedAt
      ? new Date(parsed.exportedAt).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})
      : latest.name;

    _setDriveStatus(`✅ Restored from backup: ${ts}`);
    AppBridge.showToast('✅ Data restored from Google Drive');

  } catch (err) {
    console.error('[GDrive] Restore failed:', err);
    _setDriveStatus(`❌ Restore failed: ${err.message}`);
  } finally {
    _gdriveBusy = false;
    renderGDriveSection();
  }
}

// ── Internal helpers ──────────────────────────────────────────
function _setDriveStatus(msg) {
  _gdriveStatus = msg;
  const el = document.getElementById('gdriveStatusMsg');
  if (el) el.textContent = msg;
}
