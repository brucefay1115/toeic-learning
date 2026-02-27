// Word modal (long-press lookup), save-to-vocab, renderVocabTab.

import { state, ICONS, SRS_INTERVALS, SRS_MIN_WORDS, SRS_MAX_WORDS, getNextReviewTime } from './state.js';
import { DB } from './db.js';
import { fetchWordDetails } from './apiGemini.js';
import { speakText } from './utils.js';
import { t } from './i18n.js';

let _startSrsReview = null;

export function setSrsTrigger(fn) { _startSrsReview = fn; }

/* Long Press */
export function addLongPressListener(element, wordText) {
    let pressTimer;
    const start = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        element.classList.add('word-pressing');
        pressTimer = setTimeout(() => {
            element.classList.remove('word-pressing');
            element.classList.add('word-highlighted');
            if (state.highlightedElement && state.highlightedElement !== element)
                state.highlightedElement.classList.remove('word-highlighted');
            state.highlightedElement = element;
            showWordModal(wordText);
        }, 600);
    };
    const cancel = () => { clearTimeout(pressTimer); element.classList.remove('word-pressing'); };
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.oncontextmenu = (e) => { e.preventDefault(); return false; };
}

/* Word Modal */
function showWordModal(word) {
    const modal = document.getElementById('wordModal');
    const actionArea = document.getElementById('wmActionArea');
    (async () => {
        let vocabItem = null;
        if (state.currentData && state.currentData.vocabulary)
            vocabItem = state.currentData.vocabulary.find(v => v.word.toLowerCase() === word.toLowerCase());
        if (vocabItem) {
            DB.setWord(word, vocabItem);
        } else {
            vocabItem = await DB.getWord(word);
        }
        if (!vocabItem) {
            const saved = await DB.getSavedWord(word.toLowerCase());
            if (saved) vocabItem = { word: saved.en, pos: saved.pos, ipa: saved.ipa, def: saved.zh, ex: saved.ex, ex_zh: saved.ex_zh };
        }

        document.getElementById('wmWord').innerText = word;
        document.getElementById('btnWordAudio').onclick = () => speakText(word);
        actionArea.innerHTML = '';

        if (vocabItem) {
            const existingSaved = await DB.getSavedWord(word.toLowerCase());
            if (existingSaved && vocabItem.ex && !existingSaved.ex) {
                existingSaved.ex = vocabItem.ex;
                existingSaved.ex_zh = vocabItem.ex_zh || '';
                await DB.addSavedWord(existingSaved);
            }
            document.getElementById('wmPos').innerText = vocabItem.pos || '';
            document.getElementById('wmIpa').innerText = vocabItem.ipa || '';
            document.getElementById('wmDef').innerText = vocabItem.def || '';
            if (vocabItem.ex) {
                document.getElementById('wmExText').innerText = vocabItem.ex;
                document.getElementById('wmExSpeakBtn').onclick = () => speakText(vocabItem.ex);
                document.getElementById('wmEx').classList.remove('hidden');
            } else {
                document.getElementById('wmEx').classList.add('hidden');
            }
            const exZhEl = document.getElementById('wmExZh');
            if (vocabItem.ex_zh) { exZhEl.textContent = vocabItem.ex_zh; exZhEl.classList.remove('hidden'); }
            else { exZhEl.classList.add('hidden'); }
            await renderSaveButton(actionArea, word, vocabItem);
        } else {
            document.getElementById('wmPos').innerText = '';
            document.getElementById('wmIpa').innerText = '';
            document.getElementById('wmDef').innerText = t('vocabNoDetails');
            document.getElementById('wmEx').classList.add('hidden');
            document.getElementById('wmExZh').classList.add('hidden');
            const genBtn = document.createElement('button');
            genBtn.className = 'wm-btn';
            genBtn.style.marginTop = '0';
            genBtn.style.background = 'var(--accent)';
            genBtn.innerHTML = `${ICONS.sparkle} ${t('vocabAiAnalyzeWord')}`;
            genBtn.onclick = async () => {
                genBtn.disabled = true; genBtn.innerText = t('loadingGenerating');
                try {
                    const info = await fetchWordDetails(word);
                    document.getElementById('wmPos').innerText = info.pos;
                    document.getElementById('wmIpa').innerText = info.ipa;
                    document.getElementById('wmDef').innerText = info.def;
                    document.getElementById('wmExText').innerText = info.ex;
                    document.getElementById('wmExSpeakBtn').onclick = () => speakText(info.ex);
                    document.getElementById('wmEx').classList.remove('hidden');
                    const exZhEl = document.getElementById('wmExZh');
                    if (info.ex_zh) { exZhEl.textContent = info.ex_zh; exZhEl.classList.remove('hidden'); }
                    else { exZhEl.classList.add('hidden'); }
                    const existingSaved = await DB.getSavedWord(word.toLowerCase());
                    if (existingSaved && info.ex && !existingSaved.ex) {
                        existingSaved.ex = info.ex;
                        existingSaved.ex_zh = info.ex_zh || '';
                        await DB.addSavedWord(existingSaved);
                    }
                    genBtn.remove();
                    await renderSaveButton(actionArea, word, info);
                } catch (e) { genBtn.innerText = t('vocabGenerateFailedRetry'); genBtn.disabled = false; alert(e.message); }
            };
            actionArea.appendChild(genBtn);
        }
        modal.classList.add('active');
    })();
}

async function renderSaveButton(container, word, vocabItem) {
    const existing = await DB.getSavedWord(word.toLowerCase());
    const btn = document.createElement('button');
    const setSaved = () => { btn.className = 'wm-btn saved-btn'; btn.innerHTML = `${ICONS.bookmarkFill} ${t('vocabSaved')}`; };
    const setUnsaved = () => { btn.className = 'wm-btn save-btn'; btn.innerHTML = `${ICONS.bookmark} ${t('vocabSaveToNotebook')}`; };
    if (existing) setSaved(); else setUnsaved();
    btn.onclick = async () => {
        if (await DB.getSavedWord(word.toLowerCase())) {
            await DB.deleteSavedWord(word.toLowerCase());
            setUnsaved();
            syncVocabCardBookmark(word, false);
        } else {
            await DB.addSavedWord({ id: word.toLowerCase(), en: vocabItem.word || word, zh: vocabItem.def, pos: vocabItem.pos, ipa: vocabItem.ipa, ex: vocabItem.ex || '', ex_zh: vocabItem.ex_zh || '', createdAt: Date.now(), nextReview: getNextReviewTime(0), level: 0 });
            setSaved();
            syncVocabCardBookmark(word, true);
        }
    };
    container.appendChild(btn);
}

export function syncVocabCardBookmark(wordId, isSaved) {
    document.querySelectorAll('#vocabList .vocab-card').forEach(card => {
        const wordEl = card.querySelector('.vocab-word');
        if (wordEl && wordEl.textContent.toLowerCase() === wordId.toLowerCase()) {
            const btn = card.querySelector('.vocab-save-btn');
            if (btn) {
                if (isSaved) { btn.innerHTML = ICONS.bookmarkFill; btn.classList.add('saved'); }
                else { btn.innerHTML = ICONS.bookmark; btn.classList.remove('saved'); }
            }
        }
    });
}

export function closeModal() {
    document.getElementById('wordModal').classList.remove('active');
    if (state.highlightedElement) { state.highlightedElement.classList.remove('word-highlighted'); state.highlightedElement = null; }
}

/* Vocabulary Tab */
export async function renderVocabTab() {
    const words = await DB.getSavedWords();
    document.getElementById('vocabCount').textContent = t('vocabCountLabel', { count: words.length });
    const dueWords = words.filter(w => w.nextReview <= Date.now());
    const entryEl = document.getElementById('srsReviewEntry');
    entryEl.innerHTML = '';

    if (words.length < SRS_MIN_WORDS) {
        entryEl.innerHTML = `<div class="review-entry-card disabled"><h3>${t('vocabSrsTitle')}</h3><p>${t('vocabSrsNeedMinimum', { min: SRS_MIN_WORDS, current: words.length })}</p></div>`;
    } else if (dueWords.length < SRS_MIN_WORDS) {
        const nextDue = words.filter(w => w.nextReview > Date.now()).sort((a, b) => a.nextReview - b.nextReview);
        const nextDate = nextDue.length > 0 ? new Date(nextDue[0].nextReview).toLocaleDateString() : '—';
        entryEl.innerHTML = `<div class="review-entry-card disabled"><h3>${t('vocabSrsTitle')}</h3><p>${t('vocabSrsDueInsufficient', { min: SRS_MIN_WORDS, current: dueWords.length })}<br>${t('vocabNextReviewLabel', { date: nextDate })}</p></div>`;
    } else {
        const reviewCount = Math.min(dueWords.length, SRS_MAX_WORDS);
        const card = document.createElement('button');
        card.className = 'review-entry-card';
        card.innerHTML = `<h3>${t('vocabSrsStartTitle')}</h3><p>${t('vocabSrsStartDesc', { dueCount: dueWords.length, reviewCount })}</p>`;
        card.onclick = () => { if (_startSrsReview) _startSrsReview(dueWords, words); };
        entryEl.appendChild(card);
    }

    const lv5Words = words.filter(w => w.level >= SRS_INTERVALS.length - 1);
    if (lv5Words.length > 0) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'review-entry-card';
        clearBtn.style.background = 'var(--success)';
        clearBtn.innerHTML = `<h3>${t('vocabClearMasteredTitle')}</h3><p>${t('vocabClearMasteredDesc', { count: lv5Words.length })}</p>`;
        clearBtn.onclick = async () => {
            if (!confirm(t('vocabClearMasteredConfirm', { count: lv5Words.length }))) return;
            for (const w of lv5Words) {
                await DB.deleteSavedWord(w.id);
                syncVocabCardBookmark(w.en, false);
            }
            renderVocabTab();
        };
        entryEl.appendChild(clearBtn);
    }

    const listEl = document.getElementById('savedWordsList');
    listEl.innerHTML = '';
    if (words.length === 0) {
        listEl.innerHTML = `<p style="text-align:center; color:var(--text-sub); padding: 30px 0;">${t('vocabEmpty')}<br><span style="font-size:13px;">${t('vocabEmptyHint')}</span></p>`;
        return;
    }
    words.sort((a, b) => a.level - b.level || a.nextReview - b.nextReview).forEach(w => {
        const card = document.createElement('div'); card.className = 'saved-word-card';
        const isOverdue = w.nextReview <= Date.now();
        const dateStr = isOverdue ? t('vocabReadyForReview') : new Date(w.nextReview).toLocaleDateString();
        card.innerHTML = `<div class="saved-word-info"><div class="saved-word-top"><span class="saved-word-en">${w.en}</span>${w.pos ? `<span class="vocab-pos">${w.pos}</span>` : ''}<span class="srs-badge srs-badge-${w.level}">Lv.${w.level}</span></div><div class="saved-word-zh">${w.zh}</div><div class="saved-word-next">${isOverdue ? '⏰ ' : ''}${t('vocabNextReviewLabel', { date: dateStr })}</div></div><div class="saved-word-actions"><button class="saved-word-speak">${ICONS.speaker}</button><button class="saved-word-delete">${ICONS.close}</button></div>`;
        card.querySelector('.saved-word-speak').onclick = () => speakText(w.en);
        card.querySelector('.saved-word-delete').onclick = async () => {
            if (confirm(t('vocabDeleteConfirm', { word: w.en }))) {
                await DB.deleteSavedWord(w.id);
                syncVocabCardBookmark(w.en, false);
                renderVocabTab();
            }
        };
        listEl.appendChild(card);
    });
}
