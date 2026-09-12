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

export function listSkins() {
    return [SKINS.ALIEN, SKINS.ZOMBIE, SKINS.ROBOT, SKINS.GHOST, SKINS.PUMPKIN];
}

/** A locked costume stays visible in the picker, but greyed out. */
export function isSkinUnlocked(skin, save) {
    if (!skin?.lockedUntilBossKill) return true;
    return (save?.totals?.bossKills || 0) > 0;
}

export function getSkin(id) {
    if (!id) return SKINS.ALIEN;
    for (const s of Object.values(SKINS)) if (s.id === id) return s;
    return SKINS.ALIEN;
}
