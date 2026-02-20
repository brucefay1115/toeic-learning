// PWA Service Worker registration, update detection, and update-prompt UI.

async function fetchChangelog() {
  try {
    const res = await fetch('./version.json?t=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return { version: '?', changes: ['有新版本可用'] };
  }
}

function showUpdateBanner(info, onUpdate) {
  if (document.getElementById('updateBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="update-header">
      <span class="update-title">新版本 v${info.version} 可用！</span>
      <button class="update-close" id="btnDismissUpdate">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <ul class="update-changes">
      ${info.changes.map((c) => `<li>${c}</li>`).join('')}
    </ul>
    <button class="update-btn" id="btnDoUpdate">立即更新</button>
  `;
  document.body.prepend(banner);

  document.getElementById('btnDoUpdate').onclick = onUpdate;
  document.getElementById('btnDismissUpdate').onclick = () => banner.remove();
}

function promptUpdate(newWorker) {
  fetchChangelog().then((info) => {
    showUpdateBanner(info, () => {
      const btn = document.getElementById('btnDoUpdate');
      btn.disabled = true;
      btn.textContent = '更新中…';
      newWorker.postMessage('skipWaiting');

      setTimeout(() => {
        btn.textContent = '請關閉 App 後重新開啟以完成更新';
      }, 3000);
    });
  });
}

export async function initUpdater() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    if (reg.waiting) {
      promptUpdate(reg.waiting);
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          promptUpdate(installing);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } catch (err) {
    console.warn('SW registration failed:', err);
  }
}
