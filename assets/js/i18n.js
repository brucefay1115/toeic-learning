const DEFAULT_LOCALE = 'zh-TW';

export const SUPPORTED_LOCALES = [
    { code: 'zh-TW', name: '繁體中文（台灣）' },
    { code: 'zh-CN', name: '简体中文（中国）' },
    { code: 'ko', name: '한국어' },
    { code: 'ja', name: '日本語' },
    { code: 'sr-Latn', name: 'Srpski (latinica)' },
    { code: 'de', name: 'Deutsch' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'fil', name: 'Filipino' },
    { code: 'fr', name: 'Francais' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Espanol' },
    { code: 'th', name: 'ไทย' }
];

const LOCALE_META = {
    'zh-TW': { name: 'Traditional Chinese', inLocal: '繁體中文' },
    'zh-CN': { name: 'Simplified Chinese', inLocal: '简体中文' },
    ko: { name: 'Korean', inLocal: '한국어' },
    ja: { name: 'Japanese', inLocal: '日本語' },
    'sr-Latn': { name: 'Serbian (Latin)', inLocal: 'Srpski (latinica)' },
    de: { name: 'German', inLocal: 'Deutsch' },
    vi: { name: 'Vietnamese', inLocal: 'Tiếng Việt' },
    id: { name: 'Indonesian', inLocal: 'Bahasa Indonesia' },
    fil: { name: 'Filipino', inLocal: 'Filipino' },
    fr: { name: 'French', inLocal: 'Francais' },
    it: { name: 'Italian', inLocal: 'Italiano' },
    es: { name: 'Spanish', inLocal: 'Espanol' },
    th: { name: 'Thai', inLocal: 'ไทย' }
};

import ZH_TW from './i18n/locales/zh-TW.js';
import ZH_CN from './i18n/locales/zh-CN.js';
import KO from './i18n/locales/ko.js';
import JA from './i18n/locales/ja.js';
import SR_LATN from './i18n/locales/sr-Latn.js';
import DE from './i18n/locales/de.js';
import VI from './i18n/locales/vi.js';
import ID from './i18n/locales/id.js';
import FIL from './i18n/locales/fil.js';
import FR from './i18n/locales/fr.js';
import IT from './i18n/locales/it.js';
import ES from './i18n/locales/es.js';
import TH from './i18n/locales/th.js';

function withZhTwDefaults(localePack) {
    return { ...ZH_TW, ...localePack };
}

const TRANSLATIONS = {
    'zh-TW': ZH_TW,
    'zh-CN': withZhTwDefaults(ZH_CN),
    ko: withZhTwDefaults(KO),
    ja: withZhTwDefaults(JA),
    'sr-Latn': withZhTwDefaults(SR_LATN),
    de: withZhTwDefaults(DE),
    vi: withZhTwDefaults(VI),
    id: withZhTwDefaults(ID),
    fil: withZhTwDefaults(FIL),
    fr: withZhTwDefaults(FR),
    it: withZhTwDefaults(IT),
    es: withZhTwDefaults(ES),
    th: withZhTwDefaults(TH)
};

let currentLocale = DEFAULT_LOCALE;

function normalizeLocale(locale) {
    return SUPPORTED_LOCALES.some((item) => item.code === locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale() {
    return currentLocale;
}

export function setLocale(locale) {
    currentLocale = normalizeLocale(locale);
    document.documentElement.lang = currentLocale;
    return currentLocale;
}

export function detectBrowserLocale() {
    const preferred = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language || ''];

    for (const raw of preferred) {
        const lang = String(raw || '').trim();
        if (!lang) continue;
        if (SUPPORTED_LOCALES.some((item) => item.code === lang)) return lang;

        const lower = lang.toLowerCase();
        if (lower.startsWith('zh-hant') || lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-TW';
        if (lower.startsWith('zh-hans') || lower === 'zh-cn' || lower === 'zh-sg') return 'zh-CN';
        if (lower.startsWith('ko')) return 'ko';
        if (lower.startsWith('ja')) return 'ja';
        if (lower.startsWith('sr')) return 'sr-Latn';
        if (lower.startsWith('de')) return 'de';
        if (lower.startsWith('vi')) return 'vi';
        if (lower.startsWith('id')) return 'id';
        if (lower.startsWith('fil') || lower.startsWith('tl')) return 'fil';
        if (lower.startsWith('fr')) return 'fr';
        if (lower.startsWith('it')) return 'it';
        if (lower.startsWith('es')) return 'es';
        if (lower.startsWith('th')) return 'th';
    }

    return DEFAULT_LOCALE;
}

export function getLocaleMeta(locale = currentLocale) {
    return LOCALE_META[normalizeLocale(locale)] || LOCALE_META[DEFAULT_LOCALE];
}

export function t(key, params) {
    const locale = normalizeLocale(currentLocale);
    const pack = TRANSLATIONS[locale] || TRANSLATIONS[DEFAULT_LOCALE];
    const fallbackPack = TRANSLATIONS[DEFAULT_LOCALE];
    const template = pack[key] ?? fallbackPack[key] ?? key;
    if (!params) return template;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => {
        if (params[name] === undefined || params[name] === null) return '';
        return String(params[name]);
    });
}

export function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (!key) return;
        el.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const key = el.dataset.i18nHtml;
        if (!key) return;
        el.innerHTML = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        if (!key) return;
        el.setAttribute('placeholder', t(key));
    });
}
