// Audio player bar: play/pause, speed control, progress, segment highlighting.

import { state, ICONS } from './state.js';

const audioEl = document.getElementById('mainAudio');
const playerBar = document.getElementById('playerBar');
const playBtn = document.getElementById('btnPlayPause');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const btnSpeed = document.getElementById('btnSpeed');

const speeds = [1.0, 0.75, 0.5, 0.25];
let speedIndex = 0;

export function setPlayerLoading(isLoading) {
    playerBar.classList.remove('hidden');
    playBtn.disabled = isLoading;
    btnSpeed.disabled = isLoading;
    progressContainer.style.pointerEvents = isLoading ? 'none' : 'auto';
    if (isLoading) {
        playBtn.innerHTML = ICONS.play;
        btnSpeed.innerText = '載入中';
    } else {
        btnSpeed.innerText = state.playbackSpeed === 1.0 ? '1.0x' : state.playbackSpeed + 'x';
    }
}

function writeString(v, o, s) {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}

function pcmToWav(pcm, sr) {
    const b = new ArrayBuffer(44 + pcm.length);
    const v = new DataView(b);
    writeString(v, 0, 'RIFF');
    v.setUint32(4, 36 + pcm.length, true);
    writeString(v, 8, 'WAVE');
    writeString(v, 12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    writeString(v, 36, 'data');
    v.setUint32(40, pcm.length, true);
    new Uint8Array(b, 44).set(pcm);
    return new Blob([b], { type: 'audio/wav' });
}

export function setupAudio(base64) {
    if (!base64) return;
    const bc = atob(base64), bn = new Array(bc.length);
    for (let i = 0; i < bc.length; i++) bn[i] = bc.charCodeAt(i);
    const wavBlob = pcmToWav(new Uint8Array(bn), 24000);
    if (state.audioBlobUrl) URL.revokeObjectURL(state.audioBlobUrl);
    state.audioBlobUrl = URL.createObjectURL(wavBlob);
    audioEl.src = state.audioBlobUrl;
    audioEl.playbackRate = state.playbackSpeed;
    setPlayerLoading(false);
}

export { audioEl, playBtn };

/* Event bindings */
btnSpeed.onclick = () => {
    speedIndex = (speedIndex + 1) % speeds.length;
    const s = speeds[speedIndex];
    state.playbackSpeed = s;
    audioEl.playbackRate = s;
    btnSpeed.innerText = s === 1.0 ? '1.0x' : s + 'x';
};

playBtn.onclick = () => {
    state.playUntilPct = null;
    state.playUntilSegmentIndex = null;
    if (audioEl.paused) { audioEl.play(); playBtn.innerHTML = ICONS.pause; }
    else { audioEl.pause(); playBtn.innerHTML = ICONS.play; }
};

progressContainer.onclick = (e) => {
    state.playUntilPct = null;
    state.playUntilSegmentIndex = null;
    const r = progressContainer.getBoundingClientRect();
    const p = (e.clientX - r.left) / r.width;
    if (audioEl.duration) { audioEl.currentTime = p * audioEl.duration; }
};

state.activeSegmentIndex = -1;

audioEl.ontimeupdate = () => {
    const d = audioEl.duration;
    if (!d) return;
    const p = audioEl.currentTime / d;
    progressBar.style.width = `${p * 100}%`;

    if (state.playUntilPct !== null && p >= state.playUntilPct) {
        const safeTime = Math.max(0, (state.playUntilPct * d) - 0.01);
        audioEl.currentTime = safeTime;
        audioEl.pause();
        playBtn.innerHTML = ICONS.play;
        if (state.playUntilSegmentIndex !== null && state.segmentMetadata[state.playUntilSegmentIndex]) {
            if (state.activeSegmentIndex >= 0 && state.activeSegmentIndex !== state.playUntilSegmentIndex && state.segmentMetadata[state.activeSegmentIndex]) {
                state.segmentMetadata[state.activeSegmentIndex].element.classList.remove('active');
            }
            state.segmentMetadata[state.playUntilSegmentIndex].element.classList.add('active');
            state.activeSegmentIndex = state.playUntilSegmentIndex;
        }
        state.playUntilPct = null;
        state.playUntilSegmentIndex = null;
        return;
    }

    let idx = -1;
    for (let i = 0; i < state.segmentMetadata.length; i++) {
        const s = state.segmentMetadata[i];
        if (p >= s.startPct && p < s.endPct) { idx = i; break; }
    }
    if (idx !== state.activeSegmentIndex) {
        if (state.activeSegmentIndex >= 0 && state.segmentMetadata[state.activeSegmentIndex])
            state.segmentMetadata[state.activeSegmentIndex].element.classList.remove('active');
        if (idx >= 0 && state.segmentMetadata[idx])
            state.segmentMetadata[idx].element.classList.add('active');
        state.activeSegmentIndex = idx;
    }
};

audioEl.onended = () => {
    playBtn.innerHTML = ICONS.play;
    progressBar.style.width = '0%';
    state.playUntilPct = null;
    state.playUntilSegmentIndex = null;
    if (state.activeSegmentIndex >= 0 && state.segmentMetadata[state.activeSegmentIndex])
        state.segmentMetadata[state.activeSegmentIndex].element.classList.remove('active');
    state.activeSegmentIndex = -1;
};
