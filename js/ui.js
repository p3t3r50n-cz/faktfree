/* ---------------------------------------------------------------------------
 * UI pomocníci: toasty, modaly, potvrzovací a formulářové dialogy.
 * ------------------------------------------------------------------------- */
import { esc, sv } from './util.js';
import { icon } from './icons.js';

/* ------------------------------- toasty ---------------------------------- */

export function toast(message, kind = 'info', ms = 3200) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = sv(message);
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
}

/* ------------------------------- modaly ---------------------------------- */

/**
 * Obecný modal.
 * @param {{title?:string, bodyHtml?:string, buttons?:Array, size?:string, onMount?:Function}} opts
 * @returns {{promise:Promise<any>, close:Function, body:HTMLElement, modal:HTMLElement}}
 */
export function openModal(opts) {
    const { title = '', bodyHtml = '', buttons = [], size = '', onMount } = opts || {};

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
        '<div class="modal ' + esc(size) + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
        '<button type="button" class="icon-btn" data-close aria-label="Zavřít">' + icon('x-lg') + '</button></div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-foot"></div></div>';

    const modal = backdrop.querySelector('.modal');
    const body = backdrop.querySelector('.modal-body');
    const foot = backdrop.querySelector('.modal-foot');
    body.innerHTML = bodyHtml;

    let resolveFn = null;
    const promise = new Promise((res) => { resolveFn = res; });
    let closed = false;

    function close(value) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        resolveFn(value);
    }
    function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
    }
    document.addEventListener('keydown', onKey, true);

    for (const b of buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ' + (b.variant || '');
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
            if (b.onClick) {
                const v = b.onClick({ body, modal, close });
                if (v === false) return;
                close(v);
            } else {
                close(b.value);
            }
        });
        foot.appendChild(btn);
    }

    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(undefined); });
    backdrop.querySelector('[data-close]').addEventListener('click', () => close(undefined));
    document.body.appendChild(backdrop);

    const firstField = body.querySelector('input, select, textarea, button');
    if (firstField) setTimeout(() => firstField.focus(), 30);
    if (onMount) onMount({ body, modal, close });

    return { promise, close, body, modal };
}

/** Potvrzení. @returns {Promise<boolean>} */
export async function confirmDialog({ title, body, okLabel = 'Pokračovat', cancelLabel = 'Zrušit', danger = false }) {
    const { promise } = openModal({
        title,
        bodyHtml: '<p class="muted">' + esc(body) + '</p>',
        buttons: [
            { label: cancelLabel, value: false },
            { label: okLabel, variant: danger ? 'danger' : 'primary', value: true },
        ],
    });
    return (await promise) === true;
}

/* --------------------------- formulářový dialog -------------------------- */

function fieldHtml(field, value) {
    const id = 'f-' + field.key;
    const common = 'data-key="' + esc(field.key) + '" id="' + esc(id) + '"';
    let input;
    if (field.type === 'select') {
        input = '<select ' + common + '>' + (field.options || []).map((o) =>
            '<option value="' + esc(o.value) + '"' + (sv(value) === sv(o.value) ? ' selected' : '') + '>' +
            esc(o.label) + '</option>').join('') + '</select>';
    } else if (field.type === 'textarea') {
        input = '<textarea ' + common + ' rows="3">' + esc(value) + '</textarea>';
    } else if (field.type === 'checkbox') {
        return '<label class="inline"><input type="checkbox" ' + common + (value ? ' checked' : '') + '> ' + esc(field.label) + '</label>';
    } else {
        input = '<input type="' + esc(field.type || 'text') + '" ' + common +
            (field.min != null ? ' min="' + esc(field.min) + '"' : '') +
            (field.max != null ? ' max="' + esc(field.max) + '"' : '') +
            (field.step != null ? ' step="' + esc(field.step) + '"' : '') +
            (field.placeholder ? ' placeholder="' + esc(field.placeholder) + '"' : '') +
            ' value="' + esc(value) + '">';
    }
    return '<label class="field"><span>' + esc(field.label) + '</span>' + input +
        (field.hint ? '<small class="muted">' + esc(field.hint) + '</small>' : '') + '</label>';
}

function readFields(body, fields) {
    const out = {};
    for (const f of fields) {
        const el = body.querySelector('[data-key="' + f.key + '"]');
        if (!el) continue;
        out[f.key] = f.type === 'checkbox' ? el.checked : el.value;
    }
    return out;
}

/**
 * Formulářový dialog.
 * @returns {Promise<Object|null>} hodnoty nebo null při zrušení
 */
export function formDialog({ title, fields, values = {}, okLabel = 'Uložit', size = '', validate, onMount }) {
    const html = fields.map((f) => fieldHtml(f, values[f.key])).join('') +
        '<div class="dialog-error hidden" data-error></div>';

    return new Promise((resolve) => {
        const { promise } = openModal({
            title, bodyHtml: html, size, onMount,
            buttons: [
                { label: 'Zrušit', value: null },
                {
                    label: okLabel, variant: 'primary',
                    onClick: ({ body }) => {
                        const out = readFields(body, fields);
                        const errEl = body.querySelector('[data-error]');
                        const problem = validate ? validate(out) : null;
                        if (problem) {
                            errEl.textContent = problem;
                            errEl.classList.remove('hidden');
                            return false;
                        }
                        return out;
                    },
                },
            ],
        });
        promise.then((v) => resolve(v && typeof v === 'object' ? v : null));
    });
}

/** Jednoduchý dotaz na text. */
export async function promptDialog({ title, label, value = '', type = 'text', hint }) {
    const out = await formDialog({
        title,
        fields: [{ key: 'value', label, type, hint }],
        values: { value },
        validate: (v) => (sv(v.value).trim() === '' ? 'Hodnota nesmí být prázdná.' : null),
    });
    return out ? sv(out.value).trim() : null;
}

/** Zobrazí chybu (např. při práci s daty). */
export function alertDialog(title, message) {
    return openModal({
        title,
        bodyHtml: '<p class="muted">' + esc(message) + '</p>',
        buttons: [{ label: 'Zavřít', variant: 'primary', value: true }],
    }).promise;
}
