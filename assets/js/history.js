// History: save/load/delete learning sessions, render history list.

import { state, ICONS, VOICE_NAMES } from './state.js';
import { DB } from './db.js';
import { fetchGeminiTTS } from './apiGemini.js';
import { renderContent } from './render.js';
import { setupAudio, setPlayerLoading } from './audioPlayer.js';
import { t } from './i18n.js';

let _deps = { switchTab: null, openArticleRecord: null, openExamRecord: null, openSpeakingRecord: null, onHistoryMutated: null };

export function setDeps(deps) { _deps = { ..._deps, ...deps }; }

function createHistoryRecordId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveToHistory(data, audioBase64, voiceName, topic) {
    const entry = {
        id: Date.now(),
        createdAt: Date.now(),
        type: 'article',
        date: new Date().toLocaleDateString(),
        title: (data.segments ? data.segments[0].en : data.article).substring(0, 30) + '...',
        score: state.targetScore,
        voice: voiceName || null,
        topic: topic || null,
        data,
        audio: audioBase64
    };
    try {
        await DB.addHistory(entry);
        renderHistory();
        return entry;
    }
    catch (e) { console.error("Save failed:", e); alert(t('historySaveFailed')); }
    return null;
}

export async function savePracticeRecord(entry) {
    const record = {
        id: createHistoryRecordId(),
        createdAt: Date.now(),
        date: new Date().toLocaleDateString(),
        ...entry
    };
    await DB.addHistory(record);
    renderHistory();
}

export async function renderHistory() {
    const list = document.getElementById('historyList');
    try {
        const history = await DB.getHistory();
        list.innerHTML = '';
        if (history.length === 0) {
            list.innerHTML = `<p style="text-align:center; color:var(--text-sub); padding: 30px 0;">${t('historyEmpty')}</p>`;
            return;
        }
        history.forEach(item => {
            const div = document.createElement('div'); div.className = 'history-item';
            const typeLabel = item.type === 'speaking'
                ? t('historyTypeSpeaking')
                : item.type === 'exam'
                    ? t('historyTypeExam')
                    : t('historyTypeArticle');
            const scoreBadge = item.score ? `<span class="history-score-badge">TOEIC ${item.score}</span>` : '';
            const voiceBadge = item.voice ? `<span class="history-voice-badge">${item.voice}</span>` : '';
            const audioIcon = item.audio ? `<span style="font-size:12px;display:inline-flex;align-items:center;">${ICONS.speaker}</span>` : '';
            const typeBadge = `<span class="history-voice-badge">${typeLabel}</span>`;
            const stageBadge = item.recordStage
                ? `<span class="history-voice-badge">${item.recordStage === 'exam_generated'
                    ? t('historyStageInProgress')
                    : item.recordStage === 'exam_submitted'
                        ? t('historyStageSubmitted')
                        : item.recordStage === 'explanations_generated'
                            ? t('historyStageExplanations')
                            : item.recordStage === 'speaking_completed'
                                ? t('historyStageCompleted')
                                : t('historyStageInProgress')}</span>`
                : '';
            const displayTitle = item.type === 'exam'
                ? t('historyExamTitle')
                : item.type === 'speaking'
                    ? (item.topic || item.title || t('historySpeakingTitle'))
                    : (item.title || '');
            div.innerHTML = `<div class="history-content"><div class="history-title">${displayTitle}</div><span class="history-date">${item.date} ${audioIcon} ${scoreBadge} ${voiceBadge} ${typeBadge} ${stageBadge}</span></div>`;
            div.onclick = (e) => {
                if (e.target.closest('.delete-btn')) return;
                if (item.type === 'article') {
                    if (_deps.openArticleRecord) _deps.openArticleRecord(item);
                    else {
                        loadSession(item);
                        if (_deps.switchTab) _deps.switchTab('learn');
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
                if (item.type === 'exam' && _deps.openExamRecord) {
                    _deps.openExamRecord(item);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
                if (item.type === 'speaking' && _deps.openSpeakingRecord) {
                    _deps.openSpeakingRecord(item);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            };
            const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.innerHTML = ICONS.close;
            delBtn.onclick = (e) => { e.stopPropagation(); deleteHistoryItem(item); };
            div.appendChild(delBtn);
            list.appendChild(div);
        });
    } catch (e) { console.error("Load history failed:", e); }
}

export function loadSession(item) {
    state.currentData = item.data;
    if (item.score) {
        state.targetScore = item.score;
        document.querySelectorAll('.score-chip').forEach(c => c.classList.toggle('active', parseInt(c.innerText) === item.score));
    }
    state.lastUsedVoice = item.voice || null;
    renderContent(item.data, item.voice || null);
    setPlayerLoading(true);
    if (item.audio) {
        setTimeout(() => setupAudio(item.audio), 0);
    } else {
        const v = item.voice || VOICE_NAMES[Math.floor(Math.random() * VOICE_NAMES.length)];
        fetchGeminiTTS(item.data.article, v)
            .then(async (b) => {
                setupAudio(b);
                item.audio = b;
                await DB.addHistory(item);
            })
            .catch((e) => {
                console.error('Failed to load TTS audio:', e);
                setPlayerLoading(false);
            });
    }
}

async function deleteHistoryItem(item) {
    await DB.deleteHistory(item.id);
    if (_deps.onHistoryMutated) _deps.onHistoryMutated({ action: 'delete', item });
    renderHistory();
}

export async function clearHistory() {
    if (confirm(t('historyClearConfirm'))) {
        await DB.clearHistory();
        if (_deps.onHistoryMutated) _deps.onHistoryMutated({ action: 'clear' });
        renderHistory();
    }
}

export async function loadLastSession() {
    try {
        const history = await DB.getHistory();
        const latest = history.find(item => item.type === 'article');
        if (latest?.type !== 'article') return;
        if (latest) loadSession(latest);
    }
    catch (e) { console.log("No history to load."); }
}
