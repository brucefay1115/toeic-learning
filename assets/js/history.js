// History: save/load/delete learning sessions, render history list.

import { state, ICONS, VOICE_NAMES } from './state.js';
import { DB } from './db.js';
import { fetchGeminiTTS } from './apiGemini.js';
import { renderContent } from './render.js';
import { setupAudio, setPlayerLoading } from './audioPlayer.js';

let _deps = { switchTab: null };

export function setDeps(deps) { _deps = { ..._deps, ...deps }; }

function createHistoryRecordId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveToHistory(data, audioBase64, voiceName, topic) {
    const entry = {
        id: Date.now(),
        type: 'article',
        date: new Date().toLocaleDateString(),
        title: (data.segments ? data.segments[0].en : data.article).substring(0, 30) + '...',
        score: state.targetScore,
        voice: voiceName || null,
        topic: topic || null,
        data,
        audio: audioBase64
    };
    try { await DB.addHistory(entry); renderHistory(); }
    catch (e) { console.error("Save failed:", e); alert("儲存失敗"); }
}

export async function savePracticeRecord(entry) {
    const record = {
        id: createHistoryRecordId(),
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
            list.innerHTML = '<p style="text-align:center; color:var(--text-sub); padding: 30px 0;">尚無學習紀錄</p>';
            return;
        }
        history.forEach(item => {
            const div = document.createElement('div'); div.className = 'history-item';
            const scoreBadge = item.score ? `<span class="history-score-badge">TOEIC ${item.score}</span>` : '';
            const voiceBadge = item.voice ? `<span class="history-voice-badge">${item.voice}</span>` : '';
            const audioIcon = item.audio ? `<span style="font-size:12px;display:inline-flex;align-items:center;">${ICONS.speaker}</span>` : '';
            const typeBadge = item.type && item.type !== 'article'
                ? `<span class="history-voice-badge">${item.type === 'speaking' ? '口說' : '考試'}</span>`
                : '';
            const stageBadge = item.recordStage
                ? `<span class="history-voice-badge">${item.recordStage === 'exam_submitted' ? '交卷頁' : '解說頁'}</span>`
                : '';
            div.innerHTML = `<div class="history-content"><div style="font-weight:600;">${item.title}</div><span class="history-date">${item.date} ${audioIcon} ${scoreBadge} ${voiceBadge} ${typeBadge} ${stageBadge}</span></div>`;
            div.onclick = (e) => {
                if (e.target.closest('.delete-btn')) return;
                if (item.type !== 'article') return;
                loadSession(item);
                if (_deps.switchTab) _deps.switchTab('learn');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.innerHTML = ICONS.close;
            delBtn.onclick = (e) => { e.stopPropagation(); deleteHistoryItem(item.id); };
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

async function deleteHistoryItem(id) { await DB.deleteHistory(id); renderHistory(); }

export async function clearHistory() {
    if (confirm('確定清除全部歷史紀錄？')) { await DB.clearHistory(); renderHistory(); }
}

export async function loadLastSession() {
    try {
        const latest = await DB.getLatestHistory();
        if (latest?.type !== 'article') return;
        if (latest) loadSession(latest);
    }
    catch (e) { console.log("No history to load."); }
}
