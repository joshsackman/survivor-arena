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
    // Brand palette from the art direction sheet.
    alien: '#8EE06B',
    alienShadow: '#3E7F3B',
    alienGlow: '#A7FFEB',
    skin: '#FBD7B7',
    skinShadow: '#C68F6F',
    hairBrown: '#4E2F1E',
    hairGrey: '#C8CCD6',
    eye: '#1A1F3A',
    sheet: '#F8F8F8',
    shoe: '#F8F8F8',
    neighbourSkin: '#F1D0C6',
    shirt: '#B44D4D',
    pants: '#3B3B3B',
    flashlight: '#FFEE9C',
    rake: '#C47A2F',
    momPink: '#E8709E',
    wine: '#8B1E2D',
    cardigan: '#9B5CFF',
    metal: '#C8CCD6',
    glass: '#1A1F3A',
    hoodie: '#49577A',
    dogBrown: '#C47A2F',
    dogSnout: '#FBD7B7',
    eggShirt: '#3E7F3B',
    egg: '#FFEE9C',
    pumpkin: '#E8720C',
    pumpkinDark: '#A8460A',
    stem: '#3E7F3B',
    inflate: '#A7FFEB',
    kidYellow: '#FFC830',
    mask: '#F1D0C6',
    dadBlue: '#B44D4D',
    mower: '#B44D4D',
    mowerDark: '#8B1E2D',
    bark: '#4E2F1E',
    leaves: '#3E7F3B',
    realAlien: '#3FD6C5',
    realAlienDark: '#0F8B8A',
    realGlow: '#A7FFEB'
};

/** rows: one string per pixel row (all the same length). */
const SPRITES = {
    // You: a kid in a homemade alien costume. Deliberately lopsided — the
    // head is too big and the arms don't match, because it was made in a garage.
    player: {
        rows: [
            '..A........A....',
            '...A......A.....',
            '....GGGGGGGG....',
            '...GGGGGGGGGG...',
            '...GGFFFFFFGG...',
            '...GGFKFFKFGG...',
            '...GGFFFFFFGG...',
            '....GGGGGGGG....',
            '...GGGGGGGGGG...',
            '..GGGGGGGGGGGG..',
            '..GGGGGGGGGGGG..',
            '...GGGGGGGGGG...',
            '....GG....GG....',
            '....GG....GG....',
            '...WWW....WWW...',
            '................'
        ],
        palette: { A: C.alienGlow, G: C.alien, F: C.skin, K: C.eye, W: C.shoe }
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
            '....HHHH......',
            '...HHHHHH.....',
            '...FFFFFF.....',
            '...FKFFKF.....',
            '...FFFFFF.....',
            '..BBBBBBBB....',
            '.BBBBBBBBBLLL.',
            '.BBBBBBBBBLLL.',
            '..BBBBBBBB....',
            '...PPPPPP.....',
            '...PP..PP.....',
            '...PP..PP.....',
            '..WWW..WWW....'
        ],
        palette: { H: C.hairBrown, F: C.neighbourSkin, K: C.eye, B: C.shirt, P: C.pants, L: C.flashlight, W: C.shoe }
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

    // Flashlight Dad already exists as `zombie` below; these are his street.
    // Rake Dad: the rake is the whole silhouette.
    dad_rake: {
        rows: [
            '..........RRR.',
            '..........R...',
            '....HHHH..R...',
            '...FFFFFF.R...',
            '...FKFFKF.R...',
            '...FFFFFF.R...',
            '..SSSSSSSSR...',
            '.SSSSSSSSSR...',
            '..SSSSSSSS....',
            '...PPPPPP.....',
            '...PP..PP.....',
            '...PP..PP.....',
            '..WWW..WWW....'
        ],
        palette: { R: C.rake, H: C.hairBrown, F: C.neighbourSkin, K: C.eye, S: C.eggShirt, P: C.pants, W: C.shoe }
    },

    // Polo Dad: cap, tucked polo, arms already reaching.
    dad_polo: {
        rows: [
            '...CCCCCC...',
            '..CCCCCCCC..',
            '...FFFFFF...',
            '...FKFFKF...',
            '...FFFFFF...',
            'SS.SSSSSS.SS',
            '.SSSSSSSSSS.',
            '..SSSSSSSS..',
            '...PPPPPP...',
            '...PP..PP...',
            '...PP..PP...',
            '..WWW..WWW..'
        ],
        palette: { C: C.shirt, F: C.neighbourSkin, K: C.eye, S: C.eggShirt, P: C.pants, W: C.shoe }
    },

    // Workout Mom: headband, ponytail, already mid-stride.
    mom_workout: {
        rows: [
            '...BBBBBB.DD',
            '..DDDDDDDD.D',
            '..DFFFFFFD..',
            '..FKFFKFF...',
            '..FFFFFFF...',
            '..TTTTTTTT..',
            '.TTTTTTTTTT.',
            '..TTTTTTTT..',
            '...LLLLLL...',
            '...LL..LL...',
            '..LL....LL..',
            '.WWW....WWW.'
        ],
        palette: { B: C.momPink, D: C.hairBrown, F: C.neighbourSkin, K: C.eye, T: C.cardigan, L: C.pants, W: C.shoe }
    },

    // Cardigan Mom: glasses, clipboard, absolutely writing this down.
    mom_cardigan: {
        rows: [
            '...DDDDDD...',
            '..DDDDDDDD..',
            '..DFFFFFFD..',
            '..GGFFFGG...',
            '..FFFFFFF...',
            '..CCCCCCCC..',
            '.CCCCCCCCPP.',
            '.CCCCCCCCPP.',
            '..CCCCCCCC..',
            '...LL..LL...',
            '...LL..LL...',
            '..WWW..WWW..'
        ],
        palette: { D: C.hairBrown, F: C.neighbourSkin, G: C.glass, C: C.rake, P: C.sheet, L: C.pants, W: C.shoe }
    },

    // Angry Cat: low, arched, tail up.
    pet_cat: {
        rows: [
            '.E......E...',
            '.EE....EE...',
            '.GGGGGGGG.TT',
            '.GYGGGGYG.T.',
            '.GGGGGGGG.T.',
            'GGGGGGGGGGT.',
            'GGGGGGGGGG..',
            '.GG.GG.GG...',
            '.GG.GG.GG...'
        ],
        palette: { E: C.pants, G: C.pants, Y: '#FFF04D', T: C.pants }
    },

    // Chasing Dog: white and brown, stretched out at a run.
    pet_chase: {
        rows: [
            '..BB.........',
            '..BBBBBB..TT.',
            '..BKWWWBBBT..',
            '..BWWWWBBB...',
            '.WWWWWWWWWW..',
            '.WWWBBBWWWW..',
            '.WW.WW.WW.W..',
            '.WW.WW.WW....'
        ],
        palette: { B: C.dogBrown, W: C.sheet, K: C.eye, T: C.dogBrown }
    },

    // Knitting Grandma: needles out, bag in hand, still faster than you think.
    grandma_knit: {
        rows: [
            '....VVVVVV....',
            '...VVVVVVVV...',
            '...VFFFFFFV...',
            '...FGGFFGGF...',
            '...FFFFFFFF...',
            '..CCCCCCCCCC..',
            '.CCCCCCCCCCNN.',
            '.CCCCCCCCCCNN.',
            '..CCCCCCCCCC..',
            '...CCCCCCCC...',
            '...LL....LL...',
            '...LL....LL...',
            '..WWW....WWW..',
            '..............'
        ],
        palette: { V: C.hairGrey, F: C.neighbourSkin, G: C.glass, C: C.cardigan, N: C.momPink, L: C.pants, W: C.shoe }
    },

    // ---- Bosses -------------------------------------------------------
    // The Lawn Guy: it is the mower that makes him frightening.
    reaper: {
        rows: [
            '.......CCCCCC.......',
            '......CCCCCCCC......',
            '.......FFFFFF.......',
            '.......FKFFKF.......',
            '.......FFFFFF.......',
            '......SSSSSSSS......',
            '.....SSSSSSSSSS.....',
            '.....SSSSSSSSSS.....',
            '......PPPPPPPP......',
            '......PP....PP......',
            '......PP....PP......',
            '.....WWW....WWW.....',
            '....................',
            '..MMMMMMMMMMMMMMMM..',
            '..MMMMMMMMMMMMMMMM..',
            '..MGGGGGGGGGGGGGGM..',
            '..MMMMMMMMMMMMMMMM..',
            '...TT..........TT...'
        ],
        palette: { C: C.shirt, F: C.neighbourSkin, K: C.eye, S: C.eggShirt, P: C.pants, W: C.shoe, M: C.mower, G: C.metal, T: C.eye }
    },

    // The Big Dog: not a pet. Takes up the whole street.
    void_lord: {
        rows: [
            '..EE..............EE..',
            '..EEEE..........EEEE..',
            '..BBBBBBBBBBBBBBBBBB..',
            '..BYYBBBBBBBBBBBBYYB..',
            '..BBBBBWWWWWWBBBBBBB..',
            '.BBBBBBBWWWWBBBBBBBBB.',
            'BBBBBBBBBBBBBBBBBBBBBB',
            'BBBBBBBBBBBBBBBBBBBBBB',
            'BBBBBBBBBBBBBBBBBBBBBB',
            '.BBBBBBBBBBBBBBBBBBBB.',
            '.BBB...BBB..BBB...BBB.',
            '.BBB...BBB..BBB...BBB.',
            '......................'
        ],
        palette: { E: C.bark, B: C.bark, Y: '#FFF04D', W: C.sheet }
    },

    // Book Club President: sash, big hair, glass raised the entire fight.
    necromancer: {
        rows: [
            '......DDDDDD......',
            '.....DDDDDDDD.....',
            '.....DFFFFFFD.....',
            '.....FKFFKF.......',
            '.....FFFFFF.......',
            '....PPPPPPPP..RR..',
            '...PPPPPPPPPP.RR..',
            '...PPPPPPPPPP..R..',
            '...PPPPPPPPPP.....',
            '....PPPPPPPP......',
            '....PP....PP......',
            '....PP....PP......',
            '...WWW....WWW.....',
            '..................'
        ],
        palette: { D: C.hairBrown, F: C.neighbourSkin, K: C.eye, P: C.momPink, R: C.wine, W: C.shoe }
    },

    // The Giant Tree: the yard tree, awake, with a face in the bark.
    chrono_lich: {
        rows: [
            '....LLLLLLLLLLLL....',
            '..LLLLLLLLLLLLLLLL..',
            '.LLLLLLLLLLLLLLLLLL.',
            '.LLLLLLLLLLLLLLLLLL.',
            '..LLLLLLLLLLLLLLLL..',
            '....LLLLLLLLLLLL....',
            '.......TTTTTT.......',
            '.......TKTTKT.......',
            '.......TTTTTT.......',
            '.....TTTTTTTTTT.....',
            '.B...TTTTTTTTTT...B.',
            '.BB..TTTTTTTTTT..BB.',
            '..B..TTTTTTTTTT..B..',
            '.....TTTTTTTTTT.....',
            '.....TTTTTTTTTT.....',
            '....TTTTTTTTTTTT....',
            '...TTTTTTTTTTTTTT...',
            '..TTTTTTTTTTTTTTTT..'
        ],
        palette: { L: C.leaves, T: C.bark, K: '#FFF04D', B: C.bark }
    },

    // THE REAL ALIEN: tall, smooth and wrong. Nothing like the kid's lumpy
    // homemade suit -- that contrast is the whole ending.
    ice_queen: {
        rows: [
            '.......GGGG.......',
            '.....GGGGGGGG.....',
            '....GGGGGGGGGG....',
            '...GGGGGGGGGGGG...',
            '...GGKKKGGKKKGG...',
            '...GGKKKGGKKKGG...',
            '...GGKKKGGKKKGG...',
            '....GGGGGGGGGG....',
            '.....GGGGGGGG.....',
            '.......GGGG.......',
            '.......GGGG.......',
            '....A..GGGG..A....',
            '...AA.GGGGGG.AA...',
            '..AA..GGGGGG..AA..',
            '......GGGGGG......',
            '......GGGGGG......',
            '......GG..GG......',
            '......GG..GG......',
            '.....GGG..GGG.....',
            '..................'
        ],
        palette: { G: C.realAlien, K: C.eye, A: C.realGlow }
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
        palette: { W: '#FFEE9C', B: '#FF5E5E', C: '#FFC9C9' }
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
        palette: { W: '#FFEE9C', B: '#FFC830', C: '#FFF04D' }
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
        palette: { W: '#FFEE9C', B: '#9B5CFF', C: '#C9A8FF' }
    },

    // Kid in a Cardboard Box: the plainest costume on the street, and the
    // one every kid has worn at least once.
    box_kid: {
        rows: [
            '..BBBBBBBBBB..',
            '.BBBBBBBBBBBB.',
            '.BBBBBBBBBBBB.',
            '.BB.EE..EE.BB.',
            '.BB.EE..EE.BB.',
            '.BBBBBBBBBBBB.',
            '.BB.M....M.BB.',
            '.BB..MMMM..BB.',
            '.BBBBBBBBBBBB.',
            '.BBBBBBBBBBBB.',
            '.BBBBBBBBBBBB.',
            '..BBBBBBBBBB..',
            '...LL....LL...',
            '..WWW....WWW..'
        ],
        palette: { B: C.rake, E: C.bark, M: C.bark, L: C.pants, W: C.shoe }
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
