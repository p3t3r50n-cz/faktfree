/* ---------------------------------------------------------------------------
 * Editor faktury.
 * ------------------------------------------------------------------------- */
import * as store from '../store.js';
import { esc, sv, num, fmtCZK, fmtDate } from '../util.js';
import { VAT_RATES, totals, rowTotal, invoiceTotals } from '../invoice.js';
import { printInvoice } from '../print.js';
import { confirmDialog, toast } from '../ui.js';
import { manageCustomers, manageItems, manageUnits, allocatePayment } from '../dialogs.js';
import { aresLookup } from '../ares.js';
import { icon } from '../icons.js';

const STATUS_LABEL = { paid: 'Zaplaceno', overdue: 'Po splatnosti', partial: 'Částečně uhrazeno', open: 'Nezaplaceno' };

export function renderInvoice(host) {
    closeCombo();
    const invoice = store.state.editing;
    if (!invoice) {
        host.innerHTML = '<div class="empty card">Není otevřená žádná faktura.</div>';
        return;
    }
    const company = store.activeCompany();
    const platce = !!(invoice.companySnapshot && invoice.companySnapshot.platceDPH);
    const number = store.editorNumberPreview(invoice);
    const status = store.invoiceStatus(invoice);
    const saved = store.state.editingSaved;
    const paid = store.paidAmount(invoice.id);
    const remaining = Math.max(0, Math.round((invoiceTotals(invoice).payable - paid) * 100) / 100);
    const units = unitOptions();

    const customerOptions = '<option value="">-- vyberte odběratele --</option>' +
        store.state.customers.map((c) =>
            '<option value="' + esc(c.id) + '"' + (invoice.customerId === c.id ? ' selected' : '') + '>' +
            esc(c.name || 'Bez názvu') + '</option>').join('');

    host.innerHTML =
        '<div class="view-head">' +
        '<div class="view-head-title">' +
        '<button class="btn icon" data-action="go" data-view="overview" title="Zpět na přehled faktur" aria-label="Zpět na přehled faktur">' + icon('arrow-left') + '</button>' +
        '<h2>' + (store.state.editingSaved && invoice.number ? 'Faktura ' + esc(invoice.number) : 'Nová faktura') + '</h2>' +
        '</div>' +
        '<div class="view-head-actions">' +
        '<span class="badge ' + status + '">' + STATUS_LABEL[status] + '</span>' +
        '<button class="btn" data-action="print-invoice-current">' + icon('printer') + ' Tisk</button>' +
        (paid > 0.005 ? '<button class="btn ghost" data-action="unmark-current">' + icon('arrow-counterclockwise') + ' Zrušit úhradu</button>' : '') +
        '<button class="btn ghost" data-action="duplicate-current">' + icon('copy') + ' Duplikovat</button>' +
        '<button class="btn danger ghost" data-action="delete-current">' + icon('x-lg') + ' Smazat</button>' +
        (saved ? '' : '<span class="muted small" data-draft-hint>Koncept – uloží se po vyplnění</span>') +
        '</div></div>' +

        '<div class="card">' +
        '<div class="grid3">' +
        '<label class="field"><span>Odběratel</span>' +
        '<div class="input-row">' +
        '<select data-inv="customerId" id="inv-customer">' + customerOptions + '</select>' +
        '<button class="btn small ghost" data-action="manage-customers" title="Správa odběratelů">' + icon('three-dots') + '</button>' +
        '</div>' +
        '<div class="input-row" style="margin-top:5px">' +
        '<input id="inv-ico" placeholder="…nebo napište IČO" maxlength="8" inputmode="numeric" autocomplete="off">' +
        '<button class="btn small" data-action="ares-ico" title="Načíst z ARES a použít jako odběratele">' + icon('broadcast') + ' ARES</button>' +
        '</div></label>' +

        '<label class="field"><span>Číslo faktury</span>' +
        '<input id="inv-number" value="' + esc(number) + '" readonly class="readonly' + (invoice.numberCommitted ? '' : ' draft') + '">' +
        (invoice.numberCommitted ? '' : '<small class="muted">Přidělí se při prvním uložení</small>') +
        '</label>' +

        '<label class="field"><span>Datum vystavení</span>' +
        '<input type="date" data-inv="issueDate" value="' + esc(invoice.issueDate) + '"></label>' +

        '<label class="field"><span>Datum splatnosti</span>' +
        '<input type="date" data-inv="dueDate" value="' + esc(invoice.dueDate) + '"></label>' +

        '<label class="field"><span>Variabilní symbol</span>' +
        '<input data-inv="vs" value="' + esc(invoice.vs) + '" maxlength="10"></label>' +

        '<label class="field"><span>Konstantní symbol</span>' +
        '<input data-inv="ks" value="' + esc(invoice.ks) + '" maxlength="10"></label>' +

        '<label class="field"><span>Specifický symbol</span>' +
        '<input data-inv="ss" value="' + esc(invoice.ss) + '" maxlength="10"></label>' +

        '<label class="field"><span>Číslo smlouvy</span>' +
        '<input data-inv="contractNo" value="' + esc(invoice.contractNo) + '"></label>' +

        '<label class="field"><span>Zakázka</span>' +
        '<input data-inv="projectNo" value="' + esc(invoice.projectNo) + '"></label>' +

        '<label class="field"><span>Objednávka</span>' +
        '<input data-inv="orderNo" value="' + esc(invoice.orderNo) + '"></label>' +
        '</div></div>' +

        '<div class="card">' +
        '<div class="dialog-toolbar">' +
        '<button class="btn" data-action="add-row">+ Přidat řádek</button>' +
        '<button class="btn ghost" data-action="manage-items">' + icon('tags') + ' Položky…</button>' +
        '<button class="btn ghost" data-action="manage-units">' + icon('rulers') + ' MJ…</button>' +
        '</div>' +
        '<div class="table-wrap"><table class="rows-table"><thead><tr>' +
        '<th>Název položky</th><th>MJ</th><th class="num">Cena / MJ</th><th class="num">Množství</th>' +
        '<th class="num">Sleva %</th>' + (platce ? '<th>DPH</th>' : '') + '<th class="num">Celkem</th><th></th>' +
        '</tr></thead><tbody>' +
        invoice.rows.map((row, i) => rowHtml(row, i, platce, units)).join('') +
        '</tbody></table></div>' +
        '<div class="inv-totals-row">' +
        '<label class="field grow"><span>Poznámka</span><textarea data-inv="note" rows="2">' + esc(invoice.note) + '</textarea></label>' +
        '<div class="totals" id="inv-totals">' + totalsHtml(invoice) + '</div>' +
        '</div>' +
        '<label class="inline" style="margin-top:10px"><input type="checkbox" data-inv="rounding"' + (invoice.rounding ? ' checked' : '') + '> Zaokrouhlit celkovou částku na celé Kč</label>' +
        '</div>' +

        (store.state.editingSaved ? paymentsCard(invoice, paid, remaining) : '');
}

function unitOptions() {
    return store.state.units.map((u) => u.name);
}

function rowHtml(row, i, platce, units) {
    const unitList = units.indexOf(sv(row.unit)) >= 0 ? units : units.concat([sv(row.unit) || 'ks']);
    return '<tr>' +
        '<td><div class="combo">' +
        '<input class="combo-input" data-row="' + i + '" data-col="name" autocomplete="off" spellcheck="false"' +
        ' value="' + esc(row.name) + '" placeholder="Název položky" style="min-width:200px">' +
        '<button type="button" class="combo-toggle" tabindex="-1" title="Zobrazit všechny položky" aria-label="Zobrazit všechny položky">▾</button>' +
        '</div></td>' +
        '<td><select data-row="' + i + '" data-col="unit" style="min-width:90px">' +
        unitList.map((u) => '<option' + (sv(row.unit) === u ? ' selected' : '') + '>' + esc(u) + '</option>').join('') +
        '</select></td>' +
        '<td><input type="number" step="0.01" min="0" data-row="' + i + '" data-col="price" value="' + esc(row.price) + '" style="min-width:100px"></td>' +
        '<td><input type="text" inputmode="text" data-row="' + i + '" data-col="quantity" value="' + esc(row.quantity) + '" style="min-width:90px"></td>' +
        '<td><input type="number" step="1" min="0" max="100" data-row="' + i + '" data-col="discount" value="' + esc(row.discount) + '" style="min-width:80px"></td>' +
        (platce ? '<td><select data-row="' + i + '" data-col="vat" style="min-width:90px">' +
            VAT_RATES.map((r) => '<option value="' + r + '"' + (num(row.vat) === r ? ' selected' : '') + '>' + r + ' %</option>').join('') +
            '</select></td>' : '') +
        '<td class="num" id="row-total-' + i + '">' + fmtCZK(rowTotal(row)) + '</td>' +
        '<td><button class="btn small danger" data-action="remove-row" data-index="' + i + '" title="Odebrat řádek">' + icon('x-lg') + '</button></td>' +
        '</tr>';
}

function totalsHtml(invoice) {
    const t = totals(invoice.rows, invoice.rounding);
    const paid = store.paidAmount(invoice.id);
    const remaining = Math.round((t.payable - paid) * 100) / 100;
    const platce = !!(invoice.companySnapshot && invoice.companySnapshot.platceDPH);
    let html = '';
    if (platce) {
        html += '<div class="trow"><span>Základ daně</span><span>' + fmtCZK(t.base) + ' Kč</span></div>';
        [0, 12, 21].filter((r) => t.byRate[r]).forEach((r) => {
            html += '<div class="trow"><span>DPH ' + r + ' %</span><span>' + fmtCZK(t.byRate[r]) + ' Kč</span></div>';
        });
    }
    if (t.diff) html += '<div class="trow"><span>Zaokrouhlení</span><span>' + (t.diff > 0 ? '+' : '') + fmtCZK(t.diff) + ' Kč</span></div>';
    html += '<div class="trow strong"><span>Celkem k úhradě</span><span>' + fmtCZK(t.payable) + ' Kč</span></div>';
    if (paid > 0) {
        html += '<div class="trow"><span>Uhrazeno</span><span>' + fmtCZK(paid) + ' Kč</span></div>';
        html += '<div class="trow big"><span>Zbývá uhradit</span><span>' + fmtCZK(remaining) + ' Kč</span></div>';
    }
    if (!store.companyForInvoice(invoice).account) {
        html += '<p class="muted small" style="margin-top:8px">Firma nemá vyplněný bankovní účet – ' +
            'na faktuře nebude QR platba. Doplňte ho v <strong>Nastavení</strong>.</p>';
    }
    return html;
}

function paymentsCard(invoice, paid, remaining) {
    const rows = [];
    for (const payment of store.state.payments) {
        for (const a of payment.allocations || []) {
            if (a.invoiceId === invoice.id) rows.push({ payment, amount: num(a.amount) });
        }
    }
    return '<div class="card"><h3>Úhrady</h3>' +
        (rows.length
            ? '<div class="table-wrap"><table><thead><tr><th>Datum</th><th>VS</th><th>Zpráva</th><th class="num">Částka</th><th></th></tr></thead><tbody>' +
            rows.map(({ payment, amount }) =>
                '<tr><td>' + esc(fmtDate(payment.valueDate)) + '</td>' +
                '<td>' + esc(payment.vs || '—') + '</td>' +
                '<td>' + esc(payment.message || '') + '</td>' +
                '<td class="num">' + fmtCZK(amount) + ' Kč</td>' +
                '<td><button class="btn small ghost" data-action="unassign-payment" data-id="' + esc(payment.id) + '">Odpojit</button></td></tr>').join('') +
            '</tbody></table></div>' +
            '<div class="totals"><div class="trow"><span>Uhrazeno celkem</span><span>' + fmtCZK(paid) + ' Kč</span></div>' +
            '<div class="trow strong"><span>Zbývá uhradit</span><span>' + fmtCZK(remaining) + ' Kč</span></div></div>'
            : '<p class="muted small">K faktuře zatím není přiřazena žádná platba. Platby se přiřazují v sekci <strong>Banka</strong>.</p>') +
        '</div>';
}

/* --------------------------- obsluha ------------------------------------ */

export function bindInvoice(host) {
    const invoice = () => store.state.editing;

    host.addEventListener('input', (e) => {
        const inv = invoice();
        if (!inv) return;

        const field = e.target.dataset.inv;
        if (field) {
            if (field === 'rounding') inv.rounding = e.target.checked;
            else inv[field] = e.target.value;
            if (field === 'issueDate') {
                if (!inv.dueDate || inv.dueDate < inv.issueDate) {
                    const company = store.activeCompany();
                    inv.dueDate = plusDays(inv.issueDate, company ? company.dueDays : 14);
                    const dueInput = host.querySelector('[data-inv="dueDate"]');
                    if (dueInput) dueInput.value = inv.dueDate;
                }
            }
            store.touchInvoice();
            if (field !== 'note') refreshDerived();
            return;
        }

        const rowIdx = e.target.dataset.row;
        if (rowIdx !== undefined && e.target.dataset.col) {
            const row = inv.rows[Number(rowIdx)];
            if (!row) return;
            row[e.target.dataset.col] = e.target.value;
            store.touchInvoice();
            refreshDerived();
            if (e.target.dataset.col === 'name') openCombo(e.target, false);
        }
    });

    host.addEventListener('change', (e) => {
        const inv = invoice();
        if (!inv) return;

        if (e.target.dataset.inv === 'issueDate') { renderInvoice(host); return; }

        if (e.target.id === 'inv-customer') {
            inv.customerId = e.target.value;
            const customer = store.state.customers.find((c) => c.id === e.target.value);
            inv.customerSnapshot = customer ? store.snapshotCustomer(customer) : store.emptyCustomerSnapshot();
            store.touchInvoice();
            return;
        }

        const rowIdx = e.target.dataset.row;
        const col = e.target.dataset.col;
        if (rowIdx !== undefined && col === 'name') {
            applyItemSelection(e.target, e.target.value);
        }
    });

    host.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        const inv = invoice();

        if (action === 'add-row') {
            inv.rows.push(store.emptyRow(inv.companySnapshot.platceDPH));
            store.touchInvoice();
            renderInvoice(host);
            return;
        }
        if (action === 'remove-row') {
            const index = Number(el.dataset.index);
            const row = inv.rows[index];
            if (!row) return;
            // prázdný řádek mažeme bez ptaní, u vyplněného se radši zeptáme
            const filled = sv(row.name).trim() || num(row.price) || num(row.discount) || num(row.quantity) > 1;
            if (filled && !(await confirmDialog({
                title: 'Odebrat řádek?',
                body: 'Řádek „' + (sv(row.name).trim() || '(bez názvu)') + '“ se z faktury odebere.',
                okLabel: 'Odebrat', danger: true,
            }))) return;
            inv.rows.splice(index, 1);
            if (!inv.rows.length) inv.rows.push(store.emptyRow(inv.companySnapshot.platceDPH));
            store.touchInvoice();
            renderInvoice(host);
            return;
        }
        if (action === 'unmark-current') {
            if (!(await confirmDialog({
                title: 'Zrušit úhradu?',
                body: 'U faktury ' + (sv(inv.number) || '(koncept)') + ' se odeberou vazby na platby (' +
                    fmtCZK(store.paidAmount(inv.id)) + ' Kč). Platby samotné zůstanou v přehledu banky.',
                okLabel: 'Zrušit úhradu', danger: true,
            }))) return;
            const result = await store.clearInvoicePayments(inv.id, { includeBank: true });
            toast('Úhrada zrušena (' + result.manual + '× ruční, ' + result.bank + '× z banky).', 'ok');
            return;
        }
        if (action === 'manage-customers') { await manageCustomers(); renderInvoice(host); return; }
        if (action === 'manage-items') { await manageItems(); renderInvoice(host); return; }
        if (action === 'manage-units') { await manageUnits(); renderInvoice(host); return; }
        if (action === 'ares-ico') {
            const icoInput = host.querySelector('#inv-ico');
            const typed = sv(icoInput && icoInput.value).trim();
            const selected = store.state.customers.find((c) => c.id === inv.customerId);
            const ico = typed || (selected ? sv(selected.ico) : '');
            if (!ico.trim()) { toast('Napište IČO, nebo nejdřív vyberte odběratele.', 'err'); return; }

            el.disabled = true;
            try {
                const data = await aresLookup(ico);
                const customer = await store.upsertCustomerFromAres(data);
                inv.customerId = customer.id;
                inv.customerSnapshot = store.snapshotCustomer(customer);
                store.touchInvoice();
                renderInvoice(host);
                toast('Odběratel „' + customer.name + '“ načten z ARES.', 'ok');
            } catch (err) {
                toast(err.message, 'err');
            } finally {
                el.disabled = false;
            }
            return;
        }
        if (action === 'print-invoice-current') {
            const printable = Object.assign({}, inv, { number: store.editorNumberPreview(inv) });
            printInvoice(printable, store.companyForInvoice(printable), store.paidAmount(inv.id));
            return;
        }
        if (action === 'duplicate-current') {
            await store.duplicateInvoice(inv);
            return;
        }
        if (action === 'delete-current') {
            const isDraft = !store.state.editingSaved;
            const ok = await confirmDialog({
                title: isDraft ? 'Zahodit koncept?' : 'Smazat fakturu?',
                body: isDraft
                    ? 'Rozepsaná faktura bude zahozena a číslo se neuvolní.'
                    : 'Faktura ' + sv(inv.number) + ' bude trvale odstraněna.',
                okLabel: isDraft ? 'Zahodit' : 'Smazat',
                danger: true,
            });
            if (!ok) return;
            if (isDraft) { store.discardDraft(); return; }
            await store.deleteInvoice(inv.id);
            toast('Faktura smazána.', 'ok');
            return;
        }
        if (action === 'unassign-payment') {
            await store.deallocate(el.dataset.id, inv.id);
            renderInvoice(host);
            return;
        }
    });

    bindCombo(host);
}

function refreshDerived() {
    const inv = store.state.editing;
    if (!inv) return;
    const numberInput = document.getElementById('inv-number');
    if (numberInput) numberInput.value = store.editorNumberPreview(inv);
    inv.rows.forEach((row, i) => {
        const cell = document.getElementById('row-total-' + i);
        if (cell) cell.textContent = fmtCZK(rowTotal(row));
    });
    const box = document.getElementById('inv-totals');
    if (box) box.innerHTML = totalsHtml(inv);
}

function plusDays(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + (Number(days) || 0));
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * Cílená aktualizace „rámečku“ editoru po prvním uložení konceptu.
 * (Nepřekresluje formulář, aby uživatel nepřišel o rozepsané hodnoty.)
 */
export function refreshEditorChrome() {
    const host = document.getElementById('main');
    const invoice = store.state.editing;
    if (!host || !invoice || store.state.view !== 'invoice') return;

    const h2 = host.querySelector('.view-head h2');
    if (h2 && store.state.editingSaved && invoice.number) h2.textContent = 'Faktura ' + invoice.number;

    const hint = host.querySelector('[data-draft-hint]');
    if (hint && store.state.editingSaved) hint.remove();

    const numberInput = document.getElementById('inv-number');
    if (numberInput) {
        numberInput.value = store.editorNumberPreview(invoice);
        if (store.state.editingSaved) numberInput.classList.remove('draft');
    }
}

/* ------------------- našeptávač položek (combobox) ---------------------- */
// Vlastní našeptávač místo <datalist>: psaní filtruje, šipka u pole zobrazí celý seznam.

let comboEl = null;
let comboInputEl = null;
let comboItems = [];
let comboActive = -1;

function ensureCombo() {
    if (!comboEl) {
        comboEl = document.createElement('div');
        comboEl.className = 'combo-list';
        comboEl.hidden = true;
        comboEl.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.combo-item');
            if (!item) return;
            e.preventDefault();
            pickCombo(item.dataset.value);
        });
        document.body.appendChild(comboEl);
    }
    return comboEl;
}

function openCombo(input, showAll) {
    const query = showAll ? '' : sv(input.value).trim().toLowerCase();
    comboItems = store.state.items
        .filter((it) => !query || it.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

    if (!comboItems.length) { closeCombo(); return; }

    comboInputEl = input;
    comboActive = 0;
    const el = ensureCombo();
    el.innerHTML = comboItems.map((it, idx) =>
        '<div class="combo-item' + (idx === 0 ? ' active' : '') + '" data-value="' + esc(it.name) + '">' +
        '<span class="combo-name">' + esc(it.name) + '</span>' +
        '<span class="combo-hint">' + esc(sv(it.unit)) + (num(it.price) ? ' · ' + fmtCZK(it.price) + ' Kč' : '') + '</span>' +
        '</div>').join('');

    const rect = input.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = (rect.bottom + 2) + 'px';
    el.style.minWidth = Math.max(rect.width, 260) + 'px';
    el.hidden = false;
}

function updateComboActive() {
    if (!comboEl) return;
    [...comboEl.children].forEach((child, idx) => child.classList.toggle('active', idx === comboActive));
    const active = comboEl.children[comboActive];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
}

function closeCombo() {
    if (comboEl) { comboEl.hidden = true; comboEl.innerHTML = ''; }
    comboInputEl = null;
    comboItems = [];
    comboActive = -1;
}

function pickCombo(value) {
    const input = comboInputEl;
    if (!input) return;
    applyItemSelection(input, value, true);
    closeCombo();
    input.focus();
}

/** Přenese název do řádku a případně doplní MJ/DPH podle číselníku. */
function applyItemSelection(input, value, fromList) {
    const inv = store.state.editing;
    const rowIdx = input && input.dataset ? input.dataset.row : undefined;
    if (!inv || rowIdx === undefined) return;
    const row = inv.rows[Number(rowIdx)];
    if (!row) return;

    row.name = sv(value);
    if (input && input.value !== row.name) input.value = row.name;

    const item = store.state.items.find((i) => i.name.toLowerCase() === row.name.trim().toLowerCase());
    if (item) {
        if (item.unit) row.unit = item.unit;
        if (inv.companySnapshot && inv.companySnapshot.platceDPH) row.vat = num(item.vat);

        const unitSel = document.querySelector('[data-row="' + rowIdx + '"][data-col="unit"]');
        if (unitSel) {
            if (![...unitSel.options].some((o) => o.value === row.unit)) {
                unitSel.appendChild(new Option(row.unit, row.unit));
            }
            unitSel.value = row.unit;
        }
        const vatSel = document.querySelector('[data-row="' + rowIdx + '"][data-col="vat"]');
        if (vatSel) vatSel.value = String(num(row.vat));
    }

    store.touchInvoice();
    refreshDerived();
    if (fromList) { /* hodnoty už jsou v polích, není co překreslovat */ }
}

function bindCombo(host) {
    host.addEventListener('focusin', (e) => {
        if (e.target.classList && e.target.classList.contains('combo-input')) openCombo(e.target, false);
    });

    host.addEventListener('focusout', (e) => {
        if (e.target.classList && e.target.classList.contains('combo-input')) {
            setTimeout(() => { if (comboEl && !comboEl.hidden) closeCombo(); }, 150);
        }
    });

    // kliknutí na šipku => celý seznam (i když je v poli napsaný text)
    host.addEventListener('mousedown', (e) => {
        const toggle = e.target.closest('.combo-toggle');
        if (!toggle) return;
        e.preventDefault();
        const input = toggle.parentElement.querySelector('.combo-input');
        if (input) openCombo(input, true);
    });

    host.addEventListener('keydown', (e) => {
        if (!e.target.classList || !e.target.classList.contains('combo-input')) return;
        const open = comboEl && !comboEl.hidden;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) openCombo(e.target, true);
            else { comboActive = Math.min(comboActive + 1, comboItems.length - 1); updateComboActive(); }
        } else if (e.key === 'ArrowUp') {
            if (!open) return;
            e.preventDefault();
            comboActive = Math.max(comboActive - 1, 0);
            updateComboActive();
        } else if (e.key === 'Enter') {
            if (open && comboItems[comboActive]) { e.preventDefault(); pickCombo(comboItems[comboActive].name); }
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            closeCombo();
        }
    });

    window.addEventListener('resize', closeCombo);
    host.addEventListener('scroll', closeCombo, true);
}
