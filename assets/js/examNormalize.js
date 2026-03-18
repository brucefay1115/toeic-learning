export const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export function normalizeKey(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    if (OPTION_KEYS.includes(raw)) return raw;
    const matched = raw.match(/^([A-D])(?:[\s.)\-:].*)?$/);
    return matched ? matched[1] : '';
}

export function parseLegacyOptionString(value) {
    const raw = String(value || '').trim();
    const matched = raw.match(/^([A-D])[\s.)\-:]+(.+)$/i);
    if (!matched) return null;
    return {
        key: matched[1].toUpperCase(),
        text: matched[2].trim()
    };
}

export function normalizeOption(option, index) {
    const defaultKey = OPTION_KEYS[index] || `O${index + 1}`;
    if (typeof option === 'object' && option !== null) {
        const key = normalizeKey(option.key) || defaultKey;
        const text = String(option.text || option.label || option.value || key).trim() || key;
        return { key, text };
    }
    const raw = String(option || '').trim();
    const legacy = parseLegacyOptionString(raw);
    if (legacy) return legacy;
    const key = normalizeKey(raw) || defaultKey;
    const text = raw || key;
    return { key, text };
}

export function getQuestionOptions(question) {
    const source = Array.isArray(question?.options) ? question.options.slice(0, 4) : [];
    return source.map((opt, idx) => normalizeOption(opt, idx));
}

export function resolveAnswerKey(question, options) {
    const direct = normalizeKey(question?.answerKey);
    if (direct && options.some((opt) => opt.key === direct)) return direct;
    const legacy = normalizeKey(question?.answer);
    if (legacy && options.some((opt) => opt.key === legacy)) return legacy;
    const answerText = String(question?.answer || '').trim();
    const byText = options.find((opt) => opt.text === answerText);
    if (byText) return byText.key;
    return options[0]?.key || '';
}

export function getChoiceLabel(choice) {
    if (!choice) return '';
    if (!choice.text || choice.text === choice.key) return choice.key;
    return `${choice.key}. ${choice.text}`;
}

export function resolveChoice(question, rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return null;
    const options = getQuestionOptions(question);
    const key = normalizeKey(raw);
    if (key) {
        const byKey = options.find((opt) => opt.key === key);
        if (byKey) return byKey;
    }
    const byText = options.find((opt) => opt.text === raw);
    if (byText) return byText;
    const byLabel = options.find((opt) => getChoiceLabel(opt) === raw);
    if (byLabel) return byLabel;
    return { key, text: raw };
}

function normalizeExamQuestion(category, item, idx) {
    const options = getQuestionOptions(item);
    const answerKey = resolveAnswerKey(item, options) || 'A';
    const answerText = options.find((opt) => opt.key === answerKey)?.text || '';
    return {
        id: item.id || `${category}-${idx + 1}`,
        category,
        question: item.question || '',
        passage: item.passage || '',
        options,
        answerKey,
        answerText,
        answer: item.answer || answerKey,
        audioText: item.audioText || '',
        explanationSeed: item.explanationSeed || ''
    };
}

export function normalizeExamOutput(raw) {
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
        readingQuestions = raw.readingQuestions.map((q, idx) => ({
            ...q,
            passage: raw.readingPassage,
            id: q.id || `reading-${idx + 1}`
        }));
    }
    const reading = readingQuestions.slice(0, 3).map((item, idx) => normalizeExamQuestion('reading', item, idx));

    return { listening, reading, vocabulary: vocab, grammar };
}
