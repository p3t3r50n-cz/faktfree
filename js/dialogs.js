/* ---------------------------------------------------------------------------
 * Dialogy pro správu číselníků (odběratelé, položky, MJ) a párování plateb.
 * ------------------------------------------------------------------------- */
import { openModal, confirmDialog, toast } from './ui.js';
import { esc, sv, num, fmtCZK, debounce } from './util.js';
import { VAT_RATES } from './invoice.js';
import * as store from './store.js';
import { aresLookup } from './ares.js';
import { icon, setIcon } from './icons.js';

/* ----------------------------- odběratelé -------------------------------- */

export function manageCustomers() {
    return openModal({
        title: 'Odběratelé',
        size: 'wide',
        buttons: [{ label: 'Zavřít', variant: 'primary', value: true }],
        bodyHtml: '<div class="dialog-toolbar"><button class="btn primary" data-add>+ Přidat odběratele</button>' +
            '<span class="muted small">Seznam je referenční – změny neovlivní už vystavené faktury.</span></div>' +
            '<div data-list></div>',
        onMount: ({ body }) => {
            const list = body.querySelector('[data-list]');

            const save = debounce(async (customer) => { await store.saveCustomer(customer); }, 400);

            function render() {
                if (!store.state.customers.length) {
                    list.innerHTML = '<div class="empty">Žádní odběratelé.</div>';
                    return;
                }
                list.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
                    '<th>Název</th><th>IČO</th><th>DIČ</th><th>Adresa</th><th>Účet</th><th>E-mail</th><th></th>' +
                    '</tr></thead><tbody>' +
                    store.state.customers.map((c, i) =>
                        '<tr>' +
                        '<td><input data-cust="' + i + '" data-field="name" value="' + esc(c.name) + '" style="min-width:240px"></td>' +
                        '<td><div class="input-row" style="min-width:180px">' +
                        '<input data-cust="' + i + '" data-field="ico" value="' + esc(c.ico) + '" style="min-width:90px">' +
                        '<button class="btn small" data-ares="' + i + '" title="Načíst údaje z ARES">' + icon('broadcast') + ' ARES</button>' +
                        '</div></td>' +
                        '<td><input data-cust="' + i + '" data-field="dic" value="' + esc(c.dic) + '" style="min-width:100px"></td>' +
                        '<td><input data-cust="' + i + '" data-field="address" value="' + esc(c.address) + '" style="min-width:190px"></td>' +
                        '<td><input data-cust="' + i + '" data-field="account" value="' + esc(c.account) + '" style="min-width:130px"></td>' +
                        '<td><input data-cust="' + i + '" data-field="email" value="' + esc(c.email) + '" style="min-width:140px"></td>' +
                        '<td><button class="btn small danger" data-del="' + i + '" title="Smazat">' + icon('x-lg') + '</button></td>' +
                        '</tr>').join('') +
                    '</tbody></table></div>';
            }

            list.addEventListener('input', (e) => {
                const idx = e.target.dataset.cust;
                if (idx === undefined) return;
                const customer = store.state.customers[Number(idx)];
                if (!customer) return;
                customer[e.target.dataset.field] = e.target.value;
                save(customer);
            });

            list.addEventListener('click', async (e) => {
                const del = e.target.closest('[data-del]');
                if (del) {
                    const customer = store.state.customers[Number(del.dataset.del)];
                    if (customer && await confirmDialog({
                        title: 'Smazat odběratele?',
                        body: '„' + sv(customer.name) + '“ bude odebrán z číselníku. Vystavené faktury zůstanou beze změny.',
                        okLabel: 'Smazat', danger: true,
                    })) {
                        await store.removeCustomer(customer.id);
                        render();
                    }
                    return;
                }
                const ares = e.target.closest('[data-ares]');
                if (ares) {
                    const customer = store.state.customers[Number(ares.dataset.ares)];
                    if (!customer) return;
                    const old = ares.innerHTML;
                    ares.disabled = true; setIcon(ares, 'hourglass-split');
                    try {
                        const data = await aresLookup(customer.ico);
                        customer.name = data.name || customer.name;
                        customer.address = data.address || customer.address;
                        customer.dic = data.dic || customer.dic;
                        await store.saveCustomer(customer);
                        render();
                        toast('Údaje načteny z ARES.', 'ok');
                    } catch (err) {
                        toast(err.message, 'err');
                    } finally {
                        ares.disabled = false; ares.innerHTML = old;
                    }
                }
            });

            body.querySelector('[data-add]').addEventListener('click', async () => {
                await store.saveCustomer({ id: null, name: 'Nový odběratel', ico: '', dic: '', address: '', account: '', email: '', phone: '' });
                render();
                const inputs = list.querySelectorAll('[data-field="name"]');
                if (inputs.length) inputs[inputs.length - 1].focus();
            });

            render();
        },
    });
}

/* ------------------------------- položky --------------------------------- */

export function manageItems() {
    return openModal({
        title: 'Položky',
        size: 'wide',
        buttons: [{ label: 'Zavřít', variant: 'primary', value: true }],
        bodyHtml: '<div class="dialog-toolbar"><button class="btn primary" data-add>+ Přidat položku</button>' +
            '<span class="muted small">Cena je jen orientační – na faktuře ji lze přepsat.</span></div>' +
            '<div data-list></div>',
        onMount: ({ body }) => {
            const list = body.querySelector('[data-list]');
            const save = debounce(async (item) => { await store.saveItem(item); }, 400);

            function render() {
                const units = store.state.units;
                if (!store.state.items.length) {
                    list.innerHTML = '<div class="empty">Číselník je prázdný.</div>';
                    return;
                }
                list.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
                    '<th>Název</th><th>MJ</th><th class="num">Cena</th><th>DPH</th><th></th>' +
                    '</tr></thead><tbody>' +
                    store.state.items.map((it, i) =>
                        '<tr>' +
                        '<td><input data-item="' + i + '" data-field="name" value="' + esc(it.name) + '" style="min-width:220px"></td>' +
                        '<td><select data-item="' + i + '" data-field="unit" style="min-width:90px">' +
                        units.map((u) => '<option' + (sv(it.unit) === u.name ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') +
                        '</select></td>' +
                        '<td><input type="number" step="0.01" min="0" data-item="' + i + '" data-field="price" value="' + esc(it.price) + '" style="min-width:90px"></td>' +
                        '<td><select data-item="' + i + '" data-field="vat" style="min-width:80px">' +
                        VAT_RATES.map((r) => '<option value="' + r + '"' + (num(it.vat) === r ? ' selected' : '') + '>' + r + ' %</option>').join('') +
                        '</select></td>' +
                        '<td><button class="btn small danger" data-del="' + i + '" title="Smazat">' + icon('x-lg') + '</button></td>' +
                        '</tr>').join('') +
                    '</tbody></table></div>';
            }

            list.addEventListener('input', (e) => {
                const idx = e.target.dataset.item;
                if (idx === undefined) return;
                const item = store.state.items[Number(idx)];
                if (!item) return;
                const field = e.target.dataset.field;
                item[field] = field === 'vat' || field === 'price' ? num(e.target.value) : e.target.value;
                save(item);
            });

            list.addEventListener('click', async (e) => {
                const del = e.target.closest('[data-del]');
                if (!del) return;
                const item = store.state.items[Number(del.dataset.del)];
                if (item && await confirmDialog({
                    title: 'Smazat položku?',
                    body: '„' + sv(item.name) + '“ bude odebrána z číselníku. Vystavené faktury zůstanou beze změny.',
                    okLabel: 'Smazat', danger: true,
                })) {
                    await store.removeItem(item.id);
                    render();
                }
            });

            body.querySelector('[data-add]').addEventListener('click', async () => {
                await store.saveItem({ id: null, name: 'Nová položka', unit: 'ks', vat: 21, price: 0 });
                render();
            });

            render();
        },
    });
}

/* --------------------------------- MJ ----------------------------------- */

export function manageUnits() {
    return openModal({
        title: 'Měrné jednotky',
        buttons: [{ label: 'Zavřít', variant: 'primary', value: true }],
        bodyHtml: '<div class="dialog-toolbar"><button class="btn primary" data-add>+ Přidat MJ</button></div><div data-list></div>',
        onMount: ({ body }) => {
            const list = body.querySelector('[data-list]');
            const save = debounce(async (unit) => { await store.saveUnit(unit); }, 400);

            function render() {
                list.innerHTML = '<div class="table-wrap"><table><tbody>' +
                    store.state.units.map((u, i) =>
                        '<tr><td><input data-unit="' + i + '" value="' + esc(u.name) + '"></td>' +
                        '<td style="width:1%"><button class="btn small danger" data-del="' + i + '">' + icon('x-lg') + '</button></td></tr>').join('') +
                    '</tbody></table></div>';
            }

            list.addEventListener('input', (e) => {
                const idx = e.target.dataset.unit;
                if (idx === undefined) return;
                const unit = store.state.units[Number(idx)];
                if (!unit) return;
                unit.name = e.target.value;
                save(unit);
            });

            list.addEventListener('click', async (e) => {
                const del = e.target.closest('[data-del]');
                if (!del) return;
                const unit = store.state.units[Number(del.dataset.del)];
                if (!unit) return;
                if (await confirmDialog({
                    title: 'Smazat měrnou jednotku?',
                    body: '„' + sv(unit.name) + '“ bude odebrána z číselníku. Vystavené faktury zůstanou beze změny.',
                    okLabel: 'Smazat', danger: true,
                })) {
                    await store.removeUnit(unit.id);
                    render();
                }
            });

            body.querySelector('[data-add]').addEventListener('click', async () => {
                await store.saveUnit({ id: null, name: 'nová' });
                render();
                const inputs = list.querySelectorAll('input');
                if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
            });

            render();
        },
    });
}

/* --------------------------- párování platby ---------------------------- */

export function allocatePayment(payment) {
    const invoices = store.invoicesForPayment(payment);

    function options(selectedId) {
        return '<option value="">-- nezařazeno --</option>' + invoices.map((inv) => {
            const remaining = store.remainingOf(inv);
            const label = sv(inv.number) + ' · ' + sv(inv.customerSnapshot && inv.customerSnapshot.name) +
                ' · zbývá ' + fmtCZK(remaining) + ' Kč';
            return '<option value="' + esc(inv.id) + '"' + (selectedId === inv.id ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('');
    }

    const free = store.freeAmount(payment);

    return openModal({
        title: 'Párování platby',
        size: 'wide',
        buttons: [{ label: 'Zavřít', variant: 'primary', value: true }],
        bodyHtml:
            '<div class="pay-summary">' +
            '<div><span class="muted small">Datum</span><div>' + esc(payment.valueDate) + '</div></div>' +
            '<div><span class="muted small">Částka</span><div><strong>' + fmtCZK(payment.amount) + ' Kč</strong></div></div>' +
            '<div><span class="muted small">VS</span><div>' + esc(payment.vs || '—') + '</div></div>' +
            '<div><span class="muted small">Protiúčet</span><div>' + esc(payment.contraAccount + '/' + payment.contraBank) + '</div></div>' +
            '<div><span class="muted small">Volná částka</span><div><strong data-free>' + fmtCZK(free) + ' Kč</strong></div></div>' +
            '</div>' +
            '<p class="muted small">' + esc(payment.message) + '</p>' +
            '<div data-allocs></div>' +
            '<div class="dialog-toolbar" style="margin-top:14px;align-items:flex-end;gap:10px">' +
            '<label class="field" style="flex:2"><span>Faktura</span><select data-invoice>' + options(null) + '</select></label>' +
            '<label class="field" style="flex:1"><span>Částka (Kč)</span><input type="number" step="0.01" min="0" data-amount value="' + (free > 0 ? free.toFixed(2) : '0.00') + '"></label>' +
            '<button class="btn primary" data-assign>Přiřadit</button>' +
            '</div>',
        onMount: ({ body }) => {
            const allocs = body.querySelector('[data-allocs]');

            function renderAllocs() {
                const list = payment.allocations || [];
                if (!list.length) {
                    allocs.innerHTML = '<p class="muted small">Platba zatím není přiřazena k žádné faktuře.</p>';
                    return;
                }
                allocs.innerHTML = '<table><thead><tr><th>Faktura</th><th class="num">Částka</th><th></th></tr></thead><tbody>' +
                    list.map((a) => {
                        const inv = store.state.invoices.find((i) => i.id === a.invoiceId);
                        return '<tr><td>' + esc(inv ? inv.number : '(smazaná faktura)') + '</td>' +
                            '<td class="num">' + fmtCZK(a.amount) + ' Kč</td>' +
                            '<td><button class="btn small danger" data-remove="' + esc(a.invoiceId) + '">' + icon('x-lg') + '</button></td></tr>';
                    }).join('') + '</tbody></table>';
            }

            allocs.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-remove]');
                if (!btn) return;
                const invoice = store.state.invoices.find((i) => i.id === btn.dataset.remove);
                const allocation = (payment.allocations || []).find((a) => a.invoiceId === btn.dataset.remove);
                if (!(await confirmDialog({
                    title: 'Zrušit vazbu?',
                    body: 'Platba se odpojí od faktury ' + (invoice ? sv(invoice.number) : '(smazaná)') +
                        (allocation ? ' (částka ' + fmtCZK(allocation.amount) + ' Kč)' : '') + '.',
                    okLabel: 'Zrušit vazbu', danger: true,
                }))) return;
                await store.deallocate(payment.id, btn.dataset.remove);
                renderAllocs();
                body.querySelector('[data-free]').textContent = fmtCZK(store.freeAmount(payment)) + ' Kč';
            });

            body.querySelector('[data-assign]').addEventListener('click', async () => {
                const invoiceId = body.querySelector('[data-invoice]').value;
                const amount = num(body.querySelector('[data-amount]').value);
                if (!invoiceId) { toast('Vyberte fakturu.', 'err'); return; }
                try {
                    await store.allocate(payment.id, invoiceId, amount);
                    renderAllocs();
                    body.querySelector('[data-free]').textContent = fmtCZK(store.freeAmount(payment)) + ' Kč';
                    toast('Platba přiřazena.', 'ok');
                } catch (err) {
                    toast(err.message, 'err');
                }
            });

            body.querySelector('[data-invoice]').addEventListener('change', (e) => {
                const inv = store.state.invoices.find((i) => i.id === e.target.value);
                if (inv) {
                    const freeNow = store.freeAmount(payment);
                    const amount = Math.min(freeNow, store.remainingOf(inv));
                    body.querySelector('[data-amount]').value = amount.toFixed(2);
                }
            });

            renderAllocs();
        },
    });
}
