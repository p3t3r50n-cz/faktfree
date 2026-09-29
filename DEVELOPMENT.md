# FaktFree – technické detaily

Fakturační aplikace pro OSVČ, která běží **celá v prohlížeči**. Žádný server, žádná databáze –
data zůstávají u uživatele v prohlížeči (IndexedDB) a dají se zálohovat do souboru.

> Aplikace je v **kořeni repozitáře** (dřív bývala ve složce `pwa/`), takže cesty v tomto
dokumentu jsou od kořene repa. Uživatelské README je v [`README.md`](README.md).

- **Offline** – po prvním načtení funguje i bez internetu (service worker).
- **Instalovatelná** – dá se „nainstalovat“ jako desktopová aplikace (Chrome/Chromium, Brave, Edge...) na téměř jakýkoliv systém (Windows, MacOS, Linux, BSD...).
- **Bez závislostí a bez buildu** – jen HTML, CSS a ES moduly. Stačí zkopírovat složku.
- **Přenosná** – nikde není zadrátovaná vlastní adresa, běží z libovolné domény i podadresáře.

A co je na aplikaci nejlepší? Je **Fakt Free** pro každého :-)

## Spuštění

Stačí složku naservírovat jako statický web (musí být přes **HTTPS** nebo `localhost`,
jinak nepůjde service worker). Oficiální instance běží na:

```
https://palacky.net/faktfree/
```

Lokálně pro vývoj:

```bash
python3 -m http.server 8099     # http://localhost:8099
```

## Název, adresa a self-hosting

Adresa aplikace **není nikde v kódu** – vše je relativní, takže si aplikaci můžete nasadit
kamkoliv (`https://mujweb.cz/fa/`) a bude se odtamtud i aktualizovat:

| Co | Kde je definované |
| --- | --- |
| odkaz na aplikaci při **aktualizaci** (service worker) | `navigator.serviceWorker.register('sw.js')` – relativně k adrese stránky |
| rozsah a spouštěcí adresa PWA | `start_url: "."`, `scope: "."` v `manifest.webmanifest` |
| název, domovská adresa, patička faktury | `js/appinfo.js` (`APP_NAME`, `APP_URL`, `APP_VERSION`, `APP_CREDIT`) |
| název v HTML (titulek, hlavička) | `index.html` + `manifest.webmanifest` (statické soubory, needitují se modulem) |

`APP_URL` je jen **text a odkaz** (v patičce faktury, v Nastavení) – nikdy se z něj nic nenačítá,
takže self-hosted kopie může klidně ukazovat na domovskou stránku projektu.

Cache service workeru je navíc vázaná na cestu (`faktfree_<cesta>-<verze>`), aby si dvě kopie
na stejném serveru (např. `/fa/` a `/faktfree/`) navzájem nemazaly cache.

**Pozor**: data (IndexedDB `fakturace`) jsou vázaná na **původ** (protokol + doména + port),
ne na cestu. Přesun v rámci stejné domény (např. `/fa/` → `/faktfree/`) tedy data
zachová; přechod na jinou doménu znamená novou prázdnou databázi (vyřeší se zálohou/exportem).

## Struktura

| Soubor | Význam |
| --- | --- |
| `index.html` | skořápka aplikace |
| `manifest.webmanifest` | metadata PWA (ikony, okno, barvy) |
| `sw.js` | service worker – offline cache |
| `css/app.css` | vzhled (světlý/tmavý režim) |
| `css/print.css` | tisk faktury podle vzoru daňového dokladu |
| `js/app.js` | start, navigace, globální akce, klávesové zkratky |
| `js/db.js` | IndexedDB (úložiště) |
| `js/store.js` | stav aplikace a všechny mutace |
| `js/invoice.js` | výpočty, DPH, číslování, QR platba (SPD), IBAN |
| `js/qr.js` | vlastní QR generátor (offline, ověřen proti referenční knihovně) |
| `js/abo.js` | parser ABO/GPC bankovních výpisů |
| `js/ares.js` | načtení údajů z ARES podle IČO |
| `js/themes.js` | definice témat (vestavěná + vlastní), validace importu |
| `js/icons.js` | symbolické ikony (výřez z Bootstrap Icons, MIT) |
| `js/import.js` | import faktur z Flexi XML a ISDOC/ISDOCX |
| `js/print.js` | sestavení tiskové podoby faktury |
| `js/dialogs.js` | dialogy číselníků + párování plateb |
| `js/seed.js` | demo data – **zcela smyšlená** jména, IČO i účty (fiktivní IČO v ARES neexistují) |
| `js/demo-abo.js` | generátor ukázkového ABO výpisu |
| `js/views/*.js` | jednotlivé pohledy (přehled, faktura, banka, nastavení, levý panel) |

## Datový model (IndexedDB `fakturace`)

- `companies` – firmy (kód 01–99, prefix, číselná řada, účet, DPH…)
- `customers`, `items`, `units` – společné číselníky (odběratelé, položky, MJ)
- `invoices` – faktury (snapshoty dodavatele i odběratele, řádky, stav)
- `payments` – platby z banky (+ ruční úhrady), s alokacemi na faktury
- `meta` – nastavení (aktivní firma, téma) a počítadlo kódů firem

## Číslování faktur

`[prefix][rok][kód firmy 2][pořadí 4]` → např. `FA2026010001`.
Pořadí se resetuje každý rok a drží se zvlášť pro každou firmu.
**Variabilní symbol** = posledních 10 číslic čísla faktury (max. délka VS).
Číslo se faktuře přidělí při prvním uložení (neuložený koncept číslo nevyplýtvá).

## Banka (ABO/GPC)

- Import **příchozích** plateb (kód účtování `2`); odchozí se přeskočí.
- Formát: věty `074` (hlavička) a `075` (obrat), pevné pozice dle specifikace ČNB/mBank.
  Částky jsou v souboru v **1/100** (haléře).
- Kódování: zkusí UTF-8, při náhradních znacích přepne na **cp1250**.
- **VS a SS se ořezávají o levé nuly** – banka je doplňuje na pevnou šířku pole
  (VS i SS na 10 znaků), kdežto na faktuře jsou zadané bez nich
  (`0100102026` → `100102026`, `0000000000` → prázdné). Porovnávání naštěstí
  funguje i tak (normalizuje se na obou stranách), ale v aplikaci se pak platba
  zobrazuje stejně jako faktura. Konstantní symbol se nechává v podobě z výpisu –
  v ABO má 4 znaky a `0008` je kód, ne číslo doplněné nulami.
- **Idempotence** – opakovaný import téhož výpisu nic nezduplikuje (otisk položky;
  rozpozná se i otisk z dřívější verze, kde bylo VS ještě s nulami zleva).
- **Automatické párování** – přesná shoda VS + celé částky.
- **Ruční párování** – i částečné úhrady (jedna faktura = více plateb). V dialogu jsou
  nezaplacené faktury seskupené a barevně odlišené a předvyplní se tip na fakturu, jejíž
  zbývající částka odpovídá volné částce platby (pomůže při špatném VS).
- **Filtr stavu a fulltext** – hledá v částce, VS, protiúčtu, zprávě i v čísle faktury,
  ke které je platba přiřazená. Odznak u spárované platby je **odkaz na fakturu**
  (v tooltipu má její číslo).
- **Zaúčtováno = spárováno**: nezaúčtované jsou platby, které ještě nejsou přiřazené
  k faktuře. U plně spárované platby je místo „Párovat“ tlačítko **Zrušit vazbu**
  (faktura se tím vrátí na nezaplaceno).
- **Vratky (mimo zdanitelný příjem)** – platby z účtů uvedených v *Nastavení → Vratky*
  (pojistné, daň) se označí jako **vratka**, nepočítají se do příjmů a mají vlastní
  souhrn. Účet se do seznamu přidá sám tlačítkem ↰ u platby; účet se takto
  „naučí“ a další vratky z něj aplikace pozná.
- **Vlastní převody (mimo zdanitelný příjem)** – převody mezi vlastními účty se při
  importu rozpoznají samy podle účtů firem; platbu lze takto označit i **ručně**
  tlačítkem ⇄ v přehledu plateb (a zase zrušit). Nepočítají se do příjmů a nepárují se.
- **Připsání úroků (mimo zdanitelný příjem)** – úrok už zdanila banka (srážková daň),
  proto se do příjmů nepočítá; platbu označíte tlačítkem % v přehledu plateb.
- **Hromadné označení (vratka, vlastní převod i úrok)** – dialog u označení nabídne
  (předzaškrtnuté) označit stejným způsobem i všechny ostatní **nespárované** platby
  ze stejného účtu.

## Import faktur z jiných systémů

*Nastavení → Import faktur z jiného systému* načte vydané faktury ze dvou formátů:

| Formát | Soubor | Poznámka |
| --- | --- | --- |
| **ABRA Flexi XML** | `*.xml` (root `<winstrom>`, evidence `faktura-vydana`) | proprietární formát, ale nejúplnější |
| **ISDOC / ISDOCX** | `*.isdoc` nebo `*.isdocx` (ZIP s PDF uvnitř) | národní standard elektronické faktury; ISDOCX se rozbalí v prohlížeči |

Co import dělá:

- vezme **všechny** doklady ze souboru (Flexi XML jich může obsahovat mnoho),
- **odběratele** dohledá podle IČO, jinak podle názvu; když neexistuje, založí ho v číselníku
  (existující údaje nepřepisuje, jen doplní prázdné),
- **položky a měrné jednotky** doplní do číselníků, pokud tam ještě nejsou,
- u Flexi si poradí s číselníkovými hodnotami (`code:0008` → `0008`), s chybějící cenou
  (dopočítá ji z `sumZkl / mnozMj`) i s prázdnou měrnou jednotkou,
- **faktury „bez položek“** (`bezPolozek=true`) nejsou chyba: název řádku se vezme z `<popis>`
  a částka z hlavičky (`sumZklZakl` / `sumZklSniz` / `sumOsv`) – jeden řádek za každou použitou
  sazbu DPH, aby součet seděl na původní doklad. V souhrnu se to vypíše jako
  „Dokladů bez položek“ (u faktur s položkami `faktura-vydana-polozka` se použijí řádky z nich),
- u ISDOC dopočítá slevu na řádku z rozdílu proti `LineExtensionAmount` a převede kódy
  měrných jednotek (UN/ECE, např. `C62` → `ks`),
- **stav úhrady neřeší** – ten si později dorovná import bankovního výpisu (ABO),
- **stejné číslo faktury ve stejné firmě přeskočí**, takže opakovaný import nic nezduplikuje,
- když má importovaný doklad (ISDOC) vyplněný **bankovní účet dodavatele** a firma, do které
  se importuje, ještě žádný nemá, účet se do firmy **doplní** – jinak by importovaná faktura
  neměla QR platbu (souhrn to vypíše jako „Doplněno do firmy“),
- po importu ověří, že součet z řádků odpovídá částce na původním dokladu, a rozdíly vypíše v souhrnu.

Původní číslo dokladu se zachovává (aby šla faktura dohledat ve starém systému). Když číslo
odpovídá číselné řadě firmy (prefix + rok + kód firmy + pořadí), posune se i počítadlo, aby na
něj nové faktury navázaly.

## Tisk

`Tisk` vykreslí fakturu do skryté vrstvy `#print-area` a zavolá tisk prohlížeče.
Rozložení odpovídá vzoru daňového dokladu (dodavatel / odběratel, bankovní účet, QR platba,
tabulka položek, Celkem k úhradě / Zálohy / Zbývá uhradit, Neplátce DPH, razítko a podpis).

Pozor při úpravách: `grid`/`flex` kontejnery v `print.css` mají `minmax(0, …)` a `min-width: 0`.
Bez toho si sloupec vynutí šířku podle obsahu, tisk přeteče na šířku A4 a **ořeže se pravý
okraj** (mizí sloupec „Celkem“ a částky v souhrnu).

### Údaje dodavatele a QR platba

Faktura má v `companySnapshot` uloženou kopii údajů firmy z okamžiku vzniku. Pro tisk se
používá `store.companyForInvoice(invoice)`: vezme **živá** data firmy a přes ně přepíše
pouze ty položky, které jsou ve snapshotu neprázdné (`platceDPH` vždy ze snapshotu).

Důsledek: když se v Nastavení doplní **bankovní účet** firmy, QR platba se objeví i na dřív
vytvořených/importovaných fakturách, které účet ve snapshotu nemají. Když firma účet nemá,
zobrazí se v editoru upozornění „Firma nemá vyplněný bankovní účet…“.

Úplně dole je drobná patička s odkazem na aplikaci – text se bere z `APP_CREDIT`
v `js/appinfo.js`, takže se dá pro vlastní nasazení snadno změnit nebo vypustit.

## Našeptávač položek

Pole „Název položky“ na faktuře není `<datalist>` (ten v Chromiu vždy filtruje podle
napsaného textu a po kliknutí na šipku už nejde zobrazit celý seznam), ale **vlastní combobox**:

- **psaní** = filtruje seznam (shody),
- **kliknutí na šipku ▾** = zobrazí se **celý** číselník,
- **šipky / Enter** = výběr z klávesnice, **Esc** = zavřít,
- výběr položky doplní do řádku **MJ a DPH** (cenu záměrně ne – ta se obvykle liší).

Neznámý název lze dopsat ručně; při uložení se automaticky přidá do číselníku.

## Odběratel z ARES

V editoru faktury je pod výběrem odběratele řádek s polem na IČO a tlačítkem **📡 ARES**:

- vyberete odběratele ze seznamu, **nebo** napíšete IČO a kliknete na ARES,
- údaje (název, adresa, DIČ) se doplní do faktury a odběratel se **současně uloží do číselníku**
  (existující se podle IČO aktualizuje, nový se založí),
- v dialogu *Odběratelé* je stejné tlačítko **📡 ARES** přímo u pole s IČO.

## Témata

*Nastavení → Vzhled* nabízí galerii témat s náhledem:

- **Podle systému** (světlé/tmavé podle OS), **Světlé**, **Tmavé**,
- retro/desktopové skiny: **Windows Classic**, **Mac OS Classic**, **Solaris (Commonality Sol)**,
  **Breeze Classic / Breeze Dark (KDE)**, **Adwaita / Adwaita Dark (GNOME)**.

Každé téma jen předefinovává sadu CSS proměnných, takže se nic nepočítá ani nenačítá zvlášť.
Tlačítkem **Importovat téma (JSON)** lze přidat vlastní téma a **Exportovat aktuální téma**
si vyexportovat vzor k úpravě. Importovaná témata se ukládají do nastavení (IndexedDB) a dají se smazat.

Formát vlastního tématu:

```json
{
  "id": "moje-tema",
  "name": "Moje téma",
  "dark": false,
  "vars": {
    "--bg": "#f6f6f6",
    "--panel": "#ffffff",
    "--border": "#c9c9c9",
    "--text": "#1b1b1b",
    "--muted": "#6b6b6b",
    "--primary": "#2f6fd0",
    "--primary-weak": "#dbe8fb",
    "--radius": "4px",
    "--font": "\"DejaVu Sans\", sans-serif"
  }
}
```

`id` a `name` jsou nepovinné (doplní/vygenerují se), `vars` musí obsahovat alespoň jednu
z povolených proměnných: `--bg`, `--panel`, `--panel-2`, `--border`, `--text`, `--muted`,
`--primary`, `--primary-weak`, `--primary-text`, `--ok`, `--warn`, `--err`, `--radius`, `--font`,
`--shadow`, `--sidebar-bg`, `--sidebar-text`, `--sidebar-active`.
Hodnoty se validují (žádné `url()`, `expression()` apod. – jde o ochranu proti vložení skriptu).

## Ikony

Vzhled nepoužívá barevné emoji, ale **symbolické jednobarevné ikony** – výřez ze sady
[Bootstrap Icons](https://icons.getbootstrap.com) 1.13.1 (licence MIT, plné znění
v [`../THIRD-PARTY.md`](../THIRD-PARTY.md)), vložený lokálně
v `js/icons.js`, takže se nic nenačítá ze sítě a funguje to i offline.

Klíčová vlastnost: ikony kreslí **barvou okolního textu** (`fill: currentColor`).
Proto se samy přizpůsobí světlému i tmavému tématu – na tmavém tlačítku jsou světlé,
na světlém tmavé. Neexistují žádné varianty ikon pro témata ani pro light/dark režim.

Použití v kódu:

```js
import { icon, setIcon } from '../icons.js';

'<button class="btn">' + icon('printer') + ' Tisk</button>'   // mezery řeší CSS gap tlačítka
setIcon(btn, 'hourglass-split');                              // výměna ikony za běhu
```

Velikost ikony je `1em` (roste s písmem), třída `icon-lg` je o 15 % větší.
Přehled dostupných názvů je v hlavičce `js/icons.js`; nový název stačí přidat do
objektu `ICON_PATHS` (zkopíruje se obsah `<symbol>` z `bootstrap-icons.svg`).

## Verzování

Jsou tu **dvě čísla** a je dobré je neplést:

| Číslo | Kde se nastavuje | Význam |
| --- | --- | --- |
| **verze aplikace** (např. `0.1`) | `js/appinfo.js` → `APP_VERSION` | co vidí uživatel v záhlaví a v *Nastavení → Aplikace*; při dalším vydání vždy **+0,1** (0.1 → 0.2 → … → 1.0) |
| **verze cache** (např. `0.1.1`) | `sw.js` → `CACHE_VERSION` | technické „sestavení“; **zvýšit při každé změně JS/CSS**, jinak prohlížeč servíruje staré soubory |

U vydání se obě čísla obvykle sejdou (např. aplikace `0.2`, cache `0.2.1`), v průběhu vývoje
se mění jen to druhé.

## Aktualizace aplikace

Aplikace umí aktualizovat sama (jako WhatsApp Web) — **uživatel nic nepřeinstaluje**:

1. Do `sw.js` se nasadí nová verze cache (`const CACHE_VERSION = '0.2.1'`).
2. Prohlížeč nový service worker stáhne a aktivuje; běžící stránka ale pořád používá starý kód,
   takže se dole objeví lišta **„Je dostupná nová verze aplikace → Aktualizovat“**.
3. Kliknutí stránku obnoví (nejdřív se uloží rozepsaná faktura) a uživatel má novou verzi.

Ruční kontrola je v *Nastavení → Aplikace → „Zkontrolovat aktualizace“*.
Verzi a číslo sestavení je vidět tamtéž.

## Vývoj – pozor na cache

Service worker cachuje soubory **cache-first**. Po úpravě JS/CSS **zvyšte verzi cache** v `sw.js`:

```js
const CACHE_VERSION = '0.1.2';   // ← zvýšit při každé změně souborů (i když je verze aplikace pořád 0.1)
```

Bez zvýšení verze prohlížeč servíruje starou verzi. (Vývojáři pomůže i zaškrtnutí
„Bypass for network“ v DevTools → Application → Service Workers.)

Service worker si soubory při instalaci stahuje s `cache: 'reload'`, tedy **vždy ze sítě**.
Bez toho si umí prohlížeč držet starý soubor ve své HTTP cache (server posílá jen
`Last-Modified`/`ETag`) a do nové cache by se dostala stará verze – po „Aktualizovat“ by
pořád běžel starý kód.

Hledá se **výhradně pod aktuálním názvem** cache (`caches.match(request, { cacheName: CACHE })`).
`caches.match()` bez omezení prochází všechny cache daného původu a mohl by vrátit soubor
ze starší cache – např. po přesunu aplikace z `/faktfree/` na `/faktfree/pwa/` zůstane
v prohlížeči cache `faktfree_faktfree-<verze>` a její obsah by měl vždy přednost.
Při aktivaci se proto uklízejí i cache z **nadřazených** cest (sourozenecké cesty,
např. druhá kopie na `/fa/`, zůstávají) a `js/app.js` navíc ruší registrace SW z nadřazeného
scope, které se už nemají jak aktualizovat.

## Záloha dat

Nastavení → *Záloha dat* → **Exportovat data** (JSON). Stejný soubor lze naimportovat
zpět, případně i přenést na jiný počítač. Prohlížeč může data smazat (např. při vyčištění
úložiště), proto je vhodné zapnout **trvalé úložiště** a občas exportovat zálohu.
