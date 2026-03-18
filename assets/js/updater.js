// PWA Service Worker registration, automatic update, and post-update modal.

import { t } from './i18n.js';
import { safeLocalGet, safeLocalRemove, safeLocalSet, safeSessionGet, safeSessionRemove, safeSessionSet } from './storageSafe.js';
import { fetchVersionInfo, normalizeVersionInfo } from './versioning.js';

const UPDATE_PENDING_KEY = 'update_ack_pending';
const UPDATE_SHOWN_SESSION_KEY = 'update_prompt_shown_version';

function readPendingUpdateInfo() {
  const raw = safeLocalGet(UPDATE_PENDING_KEY);
  if (!raw) return null;
  try {
    const info = normalizeVersionInfo(JSON.parse(raw));
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
  const normalized = normalizeVersionInfo(info);
  if (!normalized) return;
  safeLocalSet(UPDATE_PENDING_KEY, JSON.stringify({
    ...normalized,
    detectedAt: Date.now(),
  }));
}

async function fetchLatestVersionInfo() {
  return fetchVersionInfo(true);
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
      <h2 class="update-modal-title">${t('updaterTitle', { version: info.version })}</h2>
      <ul class="update-modal-changes">
        ${info.changes.map((c) => `<li>${c}</li>`).join('')}
      </ul>
      <p class="update-modal-notice">${t('updaterNotice')}</p>
      <button class="update-modal-btn" id="btnUpdateAck">${acknowledgeOnClose ? t('updaterAck') : t('updaterClose')}</button>
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

async function purgeAppCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => k.startsWith('toeic-tutor-static'))
      .map((k) => caches.delete(k))
  );
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

    try { await purgeAppCaches(); } catch { /* keep reload resilient */ }
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

