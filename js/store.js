/* ---------------------------------------------------------------------------
 * Aplikační stav + veškeré mutace (nad IndexedDB).
 * Data držíme v paměti, ukládáme po jednotlivých záznamech.
 * ------------------------------------------------------------------------- */
import * as db from './db.js';
import { buildDemo } from './seed.js';
import { uid, sv, num, debounce, clamp, digitsOnly } from './util.js';
import {
    DEFAULT_UNITS, formatNumber, vsFromNumber, previewNumber, counterFor,
    totals, statusOf, invoiceTotals,
} from './invoice.js';
import { parseAbo, fingerprintOf, classify, accountBankCode, accountDigits, normAccount, normVs } from './abo.js';

export const state = {
    companies: [],
    customers: [],
    items: [],
    units: [],
    invoices: [],
    payments: [],
    settings: {},

    activeCompanyId: null,
    view: 'overview',
    editing: null,          // faktura v editoru (může být neuložený koncept)
    editingSaved: false,
    selectedYear: undefined,   // undefined = první ročník otevřený, null = vše sbaleno
    search: '',
    filters: { year: 'all', month: 'all', status: 'all' },
    bankFilters: { state: 'all' },
    bankSearch: '',
    showInternal: false,
    dirty: false,
    toastQueue: [],
};

/* --------------------------- pub/sub ------------------------------------- */

/** Firmy držíme vždy seřazené podle kódu (IndexedDB je vrací podle id). */
function sortCompanies() {
    state.companies.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
}

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** @param {'all'|'sidebar'|'main'} [kind] */
export function emit(kind = 'all') { for (const fn of listeners) fn(kind); }

/* --------------------------- výběry ------------------------------------- */

export const activeCompany = () => state.companies.find((c) => c.id === state.activeCompanyId) || state.companies[0] || null;

export const companyInvoices = (companyId = state.activeCompanyId) =>
    state.invoices.filter((i) => i.companyId === companyId);

export const companyPayments = (companyId = state.activeCompanyId) =>
    state.payments.filter((p) => p.companyId === companyId);

/** Uhrazená částka faktury (součet alokací plateb). */
export function paidAmount(invoiceId) {
    let paid = 0;
    for (const p of state.payments) {
        for (const a of p.allocations || []) if (a.invoiceId === invoiceId) paid += num(a.amount);
    }
    return Math.round(paid * 100) / 100;
}

export const remainingOf = (invoice) => Math.max(0, Math.round((invoiceTotals(invoice).payable - paidAmount(invoice.id)) * 100) / 100);

export const invoiceStatus = (invoice) => statusOf(invoice, paidAmount(invoice.id));

export const isMeaningful = (invoice) =>
    (invoice.rows || []).some((r) => sv(r.name).trim() !== '' || num(r.price) !== 0) ||
    sv(invoice.note).trim() !== '';

/* --------------------------- start -------------------------------------- */

export async function init() {
    const data = await db.loadAll();
    state.companies = data.companies;
    state.customers = data.customers;
    state.items = data.items;
    state.units = data.units;
    state.invoices = data.invoices;
    state.payments = data.payments;
    state.settings = data.settings || {};

    if (!state.companies.length) await seedDemo();
    if (!state.units.length) {
        state.units = DEFAULT_UNITS.map((name) => ({ id: 'unit-' + name, name }));
        await db.putMany('units', state.units);
    }
    sortCompanies();
    if (!state.companies.some((c) => c.id === state.settings.activeCompanyId)) {
        state.settings.activeCompanyId = state.companies[0] ? state.companies[0].id : null;
        await db.setMeta('settings', state.settings);
    }
    state.activeCompanyId = state.settings.activeCompanyId;
}

export async function seedDemo() {
    const demo = buildDemo();
    await db.putMany('companies', demo.companies);
    await db.putMany('customers', demo.customers);
    await db.putMany('items', demo.items);
    await db.putMany('units', demo.units);
    await db.putMany('invoices', demo.invoices);
    await db.putMany('payments', demo.payments);
    await db.setMeta('lastCompanyCode', demo.lastCompanyCode);
    await db.setMeta('settings', demo.settings);

    state.companies = demo.companies;
    sortCompanies();
    state.customers = demo.customers;
    state.items = demo.items;
    state.units = demo.units;
    state.invoices = demo.invoices;
    state.payments = demo.payments;
    state.settings = demo.settings;
    state.activeCompanyId = demo.settings.activeCompanyId;
}

/** Smaže vše a nahraje demo data. */
export async function resetToDemo() {
    await db.clearAll();
    state.companies = []; state.customers = []; state.items = [];
    state.units = []; state.invoices = []; state.payments = []; state.settings = {};
    state.editing = null;
    await seedDemo();
    emit();
}

/**
 * Smaže úplně všechna data a ponechá jednu prázdnou firmu,
 * aby se aplikace dala rovnou naplnit vlastními údaji.
 */
export async function clearAllData() {
    await db.clearAll();

    const now = new Date().toISOString();
    const company = {
        id: uid('co'), code: '01', prefix: 'FA',
        name: '', ico: '', dic: '', address: '', account: '', bank: '',
        email: '', phone: '', web: '', platceDPH: false, dueDays: 14,
        paymentMessage: 'Faktura', invoiceFooter: '', counters: {}, createdAt: now,
    };
    const units = DEFAULT_UNITS.map((name) => ({ id: 'unit-' + name, name }));
    const settings = {
        activeCompanyId: company.id,
        theme: state.settings.theme || 'auto',
        demo: false,
    };

    await db.put('companies', company);
    await db.putMany('units', units);
    await db.setMeta('settings', settings);
    await db.setMeta('lastCompanyCode', 1);

    state.companies = [company];
    state.customers = [];
    state.items = [];
    state.units = units;
    state.invoices = [];
    state.payments = [];
    state.settings = settings;
    state.editing = null;
    state.editingSaved = false;
    state.activeCompanyId = company.id;
    state.selectedYear = null;
    state.view = 'settings';
    emit('all');
    return company;
}

/* --------------------------- firmy -------------------------------------- */

export async function setActiveCompany(id, options = {}) {
    if (state.editing) {
        try { await flushEditing(); } catch (e) { /* koncept se případně zahodí */ }
    }
    state.activeCompanyId = id;
    state.settings.activeCompanyId = id;
    state.editing = null;
    state.selectedYear = null;
    if (!options.keepView) {
        state.view = 'overview';
    }
    await db.setMeta('settings', state.settings);
    emit();
}

export async function allocCompanyCode() {
    const last = Number(await db.getMeta('lastCompanyCode', 0)) || 0;
    const next = clamp(last + 1, 1, 99);
    await db.setMeta('lastCompanyCode', next);
    return String(next).padStart(2, '0');
}

export async function addCompany(data) {
    const code = await allocCompanyCode();
    const company = Object.assign({
        id: uid('co'), code, prefix: 'FA',
        name: '', ico: '', dic: '', address: '', account: '', bank: '',
        email: '', phone: '', web: '', platceDPH: false, dueDays: 14,
        paymentMessage: 'Faktura', invoiceFooter: '', counters: {},
        createdAt: new Date().toISOString(),
    }, data || {});
    await db.put('companies', company);
    state.companies.push(company);
    sortCompanies();
    state.settings.activeCompanyId = company.id;
    await db.setMeta('settings', state.settings);
    state.activeCompanyId = company.id;
    emit();
    return company;
}

export async function saveCompany(company) {
    await db.put('companies', company);
    emit('sidebar');
}

export async function removeCompany(companyId) {
    if (state.companies.length <= 1) throw new Error('Nelze smazat poslední firmu.');
    const count = companyInvoices(companyId).length;
    if (count > 0) {
        throw new Error('Firma má ' + count + ' vydaných faktur. Nejdřív je smažte (nebo firmu jen přejmenujte).');
    }
    state.companies = state.companies.filter((c) => c.id !== companyId);
    await db.del('companies', companyId);
    if (state.activeCompanyId === companyId) {
        state.activeCompanyId = state.companies[0].id;
        state.settings.activeCompanyId = state.activeCompanyId;
        await db.setMeta('settings', state.settings);
    }
    emit();
}

/* ------------------------- číselníky ------------------------------------ */

export async function saveCustomer(customer) {
    if (!customer.id) customer.id = uid('cu');
    await db.put('customers', customer);
    if (!state.customers.some((c) => c.id === customer.id)) state.customers.push(customer);
    emit('sidebar');
    return customer;
}

export function findOrCreateCustomerByName(name) {
    const clean = sv(name).trim();
    if (!clean) return null;
    let found = state.customers.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (found) return found;
    found = { id: uid('cu'), name: clean, ico: '', dic: '', address: '', account: '', email: '', phone: '' };
    state.customers.push(found);
    db.put('customers', found);
    return found;
}

/**
 * Najde odběratele podle IČO (případně názvu) a doplní data z ARES.
 * Když takový odběratel neexistuje, založí nového.
 */
export async function upsertCustomerFromAres(data) {
    const ico = digitsOnly(data && data.ico);
    const name = sv(data && data.name).trim();

    let customer = null;
    if (ico) customer = state.customers.find((c) => digitsOnly(c.ico) === ico) || null;
    if (!customer && name) {
        customer = state.customers.find((c) => c.name.toLowerCase() === name.toLowerCase()) || null;
    }
    if (!customer) {
        customer = { id: uid('cu'), name: '', ico: '', dic: '', address: '', account: '', email: '', phone: '' };
    }

    if (name) customer.name = name;
    if (ico) customer.ico = ico;
    if (data && data.dic) customer.dic = data.dic;
    if (data && data.address) customer.address = data.address;

    return await saveCustomer(customer);
}

export async function removeCustomer(id) {
    state.customers = state.customers.filter((c) => c.id !== id);
    await db.del('customers', id);
    emit('sidebar');
}

export async function saveItem(item) {
    if (!item.id) item.id = uid('it');
    await db.put('items', item);
    if (!state.items.some((i) => i.id === item.id)) state.items.push(item);
    emit('sidebar');
    return item;
}

/** Pokud název položky v číselníku není, založí ho (dle zadání automaticky). */
export async function ensureItemByName(name, unit, vat) {
    const clean = sv(name).trim();
    if (!clean) return;
    const found = state.items.find((i) => i.name.toLowerCase() === clean.toLowerCase());
    if (found) return;
    await saveItem({ id: null, name: clean, unit: unit || 'ks', vat: num(vat) || 0, price: 0 });
}

export async function removeItem(id) {
    state.items = state.items.filter((i) => i.id !== id);
    await db.del('items', id);
    emit('sidebar');
}

export async function saveUnit(unit) {
    if (!unit.id) unit.id = uid('unit');
    await db.put('units', unit);
    if (!state.units.some((u) => u.id === unit.id)) state.units.push(unit);
    emit('sidebar');
    return unit;
}

export async function removeUnit(id) {
    state.units = state.units.filter((u) => u.id !== id);
    await db.del('units', id);
    emit('sidebar');
}

/* --------------------------- faktury ------------------------------------ */

export function createDraft() {
    const company = activeCompany();
    const today = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const issueDate = today.getFullYear() + '-' + p(today.getMonth() + 1) + '-' + p(today.getDate());
    const firstCustomer = state.customers[0] || null;
    return {
        id: uid('inv'),
        companyId: company ? company.id : null,
        number: '',
        numberCommitted: false,
        vs: '',
        ks: '', ss: '',
        issueDate,
        dueDate: addDaysLocal(issueDate, company ? company.dueDays : 14),
        customerId: firstCustomer ? firstCustomer.id : '',
        customerSnapshot: firstCustomer ? snapshotCustomer(firstCustomer) : emptyCustomerSnapshot(),
        companySnapshot: snapshotCompany(company),
        rows: [emptyRow(company ? company.platceDPH : true)],
        note: '', contractNo: '', projectNo: '', orderNo: '',
        rounding: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function addDaysLocal(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + (Number(days) || 0));
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export const emptyRow = (platce = true) => ({ name: '', unit: 'ks', quantity: '1', price: '', discount: '0', vat: platce ? '21' : '0' });

export const snapshotCustomer = (c) => ({
    name: sv(c && c.name), ico: sv(c && c.ico), dic: sv(c && c.dic),
    address: sv(c && c.address), account: sv(c && c.account),
    email: sv(c && c.email), phone: sv(c && c.phone),
});

export const emptyCustomerSnapshot = () => ({ name: '', ico: '', dic: '', address: '', account: '', email: '', phone: '' });

export const snapshotCompany = (c) => ({
    name: sv(c && c.name), ico: sv(c && c.ico), dic: sv(c && c.dic), address: sv(c && c.address),
    account: sv(c && c.account), bank: sv(c && c.bank), email: sv(c && c.email),
    phone: sv(c && c.phone), web: sv(c && c.web), platceDPH: !!(c && c.platceDPH),
    paymentMessage: sv(c && c.paymentMessage), invoiceFooter: sv(c && c.invoiceFooter),
});

/**
 * Údaje dodavatele pro tisk a QR platbu: bere se snapshot z faktury, ale
 * **prázdná** pole doplní z aktuálních údajů firmy. Bez toho by u faktur
 * vzniklých importem (kdy firma ještě neměla vyplněný účet) chyběl QR kód
 * a v hlavičce by bylo „—“.
 */
export function companyForInvoice(invoice) {
    const live = state.companies.find((c) => c.id === invoice.companyId);
    const result = snapshotCompany(live || {});
    const stored = invoice.companySnapshot || {};
    for (const key of Object.keys(result)) {
        if (key === 'platceDPH') { result.platceDPH = !!stored.platceDPH; continue; }
        const value = sv(stored[key]);
        if (value) result[key] = stored[key];
    }
    return result;
}

/** Zahodí neuložený koncept (číslo se nevyplýtvá). */
export function discardDraft() {
    state.editing = null;
    state.editingSaved = false;
    state.view = 'overview';
    emit('all');
}

/** Převede koncept na skutečné číslo a zvýší počítadlo firmy. */
export async function commitNumber(invoice) {
    if (invoice.numberCommitted) return invoice.number;
    const company = state.companies.find((c) => c.id === invoice.companyId);
    if (!company) throw new Error('Faktura nemá firmu.');
    const year = sv(invoice.issueDate).slice(0, 4);
    const counter = counterFor(company, year) + 1;
    if (counter > 9999) throw new Error('Číselná řada pro rok ' + year + ' je vyčerpaná (max. 9999).');
    company.counters = Object.assign({}, company.counters, { [year]: counter });
    invoice.number = formatNumber(company, year, counter);
    invoice.vs = vsFromNumber(invoice.number);
    invoice.numberCommitted = true;
    await db.put('companies', company);
    return invoice.number;
}

const persistEditing = debounce(async () => {
    const invoice = state.editing;
    if (!invoice) return;
    let committed = false;
    if (!state.editingSaved) {
        if (!isMeaningful(invoice)) return;
        try {
            await commitNumber(invoice);
        } catch (err) {
            console.error(err);
            return;
        }
        state.editingSaved = true;
        state.invoices.push(invoice);
        committed = true;
    }
    invoice.updatedAt = new Date().toISOString();
    await db.put('invoices', invoice);
    emit('sidebar');
    if (committed) emit('editor');
}, 500);

/** Zavolá se po každé změně v editoru (nevykresluje znovu – kvůli fokusu). */
export function touchInvoice() {
    state.dirty = true;
    persistEditing();
}

/** Okamžité uložení (při opuštění editoru). */
export async function flushEditing() {
    const invoice = state.editing;
    if (!invoice) return;
    if (!state.editingSaved) {
        if (!isMeaningful(invoice)) { state.editing = null; return; }
        await commitNumber(invoice);
        state.editingSaved = true;
        state.invoices.push(invoice);
    }
    invoice.updatedAt = new Date().toISOString();
    await db.put('invoices', invoice);
    await ensureInvoiceItems(invoice);
    const company = state.companies.find((c) => c.id === invoice.companyId);
    if (company) await db.put('companies', company);
}

/** Dopíše nové názvy položek do číselníku (jen jednou). */
async function ensureInvoiceItems(invoice) {
    for (const row of invoice.rows || []) {
        const name = sv(row.name).trim();
        if (!name) continue;
        if (!state.items.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
            await saveItem({ id: null, name, unit: row.unit || 'ks', vat: num(row.vat) || 0, price: 0 });
        }
    }
}

export function openInvoice(invoiceId) {
    const invoice = state.invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;
    state.editing = invoice;
    state.editingSaved = true;
    state.view = 'invoice';
    state.dirty = false;
    emit();
}

export async function deleteInvoice(invoiceId) {
    state.invoices = state.invoices.filter((i) => i.id !== invoiceId);
    await db.del('invoices', invoiceId);
    for (const payment of state.payments) {
        if ((payment.allocations || []).some((a) => a.invoiceId === invoiceId)) {
            payment.allocations = payment.allocations.filter((a) => a.invoiceId !== invoiceId);
            await db.put('payments', payment);
        }
    }
    if (state.editing && state.editing.id === invoiceId) { state.editing = null; state.view = 'overview'; }
    emit();
}

export async function duplicateInvoice(invoice) {
    const company = activeCompany();
    const draft = JSON.parse(JSON.stringify(invoice));
    draft.id = uid('inv');
    draft.number = '';
    draft.numberCommitted = false;
    draft.vs = '';
    draft.rows = draft.rows.map((r) => Object.assign({}, r, { vat: company && company.platceDPH ? num(r.vat) : 0 }));
    draft.companyId = company ? company.id : invoice.companyId;
    draft.companySnapshot = snapshotCompany(company);
    draft.createdAt = draft.updatedAt = new Date().toISOString();
    draft.contractNo = draft.projectNo = draft.orderNo = '';
    draft.note = '';
    draft.rounding = !!invoice.rounding;
    state.editing = draft;
    state.editingSaved = false;
    state.view = 'invoice';
    state.dirty = true;
    emit();
    return draft;
}

/** Náhled čísla pro editor (nezvyšuje počítadlo). */
export function editorNumberPreview(invoice) {
    if (invoice.number) return invoice.number;
    const company = state.companies.find((c) => c.id === invoice.companyId);
    if (!company) return '';
    return previewNumber(company, sv(invoice.issueDate).slice(0, 4));
}

/* --------------------------- platby ------------------------------------- */

export async function savePayment(payment) {
    await db.put('payments', payment);
    if (!state.payments.some((p) => p.id === payment.id)) state.payments.push(payment);
    emit();
    return payment;
}

export async function removePayment(id) {
    state.payments = state.payments.filter((p) => p.id !== id);
    await db.del('payments', id);
    emit();
}

export async function allocate(paymentId, invoiceId, amount) {
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Platba nenalezena.');
    const value = Math.round((Number(amount) || 0) * 100) / 100;
    if (value <= 0) throw new Error('Částka musí být větší než 0.');
    const free = Math.round((payment.amount - allocatedTotal(payment)) * 100) / 100;
    if (value > free + 0.005) throw new Error('Platba už je rozdělena – volná částka je ' + free.toFixed(2) + ' Kč.');
    payment.allocations = payment.allocations || [];
    const existing = payment.allocations.find((a) => a.invoiceId === invoiceId);
    if (existing) existing.amount = Math.round((existing.amount + value) * 100) / 100;
    else payment.allocations.push({ invoiceId, amount: value, at: new Date().toISOString() });
    await db.put('payments', payment);
    emit();
}

export async function deallocate(paymentId, invoiceId) {
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) return;
    payment.allocations = (payment.allocations || []).filter((a) => a.invoiceId !== invoiceId);
    await db.put('payments', payment);
    emit();
}

export const allocatedTotal = (payment) =>
    Math.round((payment.allocations || []).reduce((s, a) => s + num(a.amount), 0) * 100) / 100;

/** Ruční označení faktury jako zaplacené (vytvoří „ruční“ úhradu). */
export async function markInvoicePaid(invoiceId) {
    const invoice = state.invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;
    const remaining = remainingOf(invoice);
    if (remaining <= 0.005) return;
    const now = new Date().toISOString();
    await savePayment({
        id: uid('pay'),
        companyId: invoice.companyId,
        account: '', docNumber: 'ruční',
        valueDate: now.slice(0, 10),
        amount: remaining,
        vs: sv(invoice.vs), ks: '', ss: '',
        contraAccount: '', contraBank: '',
        message: 'Ruční označení úhrady', dueDate: '',
        kind: 'manual',
        allocations: [{ invoiceId, amount: remaining, at: now }],
        fingerprint: 'manual|' + invoiceId + '|' + now,
        importedAt: now, sourceFile: '',
    });
}

/** Odebere vazby faktury na platby. Bankovní platby jen na vyžádání. */
export async function clearInvoicePayments(invoiceId, options = {}) {
    let manual = 0;
    let bank = 0;
    for (const payment of state.payments.slice()) {
        const allocation = (payment.allocations || []).find((a) => a.invoiceId === invoiceId);
        if (!allocation) continue;
        if (payment.kind === 'manual') { await removePayment(payment.id); manual++; }
        else if (options.includeBank) { await deallocate(payment.id, invoiceId); bank++; }
    }
    emit('all');
    return { manual, bank };
}

export const freeAmount = (payment) => Math.round((payment.amount - allocatedTotal(payment)) * 100) / 100;

/** Stav platby – používá se pro filtr i pro odznak v přehledu plateb. */
export function paymentState(payment) {
    if (payment.kind === 'internal') return 'internal';
    if (payment.kind === 'refund') return 'refund';
    if (payment.kind === 'interest') return 'interest';
    if (payment.kind === 'manual') return 'matched';
    if (freeAmount(payment) <= 0.005) return 'matched';
    return allocatedTotal(payment) > 0 ? 'partial' : 'unmatched';
}

export const PAYMENT_STATE_LABEL = {
    matched: 'Zaúčtováno', partial: 'Částečně', unmatched: 'Nezaúčtováno',
    refund: 'Vratka', internal: 'Vlastní převod', interest: 'Úrok',
};

/**
 * Účty, ze kterých chodí vratky pojistného a daně – nejsou zdanitelný příjem.
 * Seznam je uživatelský (regionální OSSZ mají každá vlastní účet); stačí jednou
 * označit platbu jako vratku a účet se sem doplní sám.
 */
export const refundAccounts = () => state.settings.refundAccounts || [];

export function refundAccountFor(payment) {
    const account = normAccount(payment.contraAccount);
    const bank = digitsOnly(payment.contraBank);
    return refundAccounts().find((r) =>
        normAccount(r.account) === account && (!digitsOnly(r.bank) || digitsOnly(r.bank) === bank)) || null;
}

export async function addRefundAccount(account, bank, name) {
    const clean = accountDigits(account);
    if (!clean) return null;
    const list = refundAccounts().slice();
    const exists = list.find((r) => normAccount(r.account) === normAccount(clean) && digitsOnly(r.bank) === digitsOnly(bank));
    if (exists) { exists.name = name || exists.name; }
    else list.push({ account: clean, bank: digitsOnly(bank), name: sv(name) });
    state.settings.refundAccounts = list;
    await db.setMeta('settings', state.settings);
    emit('all');
    return list;
}

export async function removeRefundAccount(index) {
    const list = refundAccounts().slice();
    list.splice(Number(index), 1);
    state.settings.refundAccounts = list;
    await db.setMeta('settings', state.settings);
    emit('all');
}

/** Uloží seznam účtů pro vratky (z Nastavení). */
export async function saveRefundAccounts(list) {
    state.settings.refundAccounts = (list || []).map((r) => ({
        account: accountDigits(r.account) || sv(r.account).trim(),
        bank: digitsOnly(r.bank),
        name: sv(r.name).trim() || 'Vratka',
    }));
    await db.setMeta('settings', state.settings);
    emit('sidebar');
}

/**
 * Nespárované (dosud nikam nepřiřazené) příchozí platby ze stejného protiúčtu jako
 * daná platba – používá se pro hromadné označení vratky / vlastního převodu.
 */
export function unmatchedSameAccount(payment) {
    const account = normAccount(payment.contraAccount);
    const bank = digitsOnly(payment.contraBank);
    return state.payments.filter((p) =>
        p.id !== payment.id &&
        p.kind === 'invoice' &&
        paymentState(p) === 'unmatched' &&
        normAccount(p.contraAccount) === account &&
        (!bank || digitsOnly(p.contraBank) === bank));
}

/**
 * Přepne platbu (nebo více plateb) na daný druh: `'refund'` (vratka), `'internal'`
 * (vlastní převod), `'interest'` (připsání úroků) nebo `'invoice'` (běžný příjem).
 * U vratky si navíc zapamatuje účet pro budoucí importy. Uloží najednou a překreslí jen jednou.
 */
export async function setPaymentsKind(ids, kind) {
    const list = Array.isArray(ids) ? ids : [ids];
    for (const id of list) {
        const payment = state.payments.find((p) => p.id === id);
        if (!payment) continue;
        if (kind === 'refund') {
            const known = refundAccountFor(payment);
            payment.kind = 'refund';
            payment.refundName = known ? known.name : 'Vratka';
            payment.allocations = [];
            await addRefundAccount(payment.contraAccount, payment.contraBank, payment.refundName);
        } else if (kind === 'internal' || kind === 'interest') {
            payment.kind = kind;
            delete payment.refundName;
            payment.allocations = [];
        } else {
            payment.kind = 'invoice';
            delete payment.refundName;
        }
        await db.put('payments', payment);
    }
    emit('all');
}

/** Přepne platbu na vratku (a účet si zapamatuje) nebo zpět na běžný příjem. */
export const setPaymentRefund = (paymentId, isRefund) =>
    setPaymentsKind([paymentId], isRefund ? 'refund' : 'invoice');

/** Přepne platbu na vlastní převod (převod mezi vlastními účty) nebo zpět na běžný příjem. */
export const setPaymentInternal = (paymentId, isInternal) =>
    setPaymentsKind([paymentId], isInternal ? 'internal' : 'invoice');

export function invoicesForPayment(payment) {
    const companyId = payment.companyId;
    return state.invoices
        .filter((i) => i.companyId === companyId)
        .sort((a, b) => sv(b.issueDate).localeCompare(sv(a.issueDate)));
}

/* ------------------------ import ABO výpisu ----------------------------- */

export async function importAbo(text, fileName) {
    const { header, items } = parseAbo(text);
    const statementAccount = accountDigits(header.account);

    const company = state.companies.find((c) =>
        accountDigits(c.account).padStart(16, '0').slice(-16) === statementAccount.padStart(16, '0').slice(-16)) ||
        activeCompany();
    if (!company) throw new Error('Není vybraná firma.');

    const ownAccounts = state.companies.map((c) => ({ account: c.account, bankCode: accountBankCode(c.account) }));
    // Otisk platby se počítá z VS už bez levých nul; u dřív importovaných plateb
    // (kde VS měl ještě nuly z výpisu) si otisk přepočítáme, ať se neimportují znovu.
    const known = new Set();
    for (const payment of state.payments) {
        known.add(payment.fingerprint);
        const parts = sv(payment.fingerprint).split('|');
        if (parts.length === 8) { parts[5] = normVs(parts[5]); known.add(parts.join('|')); }
    }
    const now = new Date().toISOString();

    const stats = { total: items.length, imported: 0, duplicates: 0, outgoing: 0, internal: 0, refunds: 0, matched: 0, unmatched: 0 };
    const created = [];

    for (const item of items) {
        if (!item.credit) { stats.outgoing++; continue; }
        const fingerprint = fingerprintOf(item, statementAccount);
        if (known.has(fingerprint)) { stats.duplicates++; continue; }
        const kind = classify(item, ownAccounts) === 'internal' ? 'internal' : 'invoice';
        if (kind === 'internal') stats.internal++;
        const refund = kind === 'invoice' ? refundAccountFor({ contraAccount: item.contraAccount, contraBank: item.contraBank }) : null;
        if (refund) stats.refunds++;

        const payment = {
            id: uid('pay'),
            companyId: company.id,
            account: statementAccount,
            docNumber: item.docNumber,
            valueDate: item.valueDate,
            amount: item.amount,
            vs: item.vs, ks: item.ks, ss: item.ss,
            contraAccount: item.contraAccount, contraBank: item.contraBank,
            message: item.message, dueDate: item.dueDate,
            kind: refund ? 'refund' : kind,
            refundName: refund ? refund.name : undefined,
            allocations: [],
            fingerprint,
            statementNo: header.statementNo,
            importedAt: now,
            sourceFile: fileName || '',
        };
        await db.put('payments', payment);
        state.payments.push(payment);
        known.add(fingerprint);
        created.push(payment);
        stats.imported++;
    }

    // automatické párování: přesná shoda VS + celé částky
    for (const payment of created) {
        if (payment.kind !== 'invoice') continue;
        const match = findAutoMatch(payment);
        if (!match) { stats.unmatched++; continue; }
        payment.allocations = [{ invoiceId: match.id, amount: payment.amount, at: now }];
        await db.put('payments', payment);
        stats.matched++;
    }

    emit();
    return { stats, header };
}

function findAutoMatch(payment) {
    if (!payment.vs) return null;
    const candidates = state.invoices.filter((i) =>
        i.companyId === payment.companyId && normVs(i.vs) === normVs(payment.vs));
    if (candidates.length !== 1) return null;
    const invoice = candidates[0];
    const remaining = remainingOf(invoice);
    if (Math.abs(remaining - payment.amount) > 0.005) return null;
    if (paidAmount(invoice.id) > 0 && remaining <= 0.005) return null;
    return invoice;
}

/* ----------------------------- témata ----------------------------------- */

export async function setTheme(themeId) {
    state.settings.theme = themeId;
    await db.setMeta('settings', state.settings);
    // jen téma – nepřekreslujeme celou stránku (držíme scroll i pozici v Nastavení)
    emit('theme');
}

export async function addCustomTheme(theme) {
    const list = (state.settings.customThemes || []).filter((t) => t.id !== theme.id);
    list.push({ id: theme.id, name: theme.name, dark: !!theme.dark, vars: theme.vars });
    state.settings.customThemes = list;
    await db.setMeta('settings', state.settings);
    emit('all');
}

export async function removeCustomTheme(themeId) {
    state.settings.customThemes = (state.settings.customThemes || []).filter((t) => t.id !== themeId);
    if (state.settings.theme === themeId) state.settings.theme = 'light';
    await db.setMeta('settings', state.settings);
    emit('all');
}

/* --------------------------- zálohy / import ---------------------------- */

export async function exportData() {
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        companies: state.companies,
        customers: state.customers,
        items: state.items,
        units: state.units,
        invoices: state.invoices,
        payments: state.payments,
        settings: state.settings,
    };
}

/** Zapamatuje si čas poslední zálohy – podle něj se připomíná další. */
export async function markBackupDone() {
    state.settings.lastBackupAt = new Date().toISOString();
    await db.setMeta('settings', state.settings);
    emit('sidebar');
    emit('main');
}

/** Uloží obecné nastavení aplikace (např. připomínání zálohy). */
export async function setSetting(key, value) {
    state.settings[key] = value;
    await db.setMeta('settings', state.settings);
    emit('sidebar');
}

export async function importData(data) {
    if (!data || !Array.isArray(data.companies) || !data.companies.length) {
        throw new Error('Soubor neobsahuje platná data (chybí firmy).');
    }
    await db.clearAll();
    await db.putMany('companies', data.companies);
    await db.putMany('customers', data.customers || []);
    await db.putMany('items', data.items || []);
    await db.putMany('units', data.units || []);
    await db.putMany('invoices', data.invoices || []);
    await db.putMany('payments', data.payments || []);
    const settings = Object.assign({}, data.settings || {}, { demo: false });
    await db.setMeta('settings', settings);
    const maxCode = data.companies.reduce((m, c) => Math.max(m, Number(c.code) || 0), 0);
    await db.setMeta('lastCompanyCode', maxCode);

    state.companies = data.companies;
    sortCompanies();
    state.customers = data.customers || [];
    state.items = data.items || [];
    state.units = data.units || [];
    state.invoices = data.invoices || [];
    state.payments = data.payments || [];
    state.settings = settings;
    state.editing = null;
    state.view = 'overview';
    state.activeCompanyId = (state.companies.find((c) => c.id === settings.activeCompanyId) || state.companies[0]).id;
    emit();
}

/* --------------------- import dokladů z jiných systémů ------------------- */

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Když číslo dováženého dokladu odpovídá naší číselné řadě (prefix + rok +
 * kód firmy + pořadí), posune se počítadlo, aby nové faktury navázaly.
 */
function bumpCounterFromNumber(company, number) {
    const prefix = sv(company.prefix);
    const code = sv(company.code);
    if (!prefix || !code) return;
    const match = sv(number).match(new RegExp('^' + escapeRe(prefix) + '(\\d{4})' + escapeRe(code) + '(\\d{4})$'));
    if (!match) return;
    const year = match[1];
    const counter = Number(match[2]);
    if (counter > counterFor(company, year)) {
        company.counters = Object.assign({}, company.counters, { [year]: counter });
    }
}

/**
 * Hromadný import faktur (Flexi XML / ISDOC). Odběratele, položky i měrné
 * jednotky doplní do číselníků, pokud tam ještě nejsou. Doklady se stejným
 * číslem ve stejné firmě přeskočí (opakovaný import nic nezduplikuje).
 *
 * @param {Array} drafts  doklady rozparsované v js/import.js
 * @param {{companyId?:string}} [options]
 * @returns {Promise<{invoices:number,skipped:number,customers:number,items:number,units:number,warnings:string[]}>}
 */
export async function importInvoices(drafts, options = {}) {
    const company = (options.companyId && state.companies.find((c) => c.id === options.companyId)) || activeCompany();
    if (!company) throw new Error('Není vybraná žádná firma.');

    const stats = { invoices: 0, skipped: 0, customers: 0, items: 0, units: 0, headerOnly: 0, filled: [], warnings: [] };
    const companySnapshot = snapshotCompany(company);

    // Firma bez bankovního účtu by nemohla mít na faktuře QR platbu – když účet
    // zná importovaný doklad (ISDOC), doplníme ho (nikdy nepřepisujeme).
    const draftAccount = drafts.map((d) => sv(d.account)).find(Boolean);
    if (!sv(company.account) && draftAccount) {
        company.account = draftAccount;
        await db.put('companies', company);
        stats.filled.push('bankovní účet firmy ' + draftAccount);
    }
    const label = (draft) => draft.number ? 'Doklad ' + draft.number : 'Doklad bez čísla';

    for (const draft of drafts) {
        const number = sv(draft.number).trim();
        if (!number) { stats.warnings.push(label(draft) + ' nemá číslo – přeskočen.'); continue; }
        if (state.invoices.some((i) => i.companyId === company.id && sv(i.number).trim() === number)) {
            stats.skipped++;
            continue;
        }

        // 1) odběratel – podle IČO, jinak podle názvu; existující údaje nepřepisujeme
        const wanted = draft.customer || {};
        const ico = digitsOnly(wanted.ico);
        const name = sv(wanted.name).trim();
        let customer = ico ? state.customers.find((c) => digitsOnly(c.ico) === ico) : null;
        if (!customer && name) {
            customer = state.customers.find((c) => sv(c.name).trim().toLowerCase() === name.toLowerCase()) || null;
        }
        if (!customer) {
            if (!name) { stats.warnings.push(label(draft) + ' nemá odběratele – přeskočen.'); continue; }
            customer = {
                id: uid('cu'), name, ico, dic: sv(wanted.dic), address: sv(wanted.address),
                account: '', email: sv(wanted.email), phone: sv(wanted.phone),
            };
            stats.customers++;
            await saveCustomer(customer);
        } else {
            let changed = false;
            for (const key of ['ico', 'dic', 'address', 'email', 'phone']) {
                const value = sv(wanted[key]);
                if (value && !sv(customer[key])) { customer[key] = value; changed = true; }
            }
            if (changed) await saveCustomer(customer);
        }

        // 2) řádky + automatické doplnění číselníků
        const rows = [];
        for (const row of draft.rows || []) {
            const rowName = sv(row.name).trim();
            if (!rowName) continue;
            const unit = sv(row.unit).trim() || 'ks';
            if (!state.units.some((u) => sv(u.name).toLowerCase() === unit.toLowerCase())) {
                await saveUnit({ id: null, name: unit });
                stats.units++;
            }
            if (!state.items.some((i) => sv(i.name).toLowerCase() === rowName.toLowerCase())) {
                await saveItem({ id: null, name: rowName, unit, vat: num(row.vat) || 0, price: num(row.price) || 0 });
                stats.items++;
            }
            rows.push({
                name: rowName,
                unit,
                quantity: String(num(row.quantity) || 1),
                price: String(num(row.price) || 0),
                discount: String(num(row.discount) || 0),
                vat: String(num(row.vat) || 0),
            });
        }
        if (!rows.length) { stats.warnings.push(label(draft) + ' nemá žádné řádky – přeskočen.'); continue; }

        // 3) faktura – číslo zůstává originální, aby šla dohledat ve starém systému
        const issueDate = sv(draft.issueDate) || new Date().toISOString().slice(0, 10);
        const invoice = {
            id: uid('inv'),
            companyId: company.id,
            number,
            numberCommitted: true,
            vs: digitsOnly(draft.vs) || vsFromNumber(number),
            ks: sv(draft.ks),
            ss: sv(draft.ss),
            issueDate,
            dueDate: sv(draft.dueDate) || issueDate,
            customerId: customer.id,
            customerSnapshot: snapshotCustomer(customer),
            companySnapshot,
            rows,
            note: sv(draft.note),
            contractNo: sv(draft.contractNo),
            projectNo: '',
            orderNo: sv(draft.orderNo),
            rounding: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            importedFrom: sv(draft.source),
        };
        await db.put('invoices', invoice);
        state.invoices.push(invoice);
        stats.invoices++;
        if (draft.headerOnly) stats.headerOnly++;
        bumpCounterFromNumber(company, number);

        // 4) kontrola součtu proti původnímu dokladu
        if (num(draft.total)) {
            const computed = Math.round(invoiceTotals(invoice).payable * 100) / 100;
            if (Math.abs(computed - num(draft.total)) > 0.05) {
                stats.warnings.push(label(draft) + ': součet z řádků ' + computed + ' Kč ≠ ' +
                    num(draft.total) + ' Kč v původním dokladu.');
            }
        }
    }

    if (stats.invoices) {
        await db.put('companies', company);
        sortCompanies();
        emit('all');
    }
    return stats;
}
