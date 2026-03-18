// Shared id builders to keep record identity consistent.

export function createId(prefix = '') {
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return prefix ? `${prefix}-${base}` : base;
}
