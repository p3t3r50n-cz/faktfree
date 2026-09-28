# Licence třetích stran

Aplikace FaktFree je vlastní kód (licence [MIT](LICENSE)), ale používá tyto cizí komponenty,
standardy a služby. Tady je jejich přehled, aby bylo jasné, co od koho je.

---

## Bootstrap Icons 1.13.1

- **Kde**: `js/icons.js` (vložený výřez sady – SVG symboly)
- **Domov**: <https://icons.getbootstrap.com>
- **Licence**: MIT
- **Poznámka**: jde o uzavřený výřez (22 ikon), nikoli o celou sadu

```
The MIT License (MIT)

Copyright (c) The Bootstrap Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Úplné znění: <https://github.com/twbs/icons/blob/main/LICENSE.md>

---

## Ostatní – nejde o licence kódu

Tyto položky se v projektu používají jako **formáty, standardy nebo vzdálené služby**.
Žádný jejich kód se nekopíruje, takže se licence kódu neřeší; je ale dobré vědět, odkud data jsou.

| Položka | Co to je | Odkaz |
| --- | --- | --- |
| **ARES** | veřejný registr ekonomických subjektů ČR – aplikace si na vyžádání (kliknutím) dotáhne údaje firmy podle IČO | <https://ares.gov.cz> |
| **ISDOC / ISDOCX** | národní standard elektronické faktury (import i výstup dokladu) | <https://isdoc.cz> |
| **ABO / GPC** | formát bankovních výpisů (import plateb) | specifikace ČBA |
| **QR platba (SPD)** | formát platebního QR kódu dle ČBA – generátor je vlastní, v `js/qr.js` | <https://qr-platba.cz> |
| **Systémové fonty** | aplikace používá fonty operačního systému (`system-ui`), žádné vložené fonty | – |

## Vlastní kód

Vše ostatní (aplikace FaktFree i původní PHP verze) je dílo **Petra Palackého** (palacky.net)
a je pod licencí **MIT** – viz [LICENSE](LICENSE).
