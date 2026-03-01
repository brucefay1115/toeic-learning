// Exam model helpers: normalize, render, grade, and explanation merge.

import { fetchGeminiTTS } from './apiGemini.js';
import { t } from './i18n.js';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const SECTION_LABEL_KEYS = {
    listening: 'examSectionListening',
    reading: 'examSectionReading',
    vocabulary: 'examSectionVocabulary',
    grammar: 'examSectionGrammar'
};

function getSectionLabel(section) {
    const key = SECTION_LABEL_KEYS[section];
    return key ? t(key) : section;
}

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeKey(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    if (OPTION_KEYS.includes(raw)) return raw;
    const matched = raw.match(/^([A-D])(?:[\s.)\-:].*)?$/);
    return matched ? matched[1] : '';
}

function parseLegacyOptionString(value) {
    const raw = String(value || '').trim();
    const matched = raw.match(/^([A-D])[\s.)\-:]+(.+)$/i);
    if (!matched) return null;
    return {
        key: matched[1].toUpperCase(),
        text: matched[2].trim()
    };
}

function normalizeOption(option, index) {
    const defaultKey = OPTION_KEYS[index] || `O${index + 1}`;
    if (typeof option === 'object' && option !== null) {
        const key = normalizeKey(option.key) || defaultKey;
        const text = String(option.text || option.label || option.value || key).trim() || key;
        return { key, text };
    }
    const raw = String(option || '').trim();
    const legacy = parseLegacyOptionString(raw);
    if (legacy) return legacy;
    const key = normalizeKey(raw) || defaultKey;
    const text = raw || key;
    return { key, text };
}

export function getQuestionOptions(question) {
    const source = Array.isArray(question?.options) ? question.options.slice(0, 4) : [];
    return source.map((opt, idx) => normalizeOption(opt, idx));
}

function resolveAnswerKey(question, options) {
    const direct = normalizeKey(question?.answerKey);
    if (direct && options.some((opt) => opt.key === direct)) return direct;
    const legacy = normalizeKey(question?.answer);
    if (legacy && options.some((opt) => opt.key === legacy)) return legacy;
    const answerText = String(question?.answer || '').trim();
    const byText = options.find((opt) => opt.text === answerText);
    if (byText) return byText.key;
    return options[0]?.key || '';
}

function getChoiceLabel(choice) {
    if (!choice) return '';
    if (!choice.text || choice.text === choice.key) return choice.key;
    return `${choice.key}. ${choice.text}`;
}

export function resolveChoice(question, rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return null;
    const options = getQuestionOptions(question);
    const key = normalizeKey(raw);
    if (key) {
        const byKey = options.find((opt) => opt.key === key);
        if (byKey) return byKey;
    }
    const byText = options.find((opt) => opt.text === raw);
    if (byText) return byText;
    const byLabel = options.find((opt) => getChoiceLabel(opt) === raw);
    if (byLabel) return byLabel;
    return { key, text: raw };
}

export function flattenExamQuestions(examData) {
    const list = [];
    ['listening', 'reading', 'vocabulary', 'grammar'].forEach((section) => {
        const rows = Array.isArray(examData?.[section]) ? examData[section] : [];
        const max = 3;
        rows.slice(0, max).forEach((q, index) => {
            const options = getQuestionOptions(q);
            const answerKey = resolveAnswerKey(q, options);
            const answerChoice = options.find((opt) => opt.key === answerKey) || null;
            list.push({
                id: q.id || `${section}-${index + 1}-${uid()}`,
                section,
                sectionLabel: getSectionLabel(section),
                question: q.question || '',
                passage: q.passage || '',
                audioText: q.audioText || '',
                options,
                answerKey,
                answerText: answerChoice?.text || '',
                answer: q.answer || q.answerKey || answerKey,
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
        const selectedChoice = resolveChoice(q, answers[q.id]);
        const selectedKey = selectedChoice?.key || '';
        const options = getQuestionOptions(q);
        let passage = '';
        if (q.section === 'reading' && q.passage && q.passage !== lastReadingPassage) {
            passage = `<div class="exam-passage">${escapeHtml(q.passage)}</div>`;
            lastReadingPassage = q.passage;
        }
        const listenBtn = q.section === 'listening'
            ? `<button class="exam-option exam-listen-btn" data-action="listen" data-id="${escapeHtml(q.id)}">${escapeHtml(t('examPlayListeningAudioBtn'))}</button>`
            : '';
        const optionsHtml = options.map((opt) => {
            const active = selectedKey && selectedKey === opt.key ? 'active' : '';
            const label = getChoiceLabel(opt);
            return `<button class="exam-option ${active}" data-action="answer" data-id="${escapeHtml(q.id)}" data-option-key="${escapeHtml(opt.key)}">${escapeHtml(label)}</button>`;
        }).join('');
        const card = document.createElement('div');
        card.className = 'exam-question';
        card.innerHTML = `
            ${sectionBadge}
            <div class="exam-question-title">Q${index + 1}. ${escapeHtml(q.question)}</div>
            ${passage}
            ${listenBtn}
            <div class="exam-options">${optionsHtml}</div>
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
        const options = getQuestionOptions(q);
        const answerKey = resolveAnswerKey(q, options);
        const answerChoice = options.find((opt) => opt.key === answerKey) || null;
        const selectedChoice = resolveChoice(q, answers[q.id]);
        const selectedKey = selectedChoice?.key || '';
        const selectedText = selectedChoice?.text || '';
        const isCorrect = !!selectedKey && selectedKey === answerKey;
        const sectionBucket = bySection[q.section];
        if (!sectionBucket) return;
        sectionBucket.total += 1;
        if (isCorrect) {
            sectionBucket.correct += 1;
            correct += 1;
        } else {
            wrongItems.push({
                id: q.id,
                section: q.section,
                question: q.question,
                selected: selectedKey || String(answers[q.id] || ''),
                selectedKey,
                selectedText,
                answer: answerKey || q.answer || '',
                answerKey,
                answerText: answerChoice?.text || '',
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
            selected: item.selectedText ? `${item.selectedKey}. ${item.selectedText}` : (item.selected || ''),
            selectedKey: item.selectedKey || '',
            selectedText: item.selectedText || '',
            answer: item.answerText ? `${item.answerKey}. ${item.answerText}` : (item.answer || ''),
            answerKey: item.answerKey || item.answer || '',
            answerText: item.answerText || '',
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

export async function playListeningQuestion(q, voiceName = 'Kore', prefetchedBase64 = '') {
    const key = `${q.id}:${voiceName}`;
    let base64 = prefetchedBase64 || listeningAudioCache.get(key);
    if (base64) listeningAudioCache.set(key, base64);
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
            return { fallbackUsed: true, message: lastError?.message || '', base64: '' };
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
    return { fallbackUsed: false, base64 };
}
