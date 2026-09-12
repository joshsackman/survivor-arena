/**
 * Builds og-image.png -- the picture people see when they share the game.
 *
 * Composed from the game's own pixel sprites and a 5x7 pixel font, so the
 * card looks like the game rather than like a stock banner. Zero dependencies:
 * Node's zlib does the PNG compression.
 *
 *   node tools/make-og-image.mjs
 */
import { writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';
import { GLYPHS, GLYPH_W, GLYPH_H, textWidth } from './font5x7.mjs';
import { spriteData } from '../src/sprites.js';

const W = 1200;
const H = 630;
const rgba = new Uint8Array(W * H * 4);

const hex = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
];

function px(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    if (a >= 255) {
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
        return;
    }
    const t = a / 255;
    rgba[i] = Math.round(rgba[i] * (1 - t) + r * t);
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - t) + g * t);
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - t) + b * t);
    rgba[i + 3] = 255;
}

function rect(x, y, w, h, col, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, col, a);
}

// --- Night sky, dark at the top, warmer toward the street ------------------
const top = hex('#0B1020');
const horizon = hex('#3B2352');
for (let y = 0; y < H; y++) {
    const t = y / H;
    const col = [
        Math.round(top[0] + (horizon[0] - top[0]) * t),
        Math.round(top[1] + (horizon[1] - top[1]) * t),
        Math.round(top[2] + (horizon[2] - top[2]) * t)
    ];
    for (let x = 0; x < W; x++) px(x, y, col);
}

// Stars
let seed = 20261031;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 130; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * 300);
    px(x, y, hex('#F4F1E4'), 90 + Math.floor(rnd() * 140));
}

// Moon
// Tucked into the corner: at x=1040 the moon sat behind the title's last letter.
const moonX = 1118, moonY = 62, moonR = 38;
for (let y = -moonR; y <= moonR; y++) {
    for (let x = -moonR; x <= moonR; x++) {
        if (x * x + y * y <= moonR * moonR) px(moonX + x, moonY + y, hex('#FFEE9C'), 235);
    }
}

// --- The street ------------------------------------------------------------
const roadTop = 430;
rect(0, roadTop - 26, W, 26, hex('#49577A'));       // kerb
rect(0, roadTop, W, H - roadTop, hex('#2E3556'));   // road
for (let x = 20; x < W; x += 96) rect(x, roadTop + 92, 52, 7, hex('#FFC72C')); // dashes

// Houses along the back, with lit windows.
for (let i = 0; i < 7; i++) {
    const hx = i * 178 + 14;
    const hh = 120 + ((i * 37) % 40);
    const hy = roadTop - 26 - hh;
    rect(hx, hy, 150, hh, hex(['#6B7DA0', '#5A6B8C', '#7A8CB0'][i % 3]));
    rect(hx - 8, hy - 12, 166, 14, hex('#1A1F3A')); // roof
    for (let w = 0; w < 2; w++) {
        const lit = (i + w) % 3 !== 0;
        rect(hx + 20 + w * 74, hy + 28, 44, 34, hex(lit ? '#FFD37A' : '#2E3556'));
    }
    rect(hx + 60, hy + hh - 52, 32, 52, hex('#4E2F1E')); // door
}

// --- Sprites from the game itself -----------------------------------------
function drawSprite(key, cx, baseY, scale) {
    const d = spriteData(key);
    if (!d) throw new Error('missing sprite: ' + key);
    const w = d.rows[0].length * scale;
    const h = d.rows.length * scale;
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(baseY - h);
    for (let r = 0; r < d.rows.length; r++) {
        for (let c = 0; c < d.rows[r].length; c++) {
            const ch = d.rows[r][c];
            if (ch === '.') continue;
            const col = d.palette[ch];
            if (!col) continue;
            rect(x0 + c * scale, y0 + r * scale, scale, scale, hex(col));
        }
    }
}

const GROUND = roadTop + 150;
// The kid, big, out in front -- chased by the neighbours.
drawSprite('player', 250, GROUND, 9);
drawSprite('zombie', 470, GROUND - 6, 6);
drawSprite('golem', 610, GROUND - 4, 6);
drawSprite('wolf', 740, GROUND - 10, 6);
drawSprite('mom_cardigan', 860, GROUND - 6, 6);
drawSprite('pumpkin_kid', 980, GROUND - 6, 6);

// --- Text ------------------------------------------------------------------
function drawText(text, x, y, scale, col, shadow) {
    const s = text.toUpperCase();
    for (let i = 0; i < s.length; i++) {
        const g = GLYPHS[s[i]] || GLYPHS[' '];
        const gx = x + i * (GLYPH_W + 1) * scale;
        for (let r = 0; r < GLYPH_H; r++) {
            for (let c = 0; c < GLYPH_W; c++) {
                if (g[r][c] !== '1') continue;
                if (shadow) rect(gx + c * scale + scale, y + r * scale + scale, scale, scale, shadow);
                rect(gx + c * scale, y + r * scale, scale, scale, col);
            }
        }
    }
}

const title = 'NICE COSTUME';
const tScale = 13;
drawText(title, Math.round((W - textWidth(title, tScale)) / 2), 96, tScale, hex('#8EE06B'), hex('#1A1F3A'));

const tag = "IT'S JUST A COSTUME. NOBODY BELIEVES YOU.";
const gScale = 4;
drawText(tag, Math.round((W - textWidth(tag, gScale)) / 2), 216, gScale, hex('#F4F1E4'), hex('#1A1F3A'));

const credit = 'A GAME BY OWEN & FREDDIE';
const cScale = 3;
// The roofs vary in height, so rather than chase an offset, the credit sits
// on its own dark plate and reads cleanly whatever is behind it.
const cW = textWidth(credit, cScale);
const cX = Math.round((W - cW) / 2);
const cY = 286;
rect(cX - 16, cY - 10, cW + 32, GLYPH_H * cScale + 20, hex('#0B1020'), 225);
drawText(credit, cX, cY, cScale, hex('#FFC72C'));

writeFileSync(new URL('../og-image.png', import.meta.url), encodePng({ width: W, height: H, rgba }));
console.log('wrote og-image.png');
