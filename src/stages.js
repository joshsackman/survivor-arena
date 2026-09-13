/**
 * @module stages
 * @description Stage / map registry. A stage is a *modifier set* on top of the
 * base wave director: it overrides the enemy pools, the boss timing, the
 * background palette and the music style without changing the underlying
 * spawn engine. The default stage `forest` is a no-op that mirrors the
 * v2.5 balance; `crypt` is the second map introduced in iter-12 — darker,
 * ranged-heavy, and the Reaper shows up at 4:00 instead of 5:00.
 *
 * Dependencies: `./data.js` (WAVES, BOSSES) for the defaults the modifiers
 * sit on top of. We deliberately don't touch the originals — `getWavesFor`
 * returns a frozen copy. This makes stages cheap to swap mid-session and
 * keeps the catalogue diff-friendly.
 *
 * Exports:
 *   - {Record<string, StageDef>} STAGES
 *   - getStage(id)               → StageDef (defaults to forest if unknown)
 *   - getWavesFor(id)            → WaveDef[]   (cloned + remapped)
 *   - getBossesFor(id)           → BossDef[]   (cloned + spawnAt remapped)
 *   - getBackgroundFor(id)       → { fill, gridAlpha }
 *   - listStages()               → StageDef[]  (stable order)
 *   - getStageModifiers(id)      → { playerSpeedMult, enemyHpMult,
 *                                    coldTickInterval, coldTickDamage }
 *
 * iter-14 introduces the third stage `tundra`. On top of the existing pool
 * / boss / palette knobs, tundra ships three brand-new gameplay levers,
 * exposed under `getStageModifiers(id)` so the consumer (`main.js`) can apply
 * them generically rather than hard-coding string checks:
 *   - playerSpeedMult: multiplier baked into player speed (0.9 = -10%).
 *   - enemyHpMult:      multiplier baked into enemy HP at spawn (1.2 = +20%).
 *   - coldTickInterval: seconds between cold ticks (0 = disabled).
 *   - coldTickDamage:   HP drained per tick (1 by default).
 * The IceQueen boss replaces VoidLord on tundra to give a visually distinct
 * 10-minute fight (see `bossOverrides`).
 */

import { BOSSES, WAVES } from './data.js';

/**
 * @typedef {Object} StageDef
 * @property {string} id             unique key, used in storage / URL
 * @property {string} name           display name
 * @property {string} icon           emoji shown on the picker
 * @property {string} description    one-line tagline shown on the picker
 * @property {Object} background     palette overrides for the renderer
 * @property {string} background.fill        CSS hex for the canvas backdrop
 * @property {number} background.gridAlpha   0..1 opacity of the grid
 * @property {string} musicStyle     'menu' | 'combat' | 'crypt' | 'forest' — hint for AudioEngine
 * @property {Object} [poolOverrides] map of enemyId -> weight bias (0..2)
 *                                    Applied per-spawn to bias the random pick.
 *                                    Missing ids default to 1.
 * @property {string[]} [extraEnemies] enemy ids appended to every wave's pool
 * @property {Record<string, number>} [bossOffsets] bossId -> seconds to add
 *                                                  (negative = earlier)
 */

/** @type {Record<string, StageDef>} */
export const STAGES = Object.freeze({
    FOREST: Object.freeze({
        id: 'forest',
        name: 'The Cul-de-Sac',
        icon: '🏘️',
        description: 'Your street on Halloween night. A balanced mix of neighbors.',
        background: { fill: '#0B1020', gridAlpha: 0.05 },
        musicStyle: 'forest',
        poolOverrides: {},
        extraEnemies: [],
        bossOffsets: {}
    }),
    CRYPT: Object.freeze({
        id: 'crypt',
        name: 'The Haunted House',
        icon: '🎃',
        description: 'Darker. More egg throwers. The Lawn Guy rushes you at 4:00.',
        background: { fill: '#080C18', gridAlpha: 0.03 },
        musicStyle: 'crypt',
        // Bias spawns: more mages and illusionists, fewer melee chasers.
        poolOverrides: {
            // The house has its own residents; the neighbours thin out here.
            poltergeist: 2.2,
            armour: 1.8,
            ghost: 1.6,
            mage: 1.4,
            illusionist: 1.4,
            skeleton: 0.8,
            bat: 0.5,
            zombie: 0.4,
            wolf: 0.5
        },
        // Add mage to every wave so the ranged-heavy promise holds in the
        // first 90 seconds where vanilla pools have no caster.
        // The natives join the house, but the crypt keeps its guaranteed
        // ranged caster -- that pressure is the point of the stage.
        extraEnemies: ['poltergeist', 'armour', 'mage'],
        bossOffsets: {
            // Scaled to the compressed schedule: the house still rushes you,
            // but -60 would now clamp the Lawn Guy to the 30s floor.
            reaper: -20,
            necromancer: -20
        }
    }),
    // ----------------------------------------------------------------------
    // iter-14 — Tundra
    //
    // The third map. Bosses keep the same schedule as forest, but the entire
    // map applies three soft pressure modifiers:
    //   - playerSpeedMult 0.9   (ice underfoot, -10% movement)
    //   - enemyHpMult     1.2   (thicker furred enemies, +20% HP)
    //   - cold tick       1 HP / 10 s (slow attrition)
    // The cold tick is implemented in main.js (`_applyColdTick`) and reads
    // its config from `getStageModifiers(id)` so the modifier surface stays
    // declarative. The "warmth-source" pickup that temporarily disables the
    // cold tick is *intentionally disabled this iteration* — see
    // `warmthSourceEnabled: false` — so we ship the harder difficulty without
    // the relief item until the pickup pipeline is hooked up properly.
    //
    // Visual: cold blue palette (#2a3a4f) with a slightly more visible grid
    // so the snow lines read on the canvas. The 10-minute boss is replaced
    // with IceQueen (see data.js BOSSES.ICE_QUEEN) via `bossOverrides`.
    // ----------------------------------------------------------------------
    TUNDRA: Object.freeze({
        id: 'tundra',
        name: 'Area 51',
        icon: '🛸',
        description: 'Slick floors (-10% speed), tougher neighbors (+20% HP), creeping cold.',
        background: { fill: '#0D1A16', gridAlpha: 0.06 },
        musicStyle: 'forest',
        poolOverrides: {
            // The facility has its own staff -- and its own residents.
            guard: 2.2,
            grey: 1.9,
            golem: 1.2,
            wolf: 0.8,
            zombie: 0.4,
            skeleton: 0.4,
            bat: 0.4,
            box_kid: 0.3,
            pumpkin_kid: 0.3
        },
        extraEnemies: ['guard', 'grey'],
        // Bosses keep their forest-default timings — the difficulty comes
        // from the always-on modifiers, not from rushing the schedule.
        bossOffsets: {},
        // 10-minute boss reskin: replace VoidLord with IceQueen on tundra.
        bossOverrides: { void_lord: 'ice_queen' },
        modifiers: Object.freeze({
            playerSpeedMult: 0.9,
            enemyHpMult: 1.2,
            coldTickInterval: 10, // seconds
            coldTickDamage: 1, // HP per tick
            // Pickup item placeholder. Disabled this iteration (no spawn
            // logic, no pickup handler) — surfaced in the schema so the UI
            // and tests can assert the flag exists.
            warmthSourceEnabled: false
        })
    }),
    // ----------------------------------------------------------------------
    // Jamaica — the kids' stage.
    //
    // Warm instead of spooky: daylight, bright houses, food on the ground
    // instead of candy. The locals are a Duppy (the Jamaican word for a
    // spirit) and Pitchy-Patchy, a real character from Jonkonnu, Jamaica's
    // masquerade tradition where dancers cover themselves in strips of
    // bright cloth -- which is exactly this game's everyone-is-in-a-costume
    // premise, so the stage fits without inventing anything.
    // ----------------------------------------------------------------------
    JAMAICA: Object.freeze({
        id: 'jamaica',
        name: 'Jamaica',
        icon: '🇯🇲',
        description: 'Sunshine, patties and festival. The duppies are out.',
        background: { fill: '#1E6F8C', gridAlpha: 0.04 },
        musicStyle: 'jamaica',
        poolOverrides: {
            duppy: 2.2,
            pitchy_patchy: 2.0,
            bat: 0.6,
            zombie: 0.5,
            skeleton: 0.5,
            golem: 0.8
        },
        extraEnemies: ['duppy', 'pitchy_patchy'],
        bossOffsets: {}
    }),
    // ----------------------------------------------------------------------
    // Robot Junkyard — screws instead of candy, and Robot Rob at the end.
    // Rob replaces the 10-minute boss here only, the same mechanism the Ice
    // Queen uses on Area 51, so he never turns up on another stage.
    // ----------------------------------------------------------------------
    JUNKYARD: Object.freeze({
        id: 'junkyard',
        name: 'Robot Junkyard',
        icon: '🤖',
        description: 'Crushed cars and screws underfoot. Robot Rob runs this scrapyard.',
        background: { fill: '#2A2B30', gridAlpha: 0.07 },
        musicStyle: 'junkyard',
        poolOverrides: {
            rusty_bot: 2.2,
            scrap_drone: 2.0,
            bat: 0.5,
            zombie: 0.5,
            skeleton: 0.5,
            ghost: 0.4
        },
        extraEnemies: ['rusty_bot', 'scrap_drone'],
        // Rob is the reason you came to the junkyard, so he lands a little
        // before the Big Dog's new slot rather than inheriting it.
        bossOffsets: { void_lord: -15 },
        bossOverrides: { void_lord: 'robot_rob' }
    }),
    // ----------------------------------------------------------------------
    // Huss Valley - desert. Orange sand, and the neighbours live in caverns
    // cut into the rock instead of houses.
    // ----------------------------------------------------------------------
    HUSS_VALLEY: Object.freeze({
        id: 'huss_valley',
        name: 'Huss Valley',
        icon: '🏜️',
        description: 'Orange sand and cavern doorways. Cacti, vultures and rattlesnakes.',
        background: { fill: '#C96A2E', gridAlpha: 0.04 },
        musicStyle: 'desert',
        poolOverrides: {
            cactus: 2.2,
            vulture: 2.0,
            snake: 2.0,
            bat: 0.4,
            zombie: 0.4,
            skeleton: 0.4,
            ghost: 0.3
        },
        extraEnemies: ['cactus', 'vulture', 'snake'],
        bossOffsets: {},
        bossOverrides: { void_lord: 'big_g' }
    }),
    // ----------------------------------------------------------------------
    // The Final Neighborhood — one fight, nothing else. No waves, no doorbells, no
    // stage modifiers in either direction: just you, a weapon of your choosing
    // at full power, and the man who sold you the costume.
    //
    // Locked until every other boss in the game has been beaten, which means
    // playing every stage (Rob is junkyard-only, Big G is Huss-only, the Real
    // Alien is Area 51-only).
    // ----------------------------------------------------------------------
    ARENA: Object.freeze({
        id: 'arena',
        name: 'The Final Neighborhood',
        icon: '🏪',
        description: 'One fight. Pick a weapon at full power. No waves, no help.',
        background: { fill: '#1A1024', gridAlpha: 0.05 },
        musicStyle: 'boss',
        poolOverrides: {},
        extraEnemies: [],
        bossOffsets: {},
        // Only the shopkeeper. Every other boss is swapped out of the schedule.
        bossOnly: 'costume_owner',
        // A duel: no penalties and no advantages, as asked.
        modifiers: Object.freeze({
            playerSpeedMult: 1,
            enemyHpMult: 1,
            coldTickInterval: 0,
            coldTickDamage: 0,
            warmthSourceEnabled: false
        })
    })
});

const DEFAULT_STAGE_ID = 'forest';

/** @returns {StageDef} */
export function getStage(id) {
    if (!id) return STAGES.FOREST;
    for (const s of Object.values(STAGES)) {
        if (s.id === id) return s;
    }
    return STAGES.FOREST;
}

/** Stable ordering for the stage picker UI. */
export function listStages() {
    return [
        STAGES.FOREST,
        STAGES.CRYPT,
        STAGES.TUNDRA,
        STAGES.JAMAICA,
        STAGES.JUNKYARD,
        STAGES.HUSS_VALLEY,
        STAGES.ARENA
    ];
}

/**
 * Default modifier set used as the floor for any stage that doesn't define
 * its own. Forest + Crypt rely on these defaults so existing balance is
 * untouched. Frozen on first construction so callers can `Object.assign`
 * over a copy without mutating the source.
 */
const DEFAULT_MODIFIERS = Object.freeze({
    playerSpeedMult: 1,
    enemyHpMult: 1,
    coldTickInterval: 0,
    coldTickDamage: 0,
    warmthSourceEnabled: false
});

/**
 * Return the gameplay modifier bundle for a stage. Always returns a complete
 * object (defaults filled in for stages that don't declare every field), so
 * callers can read `mods.coldTickInterval` without `?? 0` everywhere.
 * @param {string} id
 * @returns {{playerSpeedMult:number, enemyHpMult:number, coldTickInterval:number, coldTickDamage:number, warmthSourceEnabled:boolean}}
 */
export function getStageModifiers(id) {
    const stage = getStage(id);
    return { ...DEFAULT_MODIFIERS, ...(stage.modifiers || {}) };
}

/**
 * Return a copy of the WAVES array with the stage's `extraEnemies` appended
 * to each wave's pool. We keep the original `from`/`to`/`spawnMult`/`label`
 * intact — only the `pool` array is mutated, and only on the copy.
 * @returns {Array}
 */
export function getWavesFor(id) {
    const stage = getStage(id);
    const extra = stage.extraEnemies || [];
    return WAVES.map((w) => {
        const pool = extra.length ? Array.from(new Set(w.pool.concat(extra))) : w.pool.slice();
        return { ...w, pool };
    });
}

/**
 * Return a copy of BOSSES with `spawnAt` shifted by the stage's per-boss
 * offset. The offset is clamped to a minimum of 30s so a stage cannot try
 * to spawn the boss before the player has any weapons online.
 *
 * `bossOverrides` (added in iter-14 for tundra) lets a stage swap one boss
 * id for another at the same `spawnAt`. We look up the replacement by id in
 * the BOSSES table; an unknown override is ignored (caller still sees the
 * original entry) so a typo can't drop a boss from the schedule entirely.
 * Any boss whose own id is the *target* of an override on this stage is
 * skipped — otherwise tundra would spawn both VoidLord and IceQueen at the
 * 10-minute mark.
 * @returns {Array<{id:string, spawnAt:number, def:object}>}
 */
export function getBossesFor(id) {
    const stage = getStage(id);
    const offsets = stage.bossOffsets || {};
    const overrides = stage.bossOverrides || {};
    // Set of replacement target ids to skip when we hit them in the source
    // table directly (e.g. ICE_QUEEN.spawnAt would otherwise duplicate-spawn).
    const replacementTargets = new Set(Object.values(overrides));
    const bossesById = {};
    for (const b of Object.values(BOSSES)) bossesById[b.id] = b;

    // Bosses that are *only* spawned via a stage's `bossOverrides` mapping
    // and never on their own. Currently just IceQueen (tundra-exclusive).
    // Skipping these on stages that don't override into them keeps the
    // forest/crypt boss timelines pristine.
    const overrideOnlyIds = new Set(['ice_queen', 'robot_rob', 'big_g', 'costume_owner']);

    // A `bossOnly` stage (the arena) runs exactly one fight: every other boss
    // is dropped from the schedule entirely.
    if (stage.bossOnly) {
        const only = bossesById[stage.bossOnly];
        return only ? [{ ...only, sourceId: only.id }] : [];
    }

    const out = [];
    for (const b of Object.values(BOSSES)) {
        if (overrideOnlyIds.has(b.id) && !replacementTargets.has(b.id)) {
            continue;
        }
        if (replacementTargets.has(b.id) && !overrides[b.id]) {
            // This boss is *only* spawned via override on this stage.
            continue;
        }
        let def = b;
        if (overrides[b.id]) {
            const replacement = bossesById[overrides[b.id]];
            if (replacement) def = replacement;
        }
        const off = offsets[b.id] || 0;
        const spawnAt = Math.max(30, b.spawnAt + off);
        // Carry the *original* id key for boss-spawned tracking sets so
        // `_bossesSpawned.has('void_lord')` doesn't double-fire on tundra.
        out.push({ ...def, spawnAt, sourceId: b.id });
    }
    return out;
}

/**
 * Bosses that must be beaten before the arena opens. The shopkeeper himself
 * is the reward, so he is not part of his own requirement.
 */
export function arenaBossIds() {
    return Object.values(BOSSES)
        .map((b) => b.id)
        .filter((id) => id !== 'costume_owner');
}

/** @returns {{open: boolean, beaten: number, total: number, missing: string[]}} */
export function arenaProgress(save) {
    const need = arenaBossIds();
    const done = save?.bossesEverDefeated || {};
    const missing = need.filter((id) => !done[id]);
    return {
        open: missing.length === 0,
        beaten: need.length - missing.length,
        total: need.length,
        missing
    };
}

/** Is this stage playable yet? Only the arena is ever gated. */
export function isStageUnlocked(stage, save) {
    if (stage?.id !== 'arena') return true;
    return arenaProgress(save).open;
}

/** Background palette helper; the renderer reads this once per frame. */
export function getBackgroundFor(id) {
    const s = getStage(id);
    return s.background;
}

/**
 * Bias a uniform random pick by the stage's `poolOverrides` weights. Missing
 * ids default to weight 1; weights of 0 effectively remove that enemy from
 * the spawn pool for this stage.
 * @param {string[]} pool
 * @param {string} stageId
 * @param {() => number} rnd  random source [0, 1)
 * @returns {string}
 */
export function pickWeighted(pool, stageId, rnd = Math.random) {
    if (!pool.length) return null;
    const stage = getStage(stageId);
    const weights = stage.poolOverrides || {};
    let total = 0;
    const cum = pool.map((id) => {
        const w = weights[id] ?? 1;
        total += Math.max(0, w);
        return total;
    });
    if (total <= 0) return pool[Math.floor(rnd() * pool.length)];
    const r = rnd() * total;
    for (let i = 0; i < pool.length; i++) {
        if (r < cum[i]) return pool[i];
    }
    return pool[pool.length - 1];
}

export { DEFAULT_STAGE_ID };
