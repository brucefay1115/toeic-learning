// Article rendering, translation/English toggle, vocab cards, phrase cards.

import { state, ICONS, VOICE_OPTIONS } from './state.js';
import { DB } from './db.js';
import { speakText } from './utils.js';
import { addLongPressListener, toggleWordSaved } from './vocab.js';
import { audioEl, playBtn, ensureAudioReady } from './audioPlayer.js';
import { t } from './i18n.js';

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderContent(data, voiceName) {
    const metaEl = document.getElementById('articleMeta');
    metaEl.innerHTML = '';
    if (voiceName) {
        const opt = VOICE_OPTIONS.find(v => v.name === voiceName);
        const voiceText = opt
            ? `${t(opt.labelKey)} · ${t(opt.descKey)}`
            : voiceName;
        metaEl.innerHTML = `<span class="voice-badge">${ICONS.speaker} ${escapeHtml(voiceText)}</span>`;
    }

    const container = document.getElementById('articleContainer');
    container.innerHTML = '';
    state.segmentMetadata = [];
    const segments = data.segments || [{ en: data.article, zh: data.translation }];
    let totalChars = 0;
    segments.forEach(seg => { totalChars += seg.en.length; });
    let acc = 0;

    segments.forEach((seg, segIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'segment-row';

        const enDiv = document.createElement('div');
        enDiv.className = 'segment-en';

        const startPct = acc / totalChars;
        const endPct = (acc + seg.en.length) / totalChars;

        const replayBtn = document.createElement('button');
        replayBtn.className = 'segment-replay-btn';
        replayBtn.innerHTML = ICONS.miniPlay;
        replayBtn.onclick = async (e) => {
            e.stopPropagation();
            const ready = await ensureAudioReady();
            if (!ready || !audioEl.duration || Number.isNaN(audioEl.duration)) return;
            state.playUntilPct = endPct;
            state.playUntilSegmentIndex = segIndex;
            audioEl.currentTime = startPct * audioEl.duration;
            if (state.activeSegmentIndex >= 0 && state.segmentMetadata[state.activeSegmentIndex]) {
                state.segmentMetadata[state.activeSegmentIndex].element.classList.remove('active');
            }
            enDiv.classList.add('active');
            state.activeSegmentIndex = segIndex;
            if (audioEl.paused) {
                try {
                    await audioEl.play();
                    playBtn.innerHTML = ICONS.pause;
                } catch (err) {
                    console.error('Segment play failed:', err);
                }
            }
        };
        enDiv.appendChild(replayBtn);

        const textSpan = document.createElement('span');
        textSpan.className = 'en-text';
        const words = seg.en.split(/(\s+)/);
        words.forEach(fragment => {
            if (!/[a-zA-Z0-9]/.test(fragment)) { textSpan.appendChild(document.createTextNode(fragment)); return; }
            const cleanWord = fragment.replace(/[^a-zA-Z0-9']/g, '');
            const wordSpan = document.createElement('span');
            wordSpan.innerText = fragment;
            wordSpan.className = 'word-interactive';
            addLongPressListener(wordSpan, cleanWord);
            textSpan.appendChild(wordSpan);
        });
        enDiv.appendChild(textSpan);

        state.segmentMetadata.push({ element: enDiv, startPct, endPct });
        acc += seg.en.length;

        const zhDiv = document.createElement('div');
        zhDiv.className = 'segment-zh hidden';
        zhDiv.innerText = seg.zh;
        rowDiv.appendChild(enDiv);
        rowDiv.appendChild(zhDiv);
        container.appendChild(rowDiv);
    });

    /* Vocab cards with save button */
    const vocabContainer = document.getElementById('vocabList');
    vocabContainer.innerHTML = '';
    const vocabRows = (data.vocabulary || []).slice(0, 8);
    const savedWordsPromise = DB.getSavedWords()
        .then((rows) => new Set((rows || []).map((row) => String(row.id || '').toLowerCase())))
        .catch(() => new Set());
    vocabRows.forEach(v => {
        const card = document.createElement('div');
        card.className = 'vocab-card';
        const word = String(v.word || '');
        const pos = String(v.pos || '');
        const ipa = String(v.ipa || '');
        const def = String(v.def || '');
        const ex = String(v.ex || '');
        const exZh = String(v.ex_zh || '');
        card.innerHTML = `
            <div class="vocab-header">
                <div><span class="vocab-word">${escapeHtml(word)}</span><button class="mini-speaker" data-speak="${escapeHtml(word)}">${ICONS.speaker}</button></div>
                <div><span class="vocab-pos">${escapeHtml(pos)}</span><span class="vocab-ipa">${escapeHtml(ipa)}</span><button class="vocab-save-btn">${ICONS.bookmark}</button></div>
            </div>
            <div class="vocab-def">${escapeHtml(def)}</div>
            <div class="vocab-ex">${escapeHtml(ex)}<button class="mini-speaker" data-speak="${escapeHtml(ex)}">${ICONS.speaker}</button></div>
            ${exZh ? `<div class="vocab-ex-zh">${escapeHtml(exZh)}</div>` : ''}`;
        card.querySelectorAll('[data-speak]').forEach((btn) => {
            btn.onclick = () => speakText(btn.dataset.speak || '');
        });
        const saveBtn = card.querySelector('.vocab-save-btn');
        savedWordsPromise.then((savedSet) => {
            if (savedSet.has(word.toLowerCase())) {
                saveBtn.innerHTML = ICONS.bookmarkFill;
                saveBtn.classList.add('saved');
            }
        });
        saveBtn.onclick = async () => {
            const saved = await toggleWordSaved(word, v);
            if (saved) {
                saveBtn.innerHTML = ICONS.bookmarkFill;
                saveBtn.classList.add('saved');
            } else {
                saveBtn.innerHTML = ICONS.bookmark;
                saveBtn.classList.remove('saved');
            }
        };
        vocabContainer.appendChild(card);
    });

    /* Phrases */
    const phraseContainer = document.getElementById('phraseList');
    const phraseTitle = document.getElementById('phraseSectionTitle');
    phraseContainer.innerHTML = '';
    if (data.phrases && data.phrases.length > 0) {
        phraseTitle.textContent = t('sectionPhrases');
        data.phrases.forEach(p => {
            const phrase = String(p.phrase || '');
            const meaning = String(p.meaning || '');
            const explanation = String(p.explanation || '');
            const example = String(p.example || '');
            const exampleZh = String(p.example_zh || '');
            const card = document.createElement('div');
            card.className = 'phrase-card';
            card.innerHTML = `<div class="phrase-header">${escapeHtml(phrase)}<button class="mini-speaker" data-speak="${escapeHtml(phrase)}" style="margin-left:6px;">${ICONS.speaker}</button></div><div class="phrase-meaning">${escapeHtml(meaning)}</div><div class="phrase-explanation">${escapeHtml(explanation)}</div><div class="phrase-example">${escapeHtml(example)}<button class="mini-speaker" data-speak="${escapeHtml(example)}" style="margin-left:4px;">${ICONS.speaker}</button></div>${exampleZh ? `<div class="phrase-example-zh">${escapeHtml(exampleZh)}</div>` : ''}`;
            card.querySelectorAll('[data-speak]').forEach((btn) => {
                btn.onclick = () => speakText(btn.dataset.speak || '');
            });
            phraseContainer.appendChild(card);
        });
    } else if (data.grammar && data.grammar.length > 0) {
        phraseTitle.textContent = t('sectionGrammar');
        data.grammar.forEach(g => {
            const row = document.createElement('div');
            row.className = 'grammar-item';
            row.innerHTML = `<span class="grammar-bullet">•</span><span>${escapeHtml(g)}</span>`;
            phraseContainer.appendChild(row);
        });
    }

    state.showTranslation = false;
    state.showEnglish = true;
    updateToggleButtons();
    updateTranslationVisibility();
    updateEnglishVisibility();
}

export function toggleTranslation() {
    state.showTranslation = !state.showTranslation;
    updateToggleButtons();
    updateTranslationVisibility();
}

export function toggleEnglish() {
    state.showEnglish = !state.showEnglish;
    updateToggleButtons();
    updateEnglishVisibility();
}

export function updateToggleButtons() {
    const e = document.getElementById('btnToggleEn');
    const z = document.getElementById('btnToggleZh');
    e.textContent = state.showEnglish ? t('btnHideEnglish') : t('btnShowEnglish');
    e.classList.toggle('active-toggle', !state.showEnglish);
    z.textContent = state.showTranslation ? t('btnHideTranslation') : t('btnShowTranslation');
    z.classList.toggle('active-toggle', state.showTranslation);
}

export function updateTranslationVisibility() {
    document.querySelectorAll('.segment-zh').forEach(el => el.classList.toggle('hidden', !state.showTranslation));
}

export function updateEnglishVisibility() {
    document.querySelectorAll('.segment-en').forEach(el => el.classList.toggle('en-hidden', !state.showEnglish));
}
