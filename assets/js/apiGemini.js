// Gemini API calls: text generation, TTS, and word detail lookups.

import { state, TEXT_MODEL, TTS_MODEL } from './state.js';
import { DB } from './db.js';

export async function fetchGeminiText(score, customTopic) {
    const topicLine = customTopic
        ? `about "${customTopic}" suitable for this level.`
        : `about a random business or daily life scenario suitable for this level.`;
    const prompt = `
        You are a strict TOEIC tutor. Target Score: ${score}.
        Task: Generate a SHORT reading comprehension passage (approx 60-80 words, 30 seconds reading time) ${topicLine}
        Output JSON strictly:
        {
            "segments": [{"en": "Sentence 1 English", "zh": "Sentence 1 Traditional Chinese Translation"}],
            "vocabulary": [{"word": "word", "pos": "v.", "ipa": "/ipa/", "def": "Chinese definition", "ex": "English example sentence ONLY (No Chinese translation, No special symbols)", "ex_zh": "Traditional Chinese translation of the example sentence"}],
            "phrases": [{"phrase": "phrase from passage", "meaning": "Traditional Chinese meaning", "explanation": "Brief Traditional Chinese explanation", "example": "English example sentence", "example_zh": "Traditional Chinese translation of the example sentence"}]
        }
        For "phrases": pick 2-3 commonly used phrases from the passage. Return ONLY raw JSON.
    `;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${state.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    let text = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(text);
}

export async function fetchWordDetails(word) {
    const cached = await DB.getWord(word);
    if (cached) return cached;
    const prompt = `Explain the word "${word}" for a TOEIC student. Keep it concise like a vocabulary card. Output JSON strictly: {"word":"${word}","pos":"part of speech (e.g. n./v./adj.)","ipa":"IPA symbol","def":"Brief Traditional Chinese definition (one short phrase)","ex":"One simple short English example sentence.","ex_zh":"Traditional Chinese translation of the example sentence"}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${state.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
    });
    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '');
    const result = JSON.parse(text);
    await DB.setWord(word, result);
    return result;
}

export async function fetchGeminiTTS(text, voiceName) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${state.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].inlineData.data;
}
