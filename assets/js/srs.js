// SRS (Spaced Repetition System) review: quiz generation, scoring, level updates.

import { ICONS, SRS_INTERVALS, SRS_MAX_WORDS, getNextReviewTime } from './state.js';
import { DB } from './db.js';
import { shuffleArray, speakText, speakTextPromise } from './utils.js';
import { t } from './i18n.js';

let _onFinish = null;
export function setOnFinish(fn) { _onFinish = fn; }

const srsState = { active: false, words: [], allWords: [], questions: [], currentQ: 0, results: {}, answered: false };

function getDistractors(correctWord, allWords, field) {
    return shuffleArray(allWords.filter(w => w.id !== correctWord.id)).slice(0, 2).map(w => w[field]);
}

export function startSrsReview(dueWords, allWords) {
    const selected = shuffleArray(dueWords).slice(0, SRS_MAX_WORDS);
    let questions = [];
    selected.forEach(w => {
        questions.push({ word: w, type: 'en2zh' });
        questions.push({ word: w, type: 'zh2en' });
        questions.push({ word: w, type: Math.random() < 0.5 ? 'listen' : 'listen3' });
    });
    questions = shuffleArray(questions);

    srsState.active = true;
    srsState.words = selected;
    srsState.allWords = allWords;
    srsState.questions = questions;
    srsState.currentQ = 0;
    srsState.answered = false;
    srsState.results = {};
    selected.forEach(w => { srsState.results[w.id] = { en2zh: null, zh2en: null, listen: null }; });
    document.getElementById('srsOverlay').classList.remove('hidden');
    renderSrsQuestion();
}

export function closeSrsReview() {
    if (srsState.active && !confirm(t('srsLeaveConfirm'))) return;
    srsState.active = false;
    document.getElementById('srsOverlay').classList.add('hidden');
}

function renderSrsQuestion() {
    const q = srsState.questions[srsState.currentQ];
    const word = q.word;
    const qArea = document.getElementById('srsQuestionArea');
    const oArea = document.getElementById('srsOptionsArea');
    document.getElementById('srsProgressText').textContent = `${srsState.currentQ + 1} / ${srsState.questions.length}`;
    const typeLabels = {
        en2zh: t('srsTypeEnToZh'),
        zh2en: t('srsTypeZhToEn'),
        listen: t('srsTypeListening'),
        listen3: t('srsTypeListening')
    };
    document.getElementById('srsPhaseBadge').textContent = typeLabels[q.type];
    srsState.answered = false;
    qArea.innerHTML = ''; oArea.innerHTML = '';

    const safeEn = word.en.replace(/'/g, "\\'");

    if (q.type === 'en2zh') {
        qArea.innerHTML = `<div class="srs-question-hint">${t('srsHintEnToZh')}</div><div class="srs-question-word">${word.en} <button class="mini-speaker" onclick="speakText('${safeEn}')">${ICONS.speaker}</button></div>`;
        setTimeout(() => speakText(word.en), 300);
        const opts = shuffleArray([word.zh, ...getDistractors(word, srsState.allWords, 'zh')]);
        opts.forEach(o => { const b = document.createElement('button'); b.className = 'srs-option'; b.textContent = o; b.onclick = () => handleSrsAnswer(b, o, word.zh, q.type); oArea.appendChild(b); });
    } else if (q.type === 'zh2en') {
        qArea.innerHTML = `<div class="srs-question-hint">${t('srsHintZhToEn')}</div><div class="srs-question-word">${word.zh}</div>`;
        const opts = shuffleArray([word.en, ...getDistractors(word, srsState.allWords, 'en')]);
        opts.forEach(o => { const b = document.createElement('button'); b.className = 'srs-option'; b.textContent = o; b.onclick = () => handleSrsAnswer(b, o, word.en, q.type); oArea.appendChild(b); });
    } else if (q.type === 'listen') {
        qArea.innerHTML = `<div class="srs-question-hint">${t('srsHintListenToZh')}</div><button class="srs-listen-btn" id="srsListenBtn">${ICONS.speaker}</button><div class="srs-reveal-word hidden" id="srsRevealWord"></div>`;
        document.getElementById('srsListenBtn').onclick = () => speakText(word.en);
        setTimeout(() => speakText(word.en), 300);
        const opts = shuffleArray([word.zh, ...getDistractors(word, srsState.allWords, 'zh')]);
        opts.forEach(o => { const b = document.createElement('button'); b.className = 'srs-option'; b.textContent = o; b.onclick = () => handleSrsAnswer(b, o, word.zh, q.type); oArea.appendChild(b); });
    } else if (q.type === 'listen3') {
        const distractorWords = shuffleArray(srsState.allWords.filter(w => w.id !== word.id)).slice(0, 2);
        const choices = shuffleArray([
            { en: word.en, isCorrect: true },
            { en: distractorWords[0]?.en || 'example', isCorrect: false },
            { en: distractorWords[1]?.en || 'sample', isCorrect: false }
        ]);
        const labels = ['A', 'B', 'C'];
        const correctLabel = labels[choices.findIndex(c => c.isCorrect)];

        qArea.innerHTML = `<div class="srs-question-hint">${t('srsHintListenToEn')}</div><div class="srs-question-word">${word.zh}</div><div class="srs-reveal-word hidden" id="srsRevealWord"></div><div class="srs-listen3-container">${choices.map((c, i) => `<div class="srs-listen3-item"><button class="srs-listen3-btn" data-label="${labels[i]}" data-word="${c.en.replace(/"/g, '&quot;')}">${ICONS.speaker}</button><div class="srs-listen3-label">${labels[i]}</div></div>`).join('')}</div>`;

        qArea.querySelectorAll('.srs-listen3-btn').forEach(btn => {
            btn.onclick = () => speakText(btn.dataset.word);
        });

        async function autoPlaySequence() {
            for (const c of choices) {
                await speakTextPromise(c.en);
                await new Promise(r => setTimeout(r, 400));
            }
        }
        setTimeout(() => autoPlaySequence(), 400);

        oArea.innerHTML = '';
        labels.forEach((label) => {
            const b = document.createElement('button');
            b.className = 'srs-option';
            b.textContent = `${label}`;
            b.onclick = () => handleSrsAnswer(b, label, correctLabel, q.type);
            oArea.appendChild(b);
        });

        srsState._listen3Choices = choices;
        srsState._listen3CorrectLabel = correctLabel;
    }
}

function handleSrsAnswer(btnEl, selected, correct, type) {
    if (srsState.answered) return;
    srsState.answered = true;
    const word = srsState.questions[srsState.currentQ].word;
    const isCorrect = selected === correct;
    const resultType = (type === 'listen3') ? 'listen' : type;
    srsState.results[word.id][resultType] = isCorrect;
    document.querySelectorAll('.srs-option').forEach(b => { b.classList.add('disabled'); if (b.textContent === correct) b.classList.add('correct'); });
    if (!isCorrect) btnEl.classList.add('wrong');

    const revealEl = document.getElementById('srsRevealWord');
    if ((type === 'listen' || type === 'listen3') && revealEl) {
        revealEl.textContent = word.en;
        revealEl.classList.remove('hidden');
    }

    speakText(word.en);
    const delay = isCorrect ? 1200 : 2000;
    setTimeout(() => { srsState.currentQ++; if (srsState.currentQ >= srsState.questions.length) showSrsResults(); else renderSrsQuestion(); }, delay);
}

async function showSrsResults() {
    const qArea = document.getElementById('srsQuestionArea');
    const oArea = document.getElementById('srsOptionsArea');
    document.getElementById('srsProgressText').textContent = t('srsDone');
    document.getElementById('srsPhaseBadge').textContent = t('srsResult');
    let totalCorrect = 0;
    const wordResults = [];
    for (const word of srsState.words) {
        const r = srsState.results[word.id];
        const cc = [r.en2zh, r.zh2en, r.listen].filter(Boolean).length;
        totalCorrect += cc;
        const allCorrect = cc === 3;
        let newLevel = word.level;
        if (allCorrect) newLevel = Math.min(word.level + 1, SRS_INTERVALS.length - 1);
        else newLevel = Math.max(word.level - 1, 0);
        const newNext = getNextReviewTime(newLevel);
        await DB.updateWordSRS(word.id, newLevel, newNext);
        wordResults.push({ word, oldLevel: word.level, newLevel, cc, nextDate: new Date(newNext).toLocaleDateString() });
    }
    srsState.active = false;
    const total = srsState.words.length * 3;
    qArea.innerHTML = `<div class="srs-result-score">${totalCorrect}/${total}</div><div class="srs-result-label">${t('srsCorrectCount')}</div>`;
    oArea.innerHTML = '';
    wordResults.forEach(wr => {
        const diff = wr.newLevel - wr.oldLevel;
        let cls = 'same', txt = `Lv.${wr.oldLevel}`;
        if (diff > 0) { cls = 'up'; txt = `Lv.${wr.oldLevel} → ${wr.newLevel}`; }
        else if (diff < 0) { cls = 'down'; txt = `Lv.${wr.oldLevel} → ${wr.newLevel}`; }

        const item = document.createElement('div');
        item.className = 'srs-result-item';

        const main = document.createElement('div');
        main.className = 'srs-result-main';

        const wordRow = document.createElement('div');
        wordRow.className = 'srs-result-word-row';

        const wordEl = document.createElement('div');
        wordEl.className = 'srs-result-word';
        wordEl.textContent = wr.word.en;

        const posText = wr.word.pos?.trim();
        const posEl = document.createElement('span');
        posEl.className = 'vocab-pos';
        posEl.textContent = posText || '';

        const ipaText = wr.word.ipa?.trim();
        const ipaEl = document.createElement('span');
        ipaEl.className = 'vocab-ipa';
        ipaEl.textContent = ipaText || '';

        const speakBtn = document.createElement('button');
        speakBtn.type = 'button';
        speakBtn.className = 'mini-speaker srs-result-speaker';
        speakBtn.innerHTML = ICONS.speaker;
        speakBtn.dataset.speak = wr.word.en;

        const meta = document.createElement('small');
        meta.className = 'srs-result-meta';
        meta.textContent = `${wr.word.zh} · ${t('srsNextReview', { date: wr.nextDate })}`;

        const exRow = document.createElement('div');
        exRow.className = 'srs-result-ex-row';

        const ex = document.createElement('div');
        ex.className = 'srs-result-ex';
        const exText = wr.word.ex?.trim() || '';
        ex.textContent = exText || t('srsNoExample');

        if (exText) {
            const exSpeakBtn = document.createElement('button');
            exSpeakBtn.type = 'button';
            exSpeakBtn.className = 'mini-speaker srs-result-speaker srs-result-ex-speaker';
            exSpeakBtn.innerHTML = ICONS.speaker;
            exSpeakBtn.dataset.speak = exText;
            exRow.appendChild(exSpeakBtn);
        }

        const exZh = document.createElement('div');
        exZh.className = 'srs-result-ex-zh';
        exZh.textContent = wr.word.ex_zh?.trim() || t('srsNoExampleZh');

        wordRow.appendChild(wordEl);
        if (posText) wordRow.appendChild(posEl);
        if (ipaText) wordRow.appendChild(ipaEl);
        wordRow.appendChild(speakBtn);
        main.appendChild(wordRow);
        main.appendChild(meta);
        exRow.prepend(ex);
        main.appendChild(exRow);
        main.appendChild(exZh);

        const status = document.createElement('div');
        status.className = `srs-result-status ${cls}`;
        status.textContent = `${wr.cc}/3 ${txt}`;

        item.appendChild(main);
        item.appendChild(status);
        oArea.appendChild(item);
    });

    oArea.querySelectorAll('.srs-result-speaker').forEach(btn => {
        btn.onclick = () => speakText(btn.dataset.speak || '');
    });

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'srs-done-btn';
    doneBtn.textContent = t('srsDone');
    doneBtn.onclick = () => finishSrsReview();
    oArea.appendChild(doneBtn);
}

export function finishSrsReview() {
    document.getElementById('srsOverlay').classList.add('hidden');
    if (_onFinish) _onFinish();
}
