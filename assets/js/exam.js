// Exam model helpers: normalize, render, grade, and explanation merge.

import { fetchGeminiTTS } from './apiGemini.js';
import { t } from './i18n.js';
import { createId } from './id.js';
import { pcmToWavBlob } from './audioCodec.js';
import { getChoiceLabel, getQuestionOptions, resolveAnswerKey, resolveChoice } from './examNormalize.js';

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

export { getQuestionOptions, resolveChoice };

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
                id: q.id || `${section}-${index + 1}-${createId()}`,
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
    const blob = pcmToWavBlob(pcm, 24000);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    return { fallbackUsed: false, base64 };
}
