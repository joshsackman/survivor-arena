/**
 * @module sprites
 * @description Pixel-art characters, drawn from code — no image files.
 *
 * Every character is a grid of characters: one letter per pixel, plus a
 * palette that maps letters to colours. "Give Grandma bigger glasses" is
 * therefore a two-character edit to the art below, which is the whole point.
 *
 * PERFORMANCE. A sprite is rasterised ONCE into an offscreen canvas per
 * (sprite, scale, tint) and blitted with drawImage after that. Painting a
 * hundred fillRects per enemy, with up to 300 enemies on screen, would not
 * hold 60fps; one drawImage each does.
 *
 * Dependencies: DOM canvas. Import is side-effect free and every entry point
 * no-ops without `document`, so Node-side tests can still import entities.js.
 *
 * Exports:
 *   - drawSprite(ctx, key, cx, cy, targetH, opts) -> boolean (false = no art)
 *   - hasSprite(key)
 */

// Shared costume palette. Kept small on purpose: a handful of colours across
// every character reads as one world.
const C = {
    alien: '#9ed98d',
    alienDark: '#6aa25f',
    eye: '#0c0a12',
    sheet: '#f4f1e4',
    hairBrown: '#6b4a2f',
    hairGrey: '#d6cfe4',
    skin: '#e8b48c',
    dadBlue: '#5b8fd9',
    momPink: '#e26fa8',
    wine: '#8e1d3f',
    cardigan: '#b9a7d6',
    metal: '#9aa0ad',
    shoe: '#f2f0e6',
    kidYellow: '#ffb703',
    mask: '#d9d2c4',
    glass: '#2b2b33',
    hoodie: '#8a6fd6',
    dogBrown: '#b06a2c',
    dogSnout: '#f2e3cf',
    eggShirt: '#6fae6a',
    egg: '#f7e7a1',
    pumpkin: '#ff7518',
    pumpkinDark: '#c94f08',
    stem: '#5f8a3a',
    inflate: '#9be8c9'
};

/** rows: one string per pixel row (all the same length). */
const SPRITES = {
    // You: a kid in a homemade alien costume. Deliberately lopsided — the
    // head is too big and the arms don't match, because it was made in a garage.
    player: {
        rows: [
            '.....GGGGGG.....',
            '....GGGGGGGG....',
            '...GGGGGGGGGG...',
            '...GGKKGGKKGG...',
            '...GGKKGGKKGG...',
            '...GGGGGGGGGG...',
            '....GGGGGGGG....',
            '......GGGG......',
            '...G..GGGG..G...',
            '..GG.GGGGGG.GG..',
            '...G.GGGGGG.G...',
            '.....GGGGGG.....',
            '.....GG..GG.....',
            '.....GG..GG.....',
            '....WWW..WWW....',
            '................'
        ],
        palette: { G: C.alien, K: C.eye, W: C.shoe }
    },

    // Grandma (golem): slow, hunched, unstoppable. The walker is the tell.
    golem: {
        rows: [
            '....VVVVVV....',
            '...VVVVVVVV...',
            '...VFFFFFFV...',
            '...FGGFFGGF...',
            '...FFFFFFFF...',
            '..CCCCCCCCCC..',
            '.CCCCCCCCCCCC.',
            '.CCCCCCCCCCCC.',
            '..CCCCCCCCCC..',
            '...CCCCCCCC...',
            '...CC....CC...',
            '..MMMMMMMMMM..',
            '..M..WWWW..M..',
            '..M........M..'
        ],
        palette: { V: C.hairGrey, F: C.skin, G: C.glass, C: C.cardigan, M: C.metal, W: C.shoe }
    },

    // Dad (zombie): slow, tough, travels in packs.
    zombie: {
        rows: [
            '....HHHH....',
            '...HHHHHH...',
            '...FFFFFF...',
            '...FKFFKF...',
            '...FFFFFF...',
            '..BBBBBBBB..',
            '.BBBBBBBBBB.',
            '.BBBBBBBBBB.',
            '..BBBBBBBB..',
            '...FFFFFF...',
            '...FF..FF...',
            '...FF..FF...',
            '..WWW..WWW..'
        ],
        palette: { H: C.hairBrown, F: C.skin, K: C.eye, B: C.dadBlue, W: C.shoe }
    },

    // Mom Book Club (skeleton): never alone, always holding a glass.
    skeleton: {
        rows: [
            '.....DD.....',
            '....DDDD....',
            '...DDDDDD...',
            '...DFFFFD...',
            '...FKFFKF...',
            '...FFFFFF...',
            '..PPPPPPPP..',
            '.PPPPPPPPPP.',
            '.PPPPPPPPRR.',
            '..PPPPPPPP..',
            '...PP..PP...',
            '...PP..PP...',
            '..WWW..WWW..'
        ],
        palette: { D: C.hairBrown, F: C.skin, K: C.eye, P: C.momPink, R: C.wine, W: C.shoe }
    },

    // Little Kid in a Bad Costume (bat): fast, weak, everywhere. The mask
    // sits crooked because it always does.
    bat: {
        rows: [
            '..MMMMMM..',
            '.MMMMMMMM.',
            '.MKMMMMKM.',
            '.MMMMMMMM.',
            '..MMMMMM..',
            '..YYYYYY..',
            '.YYYYYYYY.',
            '..YYYYYY..',
            '..YY..YY..',
            '..YY..YY..',
            '.WWW..WWW.'
        ],
        palette: { M: C.mask, K: C.eye, Y: C.kidYellow, W: C.shoe }
    },

    // Teen With a Pillowcase (mage): hood up, loot bag swinging.
    mage: {
        rows: [
            '....HHHH....',
            '...HHHHHH...',
            '...HFFFFH...',
            '...FKFFKF...',
            '...HFFFFH...',
            '..HHHHHHHH..',
            '.HHHHHHHHHH.',
            '.HHHHHHHHPP.',
            '..HHHHHHHPP.',
            '...HHHHHH...',
            '...HH..HH...',
            '...HH..HH...',
            '..WWW..WWW..'
        ],
        palette: { H: C.hoodie, F: C.skin, K: C.eye, P: C.sheet, W: C.shoe }
    },

    // Ferocious Pet (wolf): off the leash, low and quick.
    wolf: {
        rows: [
            '..BB......BB..',
            '..BBBBBBBBBB..',
            '..BKBBBBBBKB..',
            '..BBBWWWWBBB..',
            '.BBBBBBBBBBBB.',
            '.BBBBBBBBBBBB.',
            '.BB.BB..BB.BB.',
            '.BB.BB..BB.BB.',
            '..............'
        ],
        palette: { B: C.dogBrown, K: C.eye, W: C.dogSnout }
    },

    // Egg Thrower (bomber): egg already cocked back.
    bomber: {
        rows: [
            '....EE......',
            '...EEEE.....',
            '....HHHH....',
            '...FFFFFF...',
            '...FKFFKF...',
            '...FFFFFF...',
            '..GGGGGGGG..',
            '.GGGGGGGGGG.',
            '..GGGGGGGG..',
            '...GG..GG...',
            '...GG..GG...',
            '..WWW..WWW..'
        ],
        palette: { E: C.egg, H: C.hairBrown, F: C.skin, K: C.eye, G: C.eggShirt, W: C.shoe }
    },

    // Smashed Pumpkin (slime): a jack-o'-lantern that has seen better nights.
    slime: {
        rows: [
            '.....SS.....',
            '...OOOOOO...',
            '..OOOOOOOO..',
            '.OOKKOOKKOO.',
            '.OOOOOOOOOO.',
            '.OKKKKKKKKO.',
            '..OOOOOOOO..',
            '...DDDDDD...',
            '............'
        ],
        palette: { S: C.stem, O: C.pumpkin, K: C.eye, D: C.pumpkinDark }
    },

    // Pumpkin Chunk (slimeling): what is left after the smash.
    slimeling: {
        rows: [
            '..OOOO..',
            '.OOOOOO.',
            '.OOKKOO.',
            '.OOOOOO.',
            '..DDDD..',
            '........'
        ],
        palette: { O: C.pumpkin, K: C.eye, D: C.pumpkinDark }
    },

    // The Inflatable (illusionist): the giant blow-up yard decoration, awake.
    illusionist: {
        rows: [
            '....IIIIII....',
            '...IIIIIIII...',
            '..IIIIIIIIII..',
            '..IIKKIIKKII..',
            '..IIKKIIKKII..',
            '..IIIIIIIIII..',
            '..IIIIIIIIII..',
            '.IIIIIIIIIIII.',
            '.IIIIIIIIIIII.',
            '.IIIIIIIIIIII.',
            '.IIIIIIIIIIII.',
            '..IIIIIIIIII..',
            '..II..II..II..',
            '..............'
        ],
        palette: { I: C.inflate, K: C.eye }
    },

    // Candy: what the neighbours drop. Three wrappers so a street full of
    // pickups doesn't read as one repeated shape.
    candy1: {
        rows: [
            '...W...W...',
            '..WBBBBBW..',
            '.WBBCCCBBW.',
            '.WBBCCCBBW.',
            '..WBBBBBW..',
            '...W...W...'
        ],
        palette: { W: '#ffe9a8', B: '#e8354f', C: '#ff8fa0' }
    },
    candy2: {
        rows: [
            '...W...W...',
            '..WBBBBBW..',
            '.WBBCCCBBW.',
            '.WBBCCCBBW.',
            '..WBBBBBW..',
            '...W...W...'
        ],
        palette: { W: '#ffe9a8', B: '#ff7518', C: '#ffc16b' }
    },
    candy3: {
        rows: [
            '...W...W...',
            '..WBBBBBW..',
            '.WBBCCCBBW.',
            '.WBBCCCBBW.',
            '..WBBBBBW..',
            '...W...W...'
        ],
        palette: { W: '#ffe9a8', B: '#7b3fc4', C: '#c39bf0' }
    },

    // Kid in a Sheet (ghost): two eye holes, ragged hem.
    ghost: {
        rows: [
            '....SSSS....',
            '..SSSSSSSS..',
            '.SSSSSSSSSS.',
            '.SSKKSSKKSS.',
            '.SSKKSSKKSS.',
            '.SSSSSSSSSS.',
            '.SSSSSSSSSS.',
            '.SSSSSSSSSS.',
            '.SSSSSSSSSS.',
            '.SSSSSSSSSS.',
            '.S.SS.SS.SS.',
            '............'
        ],
        palette: { S: C.sheet, K: C.eye }
    }
};

/** cacheKey -> HTMLCanvasElement */
const cache = new Map();

function rasterise(spr, scale, tint) {
    if (typeof document === 'undefined') return null;
    const rows = spr.rows;
    const h = rows.length;
    const w = rows[0].length;
    const canvas = document.createElement('canvas');
    // Not every document is a browser: test stubs and server-side DOMs hand
    // back plain elements with no 2d context. Fail to null so callers draw
    // their fallback instead of throwing halfway through building a screen.
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const g = canvas.getContext('2d');
    if (!g || typeof g.fillRect !== 'function') return null;
    for (let y = 0; y < h; y++) {
        const row = rows[y];
        for (let x = 0; x < w; x++) {
            const ch = row[x];
            if (ch === '.') continue;
            g.fillStyle = spr.palette[ch] || '#ff00ff';
            g.fillRect(x * scale, y * scale, scale, scale);
        }
    }
    // v2.8 legibility: trace a 1px dark edge around the drawn pixels. On the
    // night street an untraced sprite has no silhouette and reads as a blob.
    if (spr.outline !== false) {
        const edge = spr.outlineColor || 'rgba(10,8,16,0.85)';
        g.fillStyle = edge;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (rows[y][x] !== '.') continue;
                const touches =
                    (y > 0 && rows[y - 1][x] !== '.') ||
                    (y < h - 1 && rows[y + 1][x] !== '.') ||
                    (x > 0 && rows[y][x - 1] !== '.') ||
                    (x < w - 1 && rows[y][x + 1] !== '.');
                if (touches) g.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    }

    if (tint) {
        // source-atop keeps the tint inside the drawn pixels, so a hit flash
        // follows the character's shape instead of flashing a square.
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = tint;
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalCompositeOperation = 'source-over';
    }
    return canvas;
}

/** True when `key` has pixel art (callers keep a fallback for the rest). */
export function hasSprite(key) {
    return Object.prototype.hasOwnProperty.call(SPRITES, key);
}

/**
 * Blit a character centred on (cx, cy), scaled so it stands roughly
 * `targetH` pixels tall.
 * @returns {boolean} false when there is no art for `key` — draw a fallback.
 */
export function drawSprite(ctx, key, cx, cy, targetH, opts = {}) {
    const spr = SPRITES[key];
    if (!spr || typeof document === 'undefined') return false;
    const scale = Math.max(1, Math.round(targetH / spr.rows.length));
    const tint = opts.tint || '';
    const cacheKey = key + '|' + scale + '|' + tint;
    let img = cache.get(cacheKey);
    if (img === undefined) {
        img = rasterise(spr, scale, tint);
        cache.set(cacheKey, img);
    }
    if (!img) return false;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
    ctx.imageSmoothingEnabled = prevSmoothing;
    return true;
}

/**
 * A character as a data URL, for showing one in the DOM (the roster screen).
 * Returns '' where there is no art or no canvas.
 */
export function spriteDataUrl(key, targetH = 64) {
    const spr = SPRITES[key];
    if (!spr || typeof document === 'undefined') return '';
    try {
        const scale = Math.max(1, Math.round(targetH / spr.rows.length));
        const canvas = rasterise(spr, scale, '');
        return canvas && typeof canvas.toDataURL === 'function' ? canvas.toDataURL() : '';
    } catch {
        return '';
    }
}

/** Every character that currently has art, for the roster screen. */
export function spriteKeys() {
    return Object.keys(SPRITES);
}
