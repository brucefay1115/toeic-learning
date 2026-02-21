// PWA Service Worker registration, automatic update, and post-update modal.

const UPDATE_INFO_KEY = 'just_updated_info';

function showUpdateModal(info) {
  if (document.getElementById('updateOverlay')) return;

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
      <button class="update-modal-btn" id="btnUpdateAck">我知道了</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btnUpdateAck').addEventListener('click', () => {
    sessionStorage.removeItem(UPDATE_INFO_KEY);
    overlay.remove();
  });
}

function checkPostUpdateModal() {
  const raw = sessionStorage.getItem(UPDATE_INFO_KEY);
  if (!raw) return;
  try {
    const info = JSON.parse(raw);
    if (info && info.version) showUpdateModal(info);
  } catch { /* ignore corrupt data */ }
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
      const res = await fetch('./version.json?t=' + Date.now());
      if (res.ok) {
        const info = await res.json();
        sessionStorage.setItem(UPDATE_INFO_KEY, JSON.stringify({
          version: info.version,
          changes: info.changes || [],
        }));
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
