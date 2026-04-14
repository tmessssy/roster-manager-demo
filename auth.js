(function () {
  const ACCOUNT_INDEX_KEY = 'swimWebAccounts_v1';
  const LAST_USER_KEY = 'swimWebLastUser_v1';
  const SESSION_USER_KEY = 'swimWebSessionUser_v1';
  const PBKDF2_ITERATIONS = 150000;

  let currentUser = '';
  let currentKey = null;
  let currentState = null;
  let defaultStateFactory = null;
  let writePromise = Promise.resolve();
  let initPromise = null;
  let resolveInit = null;

  function accountStorageKey(username) {
    return `swimWebAccount_${username.toLowerCase()}`;
  }

  function readAccounts() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNT_INDEX_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(accounts));
  }

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function toBase64(bytes) {
    let binary = '';
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function textEncoder() {
    return new TextEncoder();
  }

  function textDecoder() {
    return new TextDecoder();
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  async function deriveKey(password, saltBytes) {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      textEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptState(key, payload) {
    const iv = randomBytes(12);
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      textEncoder().encode(JSON.stringify(payload))
    );

    return {
      iv: toBase64(iv),
      data: toBase64(new Uint8Array(cipher))
    };
  }

  async function decryptState(key, record) {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) },
      key,
      fromBase64(record.data)
    );

    return JSON.parse(textDecoder().decode(plain));
  }

  function getOverlay() {
    return document.getElementById('authOverlay');
  }

  function getError() {
    return document.getElementById('authError');
  }

  function setError(message) {
    const el = getError();
    if (el) {
      el.textContent = message || '';
    }
  }

  function setBusy(isBusy) {
    const root = getOverlay();
    if (!root) {
      return;
    }
    root.dataset.busy = isBusy ? 'true' : 'false';
    root.querySelectorAll('button,input').forEach(node => {
      node.disabled = isBusy;
    });
  }

  function renderAccountList() {
    const list = document.getElementById('authAccountList');
    const accounts = readAccounts();
    if (!list) {
      return;
    }

    if (!accounts.length) {
      list.innerHTML = '<div class="auth-empty">No local accounts on this device yet.</div>';
      return;
    }

    list.innerHTML = accounts.map(account => `
      <button class="auth-account-chip" type="button" onclick="WebBetaAuth.pickAccount('${account.username}')">${account.username}</button>
    `).join('');
  }

  function renderMode(mode) {
    const overlay = getOverlay();
    if (!overlay) {
      return;
    }
    overlay.dataset.mode = mode;
    const isCreate = mode === 'create';
    const submit = document.getElementById('authSubmitBtn');
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const confirmRow = document.getElementById('authConfirmRow');
    const switchBtn = document.getElementById('authSwitchModeBtn');

    if (submit) submit.textContent = isCreate ? 'Create Local Account' : 'Unlock Local Account';
    if (title) title.textContent = isCreate ? 'Create a Local Account' : 'Unlock Your Local Account';
    if (subtitle) subtitle.textContent = isCreate
      ? 'Everything stays encrypted on this device. There is no server recovery.'
      : 'Enter your device-local username and password to unlock saved data.';
    if (confirmRow) confirmRow.style.display = isCreate ? '' : 'none';
    if (switchBtn) switchBtn.textContent = isCreate ? 'Use Existing Account' : 'Create New Account';

    setError('');
    renderAccountList();
  }

  function showOverlay() {
    document.body.classList.add('auth-locked');
  }

  function hideOverlay() {
    document.body.classList.remove('auth-locked');
  }

  async function writeEncryptedState(snapshot) {
    if (!currentKey || !currentUser) {
      return;
    }

    const record = await encryptState(currentKey, snapshot);
    localStorage.setItem(accountStorageKey(currentUser), JSON.stringify(record));
    currentState = snapshot;
  }

  async function unlockAccount(username, password) {
    const normalized = normalizeUsername(username);
    const meta = readAccounts().find(account => account.username === normalized);
    if (!meta) {
      throw new Error('That account does not exist on this device.');
    }

    const rawRecord = localStorage.getItem(accountStorageKey(normalized));
    if (!rawRecord) {
      throw new Error('Stored account data is missing on this device.');
    }

    const key = await deriveKey(password, fromBase64(meta.salt));
    const state = await decryptState(key, JSON.parse(rawRecord));
    currentUser = normalized;
    currentKey = key;
    currentState = state;
    sessionStorage.setItem(SESSION_USER_KEY, normalized);
    localStorage.setItem(LAST_USER_KEY, normalized);
    hideOverlay();
    return state;
  }

  async function createAccount(username, password, initialState) {
    const normalized = normalizeUsername(username);
    const accounts = readAccounts();
    if (accounts.some(account => account.username === normalized)) {
      throw new Error('That username already exists on this device.');
    }

    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);
    const record = await encryptState(key, initialState);
    accounts.push({
      username: normalized,
      salt: toBase64(salt),
      createdAt: new Date().toISOString()
    });
    saveAccounts(accounts);
    localStorage.setItem(accountStorageKey(normalized), JSON.stringify(record));
    currentUser = normalized;
    currentKey = key;
    currentState = initialState;
    sessionStorage.setItem(SESSION_USER_KEY, normalized);
    localStorage.setItem(LAST_USER_KEY, normalized);
    hideOverlay();
    return initialState;
  }

  async function handleSubmit() {
    const mode = getOverlay()?.dataset.mode || 'login';
    const username = document.getElementById('authUsername')?.value || '';
    const password = document.getElementById('authPassword')?.value || '';
    const confirm = document.getElementById('authPasswordConfirm')?.value || '';

    setError('');

    if (!normalizeUsername(username)) {
      setError('Enter a username.');
      return;
    }
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      let state = null;
      if (mode === 'create') {
        if (password !== confirm) {
          throw new Error('Passwords do not match.');
        }
        state = await createAccount(username, password, defaultStateFactory());
      } else {
        state = await unlockAccount(username, password);
      }

      if (document.body.classList.contains('app-booting')) {
        if (resolveInit) resolveInit(state);
      } else {
        location.reload();
      }
    } catch (error) {
      setError(error.message || 'Could not unlock local account.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedAccount() {
    const username = normalizeUsername(document.getElementById('authUsername')?.value || '');
    if (!username) {
      setError('Enter or select an account first.');
      return;
    }

    if (!confirm(`Delete the local account "${username}" from this device? This cannot be undone.`)) {
      return;
    }

    const accounts = readAccounts().filter(account => account.username !== username);
    saveAccounts(accounts);
    localStorage.removeItem(accountStorageKey(username));
    if (localStorage.getItem(LAST_USER_KEY) === username) {
      localStorage.removeItem(LAST_USER_KEY);
    }
    if (sessionStorage.getItem(SESSION_USER_KEY) === username) {
      sessionStorage.removeItem(SESSION_USER_KEY);
    }
    document.getElementById('authUsername').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authPasswordConfirm').value = '';
    renderAccountList();
    renderMode(accounts.length ? 'login' : 'create');
    setError('');
  }

  function fillPreferredUsername() {
    const preferred = sessionStorage.getItem(SESSION_USER_KEY) || localStorage.getItem(LAST_USER_KEY) || '';
    const input = document.getElementById('authUsername');
    if (input && preferred && !input.value) {
      input.value = preferred;
    }
  }

  window.WebBetaAuth = {
    async init(factory) {
      defaultStateFactory = factory;
      if (!initPromise) {
        initPromise = new Promise(resolve => {
          resolveInit = resolve;
        });
      }
      renderMode(readAccounts().length ? 'login' : 'create');
      fillPreferredUsername();
      showOverlay();
      return initPromise;
    },

    readState() {
      return currentState;
    },

    async getUnlockedState() {
      if (currentState) {
        return currentState;
      }
      const rawRecord = localStorage.getItem(accountStorageKey(currentUser));
      if (!rawRecord || !currentKey) return null;
      currentState = await decryptState(currentKey, JSON.parse(rawRecord));
      return currentState;
    },

    queueWrite(snapshot) {
      writePromise = writePromise
        .catch(() => undefined)
        .then(() => writeEncryptedState(snapshot));
      return writePromise;
    },

    async clearState(snapshot) {
      await writeEncryptedState(snapshot);
    },

    getCurrentUsername() {
      return currentUser;
    },

    isUnlocked() {
      return Boolean(currentUser && currentKey);
    },

    renderAccountPanel() {
      const name = document.getElementById('accountName');
      const note = document.getElementById('accountNote');
      if (name) {
        name.textContent = currentUser || 'Not signed in';
      }
      if (note) {
        note.textContent = currentUser
          ? 'Stored only in this browser on this device.'
          : 'Unlock a local account to load saved data.';
      }
    },

    showLogin() {
      showOverlay();
      fillPreferredUsername();
      renderMode(readAccounts().length ? 'login' : 'create');
    },

    async logout() {
      currentUser = '';
      currentKey = null;
      currentState = null;
      sessionStorage.removeItem(SESSION_USER_KEY);
      location.reload();
    },

    pickAccount(username) {
      const input = document.getElementById('authUsername');
      if (input) {
        input.value = username;
      }
      renderMode('login');
    },

    async submit() {
      await handleSubmit();
      this.renderAccountPanel();
    },

    switchMode() {
      const mode = getOverlay()?.dataset.mode === 'create' ? 'login' : 'create';
      renderMode(mode);
      fillPreferredUsername();
    },

    async deleteSelected() {
      await deleteSelectedAccount();
    }
  };
})();
