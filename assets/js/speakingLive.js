// Live speaking session over Gemini native audio model (SDK mode).

import { GoogleGenAI, Modality } from 'https://esm.run/@google/genai';
import { LIVE_AUDIO_MODEL, state } from './state.js';

const INPUT_MIME = 'audio/pcm;rate=16000';
const MEDIA_RESOLUTION_LOW = 'MEDIA_RESOLUTION_LOW'; // ~66-70 tokens/image

let liveSession = null;
let mediaStream = null;
let audioCtx = null;
let sourceNode = null;
let workletNode = null;
let scriptNode = null;
let silentGainNode = null;
let outputCtx = null;
let nextPlayTime = 0;
let destroyed = false;

const listeners = {
    status: null,
    log: null,
    connected: null
};

function emitStatus(text) {
    if (listeners.status) listeners.status(text);
}

function emitLog(role, text) {
    if (listeners.log) listeners.log(role, text);
}

function emitConnected(isConnected) {
    if (listeners.connected) listeners.connected(isConnected);
}

function toBase64FromInt16(samples) {
    const bytes = new Uint8Array(samples.buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function downsampleTo16k(float32Array, inputSampleRate) {
    if (inputSampleRate === 16000) return float32Array;
    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(float32Array.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
        let accum = 0;
        let count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
            accum += float32Array[i];
            count += 1;
        }
        result[offsetResult] = count ? accum / count : 0;
        offsetResult += 1;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
}

function floatToInt16(floatArray) {
    const out = new Int16Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
        const s = Math.max(-1, Math.min(1, floatArray[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
}

function decodeBase64Pcm16(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
}

function playPcm16Chunk(base64Data, sampleRate = 24000) {
    if (!outputCtx) outputCtx = new AudioContext();
    const pcm16 = decodeBase64Pcm16(base64Data);
    const audioBuffer = outputCtx.createBuffer(1, pcm16.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) channel[i] = pcm16[i] / 32768;
    const src = outputCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(outputCtx.destination);
    const now = outputCtx.currentTime;
    if (nextPlayTime < now) nextPlayTime = now;
    src.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
}

async function connectLive(topic) {
    emitStatus('正在連線語音服務...');
    const ai = new GoogleGenAI({ apiKey: state.apiKey });
    const config = {
        responseModalities: [Modality.AUDIO],
        mediaResolution: MEDIA_RESOLUTION_LOW,
        systemInstruction: `You are an English speaking partner for TOEIC learners. Hold a natural live conversation focused on this topic: ${topic}. Ask short follow-up questions and keep each turn concise.`
    };

    liveSession = await ai.live.connect({
        model: LIVE_AUDIO_MODEL,
        config,
        callbacks: {
            onopen: () => {
                state.speakingState.isConnected = true;
                emitConnected(true);
                emitLog('system', `主題：${topic}`);
                emitStatus('連線成功，準備啟用麥克風...');
            },
            onmessage: (message) => {
                if (destroyed) return;
                if (message?.serverContent?.interrupted) {
                    nextPlayTime = outputCtx ? outputCtx.currentTime : 0;
                }
                const parts = message?.serverContent?.modelTurn?.parts || [];
                const textPart = parts.find(p => typeof p?.text === 'string' && p.text.trim());
                if (textPart?.text) emitLog('ai', textPart.text);

                const audioParts = parts.filter(p => p?.inlineData?.data);
                if (audioParts.length > 0) {
                    state.speakingState.isResponding = true;
                    emitStatus('AI 回覆中...');
                    audioParts.forEach(part => playPcm16Chunk(part.inlineData.data, 24000));
                }
                if (message?.serverContent?.turnComplete) {
                    state.speakingState.isResponding = false;
                    emitStatus('等待你說話...');
                }
            },
            onerror: (e) => {
                emitStatus('連線發生錯誤: ' + (e?.message || 'unknown'));
            },
            onclose: (e) => {
                state.speakingState.isConnected = false;
                state.speakingState.isRecording = false;
                emitConnected(false);
                emitStatus('口說已停止: ' + (e?.reason || 'closed'));
            }
        }
    });
}

function sendRealtimePcm(floatChunk) {
    if (!liveSession || destroyed) return;
    const downsampled = downsampleTo16k(floatChunk, audioCtx.sampleRate);
    const pcm16 = floatToInt16(downsampled);
    liveSession.sendRealtimeInput({
        audio: {
            data: toBase64FromInt16(pcm16),
            mimeType: INPUT_MIME
        }
    });
}

async function setupMicWithWorklet() {
    await audioCtx.audioWorklet.addModule('./assets/js/mic-processor.js');
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioCtx, 'mic-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1
    });
    silentGainNode = audioCtx.createGain();
    silentGainNode.gain.value = 0;
    workletNode.port.onmessage = (event) => {
        if (!event?.data) return;
        sendRealtimePcm(event.data);
    };
    sourceNode.connect(workletNode);
    workletNode.connect(silentGainNode);
    silentGainNode.connect(audioCtx.destination);
}

function setupMicWithScriptProcessorFallback() {
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);
    scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
    scriptNode.onaudioprocess = (event) => {
        sendRealtimePcm(event.inputBuffer.getChannelData(0));
    };
    silentGainNode = audioCtx.createGain();
    silentGainNode.gain.value = 0;
    sourceNode.connect(scriptNode);
    scriptNode.connect(silentGainNode);
    silentGainNode.connect(audioCtx.destination);
}

async function setupMicStream() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    try {
        await setupMicWithWorklet();
        emitLog('system', 'AudioWorklet 已啟用');
    } catch (error) {
        console.warn('AudioWorklet unavailable, fallback ScriptProcessorNode', error);
        setupMicWithScriptProcessorFallback();
        emitLog('system', 'AudioWorklet 不可用，已使用 ScriptProcessor 降級');
    }
    state.speakingState.isRecording = true;
    emitStatus('口說進行中，請直接對著麥克風說話');
}

export async function startSpeakingSession(topic, callbacks = {}) {
    if (!state.apiKey) throw new Error('請先設定 API Key');
    if (!topic) throw new Error('請先選擇或輸入主題');
    if (liveSession || mediaStream) await stopSpeakingSession();

    listeners.status = callbacks.onStatus || null;
    listeners.log = callbacks.onLog || null;
    listeners.connected = callbacks.onConnected || null;
    destroyed = false;
    state.speakingState.finalTopic = topic;
    state.speakingState.isResponding = false;

    await connectLive(topic);
    await setupMicStream();
    emitLog('system', 'Session started');
}

export async function stopSpeakingSession() {
    destroyed = true;
    if (workletNode) {
        workletNode.port.onmessage = null;
        workletNode.disconnect();
        workletNode = null;
    }
    if (scriptNode) {
        scriptNode.disconnect();
        scriptNode.onaudioprocess = null;
        scriptNode = null;
    }
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }
    if (silentGainNode) {
        silentGainNode.disconnect();
        silentGainNode = null;
    }
    if (audioCtx) {
        await audioCtx.close();
        audioCtx = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (liveSession) {
        liveSession.close();
        liveSession = null;
    }
    state.speakingState.isConnected = false;
    state.speakingState.isRecording = false;
    state.speakingState.isResponding = false;
    emitConnected(false);
}
