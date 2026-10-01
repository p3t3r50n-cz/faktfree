/* ---------------------------------------------------------------------------
 * Nastavení: firmy, zálohy, úložiště, demo data, vzhled.
 * ------------------------------------------------------------------------- */
import * as store from '../store.js';
import * as db from '../db.js';
import { esc, sv, num, debounce, todayStr } from '../util.js';
import { confirmDialog, alertDialog, toast, openModal } from '../ui.js';
import { buildDemoAbo } from '../demo-abo.js';
import { downloadBackup, backupText, backupWarnDays, backupStale } from '../backup.js';
import { allThemes, THEME_DEFAULTS, normalizeTheme, resolveTheme } from '../themes.js';
import { icon } from '../icons.js';
import { APP_NAME, APP_URL, APP_VERSION, APP_AUTHOR, APP_AUTHOR_URL, APP_LICENSE, APP_YEAR } from '../appinfo.js';

let versionRetryDone = false;

export function renderSettings(host) {
    const company = store.activeCompany();
    if (!company) {
        host.innerHTML = '<div class="empty card">Neexistuje žádná firma.</div>';
        return;
    }
    const theme = store.state.settings.theme || 'auto';
    const isDemo = !!store.state.settings.demo;
    host.innerHTML =
        '<div class="view-head"><h2>Nastavení</h2></div>' +

        '<div class="tabs">' +
        store.state.companies.map((c) =>
            '<button class="tab' + (c.id === company.id ? ' active' : '') + '" data-action="switch-company" data-id="' + esc(c.id) + '">' +
            esc(sv(c.code) + ' · ' + (c.name || 'Bez názvu')) + '</button>').join('') +
        '<button class="tab add" data-action="add-company" title="Přidat firmu">+</button>' +
        '</div>' +

        '<div class="card"><div class="view-head"><h3>Údaje firmy</h3>' +
        '<div class="view-head-actions">' +
        '<button class="btn ghost" data-action="ares-company">' + icon('broadcast') + ' Načíst z ARES</button>' +
        '<button class="btn danger ghost" data-action="delete-company">Smazat firmu</button>' +
        '</div></div>' +
        '<div class="grid3">' +
        field('Kód firmy (v čísle faktury)', 'code', company.code, { readonly: true }) +
        field('Prefix číselné řady', 'prefix', company.prefix, { hint: 'Volitelný, jen písmena (např. FA, VF)' }) +
        field('Obchodní název', 'name', company.name) +
        field('IČO', 'ico', company.ico) +
        field('DIČ', 'dic', company.dic) +
        field('Adresa', 'address', company.address) +
        field('Bankovní účet', 'account', company.account, { hint: 'např. 123456-1234567890/0300' }) +
        field('Banka', 'bank', company.bank) +
        field('E-mail', 'email', company.email) +
        field('Telefon', 'phone', company.phone) +
        field('Web', 'web', company.web) +
        field('Splatnost (dny)', 'dueDays', company.dueDays, { type: 'number', min: 0, max: 365 }) +
        field('Zpráva pro příjemce', 'paymentMessage', company.paymentMessage) +
        '<label class="field"><span>Patička faktury</span><textarea data-co="invoiceFooter" rows="2">' + esc(company.invoiceFooter) + '</textarea></label>' +
        '<label class="inline checkbox-field"><input type="checkbox" data-co="platceDPH"' + (company.platceDPH ? ' checked' : '') + '> Plátce DPH</label>' +
        '</div>' +
        '<p class="muted small" style="margin-top:10px">Vzor čísla faktury: <strong>' +
        esc(sv(company.prefix)) + new Date().getFullYear() + esc(sv(company.code)) + '0001</strong>' +
        ' (prefix + rok + kód firmy + pořadí). Variabilní symbol = posledních 10 číslic. Pořadí se resetuje každý rok.</p>' +
        '</div>' +

        '<div class="card"><h3>Záloha dat</h3>' +
        '<p class="muted small">Vše je uloženo v tomto prohlížeči (IndexedDB). Zálohu si stáhněte jako soubor JSON – ' +
        'lze ji kdykoli naimportovat zpět (i do jiného počítače).</p>' +
        '<div class="dialog-toolbar">' +
        '<button class="btn primary" data-action="export-json">' + icon('download') + ' Exportovat data</button>' +
        '<button class="btn" data-action="import-json">' + icon('upload') + ' Importovat data</button>' +
        '</div>' +
        '<p class="muted small backup-state' + (backupStale() ? ' stale' : '') + '" style="margin-top:10px">' +
        esc(backupText()) + '</p>' +
        '<div class="grid2" style="align-items:end">' +
        '<label class="field"><span>Připomínat po dnech bez zálohy</span>' +
        '<input type="number" min="1" max="90" step="1" data-setting="backupWarnDays" value="' + esc(backupWarnDays()) + '"></label>' +
        '<label class="inline checkbox-field"><input type="checkbox" data-setting="warnOnClose"' +
        (store.state.settings.warnOnClose === false ? '' : ' checked') + '> Připomenout při zavírání aplikace</label>' +
        '</div>' +
        '<div class="storage-info" data-storage></div>' +
        '</div>' +

        '<div class="card"><h3>Import faktur z jiného systému</h3>' +
        '<p class="muted small">Načte vydané faktury z <strong>ABRA Flexi</strong> (XML „winstrom“) nebo z dokladu ' +
        '<strong>ISDOC / ISDOCX</strong>. Odběratele, položky i měrné jednotky doplní do číselníků, pokud tam ještě nejsou. ' +
        'Stav úhrady se neřeší – ten si později dorovná import bankovního výpisu. Stejné číslo faktury se přeskočí, ' +
        'takže opakovaný import nic nezduplikuje.</p>' +
        '<div class="dialog-toolbar">' +
        '<button class="btn primary" data-action="import-invoices">' + icon('box-arrow-in-down') + ' Importovat faktury…</button>' +
        '</div>' +
        '</div>' +

        '<div class="card"><h3>Vratky (mimo zdanitelný příjem)</h3>' +
        '<p class="muted small">Platby z těchto účtů se v přehledu banky označí jako <strong>vratka</strong> a nepočítají se do příjmů ' +
        '(vratky pojistného, daně…). Regionální správy sociálního zabezpečení i pojišťovny mají každá svůj účet – ' +
        'nejjednodušeji je doplníte tlačítkem ' + icon('arrow-return-left') + ' u platby v přehledu banky, účet se tím sám zapamatuje.</p>' +
        refundAccountsTable() +
        '<div class="dialog-toolbar" style="margin-top:10px">' +
        '<button class="btn" data-action="add-refund-account">+ Přidat účet</button>' +
        '</div>' +
        '</div>' +

        '<div class="card"><h3>Vzhled</h3>' +
        '<div class="theme-grid">' + themeCards() + '</div>' +
        '<div class="dialog-toolbar" style="margin-top:14px">' +
        '<button class="btn" data-action="import-theme">' + icon('upload') + ' Importovat téma (JSON)</button>' +
        '<button class="btn" data-action="export-theme">' + icon('download') + ' Exportovat aktuální téma</button>' +
        '</div>' +
        '<p class="muted small">„Podle systému“ se řídí světlým/tmavým režimem operačního systému. ' +
        'Vlastní téma nahrajete jako JSON se seznamem barev (můžete si nejdřív vyexportovat to současné jako vzor).</p>' +
        '</div>' +

        '<div class="card"><h3>Ukázková data a testování</h3>' +
        (isDemo
            ? '<p class="demo-notice">' + icon('beaker') + ' <strong>Máte načtená ukázková (demo) data.</strong> Slouží k vyzkoušení aplikace – ' +
              'než začnete doopravdy fakturovat, smažte je a vyplňte si vlastní firmu.</p>'
            : '<p class="muted small">V aplikaci máte vlastní data. Ukázkovou sadu si můžete kdykoli načíst pro vyzkoušení.</p>') +
        '<div class="dialog-toolbar">' +
        '<button class="btn" data-action="demo-abo">' + icon('download') + ' Stáhnout ukázkový výpis (ABO)</button>' +
        (isDemo
            ? '<button class="btn danger" data-action="clear-demo">' + icon('trash') + ' Smazat demo data</button>'
            : '<button class="btn danger ghost" data-action="reset-demo">' + icon('beaker') + ' Nahrát demo data (smaže vše)</button>') +
        '</div></div>' +

        '<div class="card"><h3>Aplikace</h3>' +
        '<p class="muted small">' + esc(APP_NAME) + ' · <a href="' + esc(APP_URL) + '" target="_blank" rel="noopener">' +
        esc(APP_URL.replace(/^https?:\/\//, '')) + '</a></p>' +
        '<p class="muted small">Licence ' + esc(APP_LICENSE) + ' · © ' + esc(APP_YEAR) + ' ' +
        '<a href="' + esc(APP_AUTHOR_URL) + '" target="_blank" rel="noopener">' + esc(APP_AUTHOR) + '</a>' +
        ' · <button class="link-btn" data-action="show-license">Zobrazit licenci</button></p>' +
        '<p class="muted small" data-appinfo>…</p>' +
        '<div class="dialog-toolbar">' +
        '<button class="btn" data-action="check-update">' + icon('arrow-clockwise') + ' Zkontrolovat aktualizace</button>' +
        '<button class="btn primary" data-action="install-pwa">' + icon('box-arrow-in-down') + ' Nainstalovat aplikaci</button>' +
        '</div>' +
        '<p class="muted small" data-install-hint hidden></p>' +
        '<label class="inline checkbox-field" data-install-toggle><input type="checkbox" data-setting="showInstallHint"' +
        (store.state.settings.showInstallHint === false ? '' : ' checked') + '> Zobrazovat nabídku instalace</label>' +
        '<p class="muted small">Aktualizace se stahují automaticky. Jakmile je k dispozici nová verze, ' +
        'zobrazí se dole lišta s tlačítkem „Aktualizovat“ — stačí kliknout, nic se nepřeinstalovává.</p>' +
        '</div>';

    updateAppInfo(host);
}

/* ------------------------------ témata ---------------------------------- */

/* ------------------------------ vratky ---------------------------------- */

function refundAccountsTable() {
    const list = store.refundAccounts();
    if (!list.length) {
        return '<div class="empty">Zatím žádný účet. Vratky zatím poznáte ručně – u platby v přehledu banky klikněte na ' +
            icon('arrow-return-left') + ' a účet se sem doplní.</div>';
    }
    return '<div class="table-wrap"><table><thead><tr>' +
        '<th>Účet</th><th>Kód banky</th><th>Popis</th><th></th>' +
        '</tr></thead><tbody>' +
        list.map((r, i) =>
            '<tr>' +
            '<td><input data-refund="' + i + '" data-field="account" value="' + esc(r.account) + '" style="min-width:150px"></td>' +
            '<td><input data-refund="' + i + '" data-field="bank" value="' + esc(r.bank) + '" style="min-width:70px"></td>' +
            '<td><input data-refund="' + i + '" data-field="name" value="' + esc(r.name) + '" style="min-width:170px"></td>' +
            '<td><button class="btn small danger" data-action="remove-refund-account" data-index="' + i + '" title="Odebrat účet">' + icon('x-lg') + '</button></td>' +
            '</tr>').join('') +
        '</tbody></table></div>';
}

function themeCards() {
    const custom = store.state.settings.customThemes || [];
    const mode = store.state.settings.theme || 'auto';
    const items = [{ id: 'auto', name: 'Podle systému', auto: true }].concat(allThemes(custom));

    return items.map((item) => {
        const active = mode === item.id;
        return '<div class="theme-card' + (active ? ' active' : '') + '" data-action="set-theme" data-theme-id="' + esc(item.id) + '">' +
            themePreview(item) +
            '<div class="theme-name">' + esc(item.name) + '</div>' +
            (item.custom
                ? '<button class="theme-del" data-action="delete-theme" data-id="' + esc(item.id) + '" title="Smazat téma">' + icon('x-lg') + '</button>'
                : '') +
            '</div>';
    }).join('');
}

/** Přepne zvýraznění karty aktivního tématu bez překreslení celé stránky (drží scroll). */
export function syncThemeSelection(host) {
    host = host || document.getElementById('main');
    if (!host) return;
    const mode = store.state.settings.theme || 'auto';
    host.querySelectorAll('.theme-card').forEach((card) => {
        card.classList.toggle('active', card.dataset.themeId === mode);
    });
}

function themePreview(item) {
    const v = item.auto ? THEME_DEFAULTS : item.vars;
    const bg = item.auto
        ? 'linear-gradient(100deg, ' + THEME_DEFAULTS['--bg'] + ' 45%, #0b1120 55%)'
        : v['--bg'];
    return '<div class="theme-preview" style="background:' + esc(bg) + ';border-color:' + esc(v['--border']) + '">' +
        '<div class="tp-title" style="background:' + esc(v['--primary']) + '"></div>' +
        '<div class="tp-panel" style="background:' + esc(v['--panel']) + ';border-color:' + esc(v['--border']) + '">' +
        '<span style="background:' + esc(v['--text']) + '"></span>' +
        '<span style="background:' + esc(v['--text']) + '"></span>' +
        '<span style="background:' + esc(v['--primary']) + '"></span>' +
        '</div></div>';
}

function field(label, key, value, opts) {
    const o = opts || {};
    const attrs = 'data-co="' + key + '"' +
        (o.type ? ' type="' + o.type + '"' : '') +
        (o.min != null ? ' min="' + o.min + '"' : '') +
        (o.max != null ? ' max="' + o.max + '"' : '') +
        (o.readonly ? ' readonly class="readonly"' : '');
    return '<label class="field"><span>' + esc(label) + '</span>' +
        '<input ' + attrs + ' value="' + esc(value == null ? '' : value) + '">' +
        (o.hint ? '<small class="muted">' + esc(o.hint) + '</small>' : '') + '</label>';
}

function storageText(info) {
    if (!info) return '';
    const mb = (v) => (v / 1024 / 1024).toFixed(2) + ' MB';
    return 'Využito <strong>' + mb(info.usage) + '</strong> z kvóty ' + mb(info.quota) + ' · ' +
        (info.persisted
            ? 'úložiště je trvalé ' + icon('check-lg')
            : '<button class="link-btn" data-action="persist">zapnout trvalé úložiště</button>');
}

async function updateAppInfo(host) {
    const est = await db.storageEstimate();
    const persisted = await db.isPersisted();
    store.state.storageInfo = est
        ? { usage: est.usage, quota: est.quota, persisted }
        : { usage: 0, quota: 0, persisted };

    const storage = host.querySelector('[data-storage]');
    if (storage) storage.innerHTML = storageText(store.state.storageInfo);

    const el = host.querySelector('[data-appinfo]');
    if (el) {
        const standalone = window.matchMedia('(display-mode: standalone)').matches;
        const sw = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
        // technické číslo sestavení = poslední část názvu cache service workeru
        const build = String(window.swVersion || '').split('-').pop();
        el.innerHTML = 'Běžící jako <strong>' + (standalone ? 'nainstalovaná aplikace' : 'webová aplikace') + '</strong>' +
            ' · verze ' + esc(APP_VERSION) + (build && build !== window.swVersion ? ' (sestavení ' + esc(build) + ')' : '') +
            ' · offline režim: ' + (sw ? 'aktivní' : 'neaktivní') +
            ' · záznamů: ' + store.state.invoices.length + ' faktur, ' + store.state.payments.length + ' plateb.' +
            (persisted ? '' : ' Úložiště <strong>není</strong> trvalé – prohlížeč by mohl data smazat.');
    }
    if (!window.swVersion && !versionRetryDone) {
        versionRetryDone = true;
        setTimeout(() => updateAppInfo(host), 1200);
    }
    updateInstall(host);
}

/** Je prohlížeč založený na Chromiu? (jinde instalaci PWA jedním kliknutím spustit nelze) */
function isChromiumBrowser() {
    return typeof window.chrome !== 'undefined' || 'userAgentData' in navigator;
}

/** Stav tlačítka „Nainstalovat aplikaci“, přepínače nabídky a nápověd v sekci Aplikace. */
function updateInstall(host) {
    const btn = host.querySelector('[data-action="install-pwa"]');
    if (!btn) return;
    const hint = host.querySelector('[data-install-hint]');
    const toggle = host.querySelector('[data-install-toggle]');
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const installed = standalone || window.pwaInstalled;
    const chromium = isChromiumBrowser();

    btn.hidden = installed;
    if (toggle) toggle.hidden = installed || !chromium;

    if (!hint) return;
    if (installed || !chromium || window.deferredInstallPrompt) {
        hint.hidden = true;
        hint.textContent = '';
    } else {
        hint.hidden = false;
        hint.textContent = 'Prohlížeč teď instalaci jedním kliknutím nenabízí. Otevřete nabídku prohlížeče ' +
            'a zvolte „Instalovat aplikaci“ (případně ikonu instalace v adresním pruhu).';
    }
}

/* --------------------------- obsluha ------------------------------------ */

export function bindSettings(host) {
    if (host.dataset.settingsBound) return;
    host.dataset.settingsBound = '1';

    // stav tlačítka instalace se může změnit, i když je Nastavení otevřené
    document.addEventListener('faktfree:installchange', () => updateInstall(host));

    const save = debounce(() => {
        const company = store.activeCompany();
        if (company) store.saveCompany(company);
    }, 400);

    // účty pro vratky – ukládáme se zpožděním, aby psaní neztrácelo fokus
    const saveRefunds = debounce(async (list) => { await store.saveRefundAccounts(list); }, 500);
    host.addEventListener('input', (e) => {
        const index = e.target.dataset.refund;
        if (index === undefined) return;
        const list = store.refundAccounts().slice();
        list[Number(index)] = Object.assign({}, list[Number(index)], { [e.target.dataset.field]: e.target.value });
        saveRefunds(list);
    });

    host.addEventListener('input', (e) => {
        const key = e.target.dataset.co;
        if (!key) return;
        const company = store.activeCompany();
        if (!company) return;
        if (key === 'platceDPH') company.platceDPH = e.target.checked;
        else if (key === 'dueDays') company.dueDays = num(e.target.value);
        else company[key] = e.target.value;
        save();
    });

    host.addEventListener('change', (e) => {
        const key = e.target.dataset.co;
        const company = store.activeCompany();
        if (key === 'platceDPH' && company) {
            company.platceDPH = e.target.checked;
            save();
        }
        // obecné nastavení aplikace (připomínka zálohy)
        const setting = e.target.dataset.setting;
        if (!setting) return;
        if (e.target.type === 'checkbox') store.setSetting(setting, e.target.checked);
        else store.setSetting(setting, e.target.value.trim() === '' ? '' : num(e.target.value));
        // přepínač nabídky instalace rovnou promítneme do spodní lišty
        if (setting === 'showInstallHint') document.dispatchEvent(new CustomEvent('faktfree:installchange'));
    });

    host.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        const company = store.activeCompany();

        if (action === 'show-license') {
            // text licence vozíme s aplikací (LICENSE), takže funguje i offline
            let text = '';
            try {
                const res = await fetch('LICENSE', { cache: 'no-cache' });
                if (res.ok) text = await res.text();
            } catch (err) { /* offline nebo soubor chybí – ukážeme aspoň základ */ }
            await openModal({
                title: 'Licence',
                bodyHtml: text
                    ? '<pre class="license-text">' + esc(text) + '</pre>'
                    : '<p class="muted">Soubor s licencí se nepodařilo načíst. ' + esc(APP_NAME) +
                      ' je pod licencí ' + esc(APP_LICENSE) + ' (© ' + esc(APP_YEAR) + ' ' + esc(APP_AUTHOR) + ').</p>',
                buttons: [{ label: 'Zavřít', variant: 'primary' }],
            });
            return;
        }

        if (action === 'switch-company') {
            // v nastavení zůstáváme na stejné záložce, jen se přepne editovaná firma
            await store.setActiveCompany(el.dataset.id, { keepView: true });
            return;
        }

        if (action === 'add-company') {
            const out = await openModal({
                title: 'Nová firma',
                bodyHtml:
                    '<label class="field"><span>Obchodní název</span><input data-f="name"></label>' +
                    '<label class="field"><span>IČO</span><input data-f="ico"></label>' +
                    '<label class="field"><span>Prefix číselné řady</span><input data-f="prefix" value="FA"></label>' +
                    '<label class="inline"><input type="checkbox" data-f="platceDPH"> Plátce DPH</label>',
                buttons: [
                    { label: 'Zrušit', value: null },
                    {
                        label: 'Vytvořit', variant: 'primary',
                        onClick: ({ body }) => {
                            const get = (k) => body.querySelector('[data-f="' + k + '"]');
                            const name = get('name').value.trim();
                            if (!name) return false;
                            return {
                                name,
                                ico: get('ico').value.trim(),
                                prefix: get('prefix').value.trim() || 'FA',
                                platceDPH: get('platceDPH').checked,
                            };
                        },
                    },
                ],
            }).promise;
            if (out) {
                await store.addCompany(out);
                toast('Firma přidána.', 'ok');
            }
            return;
        }

        if (action === 'delete-company') {
            const count = store.companyInvoices().length;
            if (count > 0) {
                toast('Firma má ' + count + ' faktur – nejdřív je smažte.', 'err');
                return;
            }
            if (await confirmDialog({
                title: 'Smazat firmu?',
                body: 'Firma „' + sv(company.name) + '“ bude odstraněna.',
                okLabel: 'Smazat', danger: true,
            })) {
                try {
                    await store.removeCompany(company.id);
                    toast('Firma smazána.', 'ok');
                } catch (err) {
                    toast(err.message, 'err');
                }
            }
            return;
        }

        if (action === 'ares-company') {
            el.disabled = true;
            try {
                const { aresLookup } = await import('../ares.js');
                const data = await aresLookup(company.ico);
                company.name = data.name || company.name;
                company.address = data.address || company.address;
                company.dic = data.dic || company.dic;
                await store.saveCompany(company);
                store.emit('all');
                toast('Údaje načteny z ARES.', 'ok');
            } catch (err) {
                toast(err.message, 'err');
            } finally {
                el.disabled = false;
            }
            return;
        }

        if (action === 'export-json') {
            await downloadBackup();
            return;
        }

        if (action === 'import-json') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const data = JSON.parse(await file.text());
                    if (!await confirmDialog({
                        title: 'Importovat data?',
                        body: 'Stávající data v tomto prohlížeči budou nahrazena obsahem souboru.',
                        okLabel: 'Importovat', danger: true,
                    })) return;
                    await store.importData(data);
                    toast('Data naimportována.', 'ok');
                } catch (err) {
                    toast(err.message || 'Import selhal.', 'err');
                }
            };
            input.click();
            return;
        }

        if (action === 'persist') {
            const okPersist = await db.requestPersistence();
            toast(okPersist ? 'Trvalé úložiště zapnuto.' : 'Prohlížeč trvalé úložiště nepovolil.', okPersist ? 'ok' : 'warn');
            store.emit('main');
            return;
        }

        if (action === 'demo-abo') {
            const others = store.state.companies.filter((c) => c.id !== company.id).map((c) => c.account);
            const unpaid = store.companyInvoices()
                .filter((i) => store.remainingOf(i) > 0.005)
                .slice(0, 3)
                .map((i) => ({ amount: store.remainingOf(i), vs: i.vs, date: i.dueDate || i.issueDate }));
            if (!unpaid.length) {
                toast('Firma nemá nezaplacené faktury – ukázkový výpis by neměl co párovat.', 'warn');
                return;
            }
            const text = buildDemoAbo(company, unpaid, others, todayStr());
            const blob = new Blob([text], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'vypis-demo.gpc';
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Ukázkový výpis stažen – vyzkoušejte Import v sekci Banka.', 'ok');
            return;
        }

        if (action === 'clear-demo') {
            if (await confirmDialog({
                title: 'Smazat demo data?',
                body: 'Všechna ukázková data budou smazána. Zůstane jedna prázdná firma, kterou si vyplníte vlastními údaji.',
                okLabel: 'Smazat demo data', danger: true,
            })) {
                await store.clearAllData();
                toast('Demo data smazána – doplňte prosím údaje své firmy.', 'ok');
            }
            return;
        }

        if (action === 'reset-demo') {
            if (await confirmDialog({
                title: 'Nahrát demo data?',
                body: 'Všechna současná data budou smazána a nahrazena ukázkovou sadou.',
                okLabel: 'Nahrát demo', danger: true,
            })) {
                await store.resetToDemo();
                toast('Demo data nahrána.', 'ok');
            }
            return;
        }

        if (action === 'install-pwa') {
            const prompt = window.deferredInstallPrompt;
            if (prompt) {
                prompt.prompt();
                const choice = await prompt.userChoice.catch(() => null);
                window.deferredInstallPrompt = null;
                updateInstall(host);
                if (!choice || choice.outcome !== 'accepted') toast('Instalace nebyla dokončena.', 'info');
            } else if (!isChromiumBrowser()) {
                await alertDialog('Instalace aplikace',
                    'Instalace jako aplikace je možná jen v prohlížečích založených na Chromiu ' +
                    '(Chrome, Chromium, Brave, Edge…). V tomto prohlížeči ji spustit nelze.');
            } else {
                toast('Instalaci spusťte z nabídky prohlížeče → „Instalovat aplikaci“, případně ikonou v adresním pruhu.',
                    'info', 6000);
            }
            return;
        }

        if (action === 'check-update') {
            if (window.checkForUpdate) await window.checkForUpdate();
        }

        if (action === 'add-refund-account') {
            const list = store.refundAccounts().slice();
            list.push({ account: '', bank: '', name: 'Vratka' });
            await store.saveRefundAccounts(list);
            renderSettings(host);
            return;
        }

        if (action === 'remove-refund-account') {
            const index = Number(el.dataset.index);
            const account = store.refundAccounts()[index];
            if (!account) return;
            if (await confirmDialog({
                title: 'Odebrat účet?',
                body: 'Platby z účtu ' + sv(account.account) + '/' + sv(account.bank) + ' se přestanou označovat jako vratky.',
                okLabel: 'Odebrat', danger: true,
            })) {
                const list = store.refundAccounts().slice();
                list.splice(index, 1);
                await store.saveRefundAccounts(list);
                renderSettings(host);
                toast('Účet odebrán.', 'ok');
            }
            return;
        }

        if (action === 'import-invoices') {
            const { openInvoiceImport } = await import('../import.js');
            openInvoiceImport();
            return;
        }

        if (action === 'set-theme') {
            await store.setTheme(el.dataset.themeId);
            return;
        }

        if (action === 'delete-theme') {
            const item = (store.state.settings.customThemes || []).find((t) => t.id === el.dataset.id);
            if (!item) return;
            if (await confirmDialog({
                title: 'Smazat téma?',
                body: 'Téma „' + sv(item.name) + '“ bude odebráno ze seznamu.',
                okLabel: 'Smazat', danger: true,
            })) {
                await store.removeCustomTheme(item.id);
                toast('Téma smazáno.', 'ok');
            }
            return;
        }

        if (action === 'import-theme') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const theme = normalizeTheme(JSON.parse(await file.text()));
                    await store.addCustomTheme(theme);
                    await store.setTheme(theme.id);
                    toast('Téma „' + theme.name + '“ nahráno.', 'ok');
                } catch (err) {
                    toast(err.message || 'Téma se nepodařilo nahrát.', 'err');
                }
            };
            input.click();
            return;
        }

        if (action === 'export-theme') {
            const custom = store.state.settings.customThemes || [];
            const mode = store.state.settings.theme || 'auto';
            const theme = resolveTheme(mode, window.matchMedia('(prefers-color-scheme: dark)').matches, custom);
            const data = { id: theme.id, name: theme.name, dark: theme.dark, vars: theme.vars };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'tema-' + theme.id + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Téma vyexportováno – můžete si ho upravit a nahrát zpět.', 'ok');
            return;
        }
    });
}
