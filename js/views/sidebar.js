/* ---------------------------------------------------------------------------
 * Levý panel: firma, akce, strom faktur.
 * ------------------------------------------------------------------------- */
import * as store from '../store.js';
import { esc, sv, fmtCZK } from '../util.js';
import { invoiceTotals } from '../invoice.js';
import { icon } from '../icons.js';

const STATUS_DOT = { paid: 'paid', overdue: 'overdue', partial: 'partial', open: 'open' };

export function renderSidebar() {
    const host = document.getElementById('sidebar-body');
    if (!host) return;
    const company = store.activeCompany();
    const invoices = store.companyInvoices();

    // roky s fakturami
    const byYear = new Map();
    for (const invoice of invoices) {
        const year = sv(invoice.issueDate).slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(invoice);
    }
    const years = [...byYear.keys()].sort().reverse();

    // undefined = ročník ještě nebyl vybrán → otevřeme aktuální (nebo nejnovější);
    // null = uživatel si všechno sbalil a to respektujeme (dřív se ročník vždy znovu otevřel)
    if (store.state.selectedYear === undefined) {
        const current = String(new Date().getFullYear());
        store.state.selectedYear = byYear.has(current) ? current : (years[0] || undefined);
    }
    const openYear = store.state.selectedYear;

    host.innerHTML =
        '<label class="field company-picker">' +
        '<span class="muted small">Firma</span>' +
        '<select id="companySelect">' +
        store.state.companies.map((c) =>
            '<option value="' + esc(c.id) + '"' + (company && c.id === company.id ? ' selected' : '') + '>' +
            esc(sv(c.code) + ' · ' + (c.name || 'Bez názvu')) + '</option>').join('') +
        '</select></label>' +

        (store.state.settings.demo
            ? '<button class="demo-chip" data-action="go" data-view="settings"' +
              ' title="Máte načtená ukázková data – klikněte pro správu">' + icon('beaker') + ' Ukázková data</button>'
            : '') +

        '<div class="sidebar-actions">' +
        '<button class="btn primary" data-action="new-invoice">+ Nová faktura</button>' +
        '<button class="btn' + (store.state.view === 'overview' ? ' active' : '') + '" data-action="go" data-view="overview">' + icon('bar-chart-line') + ' Přehled faktur</button>' +
        '<button class="btn' + (store.state.view === 'bank' ? ' active' : '') + '" data-action="go" data-view="bank">' + icon('bank') + ' Banka' +
        (unmatchedCount() ? '<span class="badge warn">' + unmatchedCount() + '</span>' : '') + '</button>' +
        '</div>' +

        '<div class="tree">' +
        '<div class="tree-title">Vydané faktury</div>' +
        (years.length
            ? years.map((year) => {
                const list = byYear.get(year).slice().sort((a, b) => sv(b.issueDate).localeCompare(sv(a.issueDate)));
                const sum = list.reduce((s, i) => s + invoiceTotals(i).payable, 0);
                const isOpen = year === openYear;
                return '<div class="tree-year">' +
                    '<button class="tree-year-head' + (isOpen ? ' open' : '') + '" data-action="toggle-year" data-year="' + esc(year) + '">' +
                    '<span class="chev">' + (isOpen ? '▾' : '▸') + '</span>' +
                    '<span class="year">/' + esc(year) + '</span>' +
                    '<span class="muted small">' + list.length + '× · ' + fmtCZK(sum) + ' Kč</span>' +
                    '</button>' +
                    (isOpen
                        ? '<ul class="tree-list">' + list.map((invoice) => {
                            const status = store.invoiceStatus(invoice);
                            const active = store.state.view === 'invoice' && store.state.editing && store.state.editing.id === invoice.id;
                            const customer = sv(invoice.customerSnapshot && invoice.customerSnapshot.name) || '—';
                            return '<li><button class="tree-item' + (active ? ' active' : '') + '" data-action="open-invoice" data-id="' + esc(invoice.id) + '">' +
                                '<span class="dot ' + STATUS_DOT[status] + '"></span>' +
                                '<span class="tree-item-body"><span class="num">' + esc(invoice.number || '(koncept)') + '</span>' +
                                '<span class="muted small">' + esc(customer) + '</span></span></button></li>';
                        }).join('') + '</ul>'
                        : '') +
                    '</div>';
            }).join('')
            : '<div class="muted small">Zatím žádné faktury.</div>') +
        '</div>' +

        '<div class="sidebar-foot">' +
        '<button class="btn' + (store.state.view === 'settings' ? ' active' : '') + '" data-action="go" data-view="settings">' + icon('gear') + ' Nastavení</button>' +
        '</div>';
}


/** Platby, které ještě čekají na spárování (vratky, převody a úroky se nepárují). */
function unmatchedCount() {
    return store.companyPayments().filter((p) =>
        p.kind !== 'internal' && p.kind !== 'manual' && p.kind !== 'refund' && p.kind !== 'interest' &&
        store.freeAmount(p) > 0.005).length;
}
