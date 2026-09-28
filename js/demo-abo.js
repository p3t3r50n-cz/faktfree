/* ---------------------------------------------------------------------------
 * Generátor ukázkového ABO/GPC výpisu z aktuálních dat (pro testování importu).
 * Vytvoří příchozí platby k nezaplaceným fakturám + pár „šumových“ položek.
 * ------------------------------------------------------------------------- */
import { sv, num, digitsOnly } from './util.js';
import { accountBankCode, accountDigits } from './abo.js';

const numPad = (v, len) => String(Math.round(Number(v) || 0)).padStart(len, '0').slice(-len);
const txtPad = (s, len) => String(s == null ? '' : s).slice(0, len).padEnd(len, ' ');

function ddmmyy(iso) {
    const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + m[2] + m[1].slice(2)) : '010126';
}

/** Číslo účtu bez kódu banky, doplněné na 16 znaků (formát ABO). */
const acct16 = (account) => accountDigits(account).padStart(16, '0').slice(-16);

/**
 * @param {object} company        firma (dodavatel)
 * @param {Array}  invoices       faktury, které mají být v ukázce uhrazeny
 * @param {Array}  otherAccounts  čísla účtů ostatních firem (pro interní převod)
 * @param {string} periodStart    "YYYY-MM-DD"
 */
export function buildDemoAbo(company, invoices, otherAccounts, periodStart) {
    const account = acct16(company.account);
    const bank = accountBankCode(company.account) || '6210';
    const credit = invoices.reduce((s, i) => s + num(i.amount), 0);

    const lines = [];
    lines.push(
        '074' + account + txtPad(company.name, 20) + ddmmyy(periodStart) +
        numPad(0, 14) + '+' + numPad(credit, 14) + '+' + numPad(0, 14) + '0' + numPad(credit, 14) + '0' +
        '001' + ddmmyy(periodStart) + ' '.repeat(14)
    );

    let doc = 9001;
    const push075 = (opts) => {
        lines.push(
            '075' + account +
            txtPad(opts.contra, 16) +
            numPad(doc++, 13) +
            numPad(Math.round(Math.abs(opts.amount) * 100), 12) +
            (opts.code || '2') +
            numPad(digitsOnly(opts.vs || ''), 10) +
            '00' + txtPad(opts.contraBank || '0100', 4).replace(/ /g, '0') + numPad(opts.ks || 0, 4) +
            numPad(digitsOnly(opts.ss || ''), 10) +
            ddmmyy(opts.date) +
            txtPad(opts.message || 'PRICHOZI PLATBA', 20) +
            '0' +
            '0000' +
            ddmmyy(opts.date)
        );
    };

    // 1) platby na nezaplacené faktury (VS + přesná částka → auto-spárování)
    for (const invoice of invoices) {
        push075({
            contra: '000000' + String(1000000000 + invoices.indexOf(invoice) * 7919).slice(0, 10),
            contraBank: '0100',
            amount: invoice.amount,
            vs: invoice.vs,
            date: invoice.date,
            message: 'PRICHOZI PLATBA',
        });
    }

    // 2) platba s neznámým VS (k ručnímu spárování)
    push075({
        contra: '000000' + '5551234567', contraBank: '0300',
        amount: 1234.56, vs: '9999999999', date: periodStart, message: 'PLATBA BEZ VS',
    });

    // 3) interní převod z jiného vlastního účtu
    if (otherAccounts.length) {
        push075({
            contra: acct16(otherAccounts[0]), contraBank: bank,
            amount: 5000, vs: '', date: periodStart, message: 'VLASTNI PREVOD PLATB',
        });
    }

    // 4) odchozí platba (přeskočí se)
    push075({
        contra: '000000' + '2223334445', contraBank: '0710',
        amount: 2500, vs: '0051665125', ks: '0008', code: '1',
        date: periodStart, message: 'ODCHOZI PLATBA',
    });

    return lines.join('\r\n') + '\r\n';
}
