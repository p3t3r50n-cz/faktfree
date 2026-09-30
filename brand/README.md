# Logo FaktFree

Značka je **účtenka s trhaným okrajem a fajfkou** „vyřízeno“ – jeden tvar ve třech
variantách (jednobarevná, barevná, logotyp).

| Soubor | K čemu |
| --- | --- |
| `logo-mark.svg` | **Jednobarevná značka.** Barví se barvou okolí (`currentColor`), takže na světlém pozadí je tmavá a na tmavém světlá. Používá se v záhlaví aplikace a v README – všude, kde se má přizpůsobit tématu. |
| `logo-mark-color.svg` | **Barevná značka** – stejný tvar i proporce, ale s pevnými barvami: modrý přechod `#2563eb → #3b82f6` (zleva dole → vpravo nahoru) a bílá fajfka. Předloha pro ikony aplikace. |
| `logo.svg` | **Logotyp** – značka + text „FaktFree“. Jednobarevný (řídí se okolím), takže funguje na světlém i tmavém pozadí. |

## Co logo znamená

- **Účtenka/faktura** = o doklady jde.
- **Trhaný okraj** = účtenka z tiskárny, ne „úřední“ formulář.
- **Fajfka** = vyřízeno, zaplaceno, hotovo.

## Barvy

| Barva | Kód | Použití |
| --- | --- | --- |
| akční modrá | `#2563eb` | `--primary` v aplikaci, `theme_color`; začátek přechodu (vlevo dole) |
| modrá světlá | `#3b82f6` | konec přechodu značky (vpravo nahoře) |
| bílá | `#ffffff` | fajfka |

> Jednobarevná varianta bere barvu z okolí (`currentColor`), barevná varianta má
> přechod `#2563eb → #3b82f6`. Stejnou modrou má i `--primary` v aplikaci
> a `theme_color` v manifestu, takže logo a okolí drží jednu barvu.

## Zásady použití

- Minimální velikost značky: **16 px** (favicon) – menší už se ztrácí zubatý okraj.
- Kolem značky nechte volný prostor alespoň 10 % šířky.
- Značku neotáčejte, nepřidávejte jí stíny, rámečky ani jiné barvy.

## Ikony aplikace (PNG)

Předlohou je **`brand/logo-mark-color.svg`** (průhledné pozadí). Pro ikony, které plnou
plochu potřebují, je předlohou **`icons/icon-tile.svg`** – stejná značka na barvě pozadí
aplikace (`#eef2f8`), zmenšená na 88 %, aby se i s rohy vešla do bezpečné zóny maskable
ikony (kruh o průměru 80 % plochy).

| Soubor | Pozadí | Poznámka |
| --- | --- | --- |
| `icons/icon-192.png`, `icons/icon-512.png` | průhledné | „any“ ikony pro instalaci |
| `icons/icon-maskable-512.png` | `#eef2f8` | maskable – musí být plná plocha, jinak si systém nemá co oříznout |
| `icons/apple-touch-icon.png` | `#eef2f8` | 180 px; iOS neumí průhlednost, proto má pozadí |
| `icons/favicon.svg` | průhledné | **záměrně jednobarevná** – přizpůsobuje se světlému/tmavému tématu prohlížeče, takže se z barevné značky negeruje |

Přegenerování (Inkscape):

```bash
inkscape --export-type=png --export-width=192 --export-filename=icons/icon-192.png brand/logo-mark-color.svg
inkscape --export-type=png --export-width=512 --export-filename=icons/icon-512.png brand/logo-mark-color.svg
inkscape --export-type=png --export-width=512 --export-filename=icons/icon-maskable-512.png icons/icon-tile.svg
inkscape --export-type=png --export-width=180 --export-filename=icons/apple-touch-icon.png icons/icon-tile.svg
```

Po výměně ikon nezapomeňte zvýšit `CACHE_VERSION` v `sw.js` – ikony jsou v předběžné
cache, takže by se jinak uživatelům neobnovily.
