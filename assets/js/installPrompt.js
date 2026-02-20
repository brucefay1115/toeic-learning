// PWA install prompt: platform-aware guide for adding the app to the home screen.

const DISMISS_KEY = 'pwa_install_dismissed';
const DISMISS_PERMANENT_KEY = 'pwa_install_never';
const COOLDOWN_DAYS = 7;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || navigator.standalone === true;
}

function isDismissed() {
  if (localStorage.getItem(DISMISS_PERMANENT_KEY)) return true;
  const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
  if (!ts) return false;
  return (Date.now() - ts) < COOLDOWN_DAYS * 86400000;
}

function dismiss(permanent) {
  if (permanent) localStorage.setItem(DISMISS_PERMANENT_KEY, '1');
  else localStorage.setItem(DISMISS_KEY, String(Date.now()));
  const el = document.getElementById('installOverlay');
  if (el) el.remove();
}

function detectPlatform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

const SHARE_ICON_SVG = `<svg class="install-share-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

const PLUS_ICON_SVG = `<svg class="install-share-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;

function buildBenefitsHTML() {
  return `
    <div class="install-benefits">
      <div class="install-benefit">
        <span class="install-benefit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></span>
        <span>離線也能使用</span>
      </div>
      <div class="install-benefit">
        <span class="install-benefit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
        <span>啟動更快速</span>
      </div>
      <div class="install-benefit">
        <span class="install-benefit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
        <span>全螢幕沉浸體驗</span>
      </div>
    </div>`;
}

function showAndroidOverlay(deferredPrompt) {
  if (document.getElementById('installOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'installOverlay';
  overlay.className = 'install-overlay';
  overlay.innerHTML = `
    <div class="install-card">
      <img class="install-app-icon" src="./assets/icons/icon-192.png" alt="TOEIC AI Tutor" width="72" height="72">
      <h2 class="install-title">將 TOEIC AI Tutor<br>加到桌面</h2>
      <p class="install-subtitle">享受更好的學習體驗</p>
      ${buildBenefitsHTML()}
      <button class="install-primary-btn" id="btnInstallApp">安裝到桌面</button>
      <div class="install-secondary-actions">
        <button class="install-later-btn" id="btnInstallLater">稍後再說</button>
        <button class="install-never-btn" id="btnInstallNever">不再顯示</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  document.getElementById('btnInstallApp').onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss(true);
    else dismiss(false);
  };
  document.getElementById('btnInstallLater').onclick = () => dismiss(false);
  document.getElementById('btnInstallNever').onclick = () => dismiss(true);
}

function showIOSOverlay() {
  if (document.getElementById('installOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'installOverlay';
  overlay.className = 'install-overlay';
  overlay.innerHTML = `
    <div class="install-card">
      <img class="install-app-icon" src="./assets/icons/icon-192.png" alt="TOEIC AI Tutor" width="72" height="72">
      <h2 class="install-title">將 TOEIC AI Tutor<br>加到桌面</h2>
      <p class="install-subtitle">享受更好的學習體驗</p>
      ${buildBenefitsHTML()}
      <div class="install-steps">
        <div class="install-step">
          <span class="install-step-num">1</span>
          <span class="install-step-text">點擊底部的 <strong>分享按鈕</strong> ${SHARE_ICON_SVG}</span>
        </div>
        <div class="install-step">
          <span class="install-step-num">2</span>
          <span class="install-step-text">滾動選單，點擊 <strong>「加入主畫面」</strong> ${PLUS_ICON_SVG}</span>
        </div>
        <div class="install-step">
          <span class="install-step-num">3</span>
          <span class="install-step-text">點擊右上角 <strong>「新增」</strong> 完成安裝</span>
        </div>
      </div>
      <button class="install-primary-btn" id="btnInstallDismiss">我知道了</button>
      <div class="install-secondary-actions">
        <button class="install-never-btn" id="btnInstallNever">不再顯示</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  document.getElementById('btnInstallDismiss').onclick = () => dismiss(false);
  document.getElementById('btnInstallNever').onclick = () => dismiss(true);
}

function showGenericOverlay() {
  if (document.getElementById('installOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'installOverlay';
  overlay.className = 'install-overlay';
  overlay.innerHTML = `
    <div class="install-card">
      <img class="install-app-icon" src="./assets/icons/icon-192.png" alt="TOEIC AI Tutor" width="72" height="72">
      <h2 class="install-title">將 TOEIC AI Tutor<br>加到桌面</h2>
      <p class="install-subtitle">享受更好的學習體驗</p>
      ${buildBenefitsHTML()}
      <p class="install-generic-hint">使用瀏覽器選單中的<br><strong>「加到主畫面」</strong>或<strong>「安裝應用程式」</strong>選項</p>
      <button class="install-primary-btn" id="btnInstallDismiss">我知道了</button>
      <div class="install-secondary-actions">
        <button class="install-never-btn" id="btnInstallNever">不再顯示</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  document.getElementById('btnInstallDismiss').onclick = () => dismiss(false);
  document.getElementById('btnInstallNever').onclick = () => dismiss(true);
}

let deferredPromptEvent = null;

export function initInstallPrompt() {
  if (isStandalone() || isDismissed()) return;

  const platform = detectPlatform();

  if (platform === 'ios') {
    showIOSOverlay();
    return;
  }

  // Android / Chrome / Edge — listen for beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPromptEvent = e;
    if (!isStandalone() && !isDismissed()) {
      showAndroidOverlay(deferredPromptEvent);
    }
  });

  // For browsers that don't fire beforeinstallprompt (non-Chromium desktop, etc.)
  if (platform === 'other') {
    setTimeout(() => {
      if (!deferredPromptEvent && !document.getElementById('installOverlay')) {
        showGenericOverlay();
      }
    }, 3000);
  }
}
