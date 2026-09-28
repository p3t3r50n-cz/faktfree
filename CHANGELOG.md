# Historie změn

Verze se zvyšují po desetinách (0.1 → 0.2 → 0.3 …), viz [README](README.md#verze).
U každé změny se zvyšuje i technická verze cache v `sw.js`.

## 0.1 – 2026-09-28

První veřejné vydání. Aplikace umí fakturaci od začátku do konce – vystavit doklad,
poslat ho, spárovat s platbou z banky a mít z toho přehled.

**Faktury**
- vystavení, editace, duplikace, mazání, tisk na A4 (a odtud i PDF)
- automatické číslování `[prefix][rok][kód firmy 2][pořadí 4]`, variabilní symbol z čísla
- snapshoty dodavatele i odběratele – starší doklady se zpětně nemění
- QR platba (SPD 1.0) s vlastním generátorem, funguje offline
- položky s měrnou jednotkou, množstvím, slevou, DPH 0/12/21 % a zaokrouhlením

**Číselníky**
- odběratelé s načtením údajů z ARES podle IČO
- položky s našeptávačem přímo v editoru faktury, měrné jednotky

**Banka**
- import výpisu ABO/GPC (UTF-8 i cp1250), opakovaný import nic nezduplikuje
- automatické párování podle VS a částky, ruční párování, částečné úhrady
- vratky mimo zdanitelný příjem a interní převody mezi vlastními účty
- filtry podle stavu, fulltext, měsíční souhrny

**Import z jiných systémů**
- ABRA Flexi (XML) a ISDOC/ISDOCX (ZIP se rozbalí přímo v prohlížeči)
- doplní odběratele, položky i měrné jednotky, doklady „bez položek“ vezme z hlavičky
- doplní bankovní účet firmy, aby importovaná faktura měla QR platbu

**Data a soukromí**
- všechna data jen v prohlížeči (IndexedDB), žádný server ani registrace
- export a import zálohy do jednoho souboru JSON
- PWA: offline režim, instalace jako aplikace, automatické aktualizace

**Vzhled a identita**
- světlý a tmavý režim, další témata (Windows Classic, Mac OS Classic, Solaris,
  KDE Breeze / Breeze Dark, GNOME Adwaita / Adwaita Dark), vlastní témata přes JSON
- jednobarevná značka (účtenka s fajfkou) a symbolické ikony

**Licence**: MIT, © 2026 Petr Palacký (palacky.net)
