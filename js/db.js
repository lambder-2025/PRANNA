// Simple IndexedDB Wrapper
const DB_NAME = 'LoyaltyDB';
const DB_VERSION = 1;

let db = null;

export const DB = {
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('promos')) {
                    db.createObjectStore('promos', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('pending')) {
                    db.createObjectStore('pending', { autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };

            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };

            request.onerror = (e) => reject(e);
        });
    },

    async init() {
        if (!db) await this.open();

        // Try fetching fresh data
        try {
            const [usersRes, promosRes] = await Promise.all([
                fetch('./data/usuarios.json'),
                fetch('./data/promociones.json')
            ]);

            if (usersRes.ok && promosRes.ok) {
                const serverUsers = await usersRes.json();
                const serverPromos = await promosRes.json();

                // Smart Merge Logic
                const localUsers = await this.getAll('users');
                const userMap = new Map();

                // 1. Base: Server Data
                serverUsers.forEach(u => userMap.set(u.id, u));

                // 2. Overlay: Local Data (if newer or new)
                localUsers.forEach(lUser => {
                    const sUser = userMap.get(lUser.id);
                    if (!sUser) {
                        // User exists locally but not on server (New User or Server Data is stale)
                        userMap.set(lUser.id, lUser);
                    } else {
                        // User exists in both. Compare timestamps.
                        const sDate = new Date(sUser.updatedAt || 0).getTime();
                        const lDate = new Date(lUser.updatedAt || 0).getTime();
                        if (lDate > sDate) {
                            console.log(`Preserving local changes for ${lUser.id}`);
                            userMap.set(lUser.id, lUser);
                        }
                    }
                });

                const mergedUsers = Array.from(userMap.values());

                await this.saveBulk('users', mergedUsers);
                await this.saveBulk('promos', serverPromos);

                await this.put('meta', { key: 'lastSync', value: new Date().toISOString() });
                console.log('Sync complete. Merged Users:', mergedUsers.length);
                return true; // Online match
            }
        } catch (e) {
            console.warn('Offline mode: Using local DB', e);
        }
        return false; // Offline
    },

    // --- CRUD Helpers ---
    async getAll(storeName) {
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
        });
    },

    async get(storeName, key) {
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result);
        });
    },

    async put(storeName, item) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const request = tx.objectStore(storeName).put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async saveBulk(storeName, items) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            items.forEach(item => store.put(item));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    // --- Business Logic ---
    async getUser(id) {
        return await this.get('users', id);
    },

    async getPromos() {
        return await this.getAll('promos');
    },

    async addVisit(userId) {
        const user = await this.get('users', userId);
        if (!user) throw new Error('Usuario no encontrado');

        user.visitas = (user.visitas || 0) + 1;
        user.updatedAt = new Date().toISOString();

        await this.put('users', user);
        await this.logPendingAction({ type: 'addVisit', userId, timestamp: new Date().toISOString() });
        return user;
    },

    async redeemPromo(userId, promoId) {
        const user = await this.get('users', userId);
        const promo = await this.get('promos', promoId);

        if (!user || !promo) throw new Error('Datos invalidos');
        if (user.visitas < promo.visitasRequeridas) throw new Error('Visitas insuficientes');

        user.visitas -= promo.visitasRequeridas;
        user.lastRedeem = { promoId, date: new Date().toISOString() };
        user.updatedAt = new Date().toISOString();

        await this.put('users', user);
        await this.logPendingAction({ type: 'redeem', userId, promoId, timestamp: new Date().toISOString() });
        return user;
    },

    async logPendingAction(action) {
        await this.put('pending', action);
    },

    async getPendingActions() {
        return await this.getAll('pending');
    },

    async exportUsersJSON() {
        const users = await this.getAll('users');
        const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' });
        return blob;
    }
};
