/* ---------------------------------------------------------------------------
 * Tisk faktury – rozložení podle vzoru (ABRA Flexi).
 * ------------------------------------------------------------------------- */
import { esc, sv, num, fmtCZK, fmtDate } from './util.js';
import { totals, rowTotal, buildSpd, ibanFromAccount, STATUS_LABEL, statusOf } from './invoice.js';
import { qrSvg } from './qr.js';
import { APP_NAME, APP_URL, APP_CREDIT } from './appinfo.js';

const qty = (v) => {
    const n = num(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

function partyBlock(title, snap) {
    const p = snap || {};
    return '<div class="party">' +
        '<div class="party-label">' + esc(title) + '</div>' +
        '<div class="party-name">' + esc(p.name || '—') + '</div>' +
        (p.address ? '<div>' + esc(p.address) + '</div>' : '') +
        (p.ico ? '<div>IČO: ' + esc(p.ico) + (p.dic ? ', DIČ: ' + esc(p.dic) : '') + '</div>' : (p.dic ? '<div>DIČ: ' + esc(p.dic) + '</div>' : '')) +
        '</div>';
}

/**
 * @param {object} invoice
 * @param {object} company  snapshot dodavatele (uložený u faktury)
 * @param {number} paid     uhrazená částka
 */
export function invoiceHtml(invoice, company, paid) {
    const co = company || {};
    const cust = invoice.customerSnapshot || {};
    const t = totals(invoice.rows, invoice.rounding);
    const paidAmount = Math.round((Number(paid) || 0) * 100) / 100;
    const remaining = Math.round((t.payable - paidAmount) * 100) / 100;
    const hasDiscount = (invoice.rows || []).some((r) => num(r.discount) > 0);
    const spd = buildSpd(co, invoice, t.payable);
    const iban = ibanFromAccount(co.account);
    const number = sv(invoice.number) || sv(invoice.numberDraft);
    const ks = sv(invoice.ks) || sv(co.constantSymbol) || '';
    const ss = sv(invoice.ss) || '';
    const status = statusOf(invoice, paidAmount);

    const rows = (invoice.rows || []).filter((r) => sv(r.name).trim() !== '' || num(r.price) !== 0);

    return '' +
        '<div class="invoice">' +
        '<div class="inv-head">' +
        '<div class="inv-title">Faktura – daňový doklad</div>' +
        '<div class="inv-number">' + esc(number) + '</div>' +
        '</div>' +

        '<div class="inv-grid">' +
        '<div class="col-left">' +
        partyBlock('Dodavatel:', co) +
        '<div class="contact-block">' +
        '<table class="contact-table">' +
        '<tr><th>Telefon:</th><td>' + esc(co.phone || '') + '</td></tr>' +
        '<tr><th>E-mail:</th><td>' + esc(co.email || '') + '</td></tr>' +
        '<tr><th>WWW:</th><td>' + esc(co.web || '') + '</td></tr>' +
        '</table>' +
        '</div>' +
        '<div class="bank-block">' +
        '<table class="bank-table">' +
        '<tr><th>Banka:</th><td>' + esc(co.bank || '') + '</td></tr>' +
        '<tr><th>Bankovní účet:</th><td><span class="boxed">' + esc(co.account || '') + '</span></td></tr>' +
        '<tr><th>IBAN:</th><td>' + esc(iban || '') + '</td></tr>' +
        '<tr><th>BIC:</th><td>' + esc('') + '</td></tr>' +
        '<tr><th>Var. sym.:</th><td>' + esc(sv(invoice.vs)) + '</td></tr>' +
        '<tr><th>Konst. sym.:</th><td>' + esc(ks) + '</td></tr>' +
        '<tr><th>Spec. sym.:</th><td>' + esc(ss) + '</td></tr>' +
        '</table>' +
        (spd ? '<div class="inv-qr">' + qrSvg(spd, 132) + '<div class="qr-caption">QR platba</div></div>' : '') +
        '</div>' +
        '</div>' +

        '<div class="col-right">' +
        partyBlock('Odběratel – sídlo:', cust) +
        '<table class="meta-table">' +
        '<tr><th>Číslo smlouvy:</th><td>' + esc(invoice.contractNo || '') + '</td></tr>' +
        '<tr><th>Zakázka:</th><td>' + esc(invoice.projectNo || '') + '</td></tr>' +
        '<tr><th>Objednávka:</th><td>' + esc(invoice.orderNo || '') + '</td></tr>' +
        '</table>' +
        '<table class="meta-table">' +
        '<tr><th>Forma úhrady:</th><td>Převodem</td></tr>' +
        '<tr><th>Vystaveno:</th><td>' + esc(fmtDate(invoice.issueDate)) + '</td></tr>' +
        '<tr><th>Datum splatnosti:</th><td><span class="boxed">' + esc(fmtDate(invoice.dueDate)) + '</span></td></tr>' +
        '</table>' +
        '</div>' +
        '</div>' +

        '<table class="items">' +
        '<thead><tr>' +
        '<th>Označení dodávky</th><th class="num">Množství</th><th class="c">MJ</th><th class="num">Cena za MJ</th>' +
        (hasDiscount ? '<th class="num">Sleva</th>' : '') +
        '<th class="num">Celkem [Kč]</th>' +
        '</tr></thead><tbody>' +
        (rows.length
            ? rows.map((r) => '<tr>' +
                '<td>' + esc(r.name) + '</td>' +
                '<td class="num">' + esc(qty(r.quantity)) + '</td>' +
                '<td class="c">' + esc(sv(r.unit)) + '</td>' +
                '<td class="num">' + (num(r.price) ? fmtCZK(r.price) : '') + '</td>' +
                (hasDiscount ? '<td class="num">' + (num(r.discount) ? qty(r.discount) + ' %' : '') + '</td>' : '') +
                '<td class="num">' + fmtCZK(rowTotal(r)) + '</td>' +
                '</tr>').join('')
            : '<tr><td colspan="' + (hasDiscount ? 6 : 5) + '" class="muted">Faktura neobsahuje žádné položky.</td></tr>') +
        '</tbody></table>' +

        '<div class="inv-bottom">' +
        '<div class="inv-note">' +
        (co.platceDPH ? '' : '<div class="vat-note">Neplátce DPH</div>') +
        (sv(invoice.note) ? '<div class="note">' + esc(invoice.note) + '</div>' : '') +
        '</div>' +
        '<div class="inv-totals">' +
        (co.platceDPH
            ? '<div class="trow"><span>Základ daně</span><span>' + fmtCZK(t.base) + '</span></div>' +
            [0, 12, 21].filter((r) => t.byRate[r]).map((r) =>
                '<div class="trow"><span>DPH ' + r + ' %</span><span>' + fmtCZK(t.byRate[r]) + '</span></div>').join('')
            : '') +
        (t.diff ? '<div class="trow"><span>Zaokrouhlení</span><span>' + fmtCZK(t.diff) + '</span></div>' : '') +
        '<div class="trow strong"><span>Celkem k úhradě</span><span>' + fmtCZK(t.payable) + '</span></div>' +
        '<div class="trow"><span>Zálohy</span><span>' + fmtCZK(paidAmount) + '</span></div>' +
        '<div class="trow big"><span>Zbývá uhradit [Kč]</span><span>' + fmtCZK(remaining) + '</span></div>' +
        '</div>' +
        '</div>' +

        '<div class="inv-foot">' +
        '<div class="sign">Razítko a podpis</div>' +
        '<div class="footer-note">' + esc(co.invoiceFooter || '') + '</div>' +
        '</div>' +
        '<div class="inv-credit">Vytvořeno v systému ' +
        '<a href="' + esc(APP_URL) + '">' + esc(APP_NAME) + '</a> (' + esc(APP_URL) + ')</div>' +
        '</div>';
}

/** Vykreslí fakturu do tiskové vrstvy a spustí tisk. */
export function printInvoice(invoice, company, paid) {
    let host = document.getElementById('print-area');
    if (!host) {
        host = document.createElement('div');
        host.id = 'print-area';
        document.body.appendChild(host);
    }
    host.innerHTML = invoiceHtml(invoice, company, paid);
    document.body.classList.add('printing');
    const cleanup = () => {
        document.body.classList.remove('printing');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 60);
}
