/* ---------------------------------------------------------------------------
 * FaktFree – vstupní bod aplikace.
 * ------------------------------------------------------------------------- */
import * as store from './store.js';
import { renderSidebar } from './views/sidebar.js';
import { renderOverview, bindOverview } from './views/overview.js';
import { renderInvoice, bindInvoice, refreshEditorChrome } from './views/invoice.js';
import { renderBank, bindBank } from './views/bank.js';
import { renderSettings, bindSettings } from './views/settings.js';
import { confirmDialog, toast } from './ui.js';
import { printInvoice } from './print.js';
import { sv } from './util.js';
import { icon } from './icons.js';
import { allThemes, ensureThemeStyles, resolveTheme } from './themes.js';
import { APP_NAME, APP_VERSION } from './appinfo.js';

/* ------------------------------ téma ------------------------------------ */

const mq = window.matchMedia('(prefers-color-scheme: dark)');

/** Aplikuje aktuální téma (konkrétní, nebo podle systému). */
export function applyTheme() {
    const custom = store.state.settings.customThemes || [];
    const themes = allThemes(custom);
    ensureThemeStyles(themes);

    const theme = resolveTheme(store.state.settings.theme || 'auto', mq.matches, custom);
    document.documentElement.setAttribute('data-theme', theme.id);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.vars['--primary'] || '#2563eb');
}
window.applyTheme = applyTheme;

mq.addEventListener('change', () => {
    if ((store.state.settings.theme || 'auto') === 'auto') applyTheme();
});

/* ---------------------------- vykreslení -------------------------------- */

function renderMain() {
    const main = document.getElementById('main');
    const view = store.state.view;
    if (view === 'invoice') renderInvoice(main);
    else if (view === 'bank') renderBank(main);
    else if (view === 'settings') renderSettings(main);
    else renderOverview(main);
    main.scrollTop = 0;
}

function renderAll() {
    applyTheme();
    renderSidebar();
    renderMain();
    updateVersionLabels();
}

/** Zobrazí u názvu aplikace verzi (lidská verze z `appinfo.js`). */
function updateVersionLabels() {
    const el = document.querySelector('[data-app-version]');
    if (!el) return;
    el.textContent = 'v' + APP_VERSION;
}

/* --------------------------- navigace ----------------------------------- */

async function navigate(view) {
    if (store.state.view === 'invoice' && view !== 'invoice') {
        await store.flushEditing();
    }
    if (view === 'settings' && store.state.view !== 'settings') store.state.storageInfo = null;
    store.state.view = view;
    if (view === 'invoice' && !store.state.editing) {
        store.state.editing = store.createDraft();
        store.state.editingSaved = false;
    }
    renderAll();
}

async function openInvoice(id) {
    if (store.state.view === 'invoice' && store.state.editing && store.state.editing.id !== id) {
        await store.flushEditing();
    }
    store.openInvoice(id);
    renderAll();
}

/* ------------------------ obecné akce ----------------------------------- */

document.addEventListener('click', async (e) => {
    const sidebarSelect = e.target.closest('#companySelect');
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    switch (action) {
        case 'go':
            await navigate(el.dataset.view);
            return;
        case 'new-invoice':
            if (store.state.view === 'invoice') await store.flushEditing();
            store.state.editing = store.createDraft();
            store.state.editingSaved = false;
            store.state.view = 'invoice';
            store.state.dirty = false;
            renderAll();
            return;
        case 'toggle-year': {
            const year = el.dataset.year;
            const inSidebar = !!el.closest('.tree');
            if (inSidebar && store.state.view !== 'overview') {
                // klik na ročník ve stromu faktur = přejít na přehled
                await store.flushEditing();
                store.state.selectedYear = year;
                store.state.view = 'overview';
                renderAll();
                return;
            }
            // klik na otevřený ročník ho sbalí, na sbalený ho otevře
            const willClose = el.dataset.open === '1' || store.state.selectedYear === year;
            store.state.selectedYear = willClose ? null : year;
            renderAll();
            return;
        }
        case 'open-invoice':
            await openInvoice(el.dataset.id);
            return;
        case 'clear-filters':
            store.state.filters = { year: 'all', month: 'all', status: 'all' };
            store.state.search = '';
            store.state.selectedYear = undefined;
            renderAll();
            return;
        case 'mark-paid': {
            const invoice = store.state.invoices.find((i) => i.id === el.dataset.id);
            if (!invoice) return;
            if (await confirmDialog({
                title: 'Označit jako zaplaceno?',
                body: 'Vytvoří se ruční úhrada ve výši zbývající částky ' + store.remainingOf(invoice).toFixed(2) + ' Kč.',
                okLabel: 'Označit',
            })) {
                await store.markInvoicePaid(invoice.id);
                toast('Faktura označena jako zaplacená.', 'ok');
            }
            return;
        }
        case 'unmark-paid': {
            const invoice = store.state.invoices.find((i) => i.id === el.dataset.id);
            if (!invoice) return;
            const manual = store.state.payments.filter((p) => p.kind === 'manual' && (p.allocations || []).some((a) => a.invoiceId === invoice.id));
            const bank = store.state.payments.filter((p) => p.kind !== 'manual' && (p.allocations || []).some((a) => a.invoiceId === invoice.id));
            if (!manual.length && !bank.length) {
                toast('Faktura nemá žádnou přiřazenou úhradu.', 'warn');
                return;
            }
            const parts = [];
            if (manual.length) parts.push(manual.length + '× ruční úhrada');
            if (bank.length) parts.push(bank.length + '× platba z banky');
            if (await confirmDialog({
                title: 'Zrušit úhradu?',
                body: 'U faktury ' + sv(invoice.number) + ' se odebere ' + parts.join(' a ') +
                    '. Platby samotné zůstanou v přehledu banky (zruší se jen vazba na fakturu).',
                okLabel: 'Zrušit úhradu', danger: true,
            })) {
                const result = await store.clearInvoicePayments(invoice.id, { includeBank: true });
                toast('Úhrada zrušena (' + result.manual + '× ruční, ' + result.bank + '× z banky).', 'ok');
            }
            return;
        }
        case 'print-invoice': {
            const invoice = store.state.invoices.find((i) => i.id === el.dataset.id);
            if (invoice) printInvoice(invoice, store.companyForInvoice(invoice), store.paidAmount(invoice.id));
            return;
        }
        case 'duplicate-invoice': {
            const invoice = store.state.invoices.find((i) => i.id === el.dataset.id);
            if (!invoice) return;
            await store.duplicateInvoice(invoice);
            renderAll();
            return;
        }
        case 'delete-invoice': {
            const invoice = store.state.invoices.find((i) => i.id === el.dataset.id);
            if (!invoice) return;
            if (await confirmDialog({
                title: 'Smazat fakturu?',
                body: 'Faktura ' + sv(invoice.number) + ' bude trvale odstraněna.',
                okLabel: 'Smazat', danger: true,
            })) {
                await store.deleteInvoice(invoice.id);
                toast('Faktura smazána.', 'ok');
            }
            return;
        }
        default:
            return;
    }
});

document.addEventListener('change', async (e) => {
    if (e.target.id === 'companySelect') {
        await store.setActiveCompany(e.target.value);
    }
});

/* --------------------------- start -------------------------------------- */

async function boot() {
    applyTheme();
    document.title = APP_NAME;

    const main = document.getElementById('main');
    bindInvoice(main);
    bindBank(main);
    bindSettings(main);
    bindOverview(main);

    store.subscribe((kind) => {
        if (!kind || kind === 'all') applyTheme();
        if (kind === 'sidebar' || kind === 'all' || !kind) renderSidebar();
        if (kind === 'main' || kind === 'all' || !kind) renderMain();
        if (kind === 'editor') refreshEditorChrome();
    });

    try {
        await store.init();
    } catch (err) {
        console.error(err);
        document.getElementById('main').innerHTML =
            '<div class="card"><h2>Chyba při startu</h2><p class="muted">' + sv(err && err.message) + '</p>' +
            '<p class="muted small">Zkuste prosím obnovit stránku. Pokud problém přetrvává, může jít o nedostupné úložiště ' +
            '(např. v anonymním režimu prohlížeče).</p></div>';
        return;
    }

    applyTheme();
    renderAll();

    // při odchodu ze stránky uložit rozepsanou fakturu
    window.addEventListener('pagehide', () => { store.flushEditing(); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') store.flushEditing();
    });

    // klávesové zkratky
    document.addEventListener('keydown', (e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === 's') {
            e.preventDefault();
            store.flushEditing().then(() => toast('Uloženo.', 'ok'));
        }
        if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'f') {
            const search = document.querySelector('[data-search]');
            if (search) { e.preventDefault(); search.focus(); search.select(); }
        }
        if (ctrl && e.altKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            document.querySelector('[data-action="new-invoice"]').click();
        }
    });

    // instalace PWA
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredInstallPrompt = e;
        const btn = document.querySelector('[data-action="install-pwa"]');
        if (btn) btn.hidden = false;
    });

    // service worker (offline režim + aktualizace aplikace)
    registerServiceWorker();
}

/* --------------------- aktualizace aplikace (PWA) ----------------------- */

let swRegistration = null;
let updateOffered = false;
const hadController = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'VERSION') {
            window.swVersion = event.data.version;
            updateVersionLabels();
        }
    });

    // nový service worker převzal kontrolu → stránka pořád běží ve staré verzi
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return;   // úplně první aktivace není aktualizace
        showUpdateBar();
    });

    try {
        swRegistration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
        if (swRegistration.waiting) showUpdateBar();
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
        }
        dropStaleRegistrations(swRegistration);
    } catch (err) {
        console.warn('Service worker se nepodařilo zaregistrovat:', err);
    }
}

/**
 * Úklid starých registrací. Aplikace dřív mohla běžet o úroveň výš (např. /faktfree/
 * místo /faktfree/pwa/). Taková registrace má širší scope, její skript se přesunul
 * (na původní adrese už je 404), takže se nikdy neaktualizuje – a její cache může
 * pořád obsahovat staré soubory naší aplikace. Proto ji zrušíme.
 */
async function dropStaleRegistrations(mine) {
    try {
        const myScope = new URL(mine.scope);
        for (const reg of await navigator.serviceWorker.getRegistrations()) {
            if (reg.scope === mine.scope) continue;
            const scope = new URL(reg.scope);
            if (scope.origin === myScope.origin && myScope.pathname.startsWith(scope.pathname)) {
                await reg.unregister();
            }
        }
    } catch (err) {
        console.warn('Staré registrace service workeru se nepodařilo uklidit:', err);
    }
}

function showUpdateBar() {
    if (updateOffered) return;
    updateOffered = true;
    const bar = document.createElement('div');
    bar.className = 'updatebar';
    bar.innerHTML =
        '<span>Je dostupná <strong>nová verze</strong> aplikace.</span>' +
        '<button class="btn primary small" data-update-now>Aktualizovat</button>' +
        '<button class="icon-btn" data-update-later aria-label="Zavřít" title="Zavřít">' + icon('x-lg') + '</button>';
    document.body.appendChild(bar);
    bar.querySelector('[data-update-now]').addEventListener('click', applyUpdate);
    bar.querySelector('[data-update-later]').addEventListener('click', () => bar.remove());
}

async function applyUpdate() {
    // ať uživatel nepřijde o rozepsanou fakturu
    try { await store.flushEditing(); } catch (e) { /* ignore */ }
    const waiting = swRegistration && swRegistration.waiting;
    if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        await new Promise((resolve) => setTimeout(resolve, 400));
    }
    location.reload();
}

/** Ruční kontrola aktualizací (tlačítko v nastavení). */
window.checkForUpdate = async () => {
    if (!swRegistration) {
        toast('Aplikace neběží v režimu PWA (chybí service worker).', 'warn');
        return;
    }
    try {
        // Nestačí se jen zeptat a chvíli čekat: instalace nového service workeru
        // (stažení všech souborů) může trvat déle a hlášení „máte nejnovější verzi“
        // by pak bylo nepravdivé. Proto posloucháme, co se skutečně stane.
        const update = new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), 20000);
            const done = (found) => { clearTimeout(timer); resolve(found); };
            swRegistration.addEventListener('updatefound', () => {
                const next = swRegistration.installing;
                if (!next) { done(true); return; }
                next.addEventListener('statechange', () => {
                    if (next.state === 'installed' || next.state === 'activated') done(true);
                });
            }, { once: true });
        });

        await swRegistration.update();
        const found = (await update) || !!swRegistration.waiting;

        if (found) {
            if (!updateOffered) {
                showUpdateBar();
                toast('Je dostupná nová verze aplikace.', 'ok');
            }
        } else if (!updateOffered) {
            toast('Máte nejnovější verzi.', 'ok');
        }
    } catch (err) {
        toast('Kontrolu aktualizací se nepodařilo provést.', 'err');
    }
};

document.addEventListener('DOMContentLoaded', boot);
