/* ---------------------------------------------------------------------------
 * Témata vzhledu.
 *
 * Téma = sada CSS proměnných. Aplikace je vkládá do <style id="theme-styles">
 * jako pravidla `:root[data-theme="ID"] { … }`, přepnutí je pak jen změna
 * atributu data-theme na <html>.
 *
 * Vlastní témata lze importovat (JSON) — ukládají se do nastavení (IndexedDB).
 * ------------------------------------------------------------------------- */

/** Povolené CSS proměnné (ochrana proti vložení cizího CSS při importu). */
export const THEME_VARS = [
    '--bg', '--panel', '--panel-2', '--panel-3', '--border', '--text', '--muted',
    '--primary', '--primary-weak', '--success', '--success-weak',
    '--danger', '--danger-weak', '--warn', '--warn-weak',
    '--radius', '--shadow', '--font',
];

/** Výchozí hodnoty – používají se i pro náhled a export. */
export const THEME_DEFAULTS = {
    '--bg': '#eef2f8',
    '--panel': '#ffffff',
    '--panel-2': '#f8fafc',
    '--panel-3': '#f1f5f9',
    '--border': '#dbe4ee',
    '--text': '#0f172a',
    '--muted': '#64748b',
    '--primary': '#2563eb',
    '--primary-weak': '#dbeafe',
    '--success': '#16a34a',
    '--success-weak': '#dcfce7',
    '--danger': '#dc2626',
    '--danger-weak': '#fee2e2',
    '--warn': '#d97706',
    '--warn-weak': '#fef3c7',
    '--radius': '12px',
    '--shadow': '0 2px 10px rgba(15, 23, 42, .06)',
    '--font': 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
};

const t = (id, name, dark, vars) => ({
    id, name, dark,
    vars: Object.assign({}, THEME_DEFAULTS, vars),
});

export const BUILTIN_THEMES = [
    t('light', 'Světlý (výchozí)', false, {}),

    t('dark', 'Tmavý', true, {
        '--bg': '#0b1120', '--panel': '#111827', '--panel-2': '#0f172a', '--panel-3': '#1b2537',
        '--border': '#1f2a3d', '--text': '#e6edf7', '--muted': '#93a4bd',
        '--primary': '#3b82f6', '--primary-weak': '#1e3a8a',
        '--success': '#22c55e', '--success-weak': '#14532d',
        '--danger': '#f87171', '--danger-weak': '#4c1d1d',
        '--warn': '#fbbf24', '--warn-weak': '#4a3311',
        '--shadow': '0 2px 10px rgba(0, 0, 0, .4)',
    }),

    t('windows', 'Windows Classic', false, {
        '--bg': '#d4d0c8', '--panel': '#d4d0c8', '--panel-2': '#ffffff', '--panel-3': '#bfbfbf',
        '--border': '#808080', '--text': '#000000', '--muted': '#404040',
        '--primary': '#000080', '--primary-weak': '#c6c6e8',
        '--success': '#008000', '--success-weak': '#c6e8c6',
        '--danger': '#c00000', '--danger-weak': '#f0c6c6',
        '--warn': '#808000', '--warn-weak': '#e8e8c0',
        '--radius': '0px', '--shadow': 'none',
        '--font': 'Tahoma, "DejaVu Sans", Verdana, sans-serif',
    }),

    t('macos', 'Mac OS Classic', false, {
        '--bg': '#d8d8d8', '--panel': '#ffffff', '--panel-2': '#f4f4f4', '--panel-3': '#e4e4e4',
        '--border': '#9a9a9a', '--text': '#000000', '--muted': '#5a5a5a',
        '--primary': '#2f6fd0', '--primary-weak': '#cfe0f7',
        '--success': '#1a7f37', '--success-weak': '#d6efdc',
        '--danger': '#cc3333', '--danger-weak': '#f7d6d6',
        '--warn': '#b07a10', '--warn-weak': '#f6e7c8',
        '--radius': '4px', '--shadow': '0 1px 4px rgba(0, 0, 0, .18)',
        '--font': '"Lucida Grande", "DejaVu Sans", Geneva, Verdana, sans-serif',
    }),

    // podle KDE Plasma – Commonality Sol
    t('solaris', 'Solaris (Commonality Sol)', false, {
        '--bg': '#d7d9e8', '--panel': '#dfe1ee', '--panel-2': '#e9ebf5', '--panel-3': '#c9cee4',
        '--border': '#9aa0c0', '--text': '#101024', '--muted': '#5a6084',
        '--primary': '#b5527f', '--primary-weak': '#e9c3d8',
        '--success': '#2f7d32', '--success-weak': '#cfe6d0',
        '--danger': '#b03030', '--danger-weak': '#f0d0d0',
        '--warn': '#b07a10', '--warn-weak': '#f0e2c0',
        '--radius': '3px', '--shadow': '0 1px 3px rgba(40, 40, 80, .25)',
        '--font': '"DejaVu Sans", Verdana, sans-serif',
    }),

    t('breeze', 'Breeze Classic (KDE)', false, {
        '--bg': '#eff0f1', '--panel': '#ffffff', '--panel-2': '#fcfcfc', '--panel-3': '#e8eaec',
        '--border': '#bfc4c9', '--text': '#232629', '--muted': '#7b7f83',
        '--primary': '#3daee9', '--primary-weak': '#d5eefb',
        '--success': '#27ae60', '--success-weak': '#d3f0de',
        '--danger': '#da4453', '--danger-weak': '#f9d8dc',
        '--warn': '#f67400', '--warn-weak': '#fde4cc',
        '--radius': '4px', '--shadow': '0 1px 4px rgba(35, 38, 41, .16)',
        '--font': '"Noto Sans", "DejaVu Sans", sans-serif',
    }),

    t('breeze-dark', 'Breeze Dark (KDE)', true, {
        '--bg': '#232629', '--panel': '#31363b', '--panel-2': '#2a2e32', '--panel-3': '#3b4045',
        '--border': '#4b5056', '--text': '#eff0f1', '--muted': '#a9b0b6',
        '--primary': '#3daee9', '--primary-weak': '#1f4a5f',
        '--success': '#27ae60', '--success-weak': '#1d4a33',
        '--danger': '#da4453', '--danger-weak': '#4d2029',
        '--warn': '#f67400', '--warn-weak': '#4a3311',
        '--radius': '4px', '--shadow': '0 1px 4px rgba(0, 0, 0, .45)',
        '--font': '"Noto Sans", "DejaVu Sans", sans-serif',
    }),

    t('adwaita', 'Adwaita (GNOME)', false, {
        '--bg': '#f6f5f4', '--panel': '#ffffff', '--panel-2': '#fafafa', '--panel-3': '#ebebeb',
        '--border': '#d6d5d3', '--text': '#2e3436', '--muted': '#6f7377',
        '--primary': '#3584e4', '--primary-weak': '#d4e5f9',
        '--success': '#2ec27e', '--success-weak': '#d6f2e5',
        '--danger': '#e01b24', '--danger-weak': '#fad4d6',
        '--warn': '#e5a50a', '--warn-weak': '#fbeecb',
        '--radius': '6px', '--shadow': '0 1px 4px rgba(46, 52, 54, .14)',
        '--font': 'Cantarell, "DejaVu Sans", sans-serif',
    }),

    t('adwaita-dark', 'Adwaita Dark (GNOME)', true, {
        '--bg': '#1e1e1e', '--panel': '#2a2a2a', '--panel-2': '#242424', '--panel-3': '#333333',
        '--border': '#3d3d3d', '--text': '#ffffff', '--muted': '#a6a6a6',
        '--primary': '#3584e4', '--primary-weak': '#1c3a5e',
        '--success': '#2ec27e', '--success-weak': '#1d4a33',
        '--danger': '#ff7b63', '--danger-weak': '#4d2820',
        '--warn': '#e5a50a', '--warn-weak': '#4a3c11',
        '--radius': '6px', '--shadow': '0 1px 4px rgba(0, 0, 0, .5)',
        '--font': 'Cantarell, "DejaVu Sans", sans-serif',
    }),
];

/** Všechna témata (zabudovaná + nahraná uživatelem). */
export function allThemes(customThemes) {
    const custom = (Array.isArray(customThemes) ? customThemes : []).map((theme) => ({
        id: theme.id,
        name: theme.name,
        dark: !!theme.dark,
        custom: true,
        vars: Object.assign({}, THEME_DEFAULTS, theme.vars),
    }));
    return BUILTIN_THEMES.concat(custom);
}

export function findTheme(themes, id) {
    return themes.find((theme) => theme.id === id) || BUILTIN_THEMES[0];
}

/**
 * Vyřeší režim na konkrétní téma.
 * @param {string} mode 'auto' nebo ID tématu
 */
export function resolveTheme(mode, prefersDark, customThemes) {
    const themes = allThemes(customThemes);
    if (mode === 'auto') return findTheme(themes, prefersDark ? 'dark' : 'light');
    return findTheme(themes, mode);
}

/** Vloží/aktualizuje stylopis se všemi tématy. */
export function ensureThemeStyles(themes) {
    let el = document.getElementById('theme-styles');
    if (!el) {
        el = document.createElement('style');
        el.id = 'theme-styles';
        document.head.appendChild(el);
    }
    el.textContent = themes.map((theme) => {
        const body = Object.entries(theme.vars)
            .map(([key, value]) => key + ':' + value + ';')
            .join('');
        return ':root[data-theme="' + theme.id + '"]{' + body + (theme.dark ? 'color-scheme:dark;' : 'color-scheme:light;') + '}';
    }).join('\n');
}

const SAFE_VALUE = /^[#a-zA-Z0-9 .,()%\-/'"]+$/;

/** Zkontroluje a očistí importované téma. Vyhodí Error s popisem. */
export function normalizeTheme(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Soubor neobsahuje platné téma (JSON objekt).');
    const name = String(raw.name || '').trim();
    if (!name) throw new Error('Téma nemá vyplněný název.');

    const vars = {};
    for (const [key, value] of Object.entries(raw.vars || {})) {
        if (!THEME_VARS.includes(key)) continue;
        if (typeof value !== 'string') continue;
        if (!SAFE_VALUE.test(value)) continue;
        vars[key] = value.trim();
    }
    if (!Object.keys(vars).length) throw new Error('Téma neobsahuje žádné použitelné barvy.');

    let id = String(raw.id || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!id) id = 'tema-' + Date.now().toString(36);

    return { id, name, dark: !!raw.dark, vars };
}
