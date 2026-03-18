// Word modal (long-press lookup), save-to-vocab, renderVocabTab.

import { state, ICONS, SRS_INTERVALS, SRS_MIN_WORDS, SRS_MAX_WORDS, getNextReviewTime } from './state.js';
import { DB } from './db.js';
import { fetchWordDetails, validateWordWithLanguageTool } from './apiGemini.js';
import { speakText } from './utils.js';
import { t } from './i18n.js';

let _startSrsReview = null;
let _vocabSubtab = 'notebook';
let _lookupResult = null;

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function setSrsTrigger(fn) { _startSrsReview = fn; }
export function setVocabSubtab(tab) {
    _vocabSubtab = tab === 'lookup' ? 'lookup' : 'notebook';
    renderVocabSubtab();
    if (_vocabSubtab === 'lookup') renderLookupResultCard();
}

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
            const saved = await DB.getSavedWord(normalizeWordId(word));
            if (saved) vocabItem = { word: saved.en, pos: saved.pos, ipa: saved.ipa, def: saved.zh, ex: saved.ex, ex_zh: saved.ex_zh };
        }

        document.getElementById('wmWord').innerText = word;
        document.getElementById('btnWordAudio').onclick = () => speakText(word);
        actionArea.innerHTML = '';

        if (vocabItem) {
            await backfillSavedWordExample(word, vocabItem);
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
                    await backfillSavedWordExample(word, info);
                    genBtn.remove();
                    await renderSaveButton(actionArea, word, info);
                } catch (e) { genBtn.innerText = t('vocabGenerateFailedRetry'); genBtn.disabled = false; alert(e.message); }
            };
            actionArea.appendChild(genBtn);
        }
        modal.classList.add('active');
    })();
}

export function normalizeWordId(word) {
    return String(word || '').trim().toLowerCase();
}

function normalizeLookupWord(word) {
    return String(word || '').trim();
}

function validateLookupWordInput(rawWord) {
    const word = normalizeLookupWord(rawWord);
    if (!word) return { ok: false, reason: 'required' };
    if (/\s/.test(word)) return { ok: false, reason: 'single_word_only' };
    if (/\d/.test(word)) return { ok: false, reason: 'digits_not_allowed' };
    if (!/^[A-Za-z]+$/.test(word)) return { ok: false, reason: 'invalid_chars' };
    if (word.length < 2 || word.length > 32) return { ok: false, reason: 'invalid_length' };
    return { ok: true, word: word.toLowerCase() };
}

function renderLookupMessage(message) {
    const resultEl = document.getElementById('vocabLookupResult');
    if (!resultEl) return;
    resultEl.innerHTML = `<div class="vocab-lookup-empty">${escapeHtml(message)}</div>`;
}

export function buildSavedWordPayload(word, vocabItem = {}) {
    const normalizedEn = normalizeWordId(vocabItem.word || word);
    return {
        id: normalizeWordId(vocabItem.word || word),
        en: normalizedEn,
        zh: vocabItem.def || '',
        pos: vocabItem.pos || '',
        ipa: vocabItem.ipa || '',
        ex: vocabItem.ex || '',
        ex_zh: vocabItem.ex_zh || '',
        createdAt: Date.now(),
        nextReview: getNextReviewTime(0),
        level: 0
    };
}

async function backfillSavedWordExample(word, vocabItem = {}) {
    const existingSaved = await DB.getSavedWord(normalizeWordId(word));
    if (!existingSaved || !vocabItem.ex || existingSaved.ex) return;
    existingSaved.ex = vocabItem.ex;
    existingSaved.ex_zh = vocabItem.ex_zh || '';
    await DB.addSavedWord(existingSaved);
}

export async function saveWordToNotebook(word, vocabItem) {
    await DB.addSavedWord(buildSavedWordPayload(word, vocabItem));
    syncVocabCardBookmark(word, true);
}

export async function removeWordFromNotebook(word) {
    await DB.deleteSavedWord(normalizeWordId(word));
    syncVocabCardBookmark(word, false);
}

export async function toggleWordSaved(word, vocabItem) {
    const existing = await DB.getSavedWord(normalizeWordId(word));
    if (existing) {
        await removeWordFromNotebook(word);
        return false;
    }
    await saveWordToNotebook(word, vocabItem);
    return true;
}

async function renderSaveButton(container, word, vocabItem, options = {}) {
    const { onToggle = null } = options;
    const existing = await DB.getSavedWord(normalizeWordId(word));
    const btn = document.createElement('button');
    const setSaved = () => { btn.className = 'wm-btn saved-btn'; btn.innerHTML = `${ICONS.bookmarkFill} ${t('vocabSaved')}`; };
    const setUnsaved = () => { btn.className = 'wm-btn save-btn'; btn.innerHTML = `${ICONS.bookmark} ${t('vocabSaveToNotebook')}`; };
    if (existing) setSaved(); else setUnsaved();
    btn.onclick = async () => {
        const saved = await toggleWordSaved(word, vocabItem);
        if (saved) setSaved();
        else setUnsaved();
        if (typeof onToggle === 'function') await onToggle(saved);
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

function renderVocabSubtab() {
    const notebookPanel = document.getElementById('vocabNotebookPanel');
    const lookupPanel = document.getElementById('vocabLookupPanel');
    if (!notebookPanel || !lookupPanel) return;
    notebookPanel.classList.toggle('hidden', _vocabSubtab !== 'notebook');
    lookupPanel.classList.toggle('hidden', _vocabSubtab !== 'lookup');
    document.querySelectorAll('#vocabSubtabSwitch .vocab-subtab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.vocabSubtab === _vocabSubtab);
    });
}

function renderLookupResultCard() {
    const resultEl = document.getElementById('vocabLookupResult');
    if (!resultEl) return;
    if (!_lookupResult) {
        resultEl.innerHTML = `<div class="vocab-lookup-empty">${t('vocabLookupEmpty')}</div>`;
        return;
    }
    const item = _lookupResult;
    const word = String(item.word || '');
    const pos = String(item.pos || '');
    const ipa = String(item.ipa || '');
    const def = String(item.def || '');
    const ex = String(item.ex || '');
    const exZh = String(item.ex_zh || '');
    const card = document.createElement('div');
    card.className = 'vocab-lookup-result-card';
    card.innerHTML = `
        <div class="saved-word-top">
            <span class="saved-word-en">${escapeHtml(word)}</span>
            <button class="saved-word-speak" data-action="speak-word">${ICONS.speaker}</button>
        </div>
        <div class="vocab-lookup-meta">
            ${pos ? `<span class="vocab-pos">${escapeHtml(pos)}</span>` : ''}
            ${ipa ? `<span class="vocab-ipa">${escapeHtml(ipa)}</span>` : ''}
        </div>
        <div class="saved-word-zh">${escapeHtml(def)}</div>
        ${ex ? `<div class="vocab-lookup-ex">${escapeHtml(ex)} <button class="mini-speaker" data-action="speak-ex">${ICONS.speaker}</button></div>` : ''}
        ${exZh ? `<div class="vocab-ex-zh">${escapeHtml(exZh)}</div>` : ''}
        <div id="vocabLookupActionArea" class="wm-actions" style="margin-top:10px;"></div>
    `;
    card.querySelector('[data-action="speak-word"]')?.addEventListener('click', () => speakText(word));
    card.querySelector('[data-action="speak-ex"]')?.addEventListener('click', () => speakText(ex));
    resultEl.innerHTML = '';
    resultEl.appendChild(card);
    renderSaveButton(card.querySelector('#vocabLookupActionArea'), item.word, item, {
        onToggle: async () => {
            await renderVocabTab();
        }
    }).then(() => {});
}

export async function handleLookupSearch() {
    const inputEl = document.getElementById('vocabLookupInput');
    const lookupBtn = document.getElementById('btnVocabLookup');
    if (!inputEl) return;
    const localValidation = validateLookupWordInput(inputEl.value);
    if (!localValidation.ok) {
        _lookupResult = null;
        if (localValidation.reason === 'required') renderLookupMessage(t('vocabLookupInputRequired'));
        else if (localValidation.reason === 'single_word_only') renderLookupMessage(t('vocabLookupSingleWordOnly'));
        else if (localValidation.reason === 'digits_not_allowed') renderLookupMessage(t('vocabLookupNoDigits'));
        else if (localValidation.reason === 'invalid_length') renderLookupMessage(t('vocabLookupLengthInvalid'));
        else renderLookupMessage(t('vocabLookupCharsInvalid'));
        return;
    }
    if (!state.apiKey) {
        alert(t('alertSetApiKeyFirst'));
        return;
    }
    if (lookupBtn?.disabled) return;
    if (lookupBtn) lookupBtn.disabled = true;
    try {
        const query = localValidation.word;
        renderLookupMessage(t('vocabLookupValidating'));
        const lt = await validateWordWithLanguageTool(query);
        if (!lt.ok) {
            _lookupResult = null;
            if (lt.reason === 'spelling') {
                const suggestions = (lt.suggestions || []).slice(0, 3).join(', ');
                renderLookupMessage(t('vocabLookupSpellingInvalid', { suggestions: suggestions || '-' }));
            } else {
                renderLookupMessage(t('vocabLookupValidationServiceError'));
            }
            return;
        }
        renderLookupMessage(t('loadingGenerating'));
        const info = await fetchWordDetails(query);
        _lookupResult = {
            word: info.word || query,
            pos: info.pos || '',
            ipa: info.ipa || '',
            def: info.def || '',
            ex: info.ex || '',
            ex_zh: info.ex_zh || ''
        };
        await backfillSavedWordExample(_lookupResult.word, _lookupResult);
        await renderVocabTab();
    } catch (error) {
        console.error(error);
        renderLookupMessage(t('vocabLookupFailed', { message: error.message }));
    } finally {
        if (lookupBtn) lookupBtn.disabled = false;
    }
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
            await Promise.all(lv5Words.map((w) => removeWordFromNotebook(w.id)));
            await renderVocabTab();
        };
        entryEl.appendChild(clearBtn);
    }

    const listEl = document.getElementById('savedWordsList');
    listEl.innerHTML = '';
    if (words.length === 0) {
        listEl.innerHTML = `<p style="text-align:center; color:var(--text-sub); padding: 30px 0;">${t('vocabEmpty')}<br><span style="font-size:13px;">${t('vocabEmptyHint')}</span></p>`;
        renderVocabSubtab();
        if (_vocabSubtab === 'lookup') renderLookupResultCard();
        return;
    }
    words.sort((a, b) => a.level - b.level || a.nextReview - b.nextReview).forEach(w => {
        const card = document.createElement('div'); card.className = 'saved-word-card';
        const isOverdue = w.nextReview <= Date.now();
        const dateStr = isOverdue ? t('vocabReadyForReview') : new Date(w.nextReview).toLocaleDateString();
        const displayEn = normalizeWordId(w.en);
        card.innerHTML = `<div class="saved-word-info"><div class="saved-word-top"><span class="saved-word-en">${displayEn}</span>${w.pos ? `<span class="vocab-pos">${w.pos}</span>` : ''}<span class="srs-badge srs-badge-${w.level}">Lv.${w.level}</span></div><div class="saved-word-zh">${w.zh}</div><div class="saved-word-next">${isOverdue ? '⏰ ' : ''}${t('vocabNextReviewLabel', { date: dateStr })}</div></div><div class="saved-word-actions"><button class="saved-word-speak">${ICONS.speaker}</button><button class="saved-word-delete">${ICONS.close}</button></div>`;
        card.querySelector('.saved-word-speak').onclick = () => speakText(displayEn);
        card.querySelector('.saved-word-delete').onclick = async () => {
            if (confirm(t('vocabDeleteConfirm', { word: displayEn }))) {
                await removeWordFromNotebook(w.id);
                renderVocabTab();
            }
        };
        listEl.appendChild(card);
    });
    renderVocabSubtab();
    if (_vocabSubtab === 'lookup') renderLookupResultCard();
}
