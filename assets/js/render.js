// Article rendering, translation/English toggle, vocab cards, phrase cards.

import { state, ICONS, VOICE_OPTIONS, getNextReviewTime } from './state.js';
import { DB } from './db.js';
import { speakText } from './utils.js';
import { addLongPressListener, syncVocabCardBookmark } from './vocab.js';
import { audioEl, playBtn, ensureAudioReady } from './audioPlayer.js';
import { t } from './i18n.js';

export function renderContent(data, voiceName) {
    const metaEl = document.getElementById('articleMeta');
    metaEl.innerHTML = '';
    if (voiceName) {
        const opt = VOICE_OPTIONS.find(v => v.name === voiceName);
        const voiceText = opt
            ? `${t(opt.labelKey)} · ${t(opt.descKey)}`
            : voiceName;
        metaEl.innerHTML = `<span class="voice-badge">${ICONS.speaker} ${voiceText}</span>`;
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
    (data.vocabulary || []).slice(0, 8).forEach(v => {
        const card = document.createElement('div');
        card.className = 'vocab-card';
        const safeWord = v.word.replace(/'/g, "\\'");
        const safeEx = v.ex.replace(/'/g, "\\'");
        card.innerHTML = `
            <div class="vocab-header">
                <div><span class="vocab-word">${v.word}</span><button class="mini-speaker" onclick="speakText('${safeWord}')">${ICONS.speaker}</button></div>
                <div><span class="vocab-pos">${v.pos}</span><span class="vocab-ipa">${v.ipa}</span><button class="vocab-save-btn">${ICONS.bookmark}</button></div>
            </div>
            <div class="vocab-def">${v.def}</div>
            <div class="vocab-ex">"${v.ex}"<button class="mini-speaker" onclick="speakText('${safeEx}')">${ICONS.speaker}</button></div>
            ${v.ex_zh ? `<div class="vocab-ex-zh">${v.ex_zh}</div>` : ''}`;
        const saveBtn = card.querySelector('.vocab-save-btn');
        DB.getSavedWord(v.word.toLowerCase()).then(existing => {
            if (existing) { saveBtn.innerHTML = ICONS.bookmarkFill; saveBtn.classList.add('saved'); }
        });
        saveBtn.onclick = async () => {
            if (saveBtn.classList.contains('saved')) {
                await DB.deleteSavedWord(v.word.toLowerCase());
                saveBtn.innerHTML = ICONS.bookmark;
                saveBtn.classList.remove('saved');
            } else {
                await DB.addSavedWord({ id: v.word.toLowerCase(), en: v.word, zh: v.def, pos: v.pos, ipa: v.ipa, ex: v.ex || '', ex_zh: v.ex_zh || '', createdAt: Date.now(), nextReview: getNextReviewTime(0), level: 0 });
                saveBtn.innerHTML = ICONS.bookmarkFill;
                saveBtn.classList.add('saved');
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
            const safePhrase = (p.phrase || '').replace(/'/g, "\\'");
            const safeEx = (p.example || '').replace(/'/g, "\\'");
            phraseContainer.innerHTML += `<div class="phrase-card"><div class="phrase-header">${p.phrase}<button class="mini-speaker" onclick="speakText('${safePhrase}')" style="margin-left:6px;">${ICONS.speaker}</button></div><div class="phrase-meaning">${p.meaning}</div><div class="phrase-explanation">${p.explanation}</div><div class="phrase-example">"${p.example}"<button class="mini-speaker" onclick="speakText('${safeEx}')" style="margin-left:4px;">${ICONS.speaker}</button></div>${p.example_zh ? `<div class="phrase-example-zh">${p.example_zh}</div>` : ''}</div>`;
        });
    } else if (data.grammar && data.grammar.length > 0) {
        phraseTitle.textContent = t('sectionGrammar');
        data.grammar.forEach(g => { phraseContainer.innerHTML += `<div class="grammar-item"><span class="grammar-bullet">•</span><span>${g}</span></div>`; });
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
