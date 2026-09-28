# Logo FaktFree

| Soubor | K čemu |
| --- | --- |
| `logo-mark.svg` | **Značka** – účtenka s trhaným okrajem a fajfkou „vyřízeno“. Používá se jako favicon, ikona aplikace a v záhlaví (funguje na světlém i tmavém pozadí, protože má vlastní modrou dlaždici). |
| `logo.svg` | **Logotyp** – značka + text „Fakt**Free**“. Jen na světlé pozadí; na tmavém použijte `logo-mark.svg` a text napište zvlášť. |

## Co logo znamená

- **Účtenka/faktura** = o doklady jde.
- **Fajfka** = vyřízeno, zaplaceno, hotovo.
- Modrá dlaždice + zelená fajfka = stejná rodina jako ikony aplikace, takže se nic nepřebrandovává „přes noc“.

## Barvy

| Barva | Kód | Použití |
| --- | --- | --- |
| modrá (světlá) | `#3b82f6` | přechod dlaždice |
| modrá (tmavá) | `#1d4ed8` | přechod dlaždice, řádky, slovo „Free“ |
| akční modrá | `#2563eb` | `--primary` v aplikaci |
| zelená | `#16a34a` | fajfka (vyřízeno) |
| bílá | `#ffffff` | účtenka, kolečko fajfky |

## Zásady použití

- Minimální velikost značky: **16 px** (favicon) – menší už se ztrácí řádky na účtence.
- Kolem značky nechte volný prostor alespoň 10 % šířky.
- Značku neotáčejte, nepřidávejte jí stíny ani jiné barvy, tvar dlaždice neměňte.

## Ikony aplikace (PNG)

`icons/*.png` (192, 512, maskable, Apple touch) jsou vyrenderované ze stejného motivu.
Když se značka upraví, stačí je vygenerovat znovu ze `logo-mark.svg`.
