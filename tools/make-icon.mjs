/**
 * Builds icon-512.png / icon-192.png -- the tab icon and the installed-app
 * icon. Previously both pointed at docs/hero.svg, which is the upstream
 * project's wordmark ("Survivor - open-source HTML5 Canvas roguelite"), so
 * the game was wearing someone else's badge.
 *
 *   node tools/make-icon.mjs
 */
import { writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';
import { spriteData } from '../src/sprites.js';

const hex = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
];

function build(size) {
    const rgba = new Uint8Array(size * size * 4);
    const put = (x, y, [r, g, b]) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const i = (y * size + x) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    };
    // Night-purple ground so the green costume pops at small sizes.
    const bg = hex('#1B1330');
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, bg);

    const d = spriteData('player');
    const scale = Math.floor((size * 0.82) / d.rows.length);
    const w = d.rows[0].length * scale;
    const h = d.rows.length * scale;
    const x0 = Math.round((size - w) / 2);
    const y0 = Math.round((size - h) / 2);
    for (let r = 0; r < d.rows.length; r++) {
        for (let c = 0; c < d.rows[r].length; c++) {
            const ch = d.rows[r][c];
            if (ch === '.') continue;
            const col = d.palette[ch];
            if (!col) continue;
            const rgb = hex(col);
            for (let j = 0; j < scale; j++)
                for (let i = 0; i < scale; i++) put(x0 + c * scale + i, y0 + r * scale + j, rgb);
        }
    }
    return encodePng({ width: size, height: size, rgba });
}

for (const s of [512, 192]) {
    writeFileSync(new URL(`../icon-${s}.png`, import.meta.url), build(s));
    console.log('wrote icon-' + s + '.png');
}
