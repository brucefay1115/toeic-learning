// Shared constants, icons, and mutable application state.

export const ICONS = {
    speaker: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    sparkle: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    play: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
    pause: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    bookmark: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
    bookmarkFill: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
    check: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    close: `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    miniPlay: `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
};

export const state = {
    apiKey: '',
    targetScore: 700,
    selectedVoice: 'random',
    practiceMode: 'article',
    lastUsedVoice: null,
    currentData: null,
    audioBlobUrl: null,
    audioReady: false,
    segmentMetadata: [],
    playbackSpeed: 1.0,
    activeSegmentIndex: -1,
    showTranslation: false,
    showEnglish: true,
    highlightedElement: null,
    playUntilPct: null,
    playUntilSegmentIndex: null,
    speakingState: {
        selectedTopic: '機場通關與登機',
        customTopic: '',
        finalTopic: '',
        isConnected: false,
        isRecording: false,
        isResponding: false
    },
    examState: {
        score: 700,
        questions: [],
        answers: {},
        result: null,
        explanations: null,
        attemptId: null,
        explanationRecordSaved: false
    }
};

export const SRS_INTERVALS = [0, 1, 3, 7, 14, 30];
export const SRS_MIN_WORDS = 3;
export const SRS_MAX_WORDS = 10;

export function getNextReviewTime(level) {
    const days = SRS_INTERVALS[Math.min(level, SRS_INTERVALS.length - 1)];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime() + days * 86400000;
}

export const TEXT_MODEL = "gemini-2.5-flash";
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";
export const LIVE_AUDIO_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export const VOICE_OPTIONS = [
    { name: 'random', label: '隨機', desc: '每次不同' },
    { name: 'Kore', label: 'Kore', desc: '清晰女聲' },
    { name: 'Aoede', label: 'Aoede', desc: '柔和女聲' },
    { name: 'Puck', label: 'Puck', desc: '活潑男聲' },
    { name: 'Charon', label: 'Charon', desc: '沉穩男聲' },
    { name: 'Fenrir', label: 'Fenrir', desc: '有力男聲' },
];

export const VOICE_NAMES = VOICE_OPTIONS.filter(v => v.name !== 'random').map(v => v.name);
