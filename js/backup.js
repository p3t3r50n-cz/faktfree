/* ---------------------------------------------------------------------------
 * Záloha dat: stažení do souboru, decentní připomínka v panelu a varování
 * při pokusu o zavření aplikace.
 *
 * Prohlížeč nedovolí spustit stažení souboru při zavírání stránky (chybí gesto
 * uživatele), takže „automatická záloha při zavření“ technicky nejde. Místo toho:
 *   - dokud je záloha čerstvá, nic se nepřipomíná a nic nezabírá místo,
 *   - když je stará, objeví se v patičce levého panelu drobný řádek se zálohou,
 *   - při pokusu o zavření vyvoláme nativní varování prohlížeče (vlastní text
 *     nastavit nelze); když uživatel zavření zruší, nabídneme zálohu lištou.
 * ------------------------------------------------------------------------- */
import * as store from './store.js';
import { toast } from './ui.js';
import { icon } from './icons.js';
import { todayStr } from './util.js';

/** Výchozí počet dní bez zálohy, po kterém se začne připomínat. */
export const BACKUP_WARN_DEFAULT = 7;

const MAX_WARN_DAYS = 90;

/** Uživatelské nastavení (1–90 dní), při prázdné/neplatné hodnotě výchozí. */
export function backupWarnDays() {
    const raw = store.state.settings.backupWarnDays;
    if (raw == null || raw === '') return BACKUP_WARN_DEFAULT;
    const value = Number(raw);
    if (!Number.isFinite(value)) return BACKUP_WARN_DEFAULT;
    return Math.min(MAX_WARN_DAYS, Math.max(1, Math.round(value)));
}

/** Datum poslední zálohy (null = nikdy). */
export function lastBackupAt() {
    const value = store.state.settings.lastBackupAt;
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

/** Stáří zálohy ve dnech (null = nikdy). */
export function backupAgeDays() {
    const at = lastBackupAt();
    if (!at) return null;
    return Math.floor((Date.now() - at.getTime()) / 86400000);
}

/** Je záloha stará (nebo žádná)? */
export function backupStale() {
    const days = backupAgeDays();
    return days === null || days >= backupWarnDays();
}

/** Lidský popis stavu zálohy (pro Nastavení i pro panel). */
export function backupText() {
    const days = backupAgeDays();
    if (days === null) return 'Zálohu jste ještě nestačili stáhnout.';
    if (days === 0) return 'Poslední záloha je z dneška.';
    return 'Poslední záloha: před ' + days + ' ' + (days === 1 ? 'dnem' : 'dny') + '.';
}

/** Krátký popisek do panelu (musí se vejít na jeden řádek). */
function nudgeLabel() {
    const days = backupAgeDays();
    if (days === null) return 'Zatím bez zálohy';
    if (days === 0) return 'Záloha z dneška';
    return 'Záloha před ' + days + ' dny';
}

/** Má se připomínat? (demo data zálohu nepotřebují.) */
function shouldRemind() {
    const settings = store.state.settings || {};
    if (settings.demo) return false;
    if (!store.state.companies.length) return false;
    return backupStale();
}

/**
 * HTML připomínky zálohy do patičky levého panelu.
 * Když je záloha čerstvá, vrací prázdný řetězec – nic se nezobrazuje.
 */
export function backupNudgeHtml() {
    if (!shouldRemind()) return '';
    const urgent = backupAgeDays() === null;
    return '<div class="backup-nudge' + (urgent ? ' urgent' : '') + '">' +
        '<span title="' + backupText() + '">' + nudgeLabel() + '</span>' +
        '<button class="btn small" data-action="backup-now">' + icon('download') + ' Záloha</button>' +
        '</div>';
}

/** Stáhne kompletní zálohu jako JSON a zapamatuje si čas. */
export async function downloadBackup() {
    const data = await store.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fakturace-zaloha-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    await store.markBackupDone();
    toast('Záloha stažena.', 'ok');
}

/* --------------------- připomínka při zavírání --------------------------- */

let offerTimer = 0;
let offerBar = null;

/**
 * Při pokusu o zavření stránky vyvolá nativní varování prohlížeče
 * (text bohužel nastavit nelze). Když uživatel zavření zruší, stránka
 * zůstane otevřená – pak nabídneme stažení zálohy lištou dole.
 */
export function installCloseGuard() {
    window.addEventListener('beforeunload', (event) => {
        const settings = store.state.settings || {};
        if (settings.warnOnClose === false || !shouldRemind()) return;

        event.preventDefault();
        event.returnValue = '';

        clearTimeout(offerTimer);
        offerTimer = setTimeout(() => {
            // při skutečném zavření/odchodu se sem nedostaneme (stránka už neexistuje),
            // naopak po zrušení dialogu je stránka viditelná
            if (document.visibilityState === 'visible') showBackupBar();
        }, 700);
    });
}

function showBackupBar() {
    if (offerBar && offerBar.isConnected) return;
    hideBackupBar();
    offerBar = document.createElement('div');
    offerBar.className = 'updatebar';
    offerBar.innerHTML =
        '<span>Před zavřením si nezapomeňte <strong>stáhnout zálohu</strong> dat.</span>' +
        '<button class="btn primary small" data-backup-now>' + icon('download') + ' Stáhnout zálohu</button>' +
        '<button class="link-btn" data-backup-off title="Připomínku lze znovu zapnout v Nastavení">Nepřipomínat</button>' +
        '<button class="icon-btn" data-backup-later aria-label="Zavřít" title="Zavřít">' + icon('x-lg') + '</button>';
    document.body.appendChild(offerBar);

    offerBar.querySelector('[data-backup-now]').addEventListener('click', async () => {
        await downloadBackup();
        hideBackupBar();
    });
    offerBar.querySelector('[data-backup-off]').addEventListener('click', async () => {
        await store.setSetting('warnOnClose', false);
        // je-li zrovna otevřené Nastavení, ať zaškrtávátko odpovídá stavu
        const checkbox = document.querySelector('[data-setting="warnOnClose"]');
        if (checkbox) checkbox.checked = false;
        hideBackupBar();
        toast('Připomínání zálohy při zavření vypnuto.', 'ok');
    });
    offerBar.querySelector('[data-backup-later]').addEventListener('click', hideBackupBar);
}

function hideBackupBar() {
    if (offerBar) {
        offerBar.remove();
        offerBar = null;
    }
}
