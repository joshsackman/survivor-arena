/**
 * @module skins
 * @description Playable costumes. Each one is the same kid in a different
 * homemade costume, with one stat bonus so the choice actually changes how a
 * run plays.
 *
 * The bonuses are applied once, at Player construction (`applyTo`), rather
 * than folded into the passive multipliers -- a skin is a starting condition,
 * not an upgrade you stack.
 *
 * Exports:
 *   - SKINS, listSkins(), getSkin(id), DEFAULT_SKIN_ID
 */

export const DEFAULT_SKIN_ID = 'alien';

export const SKINS = Object.freeze({
    ALIEN: Object.freeze({
        id: 'alien',
        name: 'Alien',
        sprite: 'player',
        icon: '👽',
        blurb: 'The original. No bonus, no penalty.',
        perk: 'Balanced'
    }),
    ZOMBIE: Object.freeze({
        id: 'zombie',
        name: 'Zombie',
        sprite: 'player_zombie',
        icon: '🧟',
        blurb: 'Harder to put down. Starts with 50 more health.',
        perk: '+50 health',
        maxHpBonus: 50
    }),
    ROBOT: Object.freeze({
        id: 'robot',
        name: 'Robot',
        sprite: 'player_robot',
        icon: '🤖',
        blurb: 'Hits harder. Every weapon does 20% more damage.',
        perk: '+20% damage',
        damageMult: 1.2
    }),
    MAYOR: Object.freeze({
        id: 'mayor',
        name: 'The Mayor',
        sprite: 'player_general',
        icon: '🏙️',
        blurb: "You run the place now. Comes with the Mayor's Mallet.",
        perk: "Starts with the Mayor's Mallet",
        startingWeapon: 'mayor_mallet',
        unlockAfterCostumeOwner: true
    }),
    PUMPKIN: Object.freeze({
        id: 'pumpkin',
        name: 'Jack-o-Lantern',
        sprite: 'pumpkin_kid',
        icon: '🎃',
        blurb: 'Beat any boss to unlock. Tough and hits hard, but slower.',
        perk: '+30 health, +10% damage',
        maxHpBonus: 30,
        damageMult: 1.1,
        lockedUntilBossKill: true
    }),
    SUPERHERO: Object.freeze({
        id: 'superhero',
        name: 'Superhero',
        sprite: 'player_superhero',
        icon: '🦸',
        blurb: 'Cape, mask, and a serious turn of speed.',
        perk: '+20% run speed',
        speedMult: 1.2,
        unlockAtRunExp: 1500
    }),
    GENERAL: Object.freeze({
        id: 'general',
        name: 'The General',
        sprite: 'player_general',
        icon: '🎖️',
        blurb: 'Nobody wants to charge a General. They slow right down near you.',
        perk: 'Neighbours nearby slow down',
        armorBonus: 2,
        auraSlowRadius: 150,
        auraSlowPct: 0.35,
        unlockAtRunExp: 3000
    }),
    GHOST: Object.freeze({
        id: 'ghost',
        name: 'Ghost',
        sprite: 'player_ghost',
        icon: '👻',
        blurb: 'Slips out of the way. 15% chance to dodge a hit.',
        perk: '+15% dodge',
        dodgeBonus: 0.15
    })
});

/**
 * Secret costume. Not in listSkins(), so it can never be chosen directly --
 * it is armed by putting ODG on the world board and is spent after one run.
 */
export const SECRET_SKINS = Object.freeze({
    ODG: Object.freeze({
        id: 'owens',
        name: 'Owens',
        sprite: 'player_banana',
        icon: '🍌',
        blurb: 'One round only. Everything you touch goes down, and takes the rest with it.',
        perk: 'One-hit KO',
        oneHitKill: true,
        secret: true
    }),
    UZI: Object.freeze({
        id: 'freddie',
        name: 'Freddie',
        sprite: 'player_cookie',
        icon: '🍪',
        blurb: 'One round only. Everything you touch goes down, and takes the rest with it.',
        perk: 'One-hit KO',
        oneHitKill: true,
        secret: true
    })
});

/** @returns {object|null} the costume a scoreboard code arms, if any. */
export function secretForCode(code) {
    return SECRET_SKINS[String(code || '').toUpperCase()] || null;
}

/** @returns {object|null} look a secret costume up by its id. */
export function secretById(id) {
    for (const s of Object.values(SECRET_SKINS)) if (s.id === id) return s;
    return null;
}

// Kept for compatibility with the original single-secret wiring.
export const SECRET_SKIN = SECRET_SKINS.ODG;
export const SECRET_CODE = 'ODG';

export function listSkins() {
    return [
        SKINS.ALIEN,
        SKINS.ZOMBIE,
        SKINS.ROBOT,
        SKINS.GHOST,
        SKINS.SUPERHERO,
        SKINS.GENERAL,
        SKINS.PUMPKIN,
        SKINS.MAYOR
    ];
}

/** A locked costume stays visible in the picker, but greyed out. */
export function isSkinUnlocked(skin, save) {
    if (skin?.unlockAfterCostumeOwner) return !!save?.bossesEverDefeated?.costume_owner;
    if (skin?.lockedUntilBossKill) return (save?.totals?.bossKills || 0) > 0;
    if (skin?.unlockAtRunExp) return (save?.totals?.bestRunExp || 0) >= skin.unlockAtRunExp;
    return true;
}

/** What the picker prints under a locked costume, so the goal is visible. */
export function skinRequirement(skin, save) {
    if (skin?.unlockAfterCostumeOwner) return 'Beat the Costume Store Owner to unlock';
    if (skin?.lockedUntilBossKill) return 'Beat any boss to unlock';
    if (skin?.unlockAtRunExp) {
        const best = Math.floor(save?.totals?.bestRunExp || 0);
        return `Get ${skin.unlockAtRunExp} XP in one round — best so far ${best}`;
    }
    return '';
}

export function getSkin(id) {
    if (!id) return SKINS.ALIEN;
    const secret = secretById(id);
    if (secret) return secret;
    for (const s of Object.values(SKINS)) if (s.id === id) return s;
    return SKINS.ALIEN;
}
