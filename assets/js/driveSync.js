// Google Drive appDataFolder backup/restore (manual actions only).

import { DB } from './db.js';
import { t } from './i18n.js';

let _callbacks = { renderHistory: null, loadLastSession: null, renderVocabTab: null };

export const DriveSync = {
    CLIENT_ID: '577652285741-f97oivf3f7h2u9b02hhq9man1f807v16.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    BACKUP_FILENAME: 'toeic-tutor-backup.json',
    tokenClient: null,
    accessToken: null,
    fileId: null,
    _pendingLoginResolve: null,

    setCallbacks(cbs) {
        _callbacks = { ..._callbacks, ...cbs };
    },

    init() {
        if (typeof google === 'undefined' || !google.accounts) return;
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (resp) => {
                if (resp.error) {
                    console.error('GIS auth error:', resp);
                    if (this._pendingLoginResolve) this._pendingLoginResolve(false);
                    this._pendingLoginResolve = null;
                    return;
                }
                this.accessToken = resp.access_token;
                const expiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
                DB.setSetting('gis_access_token', resp.access_token);
                DB.setSetting('gis_token_expires_at', expiresAt);
                this._fetchUserInfo();
                this.updateUI();
                if (this._pendingLoginResolve) this._pendingLoginResolve(true);
                this._pendingLoginResolve = null;
            },
        });
    },

    async login() {
        if (!this.tokenClient) {
            this.init();
            if (!this.tokenClient) { alert(t('driveGisNotLoaded')); return false; }
        }
        const ok = await new Promise((resolve) => {
            this._pendingLoginResolve = resolve;
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
        return ok;
    },

    async silentLogin() {
        try {
            const cached = await DB.getSetting('gis_access_token');
            const expiresAt = await DB.getSetting('gis_token_expires_at');
            if (cached && expiresAt && Date.now() < expiresAt) {
                this.accessToken = cached;
                this.updateUI();
                return true;
            }
        } catch (e) { /* ignore cache read errors */ }
        if (!this.tokenClient) {
            this.init();
            if (!this.tokenClient) return false;
        }
        return new Promise((resolve) => {
            this._pendingLoginResolve = resolve;
            this.tokenClient.requestAccessToken({ prompt: '' });
        });
    },

    async logout() {
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken);
        }
        this.accessToken = null;
        this.fileId = null;
        await DB.setSetting('cloud_sync_enabled', false);
        await DB.setSetting('cloud_user_email', null);
        await DB.setSetting('cloud_user_name', null);
        await DB.setSetting('gis_access_token', null);
        await DB.setSetting('gis_token_expires_at', null);
        this.updateUI();
    },

    isLoggedIn() { return !!this.accessToken; },

    async _fetchUserInfo() {
        try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            const info = await resp.json();
            await DB.setSetting('cloud_user_email', info.email || '');
            await DB.setSetting('cloud_user_name', info.name || info.email || '');
            await DB.setSetting('cloud_sync_enabled', true);
            this.updateUI();
        } catch (e) { console.warn('Failed to fetch user info:', e); }
    },

    async _apiFetch(url, opts = {}) {
        if (!this.accessToken) throw new Error('Not authenticated');
        opts.headers = { ...opts.headers, Authorization: `Bearer ${this.accessToken}` };
        const resp = await fetch(url, opts);
        if (resp.status === 401) {
            this.accessToken = null;
            DB.setSetting('gis_access_token', null);
            DB.setSetting('gis_token_expires_at', null);
            this.updateUI();
            throw new Error('Token expired');
        }
        return resp;
    },

    async exportData() {
        const [history, savedWords] = await Promise.all([
            DB.getHistory(),
            DB.getSavedWords(),
        ]);
        const lightHistory = history.map(h => ({ ...h, audio: null }));
        return JSON.stringify({
            version: 1,
            exportedAt: Date.now(),
            history: lightHistory,
            savedWords,
        });
    },

    async importData(jsonStr) {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        if (data.history) {
            await DB.clearHistory();
            for (const item of data.history) { await DB.addHistory(item); }
        }
        if (data.savedWords) {
            const existing = await DB.getSavedWords();
            for (const w of existing) { await DB.deleteSavedWord(w.id); }
            for (const w of data.savedWords) { await DB.addSavedWord(w); }
        }
    },

    async findBackupFile() {
        if (this.fileId) return this.fileId;
        const resp = await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${this.BACKUP_FILENAME}'&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1`
        );
        const data = await resp.json();
        if (data.files && data.files.length > 0) {
            this.fileId = data.files[0].id;
            return this.fileId;
        }
        return null;
    },

    async upload(jsonStr) {
        const fileId = await this.findBackupFile();
        const metadata = { name: this.BACKUP_FILENAME, mimeType: 'application/json' };
        if (!fileId) metadata.parents = ['appDataFolder'];

        const boundary = '-------DriveBackupBoundary';
        const body =
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
            `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonStr}\r\n` +
            `--${boundary}--`;

        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const resp = await this._apiFetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body,
        });
        const result = await resp.json();
        if (result.id) this.fileId = result.id;

        const now = new Date().toLocaleString();
        await DB.setSetting('cloud_last_sync', now);
        this.updateUI();
    },

    async download() {
        const fileId = await this.findBackupFile();
        if (!fileId) return null;
        const resp = await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
        );
        return resp.json();
    },

    async backupNow() {
        if (!this.isLoggedIn()) { alert(t('driveLoginRequired')); return; }
        const btn = document.getElementById('btnBackupNow');
        btn.disabled = true; btn.textContent = t('driveBackupInProgress');
        try {
            const json = await this.exportData();
            await this.upload(json);
            btn.textContent = t('driveBackupDone');
            setTimeout(() => { btn.textContent = t('cloudBackupNowBtn'); btn.disabled = false; }, 2000);
        } catch (e) {
            alert(t('driveBackupFailed', { message: e.message }));
            btn.textContent = t('cloudBackupNowBtn'); btn.disabled = false;
        }
    },

    async restore() {
        if (!this.isLoggedIn()) { alert(t('driveLoginRequired')); return; }
        const btn = document.getElementById('btnRestore');
        btn.disabled = true; btn.textContent = t('driveRestoreChecking');
        try {
            const data = await this.download();
            if (!data) { alert(t('driveRestoreNotFound')); btn.textContent = t('cloudRestoreBtn'); btn.disabled = false; return; }
            const date = data.exportedAt ? new Date(data.exportedAt).toLocaleString() : t('driveUnknownDate');
            this._showRestorePrompt(data, date, btn);
        } catch (e) {
            alert(t('driveRestoreFailed', { message: e.message }));
            btn.textContent = t('cloudRestoreBtn'); btn.disabled = false;
        }
    },

    _showRestorePrompt(data, dateStr, triggerBtn) {
        const overlay = document.createElement('div');
        overlay.className = 'restore-overlay';
        overlay.innerHTML = `<div class="restore-card">
            <h3>${t('driveRestoreDetectedTitle')}</h3>
            <p>${t('driveRestoreDetectedSummary', { date: dateStr, historyCount: (data.history || []).length, vocabCount: (data.savedWords || []).length })}</p>
            <div class="restore-btns">
                <button class="btn-cancel">${t('driveCancelBtn')}</button>
                <button class="btn-restore">${t('driveRestoreBtn')}</button>
            </div>
        </div>`;
        overlay.querySelector('.btn-cancel').onclick = () => {
            overlay.remove();
            if (triggerBtn) { triggerBtn.textContent = t('cloudRestoreBtn'); triggerBtn.disabled = false; }
        };
        overlay.querySelector('.btn-restore').onclick = async () => {
            overlay.querySelector('.btn-restore').textContent = t('driveRestoring');
            overlay.querySelector('.btn-restore').disabled = true;
            try {
                await this.importData(data);
                overlay.remove();
                if (_callbacks.renderHistory) _callbacks.renderHistory();
                if (_callbacks.loadLastSession) await _callbacks.loadLastSession();
                if (_callbacks.renderVocabTab) _callbacks.renderVocabTab();
                if (triggerBtn) { triggerBtn.textContent = t('cloudRestoreBtn'); triggerBtn.disabled = false; }
                alert(t('driveRestoreSuccess'));
            } catch (e) {
                alert(t('driveRestoreFailed', { message: e.message }));
                overlay.remove();
                if (triggerBtn) { triggerBtn.textContent = t('cloudRestoreBtn'); triggerBtn.disabled = false; }
            }
        };
        document.body.appendChild(overlay);
    },

    async updateUI() {
        const loggedIn = this.isLoggedIn();
        const authArea = document.getElementById('cloudAuthArea');
        const userArea = document.getElementById('cloudUserArea');
        if (!authArea || !userArea) return;
        const actionsEl = userArea.querySelector('.cloud-actions');

        if (loggedIn) {
            authArea.classList.add('hidden');
            userArea.classList.remove('hidden');
            const email = await DB.getSetting('cloud_user_email') || '';
            const name = await DB.getSetting('cloud_user_name') || email;
            document.getElementById('cloudUserName').textContent = name;
            document.getElementById('cloudUserEmail').textContent = email;
            document.getElementById('cloudAvatar').textContent = (name || 'G')[0].toUpperCase();
            const lastSync = await DB.getSetting('cloud_last_sync');
            document.getElementById('cloudLastSync').textContent = lastSync
                ? t('driveLastSync', { value: lastSync })
                : t('driveNotSynced');
            actionsEl.innerHTML = `
                <button class="cloud-action-btn primary" id="btnBackupNow" onclick="DriveSync.backupNow()">${t('cloudBackupNowBtn')}</button>
                <button class="cloud-action-btn" id="btnRestore" onclick="DriveSync.restore()">${t('cloudRestoreBtn')}</button>
                <button class="cloud-action-btn danger" id="btnCloudLogout" onclick="DriveSync.logout()">${t('cloudLogoutBtn')}</button>`;
        } else {
            authArea.classList.remove('hidden');
            userArea.classList.add('hidden');
        }
    },
};
