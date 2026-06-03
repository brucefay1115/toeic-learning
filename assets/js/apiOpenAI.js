// OpenAI API calls: text generation, TTS, exam generation, and explanations.
// Mirrors the interface of apiGemini.js so apiProvider.js can dispatch transparently.

import { state, OPENAI_TEXT_MODEL, OPENAI_TTS_MODEL } from './state.js';
import { DB } from './db.js';
import { getLocaleMeta } from './i18n.js';
import { normalizeExamOutput } from './examNormalize.js';

function getTextModel() {
    const m = state.selectedModel;
    return (m && m !== '__custom__') ? m : OPENAI_TEXT_MODEL;
}

async function fetchJsonFromPrompt(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.openaiApiKey}`
        },
        body: JSON.stringify({
            model: getTextModel(),
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        })
    });
    const data = await response.json();
    if (!response.ok || data?.error) {
        throw new Error(data?.error?.message || `OpenAI API error (${response.status})`);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI 回傳內容為空');
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}

export async function fetchGeminiText(score, customTopic) {
    const locale = getLocaleMeta();
    const targetLang = `${locale.name} (${locale.inLocal})`;
    const topicLine = customTopic
        ? `about "${customTopic}" suitable for this level.`
        : `about one random TOEIC-friendly scenario from this range: office communication, meetings, email updates, travel arrangements, customer service, logistics and shipping, human resources, marketing campaigns, product launches, scheduling conflicts, workplace problem-solving, announcements, and professional daily-life errands.`;
    const prompt = `
        You are a strict TOEIC tutor. Target Score: ${score}.
        Task: Generate a SHORT reading comprehension passage (approx 60-80 words, 30 seconds reading time) ${topicLine}
        Output JSON strictly:
        {
            "segments": [{"en": "Sentence 1 English", "zh": "Sentence 1 ${targetLang} translation"}],
            "vocabulary": [{"word": "word", "pos": "v.", "ipa": "/ipa/", "def": "${targetLang} definition", "ex": "English example sentence ONLY (No translation, No special symbols)", "ex_zh": "${targetLang} translation of the example sentence"}],
            "phrases": [{"phrase": "phrase from passage", "meaning": "${targetLang} meaning", "explanation": "Brief ${targetLang} explanation", "example": "English example sentence", "example_zh": "${targetLang} translation of the example sentence"}]
        }
        For "phrases": pick 2-3 commonly used phrases from the passage. Return ONLY raw JSON.
    `;
    return fetchJsonFromPrompt(prompt);
}

function lexicalCacheKey(query) {
    return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function fetchWordDetails(word) {
    const key = lexicalCacheKey(word);
    const cached = await DB.getWord(key);
    if (cached) return cached;
    const locale = getLocaleMeta();
    const targetLang = `${locale.name} (${locale.inLocal})`;
    const q = JSON.stringify(key);
    const prompt = `Explain the English word ${q} for a TOEIC student. Keep it concise like a vocabulary card. Output JSON strictly with this shape: {"word":string (the headword, lowercase),"pos":"part of speech (e.g. n./v./adj./vi./vt.)","ipa":"IPA or empty string if unclear","def":"Brief ${targetLang} definition (one short phrase)","ex":"One simple short English example sentence.","ex_zh":"${targetLang} translation of the example sentence","verb_forms":null OR {"base":string,"past":string,"past_participle":string} — use verb_forms only when pos is a verb (v./vi./vt.); otherwise verb_forms must be null.}`;
    const result = await fetchJsonFromPrompt(prompt);
    await DB.setWord(key, result);
    return result;
}

export async function fetchPhraseDetails(phrase) {
    const key = lexicalCacheKey(phrase);
    const cached = await DB.getWord(key);
    if (cached) return cached;
    const locale = getLocaleMeta();
    const targetLang = `${locale.name} (${locale.inLocal})`;
    const q = JSON.stringify(key);
    const prompt = `Explain the English phrase or collocation ${q} for a TOEIC student. Keep it concise like a vocabulary card. Output JSON strictly: {"word":string (the phrase, natural casing ok but match input meaning),"pos":"phr.","ipa":"","def":"Brief ${targetLang} meaning (one short phrase)","ex":"One simple short English example sentence using the phrase.","ex_zh":"${targetLang} translation of the example sentence"}`;
    const result = await fetchJsonFromPrompt(prompt);
    await DB.setWord(key, result);
    return result;
}

export async function fetchExamQuestions(score) {
    const locale = getLocaleMeta();
    const targetLang = `${locale.name} (${locale.inLocal})`;
    const prompt = `
        You are a TOEIC mock exam generator.
        Target score: ${score}.
        Output STRICT JSON only with this shape:
        {
          "listening": [{"id":"L1","question":"...","audioText":"text to speak","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answerKey":"A","explanationSeed":"..."}],
          "reading": [{"id":"R1","passage":"...","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answerKey":"A","explanationSeed":"..."}],
          "vocabulary": [{"id":"V1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answerKey":"A","explanationSeed":"..."}],
          "grammar": [{"id":"G1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answerKey":"A","explanationSeed":"..."}]
        }
        Rules:
        - listening must have exactly 3 questions.
        - reading must have exactly 3 items.
        - Each reading item must include its own complete "passage" and one related question.
        - Do not reuse the same reading passage for all 3 items.
        - vocabulary must have exactly 3 questions.
        - grammar must have exactly 3 questions.
        - Questions should match target score difficulty.
        - options must contain meaningful English option text, not only letters.
        - answerKey must be exactly one option key from options.
        - Use ${targetLang} for explanations if needed, but question can be English.
        - Return raw JSON only.
    `;
    const raw = await fetchJsonFromPrompt(prompt);
    return normalizeExamOutput(raw);
}

export async function fetchExamWrongAnswerExplanations(payload) {
    const locale = getLocaleMeta();
    const targetLang = `${locale.name} (${locale.inLocal})`;
    const prompt = `
        You are a TOEIC teacher. Explain each wrong answer one by one.
        Output STRICT JSON:
        {
          "items":[
            {
              "id":"question id",
              "whyWrong":"Why the selected answer is wrong (${targetLang})",
              "keyPoint":"Key point for the correct answer (${targetLang})",
              "trap":"Common trap (${targetLang})"
            }
          ]
        }
        Wrong-answer payload:
        ${JSON.stringify(payload)}
    `;
    const result = await fetchJsonFromPrompt(prompt);
    return Array.isArray(result?.items) ? result.items : [];
}

export async function fetchGeminiTTS(text, voiceName) {
    const voice = (voiceName === 'random' || !voiceName) ? 'alloy' : voiceName;
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.openaiApiKey}`
        },
        body: JSON.stringify({
            model: OPENAI_TTS_MODEL,
            input: text,
            voice,
            response_format: 'mp3'
        })
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const error = new Error(errData?.error?.message || `OpenAI TTS error (${response.status})`);
        error.code = response.status;
        throw error;
    }
    const arrayBuffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return 'mp3:' + btoa(binary);
}
