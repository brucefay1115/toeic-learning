// Exam model helpers: normalize, render, grade, and explanation merge.

import { fetchGeminiTTS } from './apiGemini.js';

const SECTION_LABELS = {
    listening: '聽力',
    reading: '閱讀',
    vocabulary: '單字',
    grammar: '文法'
};

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function flattenExamQuestions(examData) {
    const list = [];
    ['listening', 'reading', 'vocabulary', 'grammar'].forEach((section) => {
        const rows = Array.isArray(examData?.[section]) ? examData[section] : [];
        const max = 3;
        rows.slice(0, max).forEach((q, index) => {
            list.push({
                id: q.id || `${section}-${index + 1}-${uid()}`,
                section,
                sectionLabel: SECTION_LABELS[section],
                question: q.question || '',
                passage: q.passage || '',
                audioText: q.audioText || '',
                options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
                answer: q.answer || '',
                explanationSeed: q.explanationSeed || ''
            });
        });
    });
    return list;
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderExamQuestions(container, questions, answers) {
    container.innerHTML = '';
    let lastReadingPassage = '';
    questions.forEach((q, index) => {
        const sectionBadge = `<div class="exam-question-type">${escapeHtml(q.sectionLabel)}</div>`;
        let passage = '';
        if (q.section === 'reading' && q.passage && q.passage !== lastReadingPassage) {
            passage = `<div class="exam-passage">${escapeHtml(q.passage)}</div>`;
            lastReadingPassage = q.passage;
        }
        const listenBtn = q.section === 'listening'
            ? `<button class="exam-option exam-listen-btn" data-action="listen" data-id="${escapeHtml(q.id)}">播放聽力題音訊</button>`
            : '';
        const options = q.options.map((opt) => {
            const active = answers[q.id] === opt ? 'active' : '';
            return `<button class="exam-option ${active}" data-action="answer" data-id="${escapeHtml(q.id)}" data-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
        }).join('');
        const card = document.createElement('div');
        card.className = 'exam-question';
        card.innerHTML = `
            ${sectionBadge}
            <div class="exam-question-title">Q${index + 1}. ${escapeHtml(q.question)}</div>
            ${passage}
            ${listenBtn}
            <div class="exam-options">${options}</div>
        `;
        container.appendChild(card);
    });
}

export function gradeExam(questions, answers) {
    const bySection = {
        listening: { total: 0, correct: 0 },
        reading: { total: 0, correct: 0 },
        vocabulary: { total: 0, correct: 0 },
        grammar: { total: 0, correct: 0 }
    };
    const wrongItems = [];
    let correct = 0;
    questions.forEach((q) => {
        const selected = answers[q.id];
        const isCorrect = selected === q.answer;
        bySection[q.section].total += 1;
        if (isCorrect) {
            bySection[q.section].correct += 1;
            correct += 1;
        } else {
            wrongItems.push({
                id: q.id,
                section: q.section,
                question: q.question,
                selected: selected || '',
                answer: q.answer,
                explanationSeed: q.explanationSeed || ''
            });
        }
    });
    return {
        total: questions.length,
        correct,
        wrongCount: wrongItems.length,
        bySection,
        wrongItems
    };
}

export function buildWrongPayload(score, wrongItems) {
    return {
        targetScore: score,
        wrongItems: wrongItems.map(item => ({
            id: item.id,
            section: item.section,
            question: item.question,
            selected: item.selected,
            answer: item.answer,
            hint: item.explanationSeed
        }))
    };
}

const listeningAudioCache = new Map();

function speakByBrowserFallback(text) {
    return new Promise((resolve) => {
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'en-US';
            u.rate = 0.9;
            u.onend = resolve;
            u.onerror = resolve;
            window.speechSynthesis.speak(u);
        } catch {
            resolve();
        }
    });
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function pcmToWav(pcmBytes, sampleRate) {
    const buffer = new ArrayBuffer(44 + pcmBytes.length);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmBytes.length, true);
    new Uint8Array(buffer, 44).set(pcmBytes);
    return new Blob([buffer], { type: 'audio/wav' });
}

export async function playListeningQuestion(q, voiceName = 'Kore') {
    const key = `${q.id}:${voiceName}`;
    let base64 = listeningAudioCache.get(key);
    if (!base64) {
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                base64 = await fetchGeminiTTS(q.audioText || q.question, voiceName);
                listeningAudioCache.set(key, base64);
                break;
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        }
        if (!base64) {
            await speakByBrowserFallback(q.audioText || q.question);
            return { fallbackUsed: true, message: lastError?.message || '' };
        }
    }
    const bytes = atob(base64);
    const len = bytes.length;
    const pcm = new Uint8Array(len);
    for (let i = 0; i < len; i++) pcm[i] = bytes.charCodeAt(i);
    const blob = pcmToWav(pcm, 24000);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    return { fallbackUsed: false };
}
