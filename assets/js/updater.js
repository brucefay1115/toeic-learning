// PWA Service Worker registration, automatic update, and post-update modal.

const UPDATE_PENDING_KEY = 'update_ack_pending';
const UPDATE_SHOWN_SESSION_KEY = 'update_prompt_shown_version';

function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* no-op */ }
}

function safeSessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* no-op */ }
}

function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* no-op */ }
}

function safeLocalRemove(key) {
  try { localStorage.removeItem(key); } catch { /* no-op */ }
}

function normalizeUpdateInfo(info) {
  if (!info || typeof info !== 'object') return null;
  if (!info.version || typeof info.version !== 'string') return null;
  return {
    version: info.version,
    changes: Array.isArray(info.changes) ? info.changes : [],
  };
}

function readPendingUpdateInfo() {
  const raw = safeLocalGet(UPDATE_PENDING_KEY);
  if (!raw) return null;
  try {
    const info = normalizeUpdateInfo(JSON.parse(raw));
    if (!info) {
      safeLocalRemove(UPDATE_PENDING_KEY);
      return null;
    }
    return info;
  } catch {
    safeLocalRemove(UPDATE_PENDING_KEY);
    return null;
  }
}

function writePendingUpdateInfo(info) {
  const normalized = normalizeUpdateInfo(info);
  if (!normalized) return;
  safeLocalSet(UPDATE_PENDING_KEY, JSON.stringify({
    ...normalized,
    detectedAt: Date.now(),
  }));
}

async function fetchLatestVersionInfo() {
  const res = await fetch('./version.json?t=' + Date.now());
  if (!res.ok) throw new Error('Failed to fetch version.json');
  const data = await res.json();
  return normalizeUpdateInfo(data);
}

function showUpdateModal(info, options = {}) {
  if (document.getElementById('updateOverlay')) return;
  const { acknowledgeOnClose = true } = options;

  const overlay = document.createElement('div');
  overlay.id = 'updateOverlay';
  overlay.className = 'update-overlay';

  overlay.innerHTML = `
    <div class="update-modal">
      <div class="update-modal-icon">✓</div>
      <h2 class="update-modal-title">已更新到版本 v${info.version}</h2>
      <ul class="update-modal-changes">
        ${info.changes.map((c) => `<li>${c}</li>`).join('')}
      </ul>
      <p class="update-modal-notice">請完全關閉此 WebApp 後重新開啟，以確保更新生效</p>
      <button class="update-modal-btn" id="btnUpdateAck">${acknowledgeOnClose ? '我知道了' : '關閉'}</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btnUpdateAck').addEventListener('click', () => {
    if (acknowledgeOnClose) {
      safeLocalRemove(UPDATE_PENDING_KEY);
      safeSessionRemove(UPDATE_SHOWN_SESSION_KEY);
    }
    overlay.remove();
  });
}

function checkPostUpdateModal() {
  const info = readPendingUpdateInfo();
  if (!info) return;

  if (safeSessionGet(UPDATE_SHOWN_SESSION_KEY) === info.version) return;

  safeSessionSet(UPDATE_SHOWN_SESSION_KEY, info.version);
  showUpdateModal(info, { acknowledgeOnClose: true });
}

function autoActivate(worker) {
  if (worker) worker.postMessage('skipWaiting');
}

export async function initUpdater() {
  checkPostUpdateModal();

  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (refreshing) return;
    refreshing = true;

    try {
      const info = await fetchLatestVersionInfo();
      if (info) {
        writePendingUpdateInfo(info);
        safeSessionRemove(UPDATE_SHOWN_SESSION_KEY);
      }
    } catch { /* proceed with reload anyway */ }

    window.location.reload();
  });

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    reg.update().catch(() => {});

    if (reg.waiting) {
      autoActivate(reg.waiting);
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          autoActivate(installing);
        }
      });
    });

    const triggerUpdate = () => {
      reg.update().catch(() => {});
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') triggerUpdate();
    });

    window.addEventListener('pageshow', (e) => {
      if (e.persisted) triggerUpdate();
    });

  } catch (err) {
    console.warn('SW registration failed:', err);
  }
}

