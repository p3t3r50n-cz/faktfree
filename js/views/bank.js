/* ---------------------------------------------------------------------------
 * Banka: import ABO výpisů a párování plateb na faktury.
 * ------------------------------------------------------------------------- */
import * as store from '../store.js';
import { esc, sv, fmtCZK, fmtDate, debounce } from '../util.js';
import { confirmDialog, toast, alertDialog } from '../ui.js';
import { allocatePayment } from '../dialogs.js';
import { icon } from '../icons.js';

/** Odpovídá platba filtru stavu a fulltextu (částka, VS, účet, zpráva, číslo faktury)? */
function matches(payment, filters, search) {
    if (filters.state !== 'all' && store.paymentState(payment) !== filters.state) return false;
    if (!search) return true;
    const numbers = (payment.allocations || []).map((a) => {
        const invoice = store.state.invoices.find((i) => i.id === a.invoiceId);
        return invoice ? sv(invoice.number) : '';
    }).join(' ');
    const haystack = [
        sv(payment.vs), sv(payment.ks), sv(payment.ss), sv(payment.docNumber),
        sv(payment.contraAccount), sv(payment.contraBank),
        sv(payment.contraAccount) + '/' + sv(payment.contraBank),
        sv(payment.message), sv(payment.refundName),
        String(payment.amount), fmtCZK(payment.amount), sv(payment.valueDate), fmtDate(payment.valueDate),
        numbers,
    ].join(' ').toLowerCase();
    return haystack.includes(search.toLowerCase());
}

export function renderBank(host) {
    const all = store.companyPayments().filter((p) => p.kind !== 'manual');
    const f = store.state.bankFilters;
    const income = all.filter((p) => p.kind === 'invoice');
    const refunds = all.filter((p) => p.kind === 'refund');
    const unmatched = all.filter((p) => store.paymentState(p) === 'unmatched');
    const sum = (list) => list.reduce((s, p) => s + p.amount, 0);
    const matchedSum = all.reduce((s, p) => s + store.allocatedTotal(p), 0);

    host.innerHTML =
        '<div class="view-head"><h2>Banka</h2>' +
        '<div class="view-head-actions">' +
        '<button class="btn primary" data-action="import-abo">' + icon('upload') + ' Importovat výpis (ABO)</button>' +
        '</div></div>' +

        '<div class="stats">' +
        stat('Příchozích plateb', income.length + '×') +
        stat('Příjem na faktury', fmtCZK(sum(income)) + ' Kč') +
        stat('Vratky (mimo příjem)', refunds.length + '× · ' + fmtCZK(sum(refunds)) + ' Kč', refunds.length ? 'warn' : '') +
        stat('Přiřazeno', fmtCZK(matchedSum) + ' Kč', 'ok') +
        stat('Nezaúčtováno', unmatched.length + '×', unmatched.length ? 'warn' : '') +
        '</div>' +

        '<div class="filters card">' +
        '<label class="field"><span>Stav</span><select data-bank-filter="state">' +
        [['all', 'Vše'], ['unmatched', 'Nezaúčtováno (nespárováno)'], ['partial', 'Částečně spárováno'],
            ['matched', 'Zaúčtováno (spárováno)'], ['refund', 'Vratky (mimo příjem)'], ['internal', 'Interní převody']]
            .map(([v, l]) => '<option value="' + v + '"' + (f.state === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select></label>' +
        '<label class="field grow"><span>Hledat</span><input type="search" data-bank-search value="' + esc(store.state.bankSearch) + '"' +
        ' placeholder="částka, VS, protiúčet, zpráva, číslo faktury…"></label>' +
        '<label class="inline"><input type="checkbox" data-toggle="showInternal"' + (store.state.showInternal ? ' checked' : '') + '> Zobrazit i interní převody</label>' +
        '<div class="filter-buttons"><button class="btn" data-action="clear-bank-filters">Zrušit filtry</button></div>' +
        '</div>' +

        '<div id="bank-list"></div>';

    renderBankList(host);
}

/** Překreslí jen seznam plateb (filtry a fulltext pak neztrácí fokus). */
export function renderBankList(host) {
    const listHost = host.querySelector('#bank-list');
    if (!listHost) return;

    const all = store.companyPayments().filter((p) => p.kind !== 'manual');
    const f = store.state.bankFilters;
    const search = sv(store.state.bankSearch).trim();
    const visible = all
        .filter((p) => p.kind !== 'internal' || store.state.showInternal || f.state === 'internal')
        .filter((p) => matches(p, f, search))
        .sort((a, b) => sv(b.valueDate).localeCompare(sv(a.valueDate)));

    const byYear = new Map();
    for (const payment of visible) {
        const year = sv(payment.valueDate).slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(payment);
    }
    const years = [...byYear.keys()].sort().reverse();
    // undefined = první ročník otevřený, null = vše sbaleno
    const openYear = store.state.selectedYear === undefined ? (years[0] || null) : store.state.selectedYear;

    if (!years.length) {
        listHost.innerHTML = '<div class="empty card">' + (all.length
            ? 'Žádné platby neodpovídají filtru.'
            : 'Zatím žádné platby. Naimportujte výpis ve formátu ABO (GPC).') + '</div>';
        return;
    }

    listHost.innerHTML = years.map((year) => {
        const list = byYear.get(year);
        const sum = list.reduce((s, p) => s + p.amount, 0);
        const isOpen = year === openYear;
        return '<div class="acc-year">' +
            '<button class="acc-head' + (isOpen ? ' open' : '') + '" data-action="toggle-year" data-year="' + esc(year) + '"' +
            (isOpen ? ' data-open="1"' : '') + '>' +
            '<span class="chev">' + (isOpen ? '▾' : '▸') + '</span>' +
            '<span class="year">' + esc(year) + '</span>' +
            '<span class="muted">' + list.length + '× · ' + fmtCZK(sum) + ' Kč</span>' +
            '</button>' +
            (isOpen ? paymentTable(list) : '') +
            '</div>';
    }).join('');
}

function stat(label, value, kind) {
    return '<div class="stat ' + (kind || '') + '"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div></div>';
}

function paymentTable(list) {
    return '<div class="table-wrap card"><table><thead><tr>' +
        '<th>Datum</th><th class="num">Částka</th><th>VS</th><th>Protiúčet</th><th>Zpráva</th>' +
        '<th class="num">Přiřazeno</th><th>Stav</th><th></th>' +
        '</tr></thead><tbody>' +
        list.map((payment) => {
            const allocated = store.allocatedTotal(payment);
            const pstate = store.paymentState(payment);
            const label = pstate === 'refund'
                ? 'Vratka' + (payment.refundName && payment.refundName !== 'Vratka' ? ' – ' + payment.refundName : '')
                : store.PAYMENT_STATE_LABEL[pstate];
            const badgeClass = { matched: 'paid', partial: 'partial', unmatched: 'overdue', refund: 'refund', internal: 'internal' }[pstate];

            const allocations = payment.allocations || [];
            const numbers = allocations.map((a) => {
                const invoice = store.state.invoices.find((i) => i.id === a.invoiceId);
                return invoice ? sv(invoice.number) : '(smazaná faktura)';
            });
            const title = numbers.length ? store.PAYMENT_STATE_LABEL[pstate] + ': ' + numbers.join(', ') : '';
            // spárováno → odznak je odkaz na fakturu (s číslem v tooltipu)
            const badge = allocations.length
                ? '<button class="badge ' + badgeClass + ' badge-link" data-action="open-invoice" data-id="' + esc(allocations[0].invoiceId) + '"' +
                  ' title="' + esc(title) + '">' + esc(label) + '</button>'
                : '<span class="badge ' + badgeClass + '">' + esc(label) + '</span>';

            // Akce držíme v pevných sloupcích (textová akce + 2 ikony), aby tlačítka
            // v různých řádcích neujížděla – prázdný sloupec místo prostě zůstane prázdný.
            let mainAction = '';
            if (pstate === 'unmatched') {
                mainAction = '<button class="btn small" data-action="match-payment" data-id="' + esc(payment.id) + '" title="Přiřadit k faktuře">Párovat</button>';
            } else if (pstate === 'partial') {
                mainAction = '<button class="btn small" data-action="match-payment" data-id="' + esc(payment.id) + '" title="Část platby zatím není přiřazená">Párovat</button>';
            } else if (pstate === 'matched') {
                mainAction = '<button class="btn small danger ghost" data-action="unmatch-payment" data-id="' + esc(payment.id) + '"' +
                    ' title="Zrušit vazbu na fakturu">Zrušit vazbu</button>';
            }

            let refundAction = '';
            if (payment.kind === 'invoice') {
                refundAction = '<button class="btn small ghost" data-action="mark-refund" data-id="' + esc(payment.id) + '"' +
                    ' title="Označit jako vratku (pojistné, daň) – není zdanitelný příjem">' + icon('arrow-return-left') + '</button>';
            } else if (payment.kind === 'refund') {
                refundAction = '<button class="btn small ghost" data-action="unmark-refund" data-id="' + esc(payment.id) + '"' +
                    ' title="Není vratka – jde o běžný příjem">' + icon('x-lg') + '</button>';
            }
            const deleteAction = '<button class="btn small danger ghost" data-action="delete-payment" data-id="' + esc(payment.id) + '" title="Smazat platbu">' + icon('x-lg') + '</button>';

            return '<tr>' +
                '<td>' + esc(fmtDate(payment.valueDate)) + '</td>' +
                '<td class="num">' + fmtCZK(payment.amount) + ' Kč</td>' +
                '<td>' + esc(payment.vs || '—') + '</td>' +
                '<td>' + esc(sv(payment.contraAccount) + '/' + sv(payment.contraBank)) + '</td>' +
                '<td>' + esc(payment.message || '') + '</td>' +
                '<td class="num">' + fmtCZK(allocated) + ' Kč</td>' +
                '<td>' + badge + '</td>' +
                '<td class="row-actions">' +
                '<span class="act act-label">' + mainAction + '</span>' +
                '<span class="act act-icon">' + refundAction + '</span>' +
                '<span class="act act-icon">' + deleteAction + '</span>' +
                '</td></tr>';
        }).join('') + '</tbody></table></div>';
}

/* --------------------------- obsluha ------------------------------------ */

export function bindBank(host) {
    if (host.dataset.bankBound) return;
    host.dataset.bankBound = '1';

    host.addEventListener('change', (e) => {
        if (e.target.dataset.toggle === 'showInternal') {
            store.state.showInternal = e.target.checked;
            renderBankList(host);
            return;
        }
        if (e.target.dataset.bankFilter) {
            store.state.bankFilters[e.target.dataset.bankFilter] = e.target.value;
            renderBankList(host);
        }
    });

    // fulltext – překreslujeme jen seznam, aby vstup neztrácel fokus
    const search = debounce(() => renderBankList(host), 250);
    host.addEventListener('input', (e) => {
        if (e.target.dataset.bankSearch === undefined) return;
        store.state.bankSearch = e.target.value;
        search();
    });

    host.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;

        if (action === 'import-abo') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.gpc,.abo,.txt,text/plain';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const text = await readFileSmart(file);
                    const result = await store.importAbo(text, file.name);
                    const s = result.stats;
                    await alertDialog('Import dokončen',
                        'Načteno položek: ' + s.total + '\n' +
                        'Nových plateb: ' + s.imported + '\n' +
                        'Automaticky spárováno: ' + s.matched + '\n' +
                        'Nespárováno: ' + s.unmatched + '\n' +
                        'Interní převody: ' + s.internal + '\n' +
                        'Odchozí (přeskočeno): ' + s.outgoing + '\n' +
                        'Duplicity: ' + s.duplicates);
                    store.emit();
                } catch (err) {
                    toast(err.message || 'Import selhal.', 'err');
                }
            };
            input.click();
            return;
        }

        if (action === 'match-payment') {
            const payment = store.state.payments.find((p) => p.id === el.dataset.id);
            if (!payment) return;
            await allocatePayment(payment);
            renderBankList(host);
            return;
        }

        if (action === 'unmatch-payment') {
            const payment = store.state.payments.find((p) => p.id === el.dataset.id);
            if (!payment) return;
            const numbers = (payment.allocations || []).map((a) => {
                const invoice = store.state.invoices.find((i) => i.id === a.invoiceId);
                return invoice ? sv(invoice.number) : '(smazaná faktura)';
            });
            if (!numbers.length) return;
            if (await confirmDialog({
                title: 'Zrušit vazbu?',
                body: 'Platba ' + fmtCZK(payment.amount) + ' Kč se odpojí od faktury ' + numbers.join(', ') +
                    '. Platba zůstane v přehledu jako nezaúčtovaná a faktura bude zase nezaplacená.',
                okLabel: 'Zrušit vazbu', danger: true,
            })) {
                for (const allocation of (payment.allocations || []).slice()) {
                    await store.deallocate(payment.id, allocation.invoiceId);
                }
                toast('Vazba zrušena.', 'ok');
            }
            return;
        }

        if (action === 'mark-refund') {
            const payment = store.state.payments.find((p) => p.id === el.dataset.id);
            if (!payment) return;
            const hasAllocations = (payment.allocations || []).length > 0;
            if (await confirmDialog({
                title: 'Označit jako vratku?',
                body: 'Platba ' + fmtCZK(payment.amount) + ' Kč se přestane počítat jako zdanitelný příjem' +
                    (hasAllocations ? ' a její vazba na fakturu se zruší' : '') +
                    '. Účet ' + sv(payment.contraAccount) + '/' + sv(payment.contraBank) + ' si zapamatujeme, ' +
                    'takže další vratky z něj poznáme samy.',
                okLabel: 'Označit jako vratku',
            })) {
                await store.setPaymentRefund(payment.id, true);
                toast('Označeno jako vratka (mimo zdanitelný příjem).', 'ok');
            }
            return;
        }

        if (action === 'unmark-refund') {
            const payment = store.state.payments.find((p) => p.id === el.dataset.id);
            if (!payment) return;
            await store.setPaymentRefund(payment.id, false);
            toast('Označení vratky zrušeno – platba se počítá jako příjem.', 'ok');
            return;
        }

        if (action === 'clear-bank-filters') {
            store.state.bankFilters = { state: 'all' };
            store.state.bankSearch = '';
            store.state.showInternal = false;
            store.state.selectedYear = undefined;
            renderBank(host);
            return;
        }

        if (action === 'delete-payment') {
            const payment = store.state.payments.find((p) => p.id === el.dataset.id);
            if (!payment) return;
            if (await confirmDialog({
                title: 'Smazat platbu?',
                body: 'Platba ' + fmtCZK(payment.amount) + ' Kč ze ' + fmtDate(payment.valueDate) + ' bude odstraněna i s přiřazením k fakturám.',
                okLabel: 'Smazat', danger: true,
            })) {
                await store.removePayment(payment.id);
            }
            return;
        }
    });
}

/** Přečte soubor – ABO bývá cp1250, takže dekódujeme ručně. */
async function readFileSmart(file) {
    const buffer = await file.arrayBuffer();
    const { decodeAbo } = await import('../abo.js');
    return decodeAbo(buffer).text;
}
