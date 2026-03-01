const DEFAULT_LOCALE = 'zh-TW';

export const SUPPORTED_LOCALES = [
    { code: 'zh-TW', name: '繁體中文（台灣）' },
    { code: 'zh-CN', name: '简体中文（中国）' },
    { code: 'ko', name: '한국어' },
    { code: 'ja', name: '日本語' }
];

const LOCALE_META = {
    'zh-TW': { name: 'Traditional Chinese', inLocal: '繁體中文' },
    'zh-CN': { name: 'Simplified Chinese', inLocal: '简体中文' },
    ko: { name: 'Korean', inLocal: '한국어' },
    ja: { name: 'Japanese', inLocal: '日本語' }
};

import ZH_TW from './i18n/locales/zh-TW.js';
import ZH_CN from './i18n/locales/zh-CN.js';
import KO from './i18n/locales/ko.js';
import JA from './i18n/locales/ja.js';

function withZhTwDefaults(localePack) {
    return { ...ZH_TW, ...localePack };
}

const TRANSLATIONS = {
    'zh-TW': ZH_TW,
    'zh-CN': withZhTwDefaults(ZH_CN),
    ko: withZhTwDefaults(KO),
    ja: withZhTwDefaults(JA)
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
