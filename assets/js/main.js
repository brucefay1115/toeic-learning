// App entry point: initialisation, tab switching, event binding, module wiring.

import { state, VOICE_OPTIONS, VOICE_NAMES } from './state.js';
import { speakText } from './utils.js';
import { DB } from './db.js';
import { fetchGeminiText, fetchGeminiTTS } from './apiGemini.js';
import { DriveSync } from './driveSync.js';
import { setupAudio } from './audioPlayer.js';
import { renderContent, toggleEnglish, toggleTranslation } from './render.js';
import { closeModal, renderVocabTab, setSrsTrigger } from './vocab.js';
import { startSrsReview, closeSrsReview, finishSrsReview, setOnFinish } from './srs.js';
import { saveToHistory, renderHistory, loadLastSession, clearHistory, setDeps as setHistoryDeps } from './history.js';
import { initUpdater } from './updater.js';
import { initInstallPrompt } from './installPrompt.js';

/* ── Wire cross-module callbacks ── */
setSrsTrigger(startSrsReview);
setOnFinish(renderVocabTab);
setHistoryDeps({ switchTab });
DriveSync.setCallbacks({ renderHistory, loadLastSession, renderVocabTab });

/* ── Expose minimal globals needed by dynamic innerHTML onclick ── */
window.speakText = speakText;
window.finishSrsReview = finishSrsReview;
window.DriveSync = DriveSync;

/* ── Tab switching ── */
function switchTab(tabName) {
    ['tabLearn', 'tabPractice', 'tabVocab', 'tabHistory', 'tabAbout'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    if (tabName === 'history') renderHistory();
    if (tabName === 'vocab') renderVocabTab();
    const pb = document.getElementById('playerBar');
    if (tabName === 'learn' && state.audioBlobUrl) pb.classList.remove('hidden'); else pb.classList.add('hidden');
}
window.switchTab = switchTab;

/* ── Score chips ── */
const scores = [500, 600, 700, 800, 900];
const scoreSelector = document.getElementById('scoreSelector');
scores.forEach(score => {
    const chip = document.createElement('div');
    chip.className = `score-chip ${score === state.targetScore ? 'active' : ''}`;
    chip.innerText = score;
    chip.onclick = () => {
        state.targetScore = score;
        document.querySelectorAll('.score-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    };
    scoreSelector.appendChild(chip);
});

/* ── Voice chips ── */
const voiceSelector = document.getElementById('voiceSelector');
VOICE_OPTIONS.forEach(opt => {
    const chip = document.createElement('div');
    chip.className = `voice-chip ${opt.name === state.selectedVoice ? 'active' : ''}`;
    chip.innerHTML = `<span>${opt.label}</span><span class="voice-desc">${opt.desc}</span>`;
    chip.onclick = () => {
        state.selectedVoice = opt.name;
        document.querySelectorAll('.voice-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    };
    voiceSelector.appendChild(chip);
});

/* ── Settings / API Key modal ── */
const keyModal = document.getElementById('keyModal');
const APP_VERSION_CACHE_KEY = 'app_version_display';

document.getElementById('btnSettings').onclick = () => {
    document.getElementById('apiKeyInput').value = state.apiKey;
    document.getElementById('btnCloseKeyModal').style.display = state.apiKey ? 'flex' : 'none';
    DriveSync.updateUI();
    keyModal.classList.add('active');
};

function saveApiKey() {
    const v = document.getElementById('apiKeyInput').value.trim();
    if (v) { state.apiKey = v; DB.setSetting('gemini_api_key', v); keyModal.classList.remove('active'); }
    else { alert('請輸入有效的 API Key'); }
}

function safeLocalGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function safeLocalSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* no-op */ }
}

function setAppVersionText(text) {
    const el = document.getElementById('appVersion');
    if (el) el.textContent = text;
}

function initAppVersionDisplay() {
    const cached = safeLocalGet(APP_VERSION_CACHE_KEY);
    setAppVersionText(cached || 'v--');

    fetch('./version.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.version) {
            const text = `v${d.version}`;
            setAppVersionText(text);
            safeLocalSet(APP_VERSION_CACHE_KEY, text);
        } else if (cached) {
            setAppVersionText(cached);
        }
      })
      .catch(() => {
        if (cached) setAppVersionText(cached);
      });
}

/* ── Static HTML event bindings (replacing inline onclick) ── */
document.querySelector('#emptyState .cta-btn').onclick = () => switchTab('practice');
document.getElementById('btnToggleEn').onclick = () => toggleEnglish();
document.getElementById('btnToggleZh').onclick = () => toggleTranslation();
document.getElementById('btnClearHistory').onclick = () => clearHistory();
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
});
document.querySelector('#wordModal .wm-btn.secondary').onclick = () => closeModal();
document.getElementById('btnSaveApiKey').onclick = () => saveApiKey();
document.getElementById('btnCloseKeyModal').onclick = () => keyModal.classList.remove('active');
document.getElementById('btnCloudLogin').onclick = () => DriveSync.login();
document.getElementById('btnBackupNow').onclick = () => DriveSync.backupNow();
document.getElementById('btnRestore').onclick = () => DriveSync.restore();
document.getElementById('btnCloudLogout').onclick = () => DriveSync.logout();
document.querySelector('#srsOverlay .srs-close-btn').onclick = () => closeSrsReview();

/* ── Generate button ── */
const GENERATE_BTN = document.getElementById('btnGenerate');
const LOADING_TEXT = '<span class="loader"></span> 生成中...';

GENERATE_BTN.onclick = async () => {
    if (!state.apiKey) return alert('請先設定 API Key');
    GENERATE_BTN.disabled = true;
    GENERATE_BTN.innerHTML = LOADING_TEXT;
    document.getElementById('learningArea').classList.add('hidden');
    document.getElementById('playerBar').classList.add('hidden');

    try {
        const customTopic = document.getElementById('customTopic').value.trim();
        const contentData = await fetchGeminiText(state.targetScore, customTopic);
        if (contentData.segments) {
            contentData.article = contentData.segments.map(s => s.en).join(' ');
            contentData.translation = contentData.segments.map(s => s.zh).join('\n');
        }
        state.currentData = contentData;

        const voiceName = state.selectedVoice === 'random'
            ? VOICE_NAMES[Math.floor(Math.random() * VOICE_NAMES.length)]
            : state.selectedVoice;
        state.lastUsedVoice = voiceName;

        renderContent(contentData, voiceName);
        const audioBase64 = await fetchGeminiTTS(contentData.article, voiceName);
        setupAudio(audioBase64);
        await saveToHistory(contentData, audioBase64, voiceName, customTopic);
        switchTab('learn');
    } catch (error) {
        console.error(error);
        alert('發生錯誤: ' + error.message);
    } finally {
        GENERATE_BTN.disabled = false;
        GENERATE_BTN.innerText = '開始學習 (Generate)';
    }
};

/* ── App Init ── */
(async function initApp() {
    initAppVersionDisplay();

    try {
        await DB.init();
        let apiKey = await DB.getSetting('gemini_api_key');
        if (!apiKey) {
            const lk = localStorage.getItem('gemini_api_key');
            if (lk) { apiKey = lk; await DB.setSetting('gemini_api_key', lk); localStorage.removeItem('gemini_api_key'); }
        }
        if (apiKey) state.apiKey = apiKey; else keyModal.classList.add('active');
        renderHistory();
        await loadLastSession();

        DriveSync.init();
        const cloudEnabled = await DB.getSetting('cloud_sync_enabled');
        if (cloudEnabled) {
            await DriveSync.silentLogin();
            DriveSync.updateUI();
        }
        initUpdater();
        initInstallPrompt();
    } catch (e) { console.error("Init failed:", e); keyModal.classList.add('active'); }
})();
