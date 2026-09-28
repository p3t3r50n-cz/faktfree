/* ---------------------------------------------------------------------------
 * ARES – načtení údajů o subjektu podle IČO (přímo z prohlížeče, CORS je OK).
 * ------------------------------------------------------------------------- */
import { digitsOnly, sv } from './util.js';

const BASE = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';

/** @returns {Promise<{ico:string, name:string, address:string, dic:string}>} */
export async function aresLookup(icoRaw) {
    const ico = digitsOnly(icoRaw);
    if (ico.length !== 8) throw new Error('IČO musí mít 8 číslic.');

    let res;
    try {
        res = await fetch(BASE + ico, { headers: { Accept: 'application/json' } });
    } catch (e) {
        throw new Error('Nepodařilo se spojit s ARES (jste připojeni k internetu?).');
    }

    if (res.status === 404) throw new Error('IČO nebylo v ARES nalezeno.');
    if (!res.ok) throw new Error('ARES odpověděl chybou ' + res.status + '.');

    const data = await res.json();
    const name = sv(data.obchodniJmeno);
    const address = sv(data.sidlo && data.sidlo.textovaAdresa);
    const dic = sv(data.dic);
    if (!name && !address) throw new Error('ARES nevrátil použitelná data.');
    return { ico, name, address, dic };
}
