/* ---------------------------------------------------------------------------
 * IndexedDB úložiště. Vše držíme v paměti (data jsou malá) a ukládáme
 * po jednotlivých záznamech – to stačí a je to rychlé.
 * ------------------------------------------------------------------------- */

// Název databáze se záměrně NEMĚNÍ při rebrandu – je na něm navázaná všechna
// uživatelská data (IndexedDB je vázaná na původ + název DB).
const DB_NAME = 'fakturace';
const DB_VERSION = 1;

export const STORES = ['meta', 'companies', 'customers', 'items', 'units', 'invoices', 'payments'];

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('companies')) db.createObjectStore('companies', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('units')) db.createObjectStore('units', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('invoices')) {
                const s = db.createObjectStore('invoices', { keyPath: 'id' });
                s.createIndex('companyId', 'companyId');
                s.createIndex('number', 'number');
                s.createIndex('issueDate', 'issueDate');
            }
            if (!db.objectStoreNames.contains('payments')) {
                const s = db.createObjectStore('payments', { keyPath: 'id' });
                s.createIndex('companyId', 'companyId');
                s.createIndex('fingerprint', 'fingerprint');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function run(store, mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

export async function putMany(store, values) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        for (const v of values) s.put(v);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES, 'readwrite');
        for (const name of STORES) tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getMeta(key, fallback) {
    const rec = await get('meta', key);
    return rec ? rec.value : fallback;
}

export const setMeta = (key, value) => put('meta', { key, value });

/** Načte celý stav aplikace do jednoho objektu. */
export async function loadAll() {
    const [companies, customers, items, units, invoices, payments] = await Promise.all([
        getAll('companies'), getAll('customers'), getAll('items'),
        getAll('units'), getAll('invoices'), getAll('payments'),
    ]);
    const settings = await getMeta('settings', {});
    return {
        companies: companies || [],
        customers: customers || [],
        items: items || [],
        units: units || [],
        invoices: invoices || [],
        payments: payments || [],
        settings: settings || {},
    };
}

/** Odhad využití úložiště (pokud to prohlížeč umí). */
export async function storageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
        const { usage, quota } = await navigator.storage.estimate();
        return { usage, quota };
    } catch (e) {
        return null;
    }
}

/** Požádá o trvalé úložiště (aby prohlížeč data sám nemazal). */
export async function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
    } catch (e) {
        return false;
    }
}

export const isPersisted = async () => {
    try {
        return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted());
    } catch (e) { return false; }
};
