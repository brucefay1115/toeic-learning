// App entry point: initialisation, tab switching, event binding, module wiring.

import { state, VOICE_OPTIONS, VOICE_NAMES, ICONS } from './state.js';
import { speakText } from './utils.js';
import { DB } from './db.js';
import { fetchGeminiText, fetchGeminiTTS, fetchExamQuestions, fetchExamWrongAnswerExplanations } from './apiGemini.js';
import { DriveSync } from './driveSync.js';
import { setupAudio } from './audioPlayer.js';
import { renderContent, toggleEnglish, toggleTranslation, updateToggleButtons } from './render.js';
import { closeModal, renderVocabTab, setSrsTrigger } from './vocab.js';
import { startSrsReview, closeSrsReview, finishSrsReview, setOnFinish } from './srs.js';
import { saveToHistory, savePracticeRecord, renderHistory, loadSession, loadLastSession, clearHistory, setDeps as setHistoryDeps } from './history.js';
import { initUpdater } from './updater.js';
import { initInstallPrompt } from './installPrompt.js';
import { startSpeakingSession, stopSpeakingSession } from './speakingLive.js';
import { flattenExamQuestions, renderExamQuestions, gradeExam, buildWrongPayload, playListeningQuestion, resolveChoice } from './exam.js';
import { SUPPORTED_LOCALES, applyTranslations, detectBrowserLocale, getLocale, setLocale, t } from './i18n.js';

/* ── Wire cross-module callbacks ── */
setSrsTrigger(startSrsReview);
setOnFinish(renderVocabTab);
setHistoryDeps({
    switchTab,
    openArticleRecord: openArticleRecordFromHistory,
    openExamRecord: openExamRecordFromHistory,
    openSpeakingRecord: openSpeakingRecordFromHistory,
    onHistoryMutated: handleHistoryMutated
});
DriveSync.setCallbacks({ renderHistory, loadLastSession, renderVocabTab });

/* ── Expose minimal globals needed by dynamic innerHTML onclick ── */
window.speakText = speakText;
window.finishSrsReview = finishSrsReview;
window.DriveSync = DriveSync;
document.addEventListener('player-loading-changed', updatePlayerBarVisibility);

const emptyStateEl = document.getElementById('emptyState');
const learningAreaEl = document.getElementById('learningArea');
const speakingSessionViewEl = document.getElementById('speakingSessionView');
const examShellEl = document.getElementById('examShell');
let activeTab = 'learn';
let currentLearnRecord = null;

function markLearnRecord(record) {
    currentLearnRecord = record ? { ...record } : null;
}

function updatePlayerBarVisibility() {
    const pb = document.getElementById('playerBar');
    const playBtn = document.getElementById('btnPlayPause');
    const articleVisible = !learningAreaEl.classList.contains('hidden');
    const isLoadingArticleAudio = !!playBtn && playBtn.disabled;
    const hasArticleAudio = !!state.audioBlobUrl || isLoadingArticleAudio;
    const shouldShow = activeTab === 'learn' && articleVisible && hasArticleAudio;
    pb.classList.toggle('hidden', !shouldShow);
}

function clearArticleLearningContent() {
    state.currentData = null;
    state.audioReady = false;
    if (state.audioBlobUrl) {
        URL.revokeObjectURL(state.audioBlobUrl);
        state.audioBlobUrl = null;
    }
    const audioEl = document.getElementById('mainAudio');
    if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
    }
    setLearnRuntimeMode('article');
    markLearnRecord(null);
    updatePlayerBarVisibility();
}

function setLearnRuntimeMode(mode) {
    const showArticle = mode === 'article';
    const showSpeaking = mode === 'speaking';
    const showExam = mode === 'exam';
    if (showArticle) {
        emptyStateEl.classList.toggle('hidden', !!state.currentData);
        learningAreaEl.classList.toggle('hidden', !state.currentData);
    } else {
        emptyStateEl.classList.add('hidden');
        learningAreaEl.classList.add('hidden');
    }
    speakingSessionViewEl.classList.toggle('hidden', !showSpeaking);
    examShellEl.classList.toggle('hidden', !showExam);
    updatePlayerBarVisibility();
}

/* ── Tab switching ── */
function switchTab(tabName) {
    activeTab = tabName;
    ['tabLearn', 'tabPractice', 'tabVocab', 'tabHistory', 'tabAbout'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    if (tabName === 'practice' && state.practiceMode === 'speaking') resetSpeakingPracticeView();
    if (tabName === 'practice' && state.practiceMode === 'exam') resetExamPracticeView();
    if (tabName === 'history') renderHistory();
    if (tabName === 'vocab') renderVocabTab();
    updatePlayerBarVisibility();
}
window.switchTab = switchTab;

/* ── Practice mode switching ── */
function setPracticeMode(mode) {
    if (state.practiceMode === 'speaking' && mode !== 'speaking' && state.speakingState.isConnected) {
        stopSpeakingSession().catch(() => {});
    }
    state.practiceMode = mode;
    document.querySelectorAll('.practice-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.getElementById('practicePanelArticle').classList.toggle('hidden', mode !== 'article');
    document.getElementById('practicePanelSpeaking').classList.toggle('hidden', mode !== 'speaking');
    document.getElementById('practicePanelExam').classList.toggle('hidden', mode !== 'exam');
    if (mode === 'speaking') resetSpeakingPracticeView();
    if (mode === 'exam') resetExamPracticeView();
}

document.querySelectorAll('.practice-mode-btn').forEach(btn => {
    btn.onclick = () => setPracticeMode(btn.dataset.mode);
});

/* ── Speaking level chips ── */
const SPEAKING_LEVELS = ['beginner', 'intermediate', 'advanced'];

function getSpeakingLevelByScore(score) {
    const numericScore = Number(score) || 700;
    if (numericScore <= 600) return 'beginner';
    if (numericScore === 700) return 'intermediate';
    return 'advanced';
}

function renderSpeakingLevelSwitch() {
    const fallbackLevel = getSpeakingLevelByScore(state.targetScore);
    if (!SPEAKING_LEVELS.includes(state.speakingState.level)) {
        state.speakingState.level = fallbackLevel;
    }
    document.querySelectorAll('#speakingLevelSwitch .speaking-level-chip').forEach((btn) => {
        const isActive = btn.dataset.level === state.speakingState.level;
        btn.classList.toggle('active', isActive);
    });
}

document.querySelectorAll('#speakingLevelSwitch .speaking-level-chip').forEach((btn) => {
    btn.onclick = () => {
        const level = btn.dataset.level;
        if (!SPEAKING_LEVELS.includes(level)) return;
        state.speakingState.level = level;
        state.speakingState.levelManuallySelected = true;
        renderSpeakingLevelSwitch();
    };
});

/* ── Score chips (article + exam shared) ── */
const scores = [500, 600, 700, 800, 900];
function renderScoreChips(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    scores.forEach(score => {
        const chip = document.createElement('div');
        chip.className = `score-chip ${score === state.targetScore ? 'active' : ''}`;
        chip.innerText = score;
        chip.onclick = () => {
            state.targetScore = score;
            state.examState.score = score;
            document.querySelectorAll('#scoreSelector .score-chip, #examScoreSelector .score-chip').forEach(c => {
                c.classList.toggle('active', Number(c.innerText) === score);
            });
            if (!state.speakingState.levelManuallySelected) {
                state.speakingState.level = getSpeakingLevelByScore(score);
                renderSpeakingLevelSwitch();
            }
        };
        el.appendChild(chip);
    });
}
renderScoreChips('scoreSelector');
renderScoreChips('examScoreSelector');
if (!state.speakingState.level) {
    state.speakingState.level = getSpeakingLevelByScore(state.targetScore);
}
renderSpeakingLevelSwitch();

/* ── Voice chips ── */
const voiceSelector = document.getElementById('voiceSelector');
function renderVoiceOptions() {
    if (!voiceSelector) return;
    voiceSelector.innerHTML = '';
    VOICE_OPTIONS.forEach((opt) => {
        const chip = document.createElement('div');
        chip.className = `voice-chip ${opt.name === state.selectedVoice ? 'active' : ''}`;
        chip.innerHTML = `<span>${t(opt.labelKey)}</span><span class="voice-desc">${t(opt.descKey)}</span>`;
        chip.onclick = () => {
            state.selectedVoice = opt.name;
            document.querySelectorAll('.voice-chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
        };
        voiceSelector.appendChild(chip);
    });
}
renderVoiceOptions();

/* ── Settings / API Key modal ── */
const keyModal = document.getElementById('keyModal');
const localeSelect = document.getElementById('localeSelect');
const APP_VERSION_CACHE_KEY = 'app_version_display';

function populateLocaleSelector() {
    if (!localeSelect) return;
    localeSelect.innerHTML = '';
    SUPPORTED_LOCALES.forEach((locale) => {
        const opt = document.createElement('option');
        opt.value = locale.code;
        opt.textContent = locale.name;
        localeSelect.appendChild(opt);
    });
    localeSelect.value = getLocale();
}

function applyLocaleToUI() {
    applyTranslations(document);
    document.title = t('appTitle');
    renderVoiceOptions();
    renderSpeakingLevelSwitch();
    const activeTopicChip = document.querySelector('#speakingPresetGroup .topic-chip.active');
    if (activeTopicChip?.dataset.topicKey) {
        state.speakingState.selectedTopic = t(activeTopicChip.dataset.topicKey);
    }
    updateToggleButtons();
    if (state.currentData?.phrases?.length) {
        const phraseTitle = document.getElementById('phraseSectionTitle');
        if (phraseTitle) phraseTitle.textContent = t('sectionPhrases');
    } else if (state.currentData?.grammar?.length) {
        const phraseTitle = document.getElementById('phraseSectionTitle');
        if (phraseTitle) phraseTitle.textContent = t('sectionGrammar');
    }
    if (!state.speakingState.isConnected && !state.speakingState.isResponding) {
        const statusEl = document.getElementById('speakingStatus');
        if (statusEl && !activeSpeakingRecord) statusEl.textContent = t('speakingStatusStopped');
    }
}

async function persistLocaleSelection(locale) {
    const ts = Date.now();
    await DB.setSetting('app_locale', locale);
    await DB.setSetting('app_locale_updated_at', ts);
    const history = await DB.getSetting('app_locale_history');
    const list = Array.isArray(history) ? history : [];
    list.unshift({ locale, ts });
    await DB.setSetting('app_locale_history', list.slice(0, 30));
}

document.getElementById('btnSettings').onclick = () => {
    document.getElementById('apiKeyInput').value = state.apiKey;
    document.getElementById('btnCloseKeyModal').style.display = state.apiKey ? 'flex' : 'none';
    if (localeSelect) localeSelect.value = getLocale();
    DriveSync.updateUI();
    keyModal.classList.add('active');
};

async function saveApiKey() {
    const v = document.getElementById('apiKeyInput').value.trim();
    if (!v) {
        alert(t('alertInvalidApiKey'));
        return;
    }
    state.apiKey = v;
    await DB.setSetting('gemini_api_key', v);
    keyModal.classList.remove('active');
}

async function clearApiKey() {
    const confirmed = confirm(t('confirmClearApiKey'));
    if (!confirmed) return;
    state.apiKey = '';
    document.getElementById('apiKeyInput').value = '';
    await DB.setSetting('gemini_api_key', null);
    document.getElementById('btnCloseKeyModal').style.display = 'none';
    alert(t('alertApiKeyCleared'));
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

function initPostLocalePrompts() {
    // Keep this order: locale is already applied, then show prompt UIs.
    initUpdater();
    initInstallPrompt();
}

function setButtonLoading(button, loadingText, spinnerClass = 'loader') {
    if (!button) return () => {};
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="${spinnerClass}"></span> ${loadingText}`;
    return () => {
        button.disabled = false;
        button.innerHTML = originalHtml;
    };
}

let activeSpeakingRecord = null;

function createRecordId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneValue(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function createExamSnapshot(resultOverride = state.examState.result) {
    return {
        questions: cloneValue(state.examState.questions),
        answers: cloneValue(state.examState.answers),
        result: cloneValue(resultOverride),
        listeningAudioByQuestion: cloneValue(state.examState.listeningAudioByQuestion || {}),
        voiceName: state.examState.voiceName || 'Kore'
    };
}

function ensureExamRecordIdentity() {
    if (!state.examState.attemptId) state.examState.attemptId = createExamAttemptId();
    if (!state.examState.recordId) state.examState.recordId = createRecordId('exam');
    if (!state.examState.recordCreatedAt) state.examState.recordCreatedAt = Date.now();
}

async function persistExamRecord(recordStage, options = {}) {
    const { includeSummary = false, explanationsOverride = state.examState.explanations } = options;
    ensureExamRecordIdentity();
    const result = state.examState.result;
    const examSummary = includeSummary && result ? buildExamSummary(result) : null;
    await savePracticeRecord({
        id: state.examState.recordId,
        createdAt: state.examState.recordCreatedAt || Date.now(),
        type: 'exam',
        recordStage,
        attemptId: state.examState.attemptId,
        title: t('examTitle'),
        score: state.targetScore,
        examSummary,
        examSnapshot: createExamSnapshot(),
        explanations: explanationsOverride
    });
}

async function persistSpeakingRecord() {
    if (!activeSpeakingRecord?.id) return;
    await savePracticeRecord({
        ...activeSpeakingRecord,
        createdAt: activeSpeakingRecord.createdAt || Date.now(),
        recordStage: activeSpeakingRecord.recordStage || 'speaking_in_progress'
    });
}

function setExamStateFromRecord(item) {
    const snapshot = item.examSnapshot || {};
    state.targetScore = Number(item.score) || state.targetScore;
    state.examState.questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
    state.examState.answers = snapshot.answers || {};
    state.examState.result = snapshot.result || null;
    state.examState.explanations = item.explanations || null;
    state.examState.attemptId = item.attemptId || null;
    state.examState.recordId = item.id || null;
    state.examState.recordCreatedAt = item.createdAt || null;
    state.examState.voiceName = snapshot.voiceName || state.lastUsedVoice || 'Kore';
    state.examState.listeningAudioByQuestion = snapshot.listeningAudioByQuestion || {};
    state.examState.explanationRecordSaved = item.recordStage === 'explanations_generated';
}

function openExamRecordFromHistory(item) {
    setExamStateFromRecord(item);
    document.querySelectorAll('#scoreSelector .score-chip, #examScoreSelector .score-chip').forEach(c => {
        c.classList.toggle('active', Number(c.innerText) === state.targetScore);
    });
    EXAM_META.textContent = t('examMeta', { score: state.targetScore, count: state.examState.questions.length });
    renderExamQuestions(EXAM_CONTENT, state.examState.questions, state.examState.answers);
    if (state.examState.result) {
        renderExamResult();
        renderExamActions('graded');
    } else {
        renderExamActions('answering');
    }
    setPracticeMode('exam');
    showExamSessionView();
    markLearnRecord({ id: item.id, type: 'exam', fromHistory: true });
}

function openArticleRecordFromHistory(item) {
    setPracticeMode('article');
    loadSession(item);
    setLearnRuntimeMode('article');
    switchTab('learn');
    markLearnRecord({ id: item.id, type: 'article', fromHistory: true });
}

function openSpeakingRecordFromHistory(item) {
    const logs = Array.isArray(item.logs) ? item.logs : [];
    setPracticeMode('speaking');
    showSpeakingSessionView();
    document.getElementById('btnStopSpeaking').disabled = true;
    document.getElementById('speakingStatus').textContent = item.finalStatus || t('speakingRecordReview');
    const logEl = document.getElementById('speakingLog');
    logEl.innerHTML = '';
    logs.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'speaking-log-item';
        row.innerHTML = `<span class="speaking-log-role">${String(entry.role || 'log').toUpperCase()}</span>${entry.text || ''}`;
        logEl.prepend(row);
    });
    markLearnRecord({ id: item.id, type: 'speaking', fromHistory: true });
}

function handleHistoryMutated({ action, item }) {
    if (action === 'clear') {
        clearArticleLearningContent();
        return;
    }
    if (action !== 'delete' || !item || !currentLearnRecord?.fromHistory) return;
    if (item.id !== currentLearnRecord.id) return;
    if (item.type === 'article') {
        clearArticleLearningContent();
        return;
    }
    setPracticeMode('article');
    setLearnRuntimeMode('article');
    markLearnRecord(null);
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
document.getElementById('btnSaveApiKey').onclick = async () => saveApiKey();
document.getElementById('btnClearApiKey').onclick = () => clearApiKey();
document.getElementById('btnCloseKeyModal').onclick = () => keyModal.classList.remove('active');
if (localeSelect) {
    localeSelect.onchange = async (event) => {
        const locale = setLocale(event.target.value);
        applyLocaleToUI();
        try {
            await persistLocaleSelection(locale);
        } catch (error) {
            console.error('Persist locale failed:', error);
        }
    };
}
document.getElementById('btnCloudLogin').onclick = () => DriveSync.login();
document.getElementById('btnBackupNow').onclick = () => DriveSync.backupNow();
document.getElementById('btnRestore').onclick = () => DriveSync.restore();
document.getElementById('btnCloudLogout').onclick = () => DriveSync.logout();
document.querySelector('#srsOverlay .srs-close-btn').onclick = () => closeSrsReview();

/* ── Speaking mode UI ── */
function resetSpeakingPracticeView() {
    document.getElementById('speakingConfigView').classList.remove('hidden');
}

function showSpeakingConfigView() {
    resetSpeakingPracticeView();
    setLearnRuntimeMode('article');
    switchTab('practice');
}

function showSpeakingSessionView() {
    document.getElementById('speakingConfigView').classList.add('hidden');
    setLearnRuntimeMode('speaking');
    switchTab('learn');
}

function appendSpeakingLog(role, text) {
    const logEl = document.getElementById('speakingLog');
    const row = document.createElement('div');
    row.className = 'speaking-log-item';
    row.innerHTML = `<span class="speaking-log-role">${role.toUpperCase()}</span>${text}`;
    logEl.prepend(row);
    if (activeSpeakingRecord) {
        activeSpeakingRecord.logs.push({
            ts: Date.now(),
            role: String(role || '').toLowerCase(),
            text
        });
        persistSpeakingRecord().catch((e) => console.error('Persist speaking log failed:', e));
    }
}

function setSpeakingStatus(text) {
    document.getElementById('speakingStatus').textContent = text;
    if (activeSpeakingRecord) {
        activeSpeakingRecord.finalStatus = text;
    }
}

async function finalizeSpeakingRecord(finalStatus = t('speakingStatusStopped')) {
    if (!activeSpeakingRecord) return;
    activeSpeakingRecord.endedAt = Date.now();
    activeSpeakingRecord.durationMs = Math.max(0, activeSpeakingRecord.endedAt - activeSpeakingRecord.startedAt);
    activeSpeakingRecord.recordStage = 'speaking_completed';
    activeSpeakingRecord.finalStatus = finalStatus;
    await persistSpeakingRecord();
}

document.querySelectorAll('#speakingPresetGroup .topic-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('#speakingPresetGroup .topic-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.speakingState.selectedTopic = chip.dataset.topicKey ? t(chip.dataset.topicKey) : chip.dataset.topic;
    };
});

document.getElementById('btnStartSpeaking').onclick = async () => {
    try {
        const custom = document.getElementById('speakingCustomTopic').value.trim();
        state.speakingState.customTopic = custom;
        const topic = custom || state.speakingState.selectedTopic;
        if (!topic) return alert(t('alertSelectTopicFirst'));
        document.getElementById('speakingLog').innerHTML = '';
        activeSpeakingRecord = {
            id: createRecordId('speaking'),
            createdAt: Date.now(),
            type: 'speaking',
            date: new Date().toLocaleDateString(),
            title: topic,
            score: state.targetScore,
            speakingLevel: state.speakingState.level,
            topic,
            startedAt: Date.now(),
            endedAt: null,
            durationMs: 0,
            finalStatus: t('speakingStatusInit'),
            recordStage: 'speaking_in_progress',
            logs: []
        };
        await persistSpeakingRecord();
        showSpeakingSessionView();
        setSpeakingStatus(t('speakingStatusInit'));
        document.getElementById('btnStartSpeaking').disabled = true;
        document.getElementById('btnStopSpeaking').disabled = false;
        await startSpeakingSession({ topic, score: state.targetScore, level: state.speakingState.level }, {
            onStatus: (s) => setSpeakingStatus(s),
            onLog: (role, text) => appendSpeakingLog(role, text),
            onConnected: (connected) => {
                document.getElementById('btnStopSpeaking').disabled = !connected;
            }
        });
    } catch (error) {
        console.error(error);
        setSpeakingStatus(t('speakingStartFailed', { message: error.message }));
        if (activeSpeakingRecord) {
            await finalizeSpeakingRecord(t('speakingInitFailed'));
            activeSpeakingRecord = null;
        }
        document.getElementById('btnStartSpeaking').disabled = false;
        document.getElementById('btnStopSpeaking').disabled = true;
        showSpeakingConfigView();
    }
};

document.getElementById('btnStopSpeaking').onclick = async () => {
    await stopSpeakingSession();
    await finalizeSpeakingRecord(t('speakingStatusStopped'));
    activeSpeakingRecord = null;
    document.getElementById('btnStartSpeaking').disabled = false;
    document.getElementById('btnStopSpeaking').disabled = true;
    setSpeakingStatus(t('speakingStatusStopped'));
};
document.getElementById('btnStopSpeaking').disabled = true;
document.getElementById('btnSpeakingBack').onclick = async () => {
    await stopSpeakingSession();
    await finalizeSpeakingRecord(t('speakingBackToConfig'));
    activeSpeakingRecord = null;
    document.getElementById('btnStartSpeaking').disabled = false;
    document.getElementById('btnStopSpeaking').disabled = true;
    showSpeakingConfigView();
};

/* ── Exam mode ── */
const EXAM_BTN = document.getElementById('btnStartExam');
const EXAM_SHELL = document.getElementById('examShell');
const EXAM_META = document.getElementById('examMeta');
const EXAM_CONTENT = document.getElementById('examContent');
const EXAM_ACTIONS = document.getElementById('examActions');
const EXAM_CONFIG_VIEW = document.getElementById('examConfigView');

function resetExamPracticeView() {
    EXAM_CONFIG_VIEW.classList.remove('hidden');
}

function showExamConfigView() {
    resetExamPracticeView();
    setLearnRuntimeMode('article');
    switchTab('practice');
}

function showExamSessionView() {
    EXAM_CONFIG_VIEW.classList.add('hidden');
    setLearnRuntimeMode('exam');
    switchTab('learn');
}

function renderExamActions(stage = 'answering') {
    EXAM_ACTIONS.innerHTML = '';
    if (stage === 'answering') {
        const submitBtn = document.createElement('button');
        submitBtn.className = 'generate-btn';
        submitBtn.textContent = t('examSubmit');
        submitBtn.onclick = handleSubmitExam;
        EXAM_ACTIONS.appendChild(submitBtn);
        return;
    }
    if (stage === 'graded') {
        const alreadyHasExplanation = state.examState.explanationRecordSaved
            || (Array.isArray(state.examState.explanations) && state.examState.explanations.length > 0);
        const explainBtn = document.createElement('button');
        explainBtn.className = 'generate-btn';
        explainBtn.textContent = alreadyHasExplanation ? t('examExplainDone') : t('examExplainGenerate');
        explainBtn.dataset.action = 'explain';
        explainBtn.onclick = handleExplainWrongAnswers;
        if (!state.examState.result?.wrongCount || alreadyHasExplanation) explainBtn.disabled = true;
        EXAM_ACTIONS.appendChild(explainBtn);
    }
}

function createExamAttemptId() {
    return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildExamSummary(result) {
    return {
        total: result.total,
        correct: result.correct,
        wrongCount: result.wrongCount,
        bySection: result.bySection
    };
}

function buildExamSnapshot(result) {
    return createExamSnapshot(result);
}

function formatChoiceLabel(choice, fallback = '') {
    if (!choice?.key && !choice?.text) return fallback;
    if (!choice?.text || choice.text === choice.key) return choice.key || fallback;
    if (!choice?.key) return choice.text || fallback;
    return `${choice.key}. ${choice.text}`;
}

function resolveResultChoiceLabel(item, type) {
    const question = state.examState.questions.find((q) => q.id === item.id);
    const isSelected = type === 'selected';
    const value = isSelected
        ? (item.selectedKey || item.selected || '')
        : (item.answerKey || item.answer || '');
    const fallback = isSelected
        ? (item.selectedText ? formatChoiceLabel({ key: item.selectedKey, text: item.selectedText }, item.selected) : (item.selected || ''))
        : (item.answerText ? formatChoiceLabel({ key: item.answerKey, text: item.answerText }, item.answer) : (item.answer || ''));
    const resolved = question ? resolveChoice(question, value) : null;
    return formatChoiceLabel(resolved, fallback);
}

function renderExamResult() {
    const result = state.examState.result;
    if (!result) return;
    const by = result.bySection;
    const resultHtml = `
        <div class="exam-result">
            <div><strong>${t('examTotalScoreLabel')}:</strong> ${result.correct} / ${result.total}</div>
            <div>${t('examSectionSummary', { lCorrect: by.listening.correct, lTotal: by.listening.total, rCorrect: by.reading.correct, rTotal: by.reading.total, vCorrect: by.vocabulary.correct, vTotal: by.vocabulary.total, gCorrect: by.grammar.correct, gTotal: by.grammar.total })}</div>
            <div>${t('examWrongCountLabel', { count: result.wrongCount })}</div>
        </div>
    `;
    const wrongHtml = result.wrongItems.map((item) => {
        const explanation = state.examState.explanations?.find(x => x.id === item.id);
        const hasCachedAudio = !!state.examState.listeningAudioByQuestion?.[item.id];
        const reviewAudioBtn = hasCachedAudio
            ? `<button class="mini-speaker exam-review-audio-btn" data-action="review-listen" data-id="${item.id}" title="${t('examReviewAudioTitle')}">${ICONS.speaker}</button>`
            : '';
        return `
            <div class="exam-wrong-item">
                <div><strong>${item.section}</strong> - ${item.question}${reviewAudioBtn}</div>
                <div>${t('examYourAnswer')}: ${resolveResultChoiceLabel(item, 'selected') || t('examNoAnswer')}</div>
                <div>${t('examCorrectAnswer')}: ${resolveResultChoiceLabel(item, 'answer') || t('examNoAnswer')}</div>
                ${explanation ? `<div>${t('examWhyWrong')}: ${explanation.whyWrong}</div><div>${t('examKeyPoint')}: ${explanation.keyPoint}</div><div>${t('examTrap')}: ${explanation.trap}</div>` : ''}
            </div>
        `;
    }).join('');
    EXAM_CONTENT.innerHTML = `${resultHtml}<div class="exam-wrong-list">${wrongHtml || `<div class="exam-wrong-item">${t('examAllCorrect')}</div>`}</div>`;
}

async function handleSubmitExam() {
    const result = gradeExam(state.examState.questions, state.examState.answers);
    state.examState.result = result;
    state.examState.explanationRecordSaved = false;
    await persistExamRecord('exam_submitted', { includeSummary: true, explanationsOverride: state.examState.explanations || null });
    renderExamResult();
    renderExamActions('graded');
}

async function handleExplainWrongAnswers() {
    const result = state.examState.result;
    if (!result || !result.wrongCount) return;
    const alreadyHasExplanation = state.examState.explanationRecordSaved
        || (Array.isArray(state.examState.explanations) && state.examState.explanations.length > 0);
    if (alreadyHasExplanation) {
        renderExamActions('graded');
        return;
    }
    const explainBtn = document.querySelector('#examActions [data-action="explain"]');
    const finishLoading = setButtonLoading(explainBtn, t('loadingGenerating'), 'loader');
    try {
        const payload = buildWrongPayload(state.targetScore, result.wrongItems);
        state.examState.explanations = await fetchExamWrongAnswerExplanations(payload);
        await persistExamRecord('explanations_generated', { includeSummary: true, explanationsOverride: state.examState.explanations });
        state.examState.explanationRecordSaved = true;
        renderExamResult();
        renderExamActions('graded');
    } catch (error) {
        alert(t('alertExplainFailed', { message: error.message }));
    } finally {
        finishLoading();
    }
}

EXAM_BTN.onclick = async () => {
    if (!state.apiKey) return alert(t('alertSetApiKeyFirst'));
    const finishLoading = setButtonLoading(EXAM_BTN, t('loadingGeneratingQuestions'));
    try {
        const examData = await fetchExamQuestions(state.targetScore);
        const questions = flattenExamQuestions(examData);
        const attemptId = createExamAttemptId();
        const recordId = createRecordId('exam');
        const createdAt = Date.now();
        const voiceName = state.lastUsedVoice || 'Kore';
        state.examState.questions = questions;
        state.examState.answers = {};
        state.examState.result = null;
        state.examState.explanations = null;
        state.examState.attemptId = attemptId;
        state.examState.recordId = recordId;
        state.examState.recordCreatedAt = createdAt;
        state.examState.voiceName = voiceName;
        state.examState.listeningAudioByQuestion = {};
        state.examState.explanationRecordSaved = false;
        await persistExamRecord('exam_generated', { includeSummary: false, explanationsOverride: null });
        EXAM_META.textContent = t('examMeta', { score: state.targetScore, count: questions.length });
        renderExamQuestions(EXAM_CONTENT, questions, state.examState.answers);
        renderExamActions('answering');
        showExamSessionView();
    } catch (error) {
        console.error(error);
        alert(t('alertGenerateFailed', { message: error.message }));
    } finally {
        finishLoading();
    }
};

EXAM_CONTENT.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'review-listen') {
        const qForReview = state.examState.questions.find(item => item.id === id);
        const cachedAudio = state.examState.listeningAudioByQuestion[id] || '';
        if (!qForReview || !cachedAudio) return;
        const finishLoading = setButtonLoading(btn, t('loadingPlaying'), 'loader loader-sm');
        try {
            await playListeningQuestion(qForReview, state.examState.voiceName || 'Kore', cachedAudio);
        } catch (error) {
            console.error(error);
            alert(t('alertPlaybackFailed', { message: error.message }));
        } finally {
            finishLoading();
        }
        return;
    }
    const q = state.examState.questions.find(item => item.id === id);
    if (!q || state.examState.result) return;
    if (action === 'answer') {
        state.examState.answers[id] = btn.dataset.optionKey || btn.dataset.option || '';
        persistExamRecord('exam_generated', { includeSummary: false, explanationsOverride: state.examState.explanations || null }).catch((e) => console.error('Persist exam answer failed:', e));
        renderExamQuestions(EXAM_CONTENT, state.examState.questions, state.examState.answers);
        return;
    }
    if (action === 'listen') {
        const finishLoading = setButtonLoading(btn, t('loadingGeneratingAudio'), 'loader loader-sm');
        try {
            const cachedAudio = state.examState.listeningAudioByQuestion[id] || '';
            const result = await playListeningQuestion(q, state.examState.voiceName || 'Kore', cachedAudio);
            if (result?.base64 && !cachedAudio) {
                state.examState.listeningAudioByQuestion[id] = result.base64;
                persistExamRecord(state.examState.result ? 'exam_submitted' : 'exam_generated', {
                    includeSummary: !!state.examState.result,
                    explanationsOverride: state.examState.explanations || null
                }).catch((e) => console.error('Persist exam audio failed:', e));
            }
            if (result?.fallbackUsed) {
                EXAM_META.textContent = t('examFallbackTtsBusy');
            }
        } catch (error) {
            console.error(error);
            alert(t('alertPlaybackFailed', { message: error.message }));
        } finally {
            finishLoading();
        }
    }
};
document.getElementById('btnExamBack').onclick = () => showExamConfigView();

/* ── Generate button ── */
const GENERATE_BTN = document.getElementById('btnGenerate');

GENERATE_BTN.onclick = async () => {
    if (!state.apiKey) return alert(t('alertSetApiKeyFirst'));
    const finishLoading = setButtonLoading(GENERATE_BTN, t('loadingGenerating'));
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
        setLearnRuntimeMode('article');
        const audioBase64 = await fetchGeminiTTS(contentData.article, voiceName);
        setupAudio(audioBase64);
        const articleRecord = await saveToHistory(contentData, audioBase64, voiceName, customTopic);
        markLearnRecord(articleRecord?.id ? { id: articleRecord.id, type: 'article', fromHistory: false } : null);
        switchTab('learn');
    } catch (error) {
        console.error(error);
        alert(t('alertGenerateFailed', { message: error.message }));
    } finally {
        finishLoading();
    }
};

/* ── App Init ── */
(async function initApp() {
    initAppVersionDisplay();

    try {
        await DB.init();
        const savedLocale = await DB.getSetting('app_locale');
        const initialLocale = savedLocale || detectBrowserLocale();
        setLocale(initialLocale);
        if (!savedLocale) {
            await persistLocaleSelection(initialLocale);
        }
        populateLocaleSelector();
        applyLocaleToUI();
        let apiKey = await DB.getSetting('gemini_api_key');
        if (!apiKey) {
            const lk = localStorage.getItem('gemini_api_key');
            if (lk) { apiKey = lk; await DB.setSetting('gemini_api_key', lk); localStorage.removeItem('gemini_api_key'); }
        }
        if (apiKey) state.apiKey = apiKey; else keyModal.classList.add('active');
        renderHistory();
        await loadLastSession();
        setPracticeMode('article');
        setLearnRuntimeMode('article');
        showSpeakingConfigView();
        showExamConfigView();

        DriveSync.init();
        const cloudEnabled = await DB.getSetting('cloud_sync_enabled');
        if (cloudEnabled) {
            await DriveSync.silentLogin();
            DriveSync.updateUI();
        }
        initPostLocalePrompts();
    } catch (e) { console.error("Init failed:", e); keyModal.classList.add('active'); }
})();
