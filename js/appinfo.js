/* ---------------------------------------------------------------------------
 * Identita aplikace na jednom místě.
 *
 * Aplikace se nikde neodkazuje na svou vlastní adresu (vše je relativní), takže
 * funguje z libovolné domény i podadresáře. Tyto konstanty jsou jen *text a odkaz*
 * – používají se v titulku, v patičce faktury a v nastavení.
 * Kdo si aplikaci nasadí vlastní, může si je přepsat.
 * ------------------------------------------------------------------------- */

/** Název aplikace (titulek, hlavička, patička faktury). */
export const APP_NAME = 'FaktFree';

/**
 * Verze aplikace. Při dalším vydání vždy +0,1 (0.1 → 0.2 → … → 1.0).
 * Technická verze cache v `sw.js` je od téhle oddělená (mění se při každé úpravě souborů).
 */
export const APP_VERSION = '0.3';

/** Domovská adresa projektu (text/odkaz, ne adresa, ze které se aplikace načítá). */
export const APP_URL = 'https://palacky.net/faktfree';

/** Patička faktury. */
export const APP_CREDIT = 'Vytvořeno v systému ' + APP_NAME + ' (' + APP_URL + ')';

/** Autor a licence – zobrazuje se v Nastavení → Aplikace. */
export const APP_AUTHOR = 'Petr Palacký';
export const APP_AUTHOR_URL = 'https://palacky.net';
export const APP_LICENSE = 'MIT';
export const APP_YEAR = '2026';
