/* ---------------------------------------------------------------------------
 * Fakturační logika: částky, DPH, číslování, stav úhrady, QR platba (SPD).
 * ------------------------------------------------------------------------- */
import { sv, num, r2, todayStr, digitsOnly } from './util.js';

export const VAT_RATES = [0, 12, 21];
export const DEFAULT_UNITS = ['ks', 'hod', 'den', 'měsíc', 'km', 'paušál', 'kg', 'm'];

/* --------------------------- částky a DPH -------------------------------- */

export function isHourUnit(unit) {
    return ['h', 'hod', 'hodin', 'hour', 'hours'].includes(sv(unit).trim().toLowerCase());
}

export function quantityOf(row) {
    const value = sv(row && row.quantity).trim();
    if (isHourUnit(row && row.unit) && value.includes(':')) {
        const match = value.match(/^(\d+):([0-5]\d)$/);
        return match ? Number(match[1]) + Number(match[2]) / 60 : 0;
    }
    return num(value);
}

export function rowBase(row) {
    return r2(num(row.price) * quantityOf(row) * (1 - num(row.discount) / 100));
}
export function rowVat(row) {
    return r2(rowBase(row) * num(row.vat) / 100);
}
export function rowTotal(row) {
    const total = r2(rowBase(row) + rowVat(row));
    return isHourUnit(row && row.unit) ? Math.round(total) : total;
}

/**
 * Součty faktury.
 * @param {Array} rows
 * @param {boolean} rounding  zaokrouhlit celkovou částku na celé Kč
 */
export function totals(rows, rounding) {
    let base = 0, vat = 0;
    let total = 0;
    const byRate = { 0: 0, 12: 0, 21: 0 };
    for (const row of rows || []) {
        const b = rowBase(row);
        const v = rowVat(row);
        base += b; vat += v; total += rowTotal(row);
        const rate = num(row.vat) || 0;
        byRate[rate] = (byRate[rate] || 0) + v;
    }
    total = r2(total);
    const payable = rounding ? Math.round(total) : total;
    return {
        base: r2(base), vat: r2(vat), byRate,
        total, payable: r2(payable), diff: r2(payable - total),
    };
}

export const invoiceTotals = (invoice) => totals(invoice && invoice.rows, !!(invoice && invoice.rounding));

/* ------------------------------ číslování -------------------------------- */

/**
 * Číslo faktury: [prefix][YYYY][kód firmy 2][pořadí 4], např. FA2026010001.
 * Pořadí se resetuje na začátku roku, drží se zvlášť pro každou firmu.
 */
export function formatNumber(company, year, counter) {
    return sv(company.prefix) + String(year) + sv(company.code) + String(counter).padStart(4, '0');
}

export function counterFor(company, year) {
    return Number((company.counters || {})[year] || 0);
}

/** Následující číslo (náhled) – ještě nezvyšuje počítadlo. */
export function previewNumber(company, year) {
    return formatNumber(company, year, counterFor(company, year) + 1);
}

/** Variabilní symbol = posledních 10 číslic z čísla faktury. */
export function vsFromNumber(number) {
    return digitsOnly(number).slice(-10);
}

/* --------------------------- stav úhrady --------------------------------- */

export function paidAmountOf(invoice, payments) {
    let paid = 0;
    for (const p of payments || []) {
        for (const a of p.allocations || []) {
            if (a.invoiceId === invoice.id) paid += num(a.amount);
        }
    }
    return r2(paid);
}

/**
 * @returns {'paid'|'overdue'|'partial'|'open'}
 */
export function statusOf(invoice, paid) {
    const total = invoiceTotals(invoice).payable;
    if (paid >= total - 0.005) return 'paid';
    const due = sv(invoice.dueDate).slice(0, 10);
    if (due && due < todayStr()) return 'overdue';
    if (paid > 0.005) return 'partial';
    return 'open';
}

export const STATUS_LABEL = {
    paid: 'Zaplaceno',
    overdue: 'Po splatnosti',
    partial: 'Částečně uhrazeno',
    open: 'Nezaplaceno',
};

/* ------------------------------ QR platba -------------------------------- */

/** "123456-1234567890/0300" -> IBAN (mod 97); platný IBAN ponechá beze změny. */
export function ibanFromAccount(value) {
    const raw = sv(value).toUpperCase().replace(/\s+/g, '');
    if (!raw) return '';
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(raw)) return raw;
    const parts = raw.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    const bank = parts[parts.length - 1].replace(/\D/g, '');
    const acc = parts.slice(0, -1).join('').replace(/\D/g, '');
    if (bank.length !== 4 || acc === '') return '';
    const bban = (bank + acc.padStart(16, '0')).slice(0, 20);
    let rem;
    try {
        rem = BigInt(bban + '123500') % 97n;
    } catch (e) { return ''; }
    return 'CZ' + String(98n - rem).padStart(2, '0') + bban;
}

/** Platební řetězec SPD 1.0 pro QR platbu. */
export function buildSpd(company, invoice, amount) {
    const acc = ibanFromAccount(company && company.account);
    if (!acc) return '';
    const vs = digitsOnly(invoice && invoice.vs).slice(0, 10);
    let p = 'SPD*1.0*ACC:' + acc + '*AM:' + (Number(amount) || 0).toFixed(2) + '*CC:CZK';
    if (vs) p += '*X-VS:' + vs;
    if (company.paymentMessage) p += '*MSG:' + company.paymentMessage;
    if (company.name) p += '*RN:' + company.name;
    return p + '*PT:IP';
}
