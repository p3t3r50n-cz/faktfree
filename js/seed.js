/* ---------------------------------------------------------------------------
 * Demo data pro první spuštění (a pro testování).
 * Datová sada je deterministická, aby čísla faktur byla předvídatelná.
 * Všechna jména, IČO, účty i adresy jsou smyšlené (fiktivní IČO v ARES neexistují),
 * aby demo neobsahovalo údaje žádné skutečné osoby ani firmy.
 * ------------------------------------------------------------------------- */
import { DEFAULT_UNITS, formatNumber, vsFromNumber, totals } from './invoice.js';
import { uid, addDays } from './util.js';

const COMPANIES = [
    {
        code: '01', prefix: 'FA',
        name: 'Jan Novák', ico: '12345678', dic: '',
        address: 'Dlouhá 12, 11000 Praha 1',
        account: '1234567890/0300', bank: 'Ukázková banka, a.s.',
        email: 'jan.novak@example.com', phone: '+420 123 456 789', web: 'https://example.com',
        platceDPH: false, dueDays: 14, paymentMessage: 'Faktura',
        invoiceFooter: 'Nejsem plátce DPH.',
    },
    {
        code: '02', prefix: 'VF',
        name: 'Ukázková firma s.r.o.', ico: '87654321', dic: 'CZ87654321',
        address: 'Nádražní 5, 60200 Brno',
        account: '9876543210/0100', bank: 'Ukázková banka, a.s.',
        email: 'info@example.com', phone: '+420 987 654 321', web: '',
        platceDPH: true, dueDays: 14, paymentMessage: 'Faktura',
        invoiceFooter: '',
    },
];

const CUSTOMERS = [
    { name: 'Karel Svoboda', ico: '55555555', dic: '', address: 'Zahradní 12, 25001 Ukázkovice', account: '', email: 'karel.svoboda@example.com', phone: '' },
    { name: 'Josef Vondráček', ico: '22222222', dic: '', address: 'Polní 230, 25001 Ukázkovice', account: '', email: '', phone: '' },
    { name: 'Společnost Alfa s.r.o.', ico: '33333333', dic: 'CZ33333333', address: 'Průmyslová 8, 61900 Brno', account: '', email: 'info@example.com', phone: '' },
    { name: 'Základní škola Ukázkovice', ico: '44444444', dic: '', address: 'Školní 123, 25001 Ukázkovice', account: '', email: '', phone: '' },
    { name: 'Obec Ukázkovice', ico: '11111111', dic: 'CZ11111111', address: 'Náměstí Míru 1, 25001 Ukázkovice', account: '', email: '', phone: '' },
    { name: 'Marie Horáková', ico: '66666666', dic: '', address: 'Lipová 4, 60200 Brno', account: '', email: '', phone: '' },
];

/** název, MJ, sazba DPH, výchozí cena (cena se na fakturu předvyplňuje jen ručně) */
const ITEMS = [
    ['Webový vývoj, IT outsourcing', 'hod', 21, 1200],
    ['Redakční systém', 'paušál', 21, 25000],
    ['Grafický design', 'hod', 21, 900],
    ['Konzultace', 'hod', 21, 800],
    ['Webhosting (rok)', 'rok', 21, 2400],
    ['Doména .cz (rok)', 'rok', 21, 250],
    ['Správa serveru', 'měsíc', 21, 1500],
    ['Školení', 'hod', 21, 1000],
    ['Tvorba loga', 'ks', 21, 6000],
    ['Technická podpora', 'hod', 21, 700],
    ['Odborná kniha', 'ks', 12, 450],
];

/** [datum vystavení, index odběratele, [[index položky, množství, sleva %]], stav úhrady] */
const SPEC = [
    // firma 0 – Jan Novák (neplátce DPH)
    ['2024-01-15', 0, [[0, 20]], 'paid'],
    ['2024-02-12', 1, [[2, 8]], 'paid'],
    ['2024-03-20', 2, [[1, 1]], 'paid'],
    ['2024-05-06', 0, [[0, 12], [5, 1]], 'paid'],
    ['2024-09-11', 3, [[3, 6]], 'paid'],
    ['2024-11-25', 1, [[0, 24]], 'paid'],
    ['2025-01-20', 2, [[7, 16]], 'paid'],
    ['2025-02-17', 0, [[2, 10]], 'paid'],
    ['2025-03-31', 1, [[1, 1]], 'paid'],
    ['2025-04-22', 4, [[0, 18]], 'paid'],
    ['2025-06-09', 3, [[3, 4], [4, 1, 10]], 'paid'],
    ['2025-08-14', 0, [[0, 30]], 'paid'],
    ['2025-10-02', 5, [[2, 12]], 'paid'],
    ['2025-12-18', 1, [[8, 1]], 'paid'],
    ['2026-01-13', 0, [[0, 22]], 'paid'],
    ['2026-02-24', 2, [[1, 1], [5, 1]], 'paid'],
    ['2026-04-15', 2, [[0, 16]], 'paid'],
    ['2026-05-19', 1, [[3, 8, 15]], 'paid'],
    ['2026-06-30', 0, [[0, 14]], 'partial'],
    ['2026-07-10', 4, [[0, 10]], 'open'],
    ['2026-09-15', 3, [[3, 5]], 'open'],
    // firma 1 – Ukázková firma s.r.o. (plátce DPH)
    ['2025-03-05', 5, [[0, 10]], 'paid'],
    ['2025-07-14', 1, [[2, 6]], 'paid'],
    ['2025-09-30', 0, [[1, 1]], 'paid'],
    ['2026-02-11', 3, [[0, 20]], 'paid'],
    ['2026-04-08', 2, [[7, 12]], 'paid'],
    ['2026-08-19', 5, [[3, 10]], 'open'],
    ['2026-09-22', 4, [[0, 8], [10, 2]], 'open'],
];

export function buildDemo() {
    const now = new Date().toISOString();
    const companies = COMPANIES.map((c) => ({
        id: uid('co'),
        code: c.code, prefix: c.prefix,
        name: c.name, ico: c.ico, dic: c.dic, address: c.address,
        account: c.account, bank: c.bank, email: c.email, phone: c.phone, web: c.web,
        platceDPH: c.platceDPH, dueDays: c.dueDays,
        paymentMessage: c.paymentMessage, invoiceFooter: c.invoiceFooter,
        counters: {}, createdAt: now,
    }));

    const customers = CUSTOMERS.map((c) => Object.assign({ id: uid('cu') }, c));

    const items = ITEMS.map(([name, unit, vat, price]) => ({ id: uid('it'), name, unit, vat, price }));

    const units = DEFAULT_UNITS.concat(['rok']).map((name) => ({ id: 'unit-' + name, name }));

    const invoices = [];
    const payments = [];
    const counters = {};

    SPEC.forEach(([issueDate, custIdx, rowsSpec, payMode], index) => {
        const companyIdx = index < 21 ? 0 : 1;
        const company = companies[companyIdx];
        const customer = customers[custIdx];
        const year = issueDate.slice(0, 4);

        const rows = rowsSpec.map(([itemIdx, quantity, discount]) => {
            const item = items[itemIdx];
            return {
                name: item.name,
                unit: item.unit,
                quantity: quantity,
                price: item.price,
                discount: discount || 0,
                vat: company.platceDPH ? item.vat : 0,
            };
        });

        const key = company.id + '|' + year;
        counters[key] = (counters[key] || 0) + 1;
        const number = formatNumber(company, year, counters[key]);
        const dueDate = addDays(issueDate, company.dueDays);
        const id = uid('inv');

        const invoice = {
            id,
            companyId: company.id,
            number,
            numberCommitted: true,
            vs: vsFromNumber(number),
            ks: '', ss: '',
            issueDate, dueDate,
            customerId: customer.id,
            customerSnapshot: {
                name: customer.name, ico: customer.ico, dic: customer.dic,
                address: customer.address, account: customer.account,
                email: customer.email, phone: customer.phone,
            },
            companySnapshot: {
                name: company.name, ico: company.ico, dic: company.dic, address: company.address,
                account: company.account, bank: company.bank, email: company.email, phone: company.phone,
                web: company.web, platceDPH: company.platceDPH,
                paymentMessage: company.paymentMessage, invoiceFooter: company.invoiceFooter,
            },
            rows,
            note: '',
            contractNo: '', projectNo: '', orderNo: '',
            rounding: false,
            createdAt: issueDate + 'T09:00:00.000Z',
            updatedAt: now,
        };
        invoices.push(invoice);

        const payable = totals(rows, invoice.rounding).payable;
        if (payMode === 'paid' || payMode === 'partial') {
            const amount = payMode === 'paid' ? payable : Math.round(payable * 0.6);
            const valueDate = addDays(issueDate, 3);
            payments.push({
                id: uid('pay'),
                companyId: company.id,
                account: company.account.replace(/\D/g, '').padStart(16, '0').slice(-16),
                docNumber: String(2000000 + index),
                valueDate,
                amount,
                vs: invoice.vs,
                ks: '0000', ss: '',
                contraAccount: '00000' + String(1000000000 + index * 137).slice(0, 10),
                contraBank: '0100',
                message: 'PRICHOZI PLATBA',
                dueDate: valueDate,
                kind: 'invoice',
                allocations: [{ invoiceId: id, amount, at: valueDate + 'T10:00:00.000Z' }],
                fingerprint: ['demo', company.id, index].join('|'),
                importedAt: now,
                sourceFile: 'demo',
            });
        }
    });

    for (const company of companies) {
        const map = {};
        for (const key of Object.keys(counters)) {
            const [companyId, year] = key.split('|');
            if (companyId === company.id) map[year] = counters[key];
        }
        company.counters = map;
    }

    return {
        companies, customers, items, units, invoices, payments,
        lastCompanyCode: companies.length,
        settings: { activeCompanyId: companies[0].id, theme: 'auto', demo: true },
    };
}
