/* ---------------------------------------------------------------------------
 * Import faktur z jiných systémů:
 *   * ABRA Flexi  – XML „winstrom" (evidence faktura-vydana)
 *   * ISDOC/ISDOCX – národní standard elektronické faktury (MV ČR)
 *
 * Import je „měkký“: odběratele, položky i měrné jednotky si sám doplní do
 * číselníků, když tam ještě nejsou. Stav úhrady se neřeší – ten si později
 * dorovná import bankovního výpisu (ABO). Doklady se stejným číslem se
 * přeskočí, takže opakovaný import téhož souboru nic nezduplikuje.
 * ------------------------------------------------------------------------- */
import * as store from './store.js';
import { sv, num, digitsOnly, fmtCZK, fmtDate } from './util.js';
import { openModal, alertDialog, toast } from './ui.js';

/* ------------------------------- XML pomoc ------------------------------- */

const trim = (s) => sv(s).replace(/\s+/g, ' ').trim();
const kids = (node, name) => (node && node.children ? [...node.children].filter((c) => c.localName === name) : []);
/** První přímý potomek daného jména (namespace-agnosticky). */
const kid = (node, ...names) => {
    for (const name of names) { const found = kids(node, name)[0]; if (found) return found; }
    return null;
};
/** Text přímého potomka. */
const val = (node, ...names) => { const found = kid(node, ...names); return found ? trim(found.textContent) : ''; };
/** Zanořený potomek, cesta se píše jako 'A|B', 'C'. */
const deep = (node, ...path) => {
    let cur = node;
    for (const step of path) { if (!cur) return null; cur = kid(cur, ...String(step).split('|')); }
    return cur;
};
const deepVal = (node, ...path) => { const found = deep(node, ...path); return found ? trim(found.textContent) : ''; };
/** Číslo z textu (bere i desetinnou čárku). */
const numOf = (s) => num(String(sv(s)).replace(',', '.'));

/** Hodnota z číselníku Flexi: „code:0008“ + atribut showAs="0008: Platby za…" → „0008“. */
function codeVal(node, name) {
    const el = kid(node, name);
    if (!el) return '';
    const raw = trim(el.textContent);
    if (!raw.startsWith('code:')) return raw;
    const show = trim(el.getAttribute('showAs') || '');
    return show ? show.split(':')[0].trim() : raw.slice(5);
}

/* ------------------------------ ABRA Flexi ------------------------------- */

/** Sazba DPH z položky Flexi (číslo, nebo z kódu sazby). */
function flexiVat(item) {
    const explicit = numOf(val(item, 'szbDph'));
    if (explicit) return explicit;
    const code = val(item, 'typSzbDphK');
    if (code.includes('dphZakl')) return 21;
    if (code.includes('dphSniz')) return 12;
    if (code.includes('dphOsv') || code.includes('dphPren')) return 0;
    return 0;
}

/** Položky faktury – buď vnořené, nebo jako samostatné elementy s <parent>. */
function flexiItems(invoice) {
    let items = [...invoice.getElementsByTagName('faktura-vydana-polozka')];
    if (!items.length) {
        const id = val(invoice, 'id');
        if (id) {
            items = [...invoice.ownerDocument.documentElement.children]
                .filter((e) => e.localName === 'faktura-vydana-polozka' && val(e, 'parent') === id);
        }
    }
    return items;
}

/**
 * Faktury „bez položek“ (`bezPolozek=true`) nesou popis a částky jen v hlavičce
 * dokladu. Vytvoříme z nich řádek – případně jeden za každou použitou sazbu DPH,
 * aby součet seděl na původní doklad.
 */
function flexiHeaderRows(inv, warnings) {
    const name = val(inv, 'popis') || val(inv, 'poznam') || val(inv, 'uvodTxt') || 'Faktura ' + val(inv, 'kod');
    if (numOf(val(inv, 'sumZklSniz2')) > 0.005) {
        warnings.push('Doklad ' + (val(inv, 'kod') || '(bez čísla)') +
            ': druhá snížená sazba DPH byla namapována na 12 %.');
    }

    const buckets = [
        { base: numOf(val(inv, 'sumZklZakl')), vat: 21 },
        { base: numOf(val(inv, 'sumZklSniz')), vat: 12 },
        { base: numOf(val(inv, 'sumZklSniz2')), vat: 12 },
        { base: numOf(val(inv, 'sumOsv')), vat: 0 },
    ].filter((b) => b.base > 0.005);

    if (buckets.length) {
        return buckets.map((b) => ({
            name, unit: '', quantity: 1, price: b.base, discount: 0, vat: b.vat,
        }));
    }

    const base = numOf(val(inv, 'sumZklCelkem')) || numOf(val(inv, 'sumCelkem'));
    if (!base) return [];
    return [{ name, unit: '', quantity: 1, price: base, discount: 0, vat: 0 }];
}

function parseFlexi(doc) {
    const root = doc.documentElement;
    const invoices = [...root.children].filter((e) => e.localName === 'faktura-vydana');
    const warnings = [];

    const drafts = invoices.map((inv) => {
        const number = val(inv, 'kod');
        let rows = flexiItems(inv).map((item) => {
            const quantity = numOf(val(item, 'mnozMj')) || 1;
            let price = numOf(val(item, 'cenaMj'));
            const sumZkl = numOf(val(item, 'sumZkl'));
            if (!price && sumZkl && quantity) price = Math.round((sumZkl / quantity) * 100) / 100;
            return {
                name: val(item, 'nazev'),
                unit: codeVal(item, 'mj') || '',
                quantity,
                price,
                discount: numOf(val(item, 'slevaPol')),
                vat: flexiVat(item),
            };
        }).filter((r) => r.name);

        // bezPolozek=true → popis a částky jsou pouze v hlavičce dokladu
        let headerOnly = false;
        if (!rows.length) {
            rows = flexiHeaderRows(inv, warnings);
            headerOnly = rows.length > 0;
        }

        const address = [val(inv, 'ulice'), [val(inv, 'psc'), val(inv, 'mesto')].filter(Boolean).join(' ')]
            .filter(Boolean).join(', ');

        if (!rows.length) warnings.push('Doklad ' + (number || '(bez čísla)') + ': v exportu nejsou položky ani částky faktury.');

        return {
            source: 'Flexi XML',
            number,
            issueDate: val(inv, 'datVyst'),
            dueDate: val(inv, 'datSplat') || val(inv, 'datVyst'),
            vs: val(inv, 'varSym'),
            ks: codeVal(inv, 'konSym'),
            ss: val(inv, 'specSym'),
            note: val(inv, 'poznam') || val(inv, 'uvodTxt'),
            contractNo: val(inv, 'cisSml'),
            orderNo: val(inv, 'cisObj'),
            total: numOf(val(inv, 'sumCelkem')),
            customer: {
                name: val(inv, 'nazFirmy'),
                ico: digitsOnly(val(inv, 'ic')),
                dic: val(inv, 'dic'),
                address,
                email: val(inv, 'email'),
                phone: val(inv, 'tel'),
            },
            rows,
            headerOnly,
        };
    });

    return { format: 'Flexi XML', invoices: drafts, warnings };
}

/* -------------------------------- ISDOC ---------------------------------- */

function isdocParty(party) {
    if (!party) return { name: '', ico: '', dic: '', address: '', email: '', phone: '' };
    const ico = digitsOnly(deepVal(party, 'PartyIdentification', 'ID'));
    const dic = deepVal(party, 'PartyTaxScheme', 'CompanyID') || (ico ? 'CZ' + ico : '');
    const street = [deepVal(party, 'PostalAddress', 'StreetName'), deepVal(party, 'PostalAddress', 'BuildingNumber')]
        .filter(Boolean).join(' ');
    const city = [deepVal(party, 'PostalAddress', 'PostalZone'), deepVal(party, 'PostalAddress', 'CityName')]
        .filter(Boolean).join(' ');
    return {
        name: deepVal(party, 'PartyName', 'Name'),
        ico,
        dic,
        address: [street, city].filter(Boolean).join(', '),
        email: deepVal(party, 'Contact', 'ElectronicMail'),
        phone: deepVal(party, 'Contact', 'Telephone'),
    };
}

/** Kódy měrných jednotek ISDOC (UN/ECE) → názvy v aplikaci. */
const ISDOC_UNITS = {
    C62: 'ks', H87: 'ks', PCE: 'ks', KGM: 'kg', GRM: 'g', MTR: 'm', CMT: 'cm',
    KMT: 'km', LTR: 'l', HUR: 'hod', DAY: 'den', MON: 'měsíc', ANN: 'rok', WEE: 'týden',
};

function isdocUnit(line) {
    const raw = val(line, 'UnitOfMeasure', 'UnitOfMeasureCode');
    if (!raw) return '';
    if (ISDOC_UNITS[raw.toUpperCase()]) return ISDOC_UNITS[raw.toUpperCase()];
    return /^[a-zá-ž]{1,4}$/.test(raw) ? raw : '';
}

function parseIsdoc(doc) {
    const invoice = doc.documentElement;
    const warnings = [];
    const number = val(invoice, 'ID');
    const supplier = isdocParty(kid(deep(invoice, 'AccountingSupplierParty'), 'Party')
        || kid(deep(invoice, 'SellerSupplierParty'), 'Party'));
    const customer = isdocParty(kid(deep(invoice, 'AccountingCustomerParty'), 'Party'));

    const lines = kids(kid(invoice, 'InvoiceLines'), 'InvoiceLine');
    const rows = lines.map((line) => {
        const quantity = numOf(val(line, 'InvoicedQuantity')) || 1;
        let price = numOf(val(line, 'UnitPrice')) || numOf(val(line, 'UnitPriceTaxInclusive'));
        const lineExt = numOf(val(line, 'LineExtensionAmount'));
        // ISDOC nezná slevu na řádku – dopočítá se z rozdílu proti ceně × množství.
        let discount = 0;
        if (price && quantity && lineExt && Math.abs(price * quantity - lineExt) > 0.01) {
            discount = Math.round(Math.max(0, 1 - lineExt / (price * quantity)) * 10000) / 100;
        }
        return {
            name: deepVal(line, 'Item', 'Description') || val(line, 'Note'),
            unit: isdocUnit(line),
            quantity,
            price,
            discount,
            vat: numOf(deepVal(line, 'ClassifiedTaxCategory', 'Percent')),
        };
    }).filter((r) => r.name);

    const details = deep(invoice, 'PaymentMeans', 'Payment', 'Details');
    const account = details
        ? [val(details, 'ID'), val(details, 'BankCode')].filter(Boolean).join('/')
        : '';

    if (!rows.length) warnings.push('Doklad ' + (number || '(bez čísla)') + ': v souboru nejsou řádky faktury.');
    if (!account) warnings.push('Doklad ' + (number || '(bez čísla)') + ': chybí číslo účtu.');

    return {
        format: 'ISDOC',
        invoices: [{
            source: 'ISDOC',
            number,
            issueDate: val(invoice, 'IssueDate'),
            dueDate: val(details, 'PaymentDueDate') || val(invoice, 'IssueDate'),
            vs: val(details, 'VariableSymbol'),
            ks: val(details, 'ConstantSymbol'),
            ss: val(details, 'SpecificSymbol'),
            note: val(invoice, 'Note'),
            contractNo: '',
            orderNo: '',
            total: numOf(deepVal(invoice, 'LegalMonetaryTotal', 'PayableAmount')),
            supplier,
            account,
            customer,
            rows,
        }],
        warnings,
    };
}

/* ------------------------------ ISDOCX (ZIP) ------------------------------ */

/** Rozbalí ISDOCX (ZIP s manifest.xml + .isdoc) a vrátí obsah souboru .isdoc. */
async function unzipIsdocx(buffer) {
    const u8 = new Uint8Array(buffer);
    const view = new DataView(buffer);

    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Soubor není platný ZIP (ISDOCX).');

    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const entries = [];
    for (let i = 0; i < count; i++) {
        if (view.getUint32(offset, true) !== 0x02014b50) break;
        const method = view.getUint16(offset + 10, true);
        const compressed = view.getUint32(offset + 20, true);
        const nameLen = view.getUint16(offset + 28, true);
        const extraLen = view.getUint16(offset + 30, true);
        const commentLen = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const name = new TextDecoder('utf-8').decode(u8.subarray(offset + 46, offset + 46 + nameLen));
        entries.push({ name, method, compressed, localOffset });
        offset += 46 + nameLen + extraLen + commentLen;
    }

    const readEntry = async (entry) => {
        const lo = entry.localOffset;
        if (view.getUint32(lo, true) !== 0x04034b50) throw new Error('Poškozený ZIP.');
        const nameLen = view.getUint16(lo + 26, true);
        const extraLen = view.getUint16(lo + 28, true);
        const start = lo + 30 + nameLen + extraLen;
        const data = u8.subarray(start, start + entry.compressed);
        if (entry.method === 0) return new TextDecoder('utf-8').decode(data);
        if (entry.method !== 8) throw new Error('Nepodporovaná komprese v ZIP (' + entry.method + ').');
        if (typeof DecompressionStream !== 'function') {
            throw new Error('Prohlížeč neumí rozbalit ZIP – použijte prosím soubor .isdoc.');
        }
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(stream).text();
    };

    const manifest = entries.find((e) => /manifest\.xml$/i.test(e.name));
    if (manifest) {
        try {
            const mdoc = new DOMParser().parseFromString(await readEntry(manifest), 'application/xml');
            const main = (mdoc.getElementsByTagNameNS('*', 'maindocument')[0] || mdoc.getElementsByTagName('maindocument')[0]);
            const file = main && main.getAttribute('filename');
            const entry = file && entries.find((e) => e.name === file);
            if (entry) return await readEntry(entry);
        } catch (err) { /* zkusíme najít .isdoc přímo */ }
    }
    const isdoc = entries.find((e) => /\.isdoc$/i.test(e.name));
    if (!isdoc) throw new Error('V souboru ISDOCX není žádný .isdoc dokument.');
    return await readEntry(isdoc);
}

/* ------------------------------- rozpoznání ------------------------------ */

/** Rozpozná formát XML a vrátí rozparsované doklady. */
function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Soubor se nepodařilo přečíst jako XML.');
    const root = doc.documentElement;
    if (root.localName === 'winstrom') return parseFlexi(doc);
    if (root.localName === 'Invoice') return parseIsdoc(doc);
    if ([...root.children].some((e) => e.localName === 'faktura-vydana')) return parseFlexi(doc);
    throw new Error('Neznámý formát XML – očekávám Flexi XML (winstrom) nebo ISDOC.');
}

/* --------------------------------- průběh -------------------------------- */

async function parseFiles(files) {
    const drafts = [];
    const warnings = [];
    const fileInfo = [];

    for (const file of files) {
        try {
            const isZip = /\.(isdocx|zip)$/i.test(file.name) || file.type === 'application/zip';
            const text = isZip ? await unzipIsdocx(await file.arrayBuffer()) : await file.text();
            const parsed = parseXml(text);
            drafts.push(...parsed.invoices);
            for (const w of parsed.warnings) warnings.push(file.name + ': ' + w);
            fileInfo.push({ name: file.name, format: parsed.format, count: parsed.invoices.length });
        } catch (err) {
            warnings.push(file.name + ': ' + (err.message || 'nepodařilo se přečíst'));
            fileInfo.push({ name: file.name, format: '—', count: 0 });
        }
    }
    return { drafts, warnings, fileInfo };
}

function previewHtml(drafts, warnings, companies, selectedId, filesCount) {
    const rows = drafts.slice(0, 40).map((d) => '<tr>' +
        '<td>' + sv(d.number) + '</td>' +
        '<td>' + sv(d.issueDate) + '</td>' +
        '<td>' + sv(d.customer && d.customer.name) + '</td>' +
        '<td class="num">' + fmtCZK(d.total) + ' Kč</td>' +
        '<td>' + sv(d.source) + '</td>' +
        '</tr>').join('');

    return '<p class="muted small">Načteno <strong>' + drafts.length + '</strong> dokladů z ' + filesCount + ' souborů. ' +
        'Odběratelé, položky a měrné jednotky se doplní do číselníků, pokud tam ještě nejsou. ' +
        'Stav úhrady se neřeší (doplní ho import bankovního výpisu).</p>' +
        '<label class="field"><span>Importovat do firmy</span><select data-import-company>' +
        companies.map((c) => '<option value="' + sv(c.id) + '"' + (c.id === selectedId ? ' selected' : '') + '>' +
            sv(c.code) + ' · ' + (c.name || 'Bez názvu') + '</option>').join('') +
        '</select></label>' +
        (drafts.length
            ? '<div class="table-wrap" style="margin-top:10px"><table><thead><tr>' +
              '<th>Číslo</th><th>Vystaveno</th><th>Odběratel</th><th class="num">Částka</th><th>Formát</th>' +
              '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
              (drafts.length > 40 ? '<p class="muted small">… a dalších ' + (drafts.length - 40) + ' dokladů</p>' : '')
            : '<p class="empty">Nepodařilo se načíst žádný doklad.</p>') +
        (warnings.length
            ? '<details class="import-warnings"><summary>Upozornění (' + warnings.length + ')</summary>' +
              '<ul class="muted small">' + warnings.slice(0, 50).map((w) => '<li>' + sv(w) + '</li>').join('') + '</ul></details>'
            : '');
}

/** Otevře výběr souborů a provede import. */
export function openInvoiceImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xml,.isdoc,.isdocx,.zip,application/xml,text/xml,application/zip';
    input.addEventListener('change', async () => {
        const files = [...(input.files || [])];
        if (!files.length) return;
        toast('Načítám doklady…', 'info', 1500);

        const { drafts, warnings, fileInfo } = await parseFiles(files);
        if (!drafts.length) {
            await alertDialog('Import faktur', 'V souborech nebyly nalezeny žádné faktury.\n\n' + warnings.join('\n'));
            return;
        }

        // Cílová firma: podle IČO dodavatele (ISDOC), jinak aktivní firma.
        const supplierIco = digitsOnly((drafts.find((d) => d.supplier && d.supplier.ico) || {}).supplier?.ico || '');
        const byIco = supplierIco ? store.state.companies.find((c) => digitsOnly(c.ico) === supplierIco) : null;
        const active = store.activeCompany();
        const selectedId = (byIco || active || {}).id;

        const { promise, close } = openModal({
            title: 'Import faktur',
            size: 'wide',
            bodyHtml: previewHtml(drafts, warnings, store.state.companies, selectedId, fileInfo.length),
            buttons: [
                { label: 'Zrušit', value: false },
                {
                    label: 'Importovat ' + drafts.length + ' faktur',
                    variant: 'primary',
                    onClick: ({ body }) => {
                        const select = body.querySelector('[data-import-company]');
                        const companyId = select ? select.value : selectedId;
                        store.importInvoices(drafts, { companyId })
                            .then(async (stats) => { close(true); await reportImport(stats); })
                            .catch((err) => toast(err.message || 'Import se nepodařil.', 'err'));
                        return false;   // náhled zavřeme až po dokončení importu
                    },
                },
            ],
        });
        await promise;
    });
    input.click();
}

async function reportImport(stats) {
    const lines = [
        'Importováno faktur: ' + stats.invoices,
        stats.skipped ? 'Přeskočeno (stejné číslo už existuje): ' + stats.skipped : null,
        stats.headerOnly ? 'Dokladů bez položek (použit popis a částka z hlavičky): ' + stats.headerOnly : null,
        stats.customers ? 'Nových odběratelů: ' + stats.customers : null,
        stats.items ? 'Nových položek: ' + stats.items : null,
        stats.units ? 'Nových měrných jednotek: ' + stats.units : null,
        (stats.filled && stats.filled.length) ? 'Doplněno do firmy: ' + stats.filled.join(', ') : null,
    ].filter(Boolean);
    const warn = stats.warnings.length
        ? '\n\nUpozornění (' + stats.warnings.length + '):\n' + stats.warnings.slice(0, 20).join('\n')
        : '';
    await alertDialog('Import dokončen', lines.join('\n') + warn);
    toast('Import hotov – ' + stats.invoices + ' faktur.', stats.invoices ? 'ok' : 'warn');
}
