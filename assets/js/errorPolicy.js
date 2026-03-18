// Shared error handling helpers for consistent logging and user messaging.

export function toErrorMessage(error, fallback = 'Unknown error') {
    if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }
    if (typeof error === 'string' && error.trim()) return error.trim();
    return fallback;
}

export function logError(context, error) {
    console.error(`[${context}]`, error);
}
