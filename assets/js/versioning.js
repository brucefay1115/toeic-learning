// Shared version helpers for bootstrap, updater, and about display.

export function normalizeVersionInfo(info) {
    if (!info || typeof info !== 'object') return null;
    if (!info.version || typeof info.version !== 'string') return null;
    return {
        version: info.version,
        date: typeof info.date === 'string' ? info.date : '',
        changes: Array.isArray(info.changes) ? info.changes : []
    };
}

export function getBootVersionInfo() {
    if (typeof window === 'undefined') return null;
    return normalizeVersionInfo(window.__TOEIC_VERSION_INFO__);
}

export async function fetchVersionInfo(cacheBust = true) {
    const suffix = cacheBust ? `?t=${Date.now()}` : '';
    const res = await fetch(`./version.json${suffix}`);
    if (!res.ok) throw new Error('Failed to fetch version.json');
    return normalizeVersionInfo(await res.json());
}
