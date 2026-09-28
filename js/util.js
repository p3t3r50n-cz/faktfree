/* Obecné pomocné funkce – bez závislostí. */

export const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const sv = (v) => (v == null ? '' : String(v));

export const num = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export const pad2 = (n) => String(n).padStart(2, '0');

export function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function addDays(iso, days) {
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export const yearOf = (iso) => {
    const s = String(iso || '').slice(0, 4);
    return /^\d{4}$/.test(s) ? s : String(new Date().getFullYear());
};

export const monthOf = (iso) => String(iso || '').slice(5, 7);

/** "1 234,56" */
export const fmtCZK = (v) => (Number(v) || 0).toLocaleString('cs-CZ', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** "1 234,56 Kč" (s pevnou mezerou před Kč) */
export const fmtMoney = (v) => fmtCZK(v) + '\u00a0Kč';

/** "29.07.2026" */
export function fmtDate(iso) {
    const s = String(iso || '').slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : (sv(iso) || '—');
}

/** "29. 7. 2026" – pro lidský výpis */
export function fmtDateHuman(iso) {
    const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (Number(m[3]) + '. ' + Number(m[2]) + '. ' + m[1]) : (sv(iso) || '—');
}

export function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function debounce(fn, ms) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

export function digitsOnly(v) {
    return sv(v).replace(/\D/g, '');
}

/** Rozdělí částku na "tisíce" pro ruční formátování, případně vrátí null. */
export function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
