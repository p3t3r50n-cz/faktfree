# Vzorové doklady (nejsou součástí repozitáře)

Sem se odkládají soubory, na kterých se testuje **import** a **párování plateb**:

| Soubor | Odkud |
| --- | --- |
| `*.xml` (root `<winstrom>`, evidence `faktura-vydana`) | export z ABRA Flexi |
| `*.isdoc`, `*.isdocx` | elektronická faktura (ISDOC / ISDOCX ze ZIPu) |
| `*.gpc` | výpis z internetového bankovnictví (formát ABO/GPC) |

> ⚠️ **Tyto soubory se necommitují.** Obsahují skutečné údaje – jména a adresy odběratelů,
> částky, čísla účtů. Složka je proto v gitu ignorovaná (viz `.gitignore` zde) a v repozitáři
> zůstává jen tento popis.

## Jak si udělat vlastní vzorek

- **Flexi XML**: v ABRA Flexi si vyfiltrujte pár vydaných faktur a použijte *Export → XML*.
- **ISDOC/ISDOCX**: stáhněte si elektronickou fakturu, kterou vám někdo poslal (řada účetních
  systémů ji umí vygenerovat i pro vlastní doklady).
- **ABO/GPC**: v internetovém bankovnictví stáhněte výpis ve formátu `ABO`/`GPC`
  (někde se jmenuje „výpis pro účetní program“).

Až vzorky máte, stačí je v aplikaci vložit v *Nastavení → Import faktur z jiného systému*
(Flexi, ISDOC) nebo *Banka → Import výpisu* (ABO).
