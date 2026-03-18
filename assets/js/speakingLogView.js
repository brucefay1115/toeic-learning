// Speaking log DOM rendering helpers.

function buildLogRow(role, text) {
    const row = document.createElement('div');
    row.className = 'speaking-log-item';
    const roleSpan = document.createElement('span');
    roleSpan.className = 'speaking-log-role';
    roleSpan.textContent = String(role || 'log').toUpperCase();
    row.appendChild(roleSpan);
    row.appendChild(document.createTextNode(String(text || '')));
    return row;
}

export function renderSpeakingLogs(logEl, logs) {
    if (!logEl) return;
    logEl.innerHTML = '';
    (Array.isArray(logs) ? logs : []).forEach((entry) => {
        logEl.prepend(buildLogRow(entry?.role, entry?.text));
    });
}

export function prependSpeakingLog(logEl, role, text) {
    if (!logEl) return;
    logEl.prepend(buildLogRow(role, text));
}
