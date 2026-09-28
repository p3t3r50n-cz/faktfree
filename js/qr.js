/* ---------------------------------------------------------------------------
 * QR platba (SPD 1.0) – lokální generátor, funguje offline.
 * Byte mód, korekce M, verze 1–10. Ověřeno proti referenční knihovně "qrcode".
 * ------------------------------------------------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function generator(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= mul(poly[j], EXP[i]);
        }
        poly = next;
    }
    return poly;
}

function rsEncode(data, ecLen) {
    const gen = generator(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const d of data) {
        const factor = d ^ res[0];
        for (let i = 0; i < ecLen - 1; i++) res[i] = res[i + 1] ^ mul(gen[i + 1], factor);
        res[ecLen - 1] = mul(gen[ecLen], factor);
    }
    return res;
}

const EC_M = {
    1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]],
    5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const dataCodewords = (v) => EC_M[v][1].reduce((s, g) => s + g[0] * g[1], 0);

function chooseVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
        const capBits = dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16);
        if (byteLen * 8 <= capBits) return v;
    }
    return null;
}

function buildData(bytes, version) {
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4);
    put(bytes.length, version < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const cap = dataCodewords(version) * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
        cw.push(b);
    }
    const pads = [0xEC, 0x11];
    let p = 0;
    while (cw.length < dataCodewords(version)) cw.push(pads[p++ % 2]);
    return cw;
}

function interleave(cw, version) {
    const ecLen = EC_M[version][0];
    const groups = EC_M[version][1];
    const blocks = [];
    let pos = 0;
    for (const [count, dcw] of groups) {
        for (let i = 0; i < count; i++) {
            const data = cw.slice(pos, pos + dcw);
            pos += dcw;
            blocks.push({ data, ec: rsEncode(data, ecLen) });
        }
    }
    const out = [];
    const maxData = Math.max(...blocks.map((b) => b.data.length));
    for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i]);
    return out;
}

function versionBits(version) {
    let rem = version << 12;
    for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1F25 << (i - 12);
    return (version << 12) | (rem & 0xFFF);
}

function formatBits(mask) {
    const data5 = (0 << 3) | mask; // ECC M
    let d = data5 << 10;
    for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10);
    return ((data5 << 10) | (d & 0x3FF)) ^ 0x5412;
}

const newGrid = (size, fill) => Array.from({ length: size }, () => new Array(size).fill(fill));

function placeFinder(m, res, r0, c0) {
    const size = m.length;
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        m[rr][cc] = inside && ((r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        res[rr][cc] = true;
    }
}

function placeAlignment(m, res, cr, cc) {
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        m[cr + r][cc + c] = (Math.abs(r) === 2 || Math.abs(c) === 2) ? true : (r === 0 && c === 0);
        res[cr + r][cc + c] = true;
    }
}

function buildBase(version) {
    const size = 4 * version + 17;
    const m = newGrid(size, false);
    const res = newGrid(size, false);

    placeFinder(m, res, 0, 0);
    placeFinder(m, res, 0, size - 7);
    placeFinder(m, res, size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
        const dark = i % 2 === 0;
        m[6][i] = dark; res[6][i] = true;
        m[i][6] = dark; res[i][6] = true;
    }

    for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
        const nearFinder = (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
        if (!nearFinder) placeAlignment(m, res, r, c);
    }

    for (let i = 0; i <= 8; i++) if (i !== 6) { res[8][i] = true; res[i][8] = true; }
    for (let i = 0; i <= 7; i++) res[size - 1 - i][8] = true;
    for (let i = 0; i <= 7; i++) res[8][size - 1 - i] = true;
    res[size - 8][8] = true;

    if (version >= 7) {
        for (let i = 0; i < 18; i++) {
            const r = Math.floor(i / 3), c = i % 3;
            res[r][size - 11 + c] = true;
            res[size - 11 + c][r] = true;
        }
    }
    return { size, m, res };
}

function placeVersion(m, version) {
    if (version < 7) return;
    const size = m.length;
    const v = versionBits(version);
    for (let i = 0; i < 18; i++) {
        const bit = ((v >> i) & 1) === 1;
        const r = Math.floor(i / 3), c = i % 3;
        m[r][size - 11 + c] = bit;
        m[size - 11 + c][r] = bit;
    }
}

function placeFormat(m, format) {
    const size = m.length;
    const bit = (i) => ((format >> i) & 1) === 1;
    for (let i = 0; i < 15; i++) {
        const v = bit(i);
        if (i < 6) m[i][8] = v;
        else if (i < 8) m[i + 1][8] = v;
        else m[size - 15 + i][8] = v;

        if (i < 8) m[8][size - i - 1] = v;
        else if (i < 9) m[8][7] = v;
        else m[8][14 - i] = v;
    }
    m[size - 8][8] = true;
}

function maskFn(mask, r, c) {
    switch (mask) {
        case 0: return (r + c) % 2 === 0;
        case 1: return r % 2 === 0;
        case 2: return c % 3 === 0;
        case 3: return (r + c) % 3 === 0;
        case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
        case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
        default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
}

function penalty(m) {
    const size = m.length;
    let score = 0;
    for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
            if (m[r][c] === m[r][c - 1]) run++;
            else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
            if (m[r][c] === m[r - 1][c]) run++;
            else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    const match = (get, i, pat) => {
        for (let k = 0; k < 11; k++) if (get(i + k) !== pat[k]) return false;
        return true;
    };
    for (let r = 0; r < size; r++) {
        const row = (i) => m[r][i];
        for (let c = 0; c + 11 <= size; c++) if (match(row, c, pat1) || match(row, c, pat2)) score += 40;
    }
    for (let c = 0; c < size; c++) {
        const col = (i) => m[i][c];
        for (let r = 0; r + 11 <= size; r++) if (match(col, r, pat1) || match(col, r, pat2)) score += 40;
    }
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
    score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return score;
}

/** Vrátí { size, version, mask, modules } – modules[y][x] je 0/1. */
export function makeQR(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const version = chooseVersion(bytes.length);
    if (version === null) throw new Error('data too long');
    const codewords = interleave(buildData(bytes, version), version);
    const { size, m, res } = buildBase(version);
    placeVersion(m, version);

    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let col = size - 1;
    let upward = true;
    while (col > 0) {
        if (col === 6) col--;
        for (let i = 0; i < size; i++) {
            const r = upward ? size - 1 - i : i;
            for (let k = 0; k < 2; k++) {
                const c = col - k;
                if (res[r][c]) continue;
                const bit = bitIdx < totalBits ? (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
                m[r][c] = bit === 1;
                bitIdx++;
            }
        }
        col -= 2;
        upward = !upward;
    }

    let best = null, bestScore = Infinity, bestMask = 0;
    for (let mask = 0; mask < 8; mask++) {
        const g = m.map((row) => row.slice());
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            if (!res[r][c] && maskFn(mask, r, c)) g[r][c] = !g[r][c];
        }
        placeFormat(g, formatBits(mask));
        const s = penalty(g);
        if (s < bestScore) { bestScore = s; best = g; bestMask = mask; }
    }
    return { size, version, mask: bestMask, modules: best.map((row) => row.map((v) => (v ? 1 : 0))) };
}

/** Vykreslí QR kód jako inline SVG (ostrý tisk, bez externí služby). */
export function qrSvg(text, px) {
    let qr;
    try {
        qr = makeQR(text);
    } catch (err) {
        return '<div class="muted small">QR kód nelze vytvořit (příliš dlouhé údaje).</div>';
    }
    const n = qr.size, quiet = 4, dim = n + quiet * 2;
    let path = '';
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (qr.modules[y][x]) path += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
        }
    }
    return '<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim +
        '" width="' + px + '" height="' + px + '" role="img" aria-label="QR platba">' +
        '<rect width="' + dim + '" height="' + dim + '" fill="#ffffff"/>' +
        '<path d="' + path + '" fill="#000000"/></svg>';
}
