// Gemini API calls: text generation, TTS, exam generation, and explanations.

import { state, TEXT_MODEL, TTS_MODEL } from './state.js';
import { DB } from './db.js';

function ensureCandidateText(data) {
    if (data?.error) throw new Error(data.error.message || 'Gemini API error');
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini 回傳內容為空');
    return text;
}

function parseJsonCandidateText(rawText) {
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}

async function fetchJsonFromPrompt(model, prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });
    const data = await response.json();
    return parseJsonCandidateText(ensureCandidateText(data));
}

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
    return fetchJsonFromPrompt(TEXT_MODEL, prompt);
}

export async function fetchWordDetails(word) {
    const cached = await DB.getWord(word);
    if (cached) return cached;
    const prompt = `Explain the word "${word}" for a TOEIC student. Keep it concise like a vocabulary card. Output JSON strictly: {"word":"${word}","pos":"part of speech (e.g. n./v./adj.)","ipa":"IPA symbol","def":"Brief Traditional Chinese definition (one short phrase)","ex":"One simple short English example sentence.","ex_zh":"Traditional Chinese translation of the example sentence"}`;
    const result = await fetchJsonFromPrompt(TEXT_MODEL, prompt);
    await DB.setWord(word, result);
    return result;
}

function normalizeExamQuestion(category, item, idx) {
    const options = Array.isArray(item.options) ? item.options.slice(0, 4) : [];
    return {
        id: item.id || `${category}-${idx + 1}`,
        category,
        question: item.question || '',
        passage: item.passage || '',
        options,
        answer: item.answer || options[0] || '',
        audioText: item.audioText || '',
        explanationSeed: item.explanationSeed || ''
    };
}

function normalizeExamOutput(raw) {
    const listening = (Array.isArray(raw?.listening) ? raw.listening : [])
        .slice(0, 3)
        .map((item, idx) => normalizeExamQuestion('listening', item, idx));

    const vocab = (Array.isArray(raw?.vocabulary) ? raw.vocabulary : [])
        .slice(0, 3)
        .map((item, idx) => normalizeExamQuestion('vocabulary', item, idx));

    const grammar = (Array.isArray(raw?.grammar) ? raw.grammar : [])
        .slice(0, 3)
        .map((item, idx) => normalizeExamQuestion('grammar', item, idx));

    let readingQuestions = [];
    if (Array.isArray(raw?.reading) && raw.reading.length) {
        readingQuestions = raw.reading.map((q, idx) => ({
            ...q,
            id: q.id || `reading-${idx + 1}`,
            passage: q.passage || ''
        }));
    } else if (Array.isArray(raw?.readingQuestions) && raw?.readingPassage) {
        // Backward compatibility for previous schema: one passage + three questions.
        readingQuestions = raw.readingQuestions.map((q, idx) => ({
            ...q,
            passage: raw.readingPassage,
            id: q.id || `reading-${idx + 1}`
        }));
    }
    const reading = readingQuestions.slice(0, 3).map((item, idx) => normalizeExamQuestion('reading', item, idx));

    return { listening, reading, vocabulary: vocab, grammar };
}

export async function fetchExamQuestions(score) {
    const prompt = `
        You are a TOEIC mock exam generator.
        Target score: ${score}.
        Output STRICT JSON only with this shape:
        {
          "listening": [{"id":"L1","question":"...","audioText":"text to speak","options":["A","B","C","D"],"answer":"A","explanationSeed":"..."}],
          "reading": [{"id":"R1","passage":"...","question":"...","options":["A","B","C","D"],"answer":"A","explanationSeed":"..."}],
          "vocabulary": [{"id":"V1","question":"...","options":["A","B","C","D"],"answer":"A","explanationSeed":"..."}],
          "grammar": [{"id":"G1","question":"...","options":["A","B","C","D"],"answer":"A","explanationSeed":"..."}]
        }
        Rules:
        - listening must have exactly 3 questions.
        - reading must have exactly 3 items.
        - Each reading item must include its own complete "passage" and one related question.
        - Do not reuse the same reading passage for all 3 items.
        - vocabulary must have exactly 3 questions.
        - grammar must have exactly 3 questions.
        - Questions should match target score difficulty.
        - answer must be exactly one option string in options.
        - Use Traditional Chinese for explanations if needed, but question can be English.
        - Return raw JSON only.
    `;
    const raw = await fetchJsonFromPrompt(TEXT_MODEL, prompt);
    return normalizeExamOutput(raw);
}

export async function fetchExamWrongAnswerExplanations(payload) {
    const prompt = `
        你是 TOEIC 講解老師。請針對以下答錯題目逐題說明。
        請輸出嚴格 JSON：
        {
          "items":[
            {
              "id":"題目 id",
              "whyWrong":"為什麼原答案錯（繁中）",
              "keyPoint":"正解關鍵（繁中）",
              "trap":"常見陷阱（繁中）"
            }
          ]
        }
        錯題資料如下：
        ${JSON.stringify(payload)}
    `;
    const result = await fetchJsonFromPrompt(TEXT_MODEL, prompt);
    return Array.isArray(result?.items) ? result.items : [];
}

export async function fetchGeminiTTS(text, voiceName) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${state.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } })
    });
    const data = await response.json();
    if (!response.ok || data?.error) {
        const message = data?.error?.message || 'TTS failed';
        const error = new Error(message);
        error.code = data?.error?.code || response.status;
        throw error;
    }
    return data.candidates[0].content.parts[0].inlineData.data;
}
