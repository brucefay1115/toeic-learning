// PWA Service Worker registration, automatic update, and post-update modal.

import { t } from './i18n.js';
import { DB } from './db.js';
import {
  safeLocalGet,
  safeLocalRemove,
  safeSessionGet,
  safeSessionRemove,
  safeSessionSet
} from './storageSafe.js';
import { fetchVersionInfo, getBootVersionInfo, normalizeVersionInfo } from './versioning.js';

const UPDATE_ACK_VERSION_KEY = 'update_ack_version';
const LEGACY_PENDING_KEY = 'update_ack_pending';
const PENDING_SW_CHANGELOG_KEY = 'toeic_pending_sw_changelog';

async function getAcknowledgedVersion() {
  try {
    let v = await DB.getSetting(UPDATE_ACK_VERSION_KEY);
    if (v != null) return v;
    const legacy = safeLocalGet(UPDATE_ACK_VERSION_KEY);
    if (legacy) {
      await DB.setSetting(UPDATE_ACK_VERSION_KEY, legacy);
      safeLocalRemove(UPDATE_ACK_VERSION_KEY);
      return legacy;
    }
    return null;
  } catch {
    return safeLocalGet(UPDATE_ACK_VERSION_KEY);
  }
}

async function setAcknowledgedVersion(version) {
  await DB.setSetting(UPDATE_ACK_VERSION_KEY, version);
  safeLocalRemove(UPDATE_ACK_VERSION_KEY);
}

function migrateLegacyPendingKey() {
  safeLocalRemove(LEGACY_PENDING_KEY);
}

function showUpdateModal(info, { pendingSession = false } = {}) {
  if (document.getElementById('updateOverlay')) return;

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
      <button class="update-modal-btn" id="btnUpdateAck">${t('updaterAck')}</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btnUpdateAck').addEventListener('click', () => {
    setAcknowledgedVersion(info.version)
      .catch(() => {})
      .finally(() => {
        if (pendingSession) safeSessionRemove(PENDING_SW_CHANGELOG_KEY);
        overlay.remove();
      });
  });
}

async function maybeShowUpdateNotice() {
  migrateLegacyPendingKey();

  const ack = await getAcknowledgedVersion();

  let pendingNorm = null;
  const pendingRaw = safeSessionGet(PENDING_SW_CHANGELOG_KEY);
  if (pendingRaw) {
    try {
      pendingNorm = normalizeVersionInfo(JSON.parse(pendingRaw));
    } catch {
      safeSessionRemove(PENDING_SW_CHANGELOG_KEY);
    }
  }

  let info = getBootVersionInfo();
  try {
    const net = await fetchVersionInfo(true);
    if (net) info = net;
  } catch {
    /* use boot-only */
  }

  const normalized = normalizeVersionInfo(info);

  if (normalized && normalized.version === ack) {
    safeSessionRemove(PENDING_SW_CHANGELOG_KEY);
    return;
  }

  if (pendingNorm && pendingNorm.version !== ack) {
    const useForModal =
      normalized && normalized.version === pendingNorm.version
        ? normalized
        : !normalized && pendingNorm
          ? pendingNorm
          : null;

    if (useForModal) {
      showUpdateModal(useForModal, { pendingSession: true });
      return;
    }
    if (normalized && normalized.version !== pendingNorm.version) {
      safeSessionRemove(PENDING_SW_CHANGELOG_KEY);
    }
  }

  if (!normalized) return;

  if (normalized.version === ack) return;

  showUpdateModal(normalized);
}

export function scheduleUpdateNoticeAfterAppReady() {
  window.addEventListener(
    'toeic-app-ready',
    () => {
      const runWhenRevealed = () => {
        if (document.documentElement.classList.contains('app-booting')) {
          requestAnimationFrame(runWhenRevealed);
          return;
        }
        maybeShowUpdateNotice().catch(() => {});
      };
      requestAnimationFrame(runWhenRevealed);
    },
    { once: true }
  );
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

async function persistPendingChangelogBeforeReload() {
  let info = getBootVersionInfo();
  try {
    const net = await fetchVersionInfo(true);
    if (net) info = net;
  } catch {
    /* use boot-only */
  }
  const normalized = normalizeVersionInfo(info);
  if (normalized) {
    safeSessionSet(PENDING_SW_CHANGELOG_KEY, JSON.stringify(normalized));
  }
}

export async function registerServiceWorkerUpdater() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (refreshing) return;
    refreshing = true;

    try {
      await persistPendingChangelogBeforeReload();
    } catch {
      /* keep reload resilient */
    }

    try {
      await purgeAppCaches();
    } catch {
      /* keep reload resilient */
    }
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
