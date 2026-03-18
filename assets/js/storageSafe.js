// Safe wrappers around browser storage calls.

export function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
}

export function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* no-op */ }
}

export function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch { /* no-op */ }
}

export function safeLocalGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

export function safeLocalSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* no-op */ }
}

export function safeLocalRemove(key) {
    try { localStorage.removeItem(key); } catch { /* no-op */ }
}
