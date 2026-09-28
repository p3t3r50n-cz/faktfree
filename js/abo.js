/* ---------------------------------------------------------------------------
 * Parser ABO/GPC výpisu (věty 074 = hlavička, 075 = obratová položka).
 * Pozice polí ověřeny dle "Technická specifikace struktury ABO formátu"
 * (mBank, 05/2021) a proti vzorovému souboru.
 *
 * Pozor: částky jsou v souboru v 1/100 (haléřích) – zde už dělené na Kč.
 * ------------------------------------------------------------------------- */
import { num, sv, digitsOnly } from './util.js';

/** Dekóduje výpis – zkusí UTF-8, při náhradních znacích spadne na cp1250. */
export function decodeAbo(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!asUtf8.includes('\uFFFD')) return { text: asUtf8, encoding: 'utf-8' };
    try {
        return { text: new TextDecoder('windows-1250').decode(bytes), encoding: 'windows-1250' };
    } catch (e) {
        return { text: new TextDecoder('iso-8859-2').decode(bytes), encoding: 'iso-8859-2' };
    }
}

/** "ddmmyy" -> "YYYY-MM-DD" (výpisy používají 2000+). */
function isoDate(s) {
    const t = sv(s).trim();
    if (!/^\d{6}$/.test(t)) return '';
    return '20' + t.slice(4, 6) + '-' + t.slice(2, 4) + '-' + t.slice(0, 2);
}

const dekodujCastku = (s) => Math.round(num(s)) / 100;

/**
 * Banka doplňuje čísla nulami zleva na pevnou šířku pole (VS a SS na 10 znaků),
 * kdežto na faktuře jsou zadaná bez nich („0100102026“ vs. „100102026“).
 * Při importu je proto ořezáváme; samé nuly pak znamenají „nevyplněno“.
 * Konstantní symbol necháváme v podobě, v jaké je na výpisu: v ABO má 4 znaky
 * a „0008“ je kód, ne číslo doplněné nulami.
 */
const bezLevychNul = (s) => {
    const raw = sv(s).trim();
    return /^0*$/.test(raw) ? '' : raw.replace(/^0+(?=\d)/, '');
};

export function parseAbo(text) {
    const header = {
        account: '', owner: '', oldBalance: 0, newBalance: 0,
        statementNo: '', accountingDate: '', debitTurnover: 0, creditTurnover: 0,
    };
    const items = [];
    const lines = sv(text).split(/\r?\n/).filter((l) => l.length >= 100);

    for (const line of lines) {
        const type = line.slice(0, 3);

        if (type === '074') {
            header.account = line.slice(3, 19).trim();
            header.owner = line.slice(19, 39).trim();
            header.oldBalance = dekodujCastku(line.slice(45, 59)) * (line[59] === '-' ? -1 : 1);
            header.newBalance = dekodujCastku(line.slice(60, 74)) * (line[74] === '-' ? -1 : 1);
            header.debitTurnover = dekodujCastku(line.slice(75, 89));
            header.creditTurnover = dekodujCastku(line.slice(90, 104));
            header.statementNo = line.slice(105, 108).trim();
            header.accountingDate = isoDate(line.slice(108, 114));
        } else if (type === '075') {
            const ksBank = line.slice(71, 81); // [2 libovolné][kód banky 4][KS 4]
            const code = line[60];
            const credit = code === '2';
            const storno = code === '5' || code === '4';
            items.push({
                account: line.slice(3, 19).trim(),
                contraAccount: line.slice(19, 35).trim(),
                docNumber: line.slice(35, 48).trim(),
                amount: dekodujCastku(line.slice(48, 60)) * (credit ? 1 : -1),
                directionCode: code,
                credit, storno,
                vs: bezLevychNul(digitsOnly(line.slice(61, 71))),
                ks: line.slice(77, 81).trim(),
                contraBank: line.slice(73, 77).trim(),
                ss: bezLevychNul(line.slice(81, 91).trim()),
                valueDate: isoDate(line.slice(91, 97)),
                message: line.slice(97, 117).trim(),
                changeCode: line[117],
                dataType: line.slice(118, 122),
                dueDate: isoDate(line.slice(122, 128)),
            });
        }
    }
    return { header, items };
}

export async function parseAboFile(file) {
    const buffer = await file.arrayBuffer();
    const { text, encoding } = decodeAbo(buffer);
    const parsed = parseAbo(text);
    parsed.encoding = encoding;
    parsed.fileName = file.name;
    return parsed;
}

/** Otisk položky pro idempotentní import (bez duplicit). */
export function fingerprintOf(item, account) {
    return [
        account, item.docNumber, item.valueDate, item.amount.toFixed(2),
        item.directionCode, item.vs, item.contraAccount, item.contraBank,
    ].join('|');
}

/**
 * Klasifikace položky:
 *  - 'internal' … převod mezi vlastními účty (protiúčet patří některé z firem)
 *  - 'invoice'  … příchozí platba, může se párovat s fakturou
 */
export function classify(item, ownAccounts) {
    if (!item.credit) return 'outgoing';
    const contra = normAccount(item.contraAccount);
    const bank = digitsOnly(item.contraBank);
    for (const own of ownAccounts) {
        const acc = normAccount(own.account);
        const bnk = digitsOnly(own.bankCode || accountBankCode(own.account));
        if (contra !== '0' && contra === acc && (!bnk || bnk === bank)) return 'internal';
    }
    return 'invoice';
}

/** Číslo účtu bez kódu banky ("123456-1234567890/0300" -> "1234561234567890"). */
export function accountDigits(account) {
    return digitsOnly(sv(account).split('/')[0]);
}

/** Normalizované číslo účtu pro porovnání (bez levých nul). */
export const normAccount = (account) => accountDigits(account).replace(/^0+(?=\d)/, '') || '0';

/** Normalizovaný variabilní symbol pro porovnání (banky ho ukládají s nulami zleva). */
export const normVs = (vs) => digitsOnly(vs).replace(/^0+(?=\d)/, '');

/** Vytáhne kód banky z čísla účtu "123456-1234567890/0300". */
export function accountBankCode(account) {
    const m = sv(account).match(/\/\s*(\d{4})/);
    return m ? m[1] : '';
}

/** IBAN z čísla účtu (stejná logika jako v invoice.js, zde kvůli nezávislosti). */
export function ibanFromAccount(account) {
    const raw = sv(account).toUpperCase().replace(/\s+/g, '');
    if (!raw) return '';
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(raw)) return raw;
    const parts = raw.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    const bank = parts[parts.length - 1].replace(/\D/g, '');
    const acc = parts.slice(0, -1).join('').replace(/\D/g, '');
    if (bank.length !== 4 || acc === '') return '';
    const bban = (bank + acc.padStart(16, '0')).slice(0, 20);
    try {
        const rem = BigInt(bban + '123500') % 97n;
        return 'CZ' + String(98n - rem).padStart(2, '0') + bban;
    } catch (e) { return ''; }
}
