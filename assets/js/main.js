// App entry point: initialisation, tab switching, event binding, module wiring.

import { state, VOICE_OPTIONS, VOICE_NAMES } from './state.js';
import { speakText } from './utils.js';
import { DB } from './db.js';
import { fetchGeminiText, fetchGeminiTTS, fetchExamQuestions, fetchExamWrongAnswerExplanations } from './apiGemini.js';
import { DriveSync } from './driveSync.js';
import { setupAudio } from './audioPlayer.js';
import { renderContent, toggleEnglish, toggleTranslation } from './render.js';
import { closeModal, renderVocabTab, setSrsTrigger } from './vocab.js';
import { startSrsReview, closeSrsReview, finishSrsReview, setOnFinish } from './srs.js';
import { saveToHistory, savePracticeRecord, renderHistory, loadLastSession, clearHistory, setDeps as setHistoryDeps } from './history.js';
import { initUpdater } from './updater.js';
import { initInstallPrompt } from './installPrompt.js';
import { startSpeakingSession, stopSpeakingSession } from './speakingLive.js';
import { flattenExamQuestions, renderExamQuestions, gradeExam, buildWrongPayload, playListeningQuestion } from './exam.js';

/* ── Wire cross-module callbacks ── */
setSrsTrigger(startSrsReview);
setOnFinish(renderVocabTab);
setHistoryDeps({ switchTab });
DriveSync.setCallbacks({ renderHistory, loadLastSession, renderVocabTab });

/* ── Expose minimal globals needed by dynamic innerHTML onclick ── */
window.speakText = speakText;
window.finishSrsReview = finishSrsReview;
window.DriveSync = DriveSync;

const emptyStateEl = document.getElementById('emptyState');
const learningAreaEl = document.getElementById('learningArea');
const speakingSessionViewEl = document.getElementById('speakingSessionView');
const examShellEl = document.getElementById('examShell');

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
}

/* ── Tab switching ── */
function switchTab(tabName) {
    ['tabLearn', 'tabPractice', 'tabVocab', 'tabHistory', 'tabAbout'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    if (tabName === 'history') renderHistory();
    if (tabName === 'vocab') renderVocabTab();
    const pb = document.getElementById('playerBar');
    if (tabName === 'learn' && state.audioBlobUrl && !learningAreaEl.classList.contains('hidden')) pb.classList.remove('hidden'); else pb.classList.add('hidden');
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
}

document.querySelectorAll('.practice-mode-btn').forEach(btn => {
    btn.onclick = () => setPracticeMode(btn.dataset.mode);
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
        };
        el.appendChild(chip);
    });
}
renderScoreChips('scoreSelector');
renderScoreChips('examScoreSelector');

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

/* ── Speaking mode UI ── */
function showSpeakingConfigView() {
    document.getElementById('speakingConfigView').classList.remove('hidden');
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
}

function setSpeakingStatus(text) {
    document.getElementById('speakingStatus').textContent = text;
}

document.querySelectorAll('#speakingPresetGroup .topic-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('#speakingPresetGroup .topic-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.speakingState.selectedTopic = chip.dataset.topic;
    };
});

document.getElementById('btnStartSpeaking').onclick = async () => {
    try {
        const custom = document.getElementById('speakingCustomTopic').value.trim();
        state.speakingState.customTopic = custom;
        const topic = custom || state.speakingState.selectedTopic;
        if (!topic) return alert('請先輸入或選擇主題');
        document.getElementById('speakingLog').innerHTML = '';
        showSpeakingSessionView();
        setSpeakingStatus('正在初始化對話...');
        document.getElementById('btnStartSpeaking').disabled = true;
        document.getElementById('btnStopSpeaking').disabled = false;
        await startSpeakingSession(topic, {
            onStatus: (s) => setSpeakingStatus(s),
            onLog: (role, text) => appendSpeakingLog(role, text),
            onConnected: (connected) => {
                document.getElementById('btnStopSpeaking').disabled = !connected;
            }
        });
    } catch (error) {
        console.error(error);
        setSpeakingStatus('啟動失敗: ' + error.message);
        document.getElementById('btnStartSpeaking').disabled = false;
        document.getElementById('btnStopSpeaking').disabled = true;
        showSpeakingConfigView();
    }
};

document.getElementById('btnStopSpeaking').onclick = async () => {
    await stopSpeakingSession();
    document.getElementById('btnStartSpeaking').disabled = false;
    document.getElementById('btnStopSpeaking').disabled = true;
    setSpeakingStatus('口說已停止');
};
document.getElementById('btnStopSpeaking').disabled = true;
document.getElementById('btnSpeakingBack').onclick = async () => {
    await stopSpeakingSession();
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

function showExamConfigView() {
    EXAM_CONFIG_VIEW.classList.remove('hidden');
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
        submitBtn.textContent = '交卷';
        submitBtn.onclick = handleSubmitExam;
        EXAM_ACTIONS.appendChild(submitBtn);
        return;
    }
    if (stage === 'graded') {
        const explainBtn = document.createElement('button');
        explainBtn.className = 'generate-btn';
        explainBtn.textContent = '生成錯題解說';
        explainBtn.dataset.action = 'explain';
        explainBtn.onclick = handleExplainWrongAnswers;
        if (!state.examState.result?.wrongCount) explainBtn.disabled = true;
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
    return {
        questions: state.examState.questions,
        answers: state.examState.answers,
        result
    };
}

function renderExamResult() {
    const result = state.examState.result;
    if (!result) return;
    const by = result.bySection;
    const resultHtml = `
        <div class="exam-result">
            <div><strong>總分：</strong>${result.correct} / ${result.total}</div>
            <div>聽力 ${by.listening.correct}/${by.listening.total} ・ 閱讀 ${by.reading.correct}/${by.reading.total} ・ 單字 ${by.vocabulary.correct}/${by.vocabulary.total} ・ 文法 ${by.grammar.correct}/${by.grammar.total}</div>
            <div>錯題數：${result.wrongCount}</div>
        </div>
    `;
    const wrongHtml = result.wrongItems.map((item) => {
        const explanation = state.examState.explanations?.find(x => x.id === item.id);
        return `
            <div class="exam-wrong-item">
                <div><strong>${item.section}</strong> - ${item.question}</div>
                <div>你的答案：${item.selected || '未作答'} / 正確答案：${item.answer}</div>
                ${explanation ? `<div>為何錯：${explanation.whyWrong}</div><div>關鍵：${explanation.keyPoint}</div><div>陷阱：${explanation.trap}</div>` : ''}
            </div>
        `;
    }).join('');
    EXAM_CONTENT.innerHTML = `${resultHtml}<div class="exam-wrong-list">${wrongHtml || '<div class="exam-wrong-item">本次全對，太強了！</div>'}</div>`;
}

async function handleSubmitExam() {
    const result = gradeExam(state.examState.questions, state.examState.answers);
    const attemptId = state.examState.attemptId || createExamAttemptId();
    const examSummary = buildExamSummary(result);
    state.examState.result = result;
    state.examState.attemptId = attemptId;
    state.examState.explanationRecordSaved = false;
    renderExamResult();
    renderExamActions('graded');
    await savePracticeRecord({
        type: 'exam',
        recordStage: 'exam_submitted',
        attemptId,
        title: `模擬考試（TOEIC ${state.targetScore}）- 交卷紀錄`,
        score: state.targetScore,
        examSummary,
        examSnapshot: buildExamSnapshot(result),
        explanations: null
    });
}

async function handleExplainWrongAnswers() {
    const result = state.examState.result;
    if (!result || !result.wrongCount) return;
    const explainBtn = document.querySelector('#examActions [data-action="explain"]');
    const finishLoading = setButtonLoading(explainBtn, '生成中...', 'loader');
    try {
        const payload = buildWrongPayload(state.targetScore, result.wrongItems);
        state.examState.explanations = await fetchExamWrongAnswerExplanations(payload);
        if (!state.examState.explanationRecordSaved) {
            const attemptId = state.examState.attemptId || createExamAttemptId();
            state.examState.attemptId = attemptId;
            await savePracticeRecord({
                type: 'exam',
                recordStage: 'explanations_generated',
                attemptId,
                title: `模擬考試（TOEIC ${state.targetScore}）- 解說紀錄`,
                score: state.targetScore,
                examSummary: buildExamSummary(result),
                examSnapshot: buildExamSnapshot(result),
                explanations: state.examState.explanations
            });
            state.examState.explanationRecordSaved = true;
        }
        renderExamResult();
    } catch (error) {
        alert('生成錯題解說失敗: ' + error.message);
    } finally {
        finishLoading();
    }
}

EXAM_BTN.onclick = async () => {
    if (!state.apiKey) return alert('請先設定 API Key');
    const finishLoading = setButtonLoading(EXAM_BTN, '生成題目中...');
    try {
        const examData = await fetchExamQuestions(state.targetScore);
        const questions = flattenExamQuestions(examData);
        state.examState.questions = questions;
        state.examState.answers = {};
        state.examState.result = null;
        state.examState.explanations = null;
        state.examState.attemptId = null;
        state.examState.explanationRecordSaved = false;
        EXAM_META.textContent = `目標分數 TOEIC ${state.targetScore} ・ 共 ${questions.length} 題`;
        renderExamQuestions(EXAM_CONTENT, questions, state.examState.answers);
        renderExamActions('answering');
        showExamSessionView();
    } catch (error) {
        console.error(error);
        alert('生成考題失敗: ' + error.message);
    } finally {
        finishLoading();
    }
};

EXAM_CONTENT.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const q = state.examState.questions.find(item => item.id === id);
    if (!q || state.examState.result) return;
    if (action === 'answer') {
        state.examState.answers[id] = btn.dataset.option;
        renderExamQuestions(EXAM_CONTENT, state.examState.questions, state.examState.answers);
        return;
    }
    if (action === 'listen') {
        const finishLoading = setButtonLoading(btn, '生成音訊中...', 'loader loader-sm');
        try {
            const result = await playListeningQuestion(q, state.lastUsedVoice || 'Kore');
            if (result?.fallbackUsed) {
                EXAM_META.textContent = 'Gemini 聽力語音暫時忙碌，已改用本機語音播放。';
            }
        } catch (error) {
            console.error(error);
            alert('播放聽力題失敗: ' + error.message);
        } finally {
            finishLoading();
        }
    }
};
document.getElementById('btnExamBack').onclick = () => showExamConfigView();

/* ── Generate button ── */
const GENERATE_BTN = document.getElementById('btnGenerate');

GENERATE_BTN.onclick = async () => {
    if (!state.apiKey) return alert('請先設定 API Key');
    const finishLoading = setButtonLoading(GENERATE_BTN, '生成中...');
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
        await saveToHistory(contentData, audioBase64, voiceName, customTopic);
        switchTab('learn');
    } catch (error) {
        console.error(error);
        alert('發生錯誤: ' + error.message);
    } finally {
        finishLoading();
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
        initUpdater();
        initInstallPrompt();
    } catch (e) { console.error("Init failed:", e); keyModal.classList.add('active'); }
})();
