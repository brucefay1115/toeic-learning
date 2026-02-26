// IndexedDB data layer: history, wordCache, settings, savedWords CRUD.

export const DB = {
    name: 'ToeicTutorDB', version: 3, db: null,

    getHistorySortTs(item) {
        if (Number.isFinite(item?.createdAt)) return item.createdAt;
        if (Number.isFinite(item?.id)) return item.id;
        if (typeof item?.id === 'string') {
            const match = item.id.match(/^\d{10,}/);
            if (match) return Number(match[0]);
        }
        return 0;
    },

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('wordCache')) db.createObjectStore('wordCache', { keyPath: 'word' });
                if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('savedWords')) db.createObjectStore('savedWords', { keyPath: 'id' });
            };
            request.onsuccess = (event) => { this.db = event.target.result; resolve(this.db); };
            request.onerror = (event) => { console.error("IndexedDB error:", event.target.error); reject(event.target.error); };
        });
    },

    async getSetting(key) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const req = this.db.transaction('settings', 'readonly').objectStore('settings').get(key);
            req.onsuccess = () => r(req.result ? req.result.value : null);
            req.onerror = () => j(req.error);
        });
    },

    async setSetting(key, value) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const tx = this.db.transaction('settings', 'readwrite');
            tx.objectStore('settings').put({ key, value });
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    },

    async addHistory(item) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('history', 'readwrite');
            const store = tx.objectStore('history');
            store.put(item);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async getHistory() {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const req = this.db.transaction('history', 'readonly').objectStore('history').getAll();
            req.onsuccess = () => {
                const sorted = req.result.sort((a, b) => {
                    const diff = this.getHistorySortTs(b) - this.getHistorySortTs(a);
                    if (diff !== 0) return diff;
                    return String(b.id || '').localeCompare(String(a.id || ''));
                });
                r(sorted);
            };
            req.onerror = () => j(req.error);
        });
    },

    async getLatestHistory() {
        const history = await this.getHistory();
        return history[0] || null;
    },

    async deleteHistory(id) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const tx = this.db.transaction('history', 'readwrite');
            tx.objectStore('history').delete(id);
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    },

    async clearHistory() {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const tx = this.db.transaction('history', 'readwrite');
            tx.objectStore('history').clear();
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    },

    async getWord(word) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const req = this.db.transaction('wordCache', 'readonly').objectStore('wordCache').get(word.toLowerCase());
            req.onsuccess = () => r(req.result ? req.result.data : null);
            req.onerror = () => j(req.error);
        });
    },

    async setWord(word, data) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const tx = this.db.transaction('wordCache', 'readwrite');
            tx.objectStore('wordCache').put({ word: word.toLowerCase(), data });
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    },

    async addSavedWord(obj) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const tx = this.db.transaction('savedWords', 'readwrite');
            tx.objectStore('savedWords').put(obj);
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    },

    async getSavedWord(id) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const req = this.db.transaction('savedWords', 'readonly').objectStore('savedWords').get(id);
            req.onsuccess = () => r(req.result || null);
            req.onerror = () => j(req.error);
        });
    },

    async getSavedWords() {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const req = this.db.transaction('savedWords', 'readonly').objectStore('savedWords').getAll();
            req.onsuccess = () => r(req.result || []);
            req.onerror = () => j(req.error);
        });
    },

    async getWordsForReview() {
        const all = await this.getSavedWords();
        const now = Date.now();
        return all.filter(w => w.nextReview <= now);
    },

    async updateWordSRS(id, level, nextReview) {
        if (!this.db) await this.init();
        const existing = await this.getSavedWord(id);
        if (!existing) return;
        existing.level = level;
        existing.nextReview = nextReview;
        return new Promise((r, j) => {
            const tx = this.db.transaction('savedWords', 'readwrite');
            tx.objectStore('savedWords').put(existing);
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    },

    async deleteSavedWord(id) {
        if (!this.db) await this.init();
        return new Promise((r, j) => {
            const tx = this.db.transaction('savedWords', 'readwrite');
            tx.objectStore('savedWords').delete(id);
            tx.oncomplete = () => r();
            tx.onerror = () => j(tx.error);
        });
    }
};
