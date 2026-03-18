// Practice mode view helpers to keep UI toggling isolated.

export function resetSpeakingPracticeView() {
    const el = document.getElementById('speakingConfigView');
    if (el) el.classList.remove('hidden');
}

export function showSpeakingConfigView(setLearnRuntimeMode, switchTab) {
    resetSpeakingPracticeView();
    setLearnRuntimeMode('article');
    switchTab('practice');
}

export function showSpeakingSessionView(setLearnRuntimeMode, switchTab) {
    const el = document.getElementById('speakingConfigView');
    if (el) el.classList.add('hidden');
    setLearnRuntimeMode('speaking');
    switchTab('learn');
}

export function resetExamPracticeView() {
    const config = document.getElementById('examConfigView');
    if (config) config.classList.remove('hidden');
}

export function showExamConfigView(setLearnRuntimeMode, switchTab) {
    resetExamPracticeView();
    setLearnRuntimeMode('article');
    switchTab('practice');
}

export function showExamSessionView(setLearnRuntimeMode, switchTab) {
    const config = document.getElementById('examConfigView');
    if (config) config.classList.add('hidden');
    setLearnRuntimeMode('exam');
    switchTab('learn');
}
