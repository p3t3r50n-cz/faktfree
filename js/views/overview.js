/* ---------------------------------------------------------------------------
 * Přehled faktur: souhrn, filtry, seznam po rocích (akordeon).
 * Filtry se překreslují zvlášť od seznamu, aby neztrácely fokus.
 * ------------------------------------------------------------------------- */
import * as store from '../store.js';
import { esc, sv, fmtCZK, fmtDate, debounce } from '../util.js';
import { invoiceTotals } from '../invoice.js';
import { icon } from '../icons.js';

const STATUS_LABEL = {
    paid: 'Zaplaceno',
    overdue: 'Po splatnosti',
    partial: 'Částečně uhrazeno',
    open: 'Nezaplaceno',
};

function matches(invoice, filters, search) {
    const year = sv(invoice.issueDate).slice(0, 4);
    const month = sv(invoice.issueDate).slice(5, 7);
    if (filters.year !== 'all' && year !== filters.year) return false;
    if (filters.month !== 'all' && month !== filters.month) return false;

    const status = store.invoiceStatus(invoice);
    if (filters.status === 'paid' && status !== 'paid') return false;
    if (filters.status === 'open' && !(status === 'open' || status === 'partial')) return false;
    if (filters.status === 'overdue' && status !== 'overdue') return false;

    if (search) {
        const q = search.toLowerCase();
        const customer = sv(invoice.customerSnapshot && invoice.customerSnapshot.name);
        if (!(sv(invoice.number).toLowerCase().includes(q) ||
            customer.toLowerCase().includes(q) ||
            fmtCZK(invoiceTotals(invoice).payable).includes(q) ||
            sv(invoice.issueDate).includes(q) ||
            sv(invoice.note).toLowerCase().includes(q))) return false;
    }
    return true;
}

export function renderOverview(host) {
    const invoices = store.companyInvoices();
    const years = [...new Set(invoices.map((i) => sv(i.issueDate).slice(0, 4)))].sort().reverse();
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const f = store.state.filters;

    host.innerHTML =
        '<div class="view-head"><h2>Přehled faktur</h2>' +
        '<div class="view-head-actions"><button class="btn primary" data-action="new-invoice">+ Nová faktura</button></div></div>' +

        '<div class="stats" id="overview-stats"></div>' +

        '<div class="filters card">' +
        '<label class="field"><span>Účetní období</span><select data-filter="year">' +
        '<option value="all"' + (f.year === 'all' ? ' selected' : '') + '>Vše</option>' +
        years.map((y) => '<option value="' + y + '"' + (f.year === y ? ' selected' : '') + '>' + y + '</option>').join('') +
        '</select></label>' +
        '<label class="field"><span>Měsíc vystavení</span><select data-filter="month">' +
        '<option value="all"' + (f.month === 'all' ? ' selected' : '') + '>Vše</option>' +
        months.map((m) => '<option value="' + m + '"' + (f.month === m ? ' selected' : '') + '>/' + m + '</option>').join('') +
        '</select></label>' +
        '<label class="field"><span>Stav úhrady</span><select data-filter="status">' +
        [['all', 'Vše'], ['open', 'Nezaplaceno'], ['paid', 'Zaplaceno'], ['overdue', 'Po splatnosti']]
            .map(([v, l]) => '<option value="' + v + '"' + (f.status === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select></label>' +
        '<label class="field grow"><span>Hledat</span><input type="search" data-search value="' + esc(store.state.search) + '"' +
        ' placeholder="číslo, odběratel, částka, poznámka…"></label>' +
        '<div class="filter-buttons"><button class="btn" data-action="clear-filters">Zrušit filtry</button></div>' +
        '</div>' +

        '<div id="overview-list"></div>';

    renderOverviewList(host);
}

export function renderOverviewList(host) {
    const statsHost = host.querySelector('#overview-stats');
    const listHost = host.querySelector('#overview-list');
    if (!statsHost || !listHost) return;

    const invoices = store.companyInvoices();
    const filtered = invoices.filter((i) => matches(i, store.state.filters, store.state.search));
    const sum = (list) => list.reduce((s, i) => s + invoiceTotals(i).payable, 0);

    const paid = filtered.filter((i) => store.invoiceStatus(i) === 'paid');
    const overdue = filtered.filter((i) => store.invoiceStatus(i) === 'overdue');
    const unpaidSum = sum(filtered) - sum(paid);
    const currentYear = String(new Date().getFullYear());
    const yearSum = sum(invoices.filter((i) => sv(i.issueDate).slice(0, 4) === currentYear));

    statsHost.innerHTML =
        stat('Faktur celkem', filtered.length + '×') +
        stat('Obrat celkem', fmtCZK(sum(filtered)) + ' Kč') +
        stat('Zaplaceno', fmtCZK(sum(paid)) + ' Kč', 'ok') +
        stat('Nezaplaceno', fmtCZK(unpaidSum) + ' Kč', unpaidSum > 0.005 ? 'warn' : '') +
        stat('Po splatnosti', overdue.length + '× · ' + fmtCZK(sum(overdue)) + ' Kč', overdue.length ? 'danger' : '') +
        stat('Obrat ' + currentYear, fmtCZK(yearSum) + ' Kč');

    const byYear = new Map();
    for (const invoice of filtered) {
        const year = sv(invoice.issueDate).slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(invoice);
    }
    const listYears = [...byYear.keys()].sort().reverse();

    if (!listYears.length) {
        listHost.innerHTML = '<div class="empty card">' +
            (invoices.length
                ? 'Žádné faktury neodpovídají filtru.'
                : 'Zatím žádné faktury. Začněte tlačítkem „+ Nová faktura“ (nebo si v Nastavení nahrajte ukázková data).') +
            '</div>';
        return;
    }

    listHost.innerHTML = listYears.map((year) => {
        const list = byYear.get(year).slice().sort((a, b) => sv(b.issueDate).localeCompare(sv(a.issueDate)));
        // selectedYear: undefined = první ročník otevřený, null = vše sbaleno
        const openYear = store.state.selectedYear === undefined ? listYears[0] : store.state.selectedYear;
        const isOpen = store.state.filters.year === year ? true : year === openYear;
        return '<div class="acc-year">' +
            '<button class="acc-head' + (isOpen ? ' open' : '') + '" data-action="toggle-year" data-year="' + esc(year) + '"' +
            (isOpen ? ' data-open="1"' : '') + '>' +
            '<span class="chev">' + (isOpen ? '▾' : '▸') + '</span>' +
            '<span class="year">' + esc(year) + '</span>' +
            '<span class="muted">' + list.length + '× · ' + fmtCZK(sum(list)) + ' Kč</span>' +
            '</button>' +
            (isOpen ? invoiceTable(list) : '') +
            '</div>';
    }).join('');
}

function stat(label, value, kind) {
    return '<div class="stat ' + (kind || '') + '"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div></div>';
}

function invoiceTable(list) {
    return '<div class="table-wrap card"><table><thead><tr>' +
        '<th>Číslo</th><th>Odběratel</th><th>Vystaveno</th><th>Splatnost</th>' +
        '<th class="num">Částka</th><th class="num">Uhrazeno</th><th>Stav</th><th></th>' +
        '</tr></thead><tbody>' +
        list.map((invoice) => {
            const t = invoiceTotals(invoice);
            const paid = store.paidAmount(invoice.id);
            const status = store.invoiceStatus(invoice);
            const customer = sv(invoice.customerSnapshot && invoice.customerSnapshot.name);
            return '<tr>' +
                '<td><button class="link-btn" data-action="open-invoice" data-id="' + esc(invoice.id) + '">' + esc(invoice.number || '(koncept)') + '</button></td>' +
                '<td>' + esc(customer) + '</td>' +
                '<td>' + esc(fmtDate(invoice.issueDate)) + '</td>' +
                '<td' + (status === 'overdue' ? ' class="overdue-text"' : '') + '>' + esc(fmtDate(invoice.dueDate)) + '</td>' +
                '<td class="num">' + fmtCZK(t.payable) + ' Kč</td>' +
                '<td class="num">' + fmtCZK(paid) + ' Kč</td>' +
                '<td><span class="badge ' + status + '">' + STATUS_LABEL[status] + '</span></td>' +
                '<td class="row-actions">' +
                '<button class="btn small ghost" data-action="print-invoice" data-id="' + esc(invoice.id) + '" title="Tisk">' + icon('printer') + '</button>' +
                (status === 'paid'
                    ? '<button class="btn small ghost" data-action="unmark-paid" data-id="' + esc(invoice.id) + '" title="Zrušit ruční úhradu">' + icon('arrow-counterclockwise') + '</button>'
                    : '<button class="btn small ghost" data-action="mark-paid" data-id="' + esc(invoice.id) + '" title="Označit jako zaplaceno">' + icon('check-lg') + '</button>') +
                '<button class="btn small ghost" data-action="duplicate-invoice" data-id="' + esc(invoice.id) + '" title="Duplikovat">' + icon('copy') + '</button>' +
                '<button class="btn small danger" data-action="delete-invoice" data-id="' + esc(invoice.id) + '" title="Smazat">' + icon('x-lg') + '</button>' +
                '</td></tr>';
        }).join('') + '</tbody></table></div>';
}

/* --------------------------- obsluha ------------------------------------ */

export function bindOverview(host) {
    if (host.dataset.overviewBound) return;
    host.dataset.overviewBound = '1';

    host.addEventListener('change', (e) => {
        const filter = e.target.dataset.filter;
        if (!filter) return;
        store.state.filters[filter] = e.target.value;
        if (filter === 'year') {
            store.state.selectedYear = e.target.value === 'all' ? null : e.target.value;
        }
        renderOverviewList(host);
    });

    const search = debounce(() => renderOverviewList(host), 250);
    host.addEventListener('input', (e) => {
        if (e.target.dataset.search === undefined) return;
        store.state.search = e.target.value;
        search();
    });
}
