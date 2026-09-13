/**
 * @module data
 * @description Pure-data catalogue: weapons, passives, enemies, bosses, wave
 * director timeline, achievement definitions and unlock map. Behaviour lives
 * elsewhere (`weapons.js`, `entities.js`, `achievements.js`); this module is
 * intentionally side-effect free so it can be diffed during balancing.
 *
 * Dependencies: none.
 *
 * Exports:
 *   - {Record<string, WeaponDef>} WEAPONS
 *   - {Record<string, PassiveDef>} PASSIVES
 *   - {Record<string, EnemyDef>} ENEMIES
 *   - {Record<string, BossDef>} BOSSES
 *   - {WaveDef[]} WAVES
 *   - {AchievementDef[]} ACHIEVEMENTS
 *   - {Record<string, UnlockDef>} UNLOCKS
 */

// ---------------------------------------------------------------------------
// Weapons
// Level scaling is uniform: damage +20% per level, cooldown ×0.92, range +10%.
// Level 5 triggers a weapon's "evolution" flag (see weapons.js).
// ---------------------------------------------------------------------------
export const WEAPONS = {
    WHIP: {
        id: 'whip',
        name: 'Silly String',
        icon: '⚔️',
        description: 'Lashes to both sides of the hero. Evolves: full circle sweep.',
        baseDamage: 20,
        baseCooldown: 1.5,
        baseRange: 90,
        projectileCount: 1,
        piercing: false,
        type: 'melee',
        evolveLevel: 5,
        evolveName: 'Bloody Sweep'
    },
    MAGIC_WAND: {
        id: 'magic_wand',
        name: 'Glow Stick',
        icon: '🔮',
        description: 'Homing bolt that seeks the closest foe. Evolves: triple volley.',
        baseDamage: 15,
        baseCooldown: 1.2,
        baseRange: 320,
        projectileCount: 1,
        piercing: false,
        type: 'projectile',
        speed: 420,
        homing: true,
        evolveLevel: 5,
        evolveName: 'Seeker Storm'
    },
    KNIFE: {
        id: 'knife',
        name: 'Candy Corn Toss',
        icon: '🗡️',
        description: 'Piercing blade thrown forward. Evolves: wide 5-blade fan.',
        baseDamage: 12,
        baseCooldown: 0.4,
        baseRange: 420,
        projectileCount: 1,
        piercing: true,
        type: 'projectile',
        speed: 620,
        evolveLevel: 5,
        evolveName: 'Blade Fan',
        // iter-14 evolution micro-tweak: the fan also gets a flat +10% crit
        // chance on top of the player's current critChance roll. Picked up
        // by Weapon._rollCrit when the weapon `isEvolved()`.
        evolveBonusCrit: 0.1
    },
    ORBIT: {
        id: 'orbit',
        name: "Spinning Jack-o'-Lanterns",
        icon: '💫',
        description: 'Pumpkins circle you. WEARS OFF after 20s - pick it again to refill.',
        duration: 20,
        baseDamage: 16,
        baseCooldown: 0.4, // used as "tick" for damage re-hit window
        baseRange: 120, // orbit radius
        projectileCount: 2,
        piercing: true,
        type: 'orbit',
        evolveLevel: 5,
        evolveName: 'Twin Halo',
        // iter-14: evolved Twin Halo also boosts shard damage by +10%.
        evolveDamageMult: 1.1
    },
    LIGHTNING: {
        id: 'lightning',
        name: 'Motion Sensor Light',
        icon: '⚡',
        description: 'Smites a random foe. Lv3+ chains. Evolves: storm burst.',
        baseDamage: 35,
        baseCooldown: 3.0,
        baseRange: 420,
        piercing: true,
        type: 'instant',
        chain: true,
        chainCount: 3,
        evolveLevel: 5,
        evolveName: 'Thunder Call',
        // iter-14: evolved Thunder Call rolls a +15% crit on the strikes.
        evolveBonusCrit: 0.15
    },
    MINE: {
        id: 'mine',
        name: 'Toilet Paper Trap',
        icon: '💣',
        description: 'Drops a mine that arms and detonates. Evolves: double-stack.',
        baseDamage: 45,
        baseCooldown: 2.2,
        baseRange: 100, // explosion radius
        projectileCount: 1,
        piercing: true,
        type: 'mine',
        fuse: 1.2,
        evolveLevel: 5,
        evolveName: 'Cluster Mine'
    },
    GARLIC: {
        id: 'garlic',
        name: 'Fog Machine',
        icon: '🧄',
        description: 'Fog hurts everyone near you. WEARS OFF after 18s - pick it again to refill.',
        duration: 18,
        baseDamage: 5,
        baseCooldown: 0.2,
        baseRange: 110,
        piercing: true,
        type: 'aura',
        continuous: true
    },
    // --- v2.4 additions ---------------------------------------------------
    FROST_NOVA: {
        id: 'frost_nova',
        name: 'Brain Freeze',
        icon: '❄️',
        description: 'Expanding ring of ice slows foes caught in the burst. Evolves: twin-ring.',
        baseDamage: 28,
        baseCooldown: 3.2,
        baseRange: 200, // blast radius
        projectileCount: 1,
        piercing: true,
        type: 'nova',
        slowPct: 0.5,
        slowDuration: 1.2,
        evolveLevel: 5,
        evolveName: 'Glacial Cascade'
    },
    SOUL_DRAIN: {
        id: 'soul_drain',
        name: 'Pillowcase Vacuum',
        icon: '🩸',
        description: 'Vacuum beam that heals you. WEARS OFF after 16s - pick it again to refill.',
        duration: 16,
        baseDamage: 8,
        baseCooldown: 0.25, // tick rate
        baseRange: 260,
        projectileCount: 1,
        piercing: true,
        type: 'drain',
        lifestealPct: 0.25,
        evolveLevel: 5,
        evolveName: 'Vampiric Chord'
    },
    BOOMERANG: {
        id: 'boomerang',
        name: 'Flying Paper Plate',
        icon: '🪃',
        description: 'Flung forward, homes back to the hero. Evolves: twin arc.',
        baseDamage: 18,
        baseCooldown: 1.1,
        baseRange: 340,
        projectileCount: 1,
        piercing: true,
        type: 'projectile',
        speed: 380,
        boomerang: true,
        evolveLevel: 5,
        evolveName: 'Twin Arc',
        // iter-14: Twin Arc fires 5% faster than its base cooldown formula.
        evolveCooldownMult: 0.95
    },
    // --- iter-20: Konami Code unlock --------------------------------------
    // Hidden weapon awarded on the first time the player enters the Konami
    // Code on the main menu. Behaves like a fast piercing projectile (a nod
    // to retro shoot-'em-ups). Not part of the regular drop pool — only
    // available as a starter once UNLOCKS.konami_code is earned.
    ULTRA_CHARGER: {
        id: 'ultra_charger',
        name: 'Ultra Charger',
        icon: '🍬',
        description: 'Candy corn fired all the way around you, ray-gun fast.',
        baseDamage: 16,
        baseCooldown: 1.1,
        baseRange: 420,
        projectileCount: 10,
        piercing: true,
        type: 'projectile',
        speed: 560,
        // Fires a full ring instead of aiming at one target.
        radial: true,
        shopPrice: 100
    },
    ALIEN_RAYGUN: {
        id: 'alien_raygun',
        name: 'Alien Raygun',
        icon: '🛸',
        description: 'A steady beam. Far more likely to crit against aliens.',
        baseDamage: 22,
        baseCooldown: 0.6,
        baseRange: 460,
        projectileCount: 1,
        piercing: true,
        type: 'projectile',
        speed: 640,
        // Who counts as an alien: the Area 51 natives and the Real Alien.
        alienBonusCrit: 0.5,
        alienIds: ['grey', 'guard', 'ice_queen'],
        shopPrice: 50
    },
    EGG_LAUNCHER: {
        id: 'egg_launcher',
        name: 'Egg Launcher',
        icon: '🥚',
        description: 'Lob eggs that splatter where they land.',
        baseDamage: 26,
        baseCooldown: 1.0,
        baseRange: 400,
        projectileCount: 1,
        type: 'projectile',
        speed: 380,
        eggSplat: true,
        splatRadius: 70,
        shopPrice: 30
    },
    MAYOR_MALLET: {
        id: 'mayor_mallet',
        // The Mayor's own weapon: never offered to any other costume.
        skinOnly: 'mayor',
        name: "Mayor's Mallet",
        icon: '🔨',
        description: 'One pellet. Takes half of whatever it hits, however big.',
        baseDamage: 20,
        baseCooldown: 0.9,
        baseRange: 480,
        projectileCount: 1,
        // Deliberately NOT piercing: one pellet, one target. With piercing it
        // would halve every enemy in a line, which is a different weapon.
        piercing: false,
        type: 'projectile',
        speed: 700,
        // Damage is a share of the TARGET's maximum health, so it is just as
        // devastating on a 28,000 HP boss as on a bat.
        percentMaxHp: 0.5
    },
    RETRO_BLASTER: {
        id: 'retro_blaster',
        name: 'Toy Ray Gun',
        icon: '👾',
        description: '8-bit arcade beam. Pierces forward in a tight burst. Evolves: triple beam.',
        baseDamage: 14,
        baseCooldown: 0.5,
        baseRange: 480,
        projectileCount: 2,
        piercing: true,
        type: 'projectile',
        speed: 700,
        evolveLevel: 5,
        evolveName: 'Pixel Storm'
    }
};

// ---------------------------------------------------------------------------
// Passives (stackable up to CONFIG.PASSIVE_MAX_STACK)
// ---------------------------------------------------------------------------
export const PASSIVES = {
    MAX_HP: {
        id: 'max_hp',
        name: 'Extra Padding',
        icon: '❤️',
        description: 'Max HP +20%',
        effect: { maxHpMult: 0.2 }
    },
    RECOVERY: {
        id: 'recovery',
        name: 'Snack Break',
        icon: '💚',
        description: 'Regen +0.5 HP/s',
        effect: { hpRegen: 0.5 }
    },
    ARMOR: {
        id: 'armor',
        name: 'Thick Costume',
        icon: '🛡️',
        description: 'Damage taken -1',
        effect: { armor: 1 }
    },
    MOVESPEED: {
        id: 'movespeed',
        name: 'Good Sneakers',
        icon: '👟',
        description: 'Move speed +10%',
        effect: { speedMult: 0.1 }
    },
    MIGHT: {
        id: 'might',
        name: 'Sugar Rush',
        icon: '💪',
        description: 'Damage +10%',
        effect: { damageMult: 0.1 }
    },
    AREA: {
        id: 'area',
        name: 'Giant Costume',
        icon: '📏',
        description: 'Weapon range +10%',
        effect: { areaMult: 0.1 }
    },
    COOLDOWN: {
        id: 'cooldown',
        name: 'Fast Hands',
        icon: '⏱️',
        description: 'Attack speed +8%',
        effect: { cooldownMult: -0.08 }
    },
    MAGNET: {
        id: 'magnet',
        name: 'Candy Magnet',
        icon: '🧲',
        description: 'Pickup range +25%',
        effect: { magnetMult: 0.25 }
    },
    GROWTH: {
        id: 'growth',
        name: 'Full-Size Bars',
        icon: '📈',
        description: 'XP gain +10%',
        effect: { expMult: 0.1 }
    },
    LUCK: {
        id: 'luck',
        name: 'Lucky House',
        icon: '🍀',
        description: 'Crit chance +5%',
        effect: { critChance: 0.05 }
    },
    // --- iter-14 passives -------------------------------------------------
    // The three new passives all hook into existing player stats so the level-
    // up roller pool grows without any new code path. `dodgeChance` is summed
    // (capped at 0.6 in entities.js) and consulted before damage is applied;
    // `magnetMult` is reused for Pickup Magnet+ which stacks multiplicatively
    // on the existing MAGNET passive; `damageReduction` is summed and clamped
    // to a soft 0.6 cap on the consumer side so the player can't go fully
    // immortal even with five stacks.
    DODGE: {
        id: 'dodge',
        name: 'Slippery Costume',
        icon: '💨',
        description: 'Dodge chance +5%',
        effect: { dodgeChance: 0.05 }
    },
    MAGNET_PLUS: {
        id: 'magnet_plus',
        name: 'Candy Magnet+',
        icon: '🧲',
        description: 'Pickup range +35%',
        effect: { magnetMult: 0.35 }
    },
    DAMAGE_REDUCTION: {
        id: 'damage_reduction',
        name: 'Pillowcase Shield',
        icon: '🛡️',
        description: 'Incoming damage -8%',
        effect: { damageReduction: 0.08 }
    }
};

// ---------------------------------------------------------------------------
// Enemies
// Five distinct archetypes + legacy types kept for backwards compat.
// New archetype flags (all optional):
//   ranged:     fires projectiles at the player
//   splitter:   on death, spawns splitChildren × ENEMIES.splitInto
//   dasher:     charges forward in short bursts
//   shielded:   takes reduced damage until shield breaks
// ---------------------------------------------------------------------------
export const ENEMIES = {
    BAT: {
        id: 'bat',
        name: 'Little Kid in a Bad Costume',
        archetype: 'chaser',
        hp: 15,
        speed: 110,
        damage: 10,
        exp: 10,
        color: '#ffb703',
        size: 12
    },
    ZOMBIE: {
        id: 'zombie',
        name: 'Flashlight Dad',
        archetype: 'chaser',
        hp: 30,
        speed: 70,
        damage: 15,
        exp: 15,
        color: '#5b8fd9',
        size: 18
    },
    SKELETON: {
        id: 'skeleton',
        name: 'Robe Mom',
        archetype: 'chaser',
        hp: 25,
        speed: 95,
        damage: 12,
        exp: 12,
        color: '#e26fa8',
        size: 14
    },
    WOLF: {
        id: 'wolf',
        name: 'Barking Dog',
        archetype: 'dasher',
        dasher: true,
        dashSpeed: 320,
        dashInterval: 3.5,
        dashDuration: 0.6,
        hp: 40,
        speed: 150,
        damage: 20,
        exp: 20,
        color: '#b06a2c',
        size: 12
    },
    GOLEM: {
        id: 'golem',
        name: 'Nightgown Grandma',
        archetype: 'shielded',
        shielded: true,
        shieldHp: 60,
        damageReduction: 0.5,
        hp: 120,
        speed: 45,
        damage: 30,
        exp: 50,
        color: '#cbbfe0',
        size: 28
    },
    DAD_RAKE: {
        id: 'dad_rake',
        name: 'Rake Dad',
        archetype: 'chaser',
        hp: 38,
        speed: 64,
        damage: 19,
        exp: 17,
        color: '#B44D4D',
        size: 19
    },
    DAD_POLO: {
        id: 'dad_polo',
        name: 'Polo Dad',
        archetype: 'chaser',
        hp: 26,
        speed: 84,
        damage: 13,
        exp: 15,
        color: '#3E7F3B',
        size: 17
    },
    MOM_WORKOUT: {
        id: 'mom_workout',
        name: 'Workout Mom',
        archetype: 'chaser',
        hp: 26,
        speed: 112,
        damage: 14,
        exp: 18,
        color: '#9B5CFF',
        size: 16
    },
    MOM_CARDIGAN: {
        id: 'mom_cardigan',
        name: 'Cardigan Mom',
        archetype: 'chaser',
        hp: 34,
        speed: 66,
        damage: 16,
        exp: 18,
        color: '#C47A2F',
        size: 17
    },
    PET_CAT: {
        id: 'pet_cat',
        name: 'Angry Cat',
        archetype: 'dasher',
        dasher: true,
        dashSpeed: 380,
        dashInterval: 2.8,
        dashDuration: 0.45,
        hp: 26,
        speed: 165,
        damage: 16,
        exp: 20,
        color: '#3B3B3B',
        size: 13
    },
    CACTUS: {
        id: 'cactus',
        name: 'Walking Cactus',
        archetype: 'chaser',
        // Slow and thick, and it hurts to touch. You go around it.
        hp: 70,
        speed: 46,
        damage: 20,
        exp: 26,
        color: '#4E8C3A',
        size: 17
    },
    VULTURE: {
        id: 'vulture',
        name: 'Vulture',
        archetype: 'dasher',
        // Circles, then swoops.
        dasher: true,
        dashSpeed: 340,
        dashInterval: 3.0,
        dashDuration: 0.6,
        hp: 28,
        speed: 138,
        damage: 14,
        exp: 22,
        color: '#4A3B3B',
        size: 15
    },
    SNAKE: {
        id: 'snake',
        name: 'Rattlesnake',
        archetype: 'chaser',
        // Fast and flimsy: it gets to you before you notice it.
        hp: 22,
        speed: 176,
        damage: 15,
        exp: 20,
        color: '#A8B84A',
        size: 13
    },
    RUSTY_BOT: {
        id: 'rusty_bot',
        name: 'Rusty Bot',
        archetype: 'chaser',
        hp: 44,
        speed: 70,
        damage: 16,
        exp: 22,
        color: '#8A4B2A',
        size: 16
    },
    SCRAP_DRONE: {
        id: 'scrap_drone',
        name: 'Scrap Drone',
        archetype: 'ranged',
        // Hangs back and throws bolts at you.
        ranged: true,
        firingRange: 330,
        keepDistance: 210,
        projectileSpeed: 290,
        projectileDamage: 9,
        projectileKind: 'bolt',
        fireCooldown: 2.3,
        hp: 26,
        speed: 150,
        damage: 7,
        exp: 24,
        color: '#8A8F98',
        size: 14
    },
    DUPPY: {
        id: 'duppy',
        name: 'Duppy',
        archetype: 'chaser',
        // A spirit: drifts straight at you and through whatever is in the way.
        hp: 32,
        speed: 96,
        damage: 14,
        exp: 20,
        color: '#F8F8F8',
        size: 15
    },
    PITCHY_PATCHY: {
        id: 'pitchy_patchy',
        name: 'Pitchy-Patchy',
        archetype: 'dasher',
        dasher: true,
        dashSpeed: 300,
        dashInterval: 3.4,
        dashDuration: 0.5,
        hp: 40,
        speed: 130,
        damage: 16,
        exp: 24,
        color: '#E8720C',
        size: 16
    },
    JUMP_SCARE: {
        id: 'jump_scare',
        name: 'The Jump Scare',
        archetype: 'chaser',
        // Waits completely still, then bursts out when you wander too close.
        // main.js gives him the ambush behaviour; the numbers are the payoff.
        ambush: true,
        ambushRange: 150,
        hp: 34,
        speed: 200,
        damage: 22,
        exp: 30,
        color: '#9B5CFF',
        size: 16
    },
    BEAN_ALWAYS: {
        id: 'bean_always',
        name: 'Bean Always',
        archetype: 'chaser',
        // A giant bean is not fast, but it takes a lot of hitting.
        hp: 46,
        speed: 58,
        damage: 15,
        exp: 18,
        color: '#5FA83C',
        size: 17
    },
    FREDDY: {
        id: 'freddy',
        name: 'Freddie',
        archetype: 'ranged',
        // Quick on the board, and sprays from a distance rather than touching
        // you -- so you have to keep moving instead of tanking him.
        ranged: true,
        firingRange: 340,
        keepDistance: 200,
        projectileSpeed: 300,
        projectileDamage: 10,
        projectileKind: 'paint',
        splatRadius: 60,
        splatDamage: 7,
        fireCooldown: 2.4,
        hp: 30,
        speed: 168,
        damage: 8,
        exp: 26,
        color: '#4FC3F7',
        size: 15
    },
    PET_CHASE: {
        id: 'pet_chase',
        name: 'Chasing Dog',
        archetype: 'dasher',
        dasher: true,
        dashSpeed: 300,
        dashInterval: 3.2,
        dashDuration: 0.7,
        hp: 44,
        speed: 158,
        damage: 18,
        exp: 22,
        color: '#F8F8F8',
        size: 12
    },
    GRANDMA_KNIT: {
        id: 'grandma_knit',
        name: 'Knitting Grandma',
        archetype: 'shielded',
        shielded: true,
        shieldHp: 45,
        damageReduction: 0.4,
        hp: 105,
        speed: 55,
        damage: 26,
        exp: 48,
        color: '#9B5CFF',
        size: 26
    },
    BOX_KID: {
        id: 'box_kid',
        name: 'Kid in a Cardboard Box',
        archetype: 'chaser',
        hp: 24,
        speed: 74,
        damage: 16,
        exp: 14,
        color: '#C47A2F',
        size: 16
    },
    PUMPKIN_KID: {
        id: 'pumpkin_kid',
        name: "Kid in a Jack-o'-Lantern",
        archetype: 'chaser',
        hp: 30,
        speed: 68,
        damage: 17,
        exp: 15,
        color: '#E8720C',
        size: 17
    },
    BULLY: {
        id: 'bully',
        name: 'The Big Bully',
        archetype: 'chaser',
        // Deliberately NOT in any wave pool: pools pick close to uniformly,
        // which would make him common. main.js spawns one rarely, on a timer,
        // and only ever one at a time.
        hp: 260,
        // Slow enough to outrun, which is the kids' escape hatch for him.
        speed: 52,
        damage: 18,
        exp: 70,
        stealsCandy: 2,
        color: '#B44D4D',
        size: 30
    },
    POLTERGEIST: {
        id: 'poltergeist',
        name: 'Poltergeist',
        archetype: 'chaser',
        hp: 34,
        speed: 96,
        damage: 14,
        exp: 24,
        color: '#C8CCD6',
        size: 16
    },
    ARMOUR: {
        id: 'armour',
        name: 'Suit of Armour',
        archetype: 'shielded',
        shielded: true,
        shieldHp: 40,
        damageReduction: 0.35,
        hp: 90,
        speed: 48,
        damage: 24,
        exp: 42,
        color: '#C8CCD6',
        size: 22
    },
    GUARD: {
        id: 'guard',
        name: 'Area 51 Guard',
        archetype: 'ranged',
        ranged: true,
        firingRange: 340,
        keepDistance: 220,
        projectileSpeed: 300,
        projectileDamage: 13,
        fireCooldown: 2.2,
        hp: 46,
        speed: 84,
        damage: 10,
        exp: 30,
        color: '#3A5A50',
        size: 16
    },
    GREY: {
        id: 'grey',
        name: 'A Real Grey',
        archetype: 'dasher',
        dasher: true,
        dashSpeed: 360,
        dashInterval: 3,
        dashDuration: 0.5,
        hp: 40,
        speed: 132,
        damage: 16,
        exp: 34,
        color: '#3FD6C5',
        size: 15
    },
    GHOST: {
        id: 'ghost',
        name: 'Kid in a Sheet',
        archetype: 'chaser',
        hp: 20,
        speed: 130,
        damage: 18,
        exp: 18,
        color: '#f2f0e6',
        size: 15,
        ghost: true
    },
    // --- New archetypes --------------------------------------------------
    MAGE: {
        id: 'mage',
        name: 'Teen With a Pillowcase',
        archetype: 'ranged',
        ranged: true,
        firingRange: 360,
        keepDistance: 260,
        projectileSpeed: 220,
        projectileDamage: 14,
        fireCooldown: 2.4,
        hp: 28,
        speed: 70,
        damage: 8,
        exp: 22,
        color: '#8a6fd6',
        size: 14
    },
    SLIME: {
        id: 'slime',
        name: 'Smashed Pumpkin',
        archetype: 'splitter',
        splitter: true,
        splitCount: 2,
        hp: 55,
        speed: 65,
        damage: 14,
        exp: 24,
        color: '#ff7518',
        size: 20
    },
    SLIMELING: {
        id: 'slimeling',
        name: 'Pumpkin Chunk',
        archetype: 'chaser',
        hp: 18,
        speed: 105,
        damage: 8,
        exp: 6,
        color: '#ffa24d',
        size: 10
    },
    // --- v2.4 additions: bomber (self-destructs) + illusionist (clone) ---
    BOMBER: {
        id: 'bomber',
        name: 'Egg Thrower',
        // v2.8: he used to charge in and detonate like a bomb, which made no
        // sense for a kid with a carton. He hangs back and throws now, and
        // the eggs splatter on impact.
        archetype: 'ranged',
        ranged: true,
        firingRange: 380,
        keepDistance: 230,
        projectileSpeed: 260,
        projectileDamage: 12,
        projectileKind: 'egg',
        splatRadius: 70,
        splatDamage: 8,
        fireCooldown: 2.1,
        hp: 35,
        speed: 110,
        damage: 8,
        exp: 28,
        color: '#f7e7a1',
        size: 14
    },
    ILLUSIONIST: {
        id: 'illusionist',
        name: 'The Inflatable',
        archetype: 'illusionist',
        illusionist: true,
        cloneCooldown: 5.5,
        cloneCount: 2,
        hp: 42,
        speed: 95,
        damage: 12,
        exp: 30,
        color: '#9be8c9',
        size: 15
    }
};

// Splitter produces this type (lookup by id to avoid circular assignment).
ENEMIES.SLIME.splitInto = 'slimeling';

// ---------------------------------------------------------------------------
// Bosses
// Mid-boss at 5:00, final boss at 10:00 (default). Each has a signature ability.
// ---------------------------------------------------------------------------
export const BOSSES = {
    REAPER: {
        id: 'reaper',
        name: 'The Lawn Guy',
        hp: 2500,
        speed: 80,
        damage: 40,
        exp: 500,
        color: '#35502e',
        size: 36,
        boss: true,
        ability: 'summon',
        spawnAt: 90 // 1:30
    },
    VOID_LORD: {
        id: 'void_lord',
        name: 'The Big Dog',
        hp: 6000,
        speed: 60,
        damage: 60,
        exp: 1200,
        color: '#4a2d1f',
        size: 46,
        boss: true,
        ability: 'charge',
        spawnAt: 195 // 3:15
    },
    COSTUME_OWNER: {
        id: 'costume_owner',
        name: 'The Costume Store Owner',
        // The one who sold him the costume. Harder than Robot Rob (14000/90)
        // and Big G (5200/52) put together, because beating him is the whole
        // point of the arena.
        hp: 28000,
        speed: 84,
        damage: 160,
        exp: 5000,
        color: '#6B3FA0',
        size: 56,
        boss: true,
        // Eggs, not helpers: 'summon' was spawning adds into a level that is
        // meant to be a duel.
        ability: 'eggs',
        spawnAt: 0
    },
    BIG_G: {
        id: 'big_g',
        name: 'Big G',
        // An orange tabby that owns the valley. Boss-sized but cat-fast.
        hp: 5200,
        speed: 128,
        damage: 52,
        exp: 1000,
        color: '#E8913C',
        size: 42,
        boss: true,
        ability: 'charge',
        spawnAt: 240
    },
    LIL_TIMMY: {
        id: 'lil_timmy',
        name: 'Lil Timmy',
        // A wooden block with a face. Heavy and slow: he tips over and slides
        // at you rather than chasing.
        hp: 2200,
        speed: 58,
        damage: 38,
        exp: 450,
        color: '#C89A5E',
        size: 40,
        boss: true,
        ability: 'charge',
        spawnAt: 60
    },
    OWEN: {
        id: 'owen',
        name: 'Owen the Animator',
        hp: 3400,
        speed: 75,
        damage: 45,
        exp: 700,
        color: '#49577A',
        size: 38,
        boss: true,
        // Drops pixels around the street that hurt to stand in.
        ability: 'pixels',
        spawnAt: 120 // 2:00
    },
    ROBOT_ROB: {
        id: 'robot_rob',
        name: 'Robot Rob',
        // The hardest boss in the game: more HP and more damage than the
        // Giant Tree, which was the previous ceiling.
        hp: 14000,
        speed: 66,
        damage: 90,
        exp: 2000,
        color: '#8A8F98',
        size: 52,
        boss: true,
        // Throws heavy scrap that explodes where it lands.
        ability: 'scrap',
        // He comes back every two minutes, tougher each time. Without this a
        // boss spawns once per run and is never seen again.
        repeatEvery: 120,
        spawnAt: 210
    },
    // --- v2.4 mid/late bosses --------------------------------------------
    NECROMANCER: {
        id: 'necromancer',
        name: 'Book Club President',
        hp: 4200,
        speed: 70,
        damage: 50,
        exp: 850,
        color: '#5b1f3f',
        size: 40,
        boss: true,
        ability: 'summon',
        spawnAt: 150 // 2:30
    },
    CHRONO_LICH: {
        id: 'chrono_lich',
        name: 'The Giant Tree',
        hp: 10000,
        speed: 55,
        damage: 75,
        exp: 2000,
        color: '#2b3a1c',
        size: 50,
        boss: true,
        ability: 'charge',
        spawnAt: 255 // 4:15
    },
    // --- iter-14 tundra final boss ---------------------------------------
    // IceQueen is a frost-palette variant of the 10-minute boss. The tundra
    // stage swaps her in for VoidLord via `bossOverrides`; on other stages she
    // never auto-spawns. Listed here so the boss list, daily-mode replays and
    // achievement registry can reference her by id without a special case.
    ICE_QUEEN: {
        id: 'ice_queen',
        name: 'THE REAL ALIEN',
        hp: 6200,
        speed: 55,
        damage: 60,
        exp: 1300,
        color: '#7cf2b0',
        size: 44,
        boss: true,
        ability: 'charge',
        // Listed at 660 to keep the BOSSES timeline strictly ascending
        // (Reaper 300 < Necro 450 < VoidLord 600 < IceQueen 660 < ChronoLich
        // 720). Tundra's `bossOverrides` swaps her into VoidLord's 600 slot
        // at runtime; this raw value is never read on tundra (the override
        // path uses the source boss's spawnAt + offset).
        spawnAt: 225, // 3:45
        iceQueen: true // visual flag, read by entities renderer for frost halo
    }
};

// ---------------------------------------------------------------------------
// Wave director: each entry is a window [from, to) (seconds) listing the pool
// of enemies that may spawn, plus a spawn-rate multiplier. The director falls
// back to the final entry once gameTime exceeds the last window.
// ---------------------------------------------------------------------------
export const WAVES = [
    { from: 0, to: 30, pool: ['bat', 'box_kid', 'pumpkin_kid', 'ghost'], spawnMult: 1.35, label: 'Opening' },
    { from: 30, to: 60, pool: ['bat', 'box_kid', 'pumpkin_kid', 'ghost', 'zombie'], spawnMult: 1.5, label: 'Wave 2' },
    {
        from: 60,
        to: 90,
        pool: ['zombie', 'dad_polo', 'dad_rake', 'skeleton', 'mom_workout', 'mage', 'box_kid', 'freddy'],
        spawnMult: 1.6,
        label: 'Teens'
    },
    {
        from: 90,
        to: 120,
        pool: ['skeleton', 'mom_cardigan', 'wolf', 'pet_chase', 'ghost', 'mage', 'bean_always'],
        spawnMult: 1.7,
        label: 'Pack'
    },
    {
        from: 120,
        to: 180,
        pool: ['wolf', 'pet_cat', 'ghost', 'slime', 'mage', 'bomber', 'bean_always', 'jump_scare'],
        spawnMult: 1.8,
        label: 'Pumpkins'
    },
    {
        from: 180,
        to: 240,
        pool: ['wolf', 'pet_chase', 'golem', 'ghost', 'slime', 'bomber', 'freddy', 'jump_scare'],
        spawnMult: 1.9,
        label: 'Vanguard'
    },
    {
        from: 240,
        to: 300,
        pool: ['golem', 'grandma_knit', 'ghost', 'slime', 'mage', 'illusionist', 'freddy', 'jump_scare'],
        spawnMult: 2.0,
        label: 'Pressure'
    },
    {
        from: 300,
        to: 420,
        pool: ['wolf', 'pet_cat', 'golem', 'grandma_knit', 'ghost', 'slime', 'mage', 'bomber', 'illusionist'],
        spawnMult: 2.1,
        label: 'Post-Lawn Guy'
    },
    {
        from: 420,
        to: 600,
        pool: ['golem', 'grandma_knit', 'slime', 'mage', 'ghost', 'wolf', 'illusionist', 'bean_always', 'jump_scare'],
        spawnMult: 2.3,
        label: 'Escalation'
    },
    {
        from: 600,
        to: Infinity,
        pool: ['golem', 'grandma_knit', 'slime', 'mage', 'ghost', 'wolf', 'pet_cat', 'skeleton', 'mom_cardigan', 'bomber', 'illusionist'],
        spawnMult: 2.6,
        label: 'Endgame'
    }
];

// ---------------------------------------------------------------------------
// Achievements: condition evaluated at end-of-run + continuously in-game.
// `check(ctx)` returns true when unlocked. `ctx` = { game, run }
// ---------------------------------------------------------------------------
export const ACHIEVEMENTS = [
    {
        id: 'city_mayor',
        name: 'City Mayor',
        icon: '🏙️',
        description: 'Beat the Costume Store Owner in the Final Neighborhood.',
        check: (c) => !!c.run.bossesDefeated?.costume_owner
    },
    {
        id: 'first_blood',
        name: 'First Blood',
        icon: '🗡️',
        description: 'Defeat your first foe.',
        check: (c) => c.game.kills >= 1
    },
    {
        id: 'slayer_100',
        name: 'Centurion',
        icon: '🎯',
        description: 'Defeat 100 foes in a single run.',
        check: (c) => c.game.kills >= 100
    },
    {
        id: 'slayer_1000',
        name: 'Legion Breaker',
        icon: '🏆',
        description: 'Defeat 1000 foes in a single run.',
        check: (c) => c.game.kills >= 1000
    },
    {
        id: 'boss_slayer',
        name: 'Lawn Guy Down',
        icon: '☠️',
        description: 'Defeat the Lawn Guy mid-boss.',
        check: (c) => !!c.run.bossesDefeated?.reaper
    },
    {
        id: 'void_breaker',
        name: 'Big Dog Down',
        icon: '🌌',
        description: 'Defeat the Big Dog.',
        check: (c) => !!c.run.bossesDefeated?.void_lord
    },
    {
        id: 'survive_5min',
        name: 'Five-Minute Flame',
        icon: '⏱️',
        description: 'Survive 5 minutes.',
        check: (c) => c.game.gameTime >= 300
    },
    {
        id: 'survive_10min',
        name: 'Ten-Minute Titan',
        icon: '🔥',
        description: 'Survive 10 minutes.',
        check: (c) => c.game.gameTime >= 600
    },
    {
        id: 'survive_15min',
        name: 'Quarter Hour',
        icon: '⌛',
        description: 'Survive 15 minutes.',
        check: (c) => c.game.gameTime >= 900
    },
    {
        id: 'weapon_max',
        name: 'Mastery',
        icon: '🌟',
        description: 'Reach max level on any weapon.',
        check: (c) => !!c.run.maxedWeapon
    },
    {
        id: 'untouchable',
        name: 'Untouchable',
        icon: '🛡️',
        description: 'Avoid damage for 60 straight seconds.',
        check: (c) => (c.run.longestUnhit || 0) >= 60
    },
    {
        id: 'xp_hoarder',
        name: 'XP Hoarder',
        icon: '💎',
        description: 'Collect 100 XP orbs in a run.',
        check: (c) => (c.run.orbsCollected || 0) >= 100
    },
    {
        id: 'level_20',
        name: 'High Roller',
        icon: '📈',
        description: 'Reach hero level 20.',
        check: (c) => c.game.player?.level >= 20
    },
    // --- v2.4 additions ---------------------------------------------------
    {
        id: 'speed_demon',
        name: 'Speed Demon',
        icon: '💨',
        description: 'Defeat the Big Dog in under 5 minutes of real time.',
        check: (c) =>
            !!c.run.bossesDefeated?.void_lord && (c.run.realSecondsToVoidLord || Infinity) < 300
    },
    {
        id: 'no_hit_boss',
        name: 'Flawless Duel',
        icon: '🕊️',
        description: 'Defeat any boss without taking damage during the fight.',
        check: (c) => !!c.run.noHitBoss
    },
    {
        id: 'max_all',
        name: 'Max All',
        icon: '👑',
        description: 'Reach max level on every weapon slot in a single run.',
        check: (c) => (c.run.maxedWeaponCount || 0) >= 6
    },
    {
        id: 'early_evolve',
        name: 'Early Evolve',
        icon: '🔮',
        description: 'Evolve a weapon before the 7-minute mark.',
        check: (c) => !!c.run.evolvedBefore?.sevenMin
    },
    {
        id: 'triple_build',
        name: 'Triple Threat',
        icon: '🎲',
        description: 'Finish 3 distinct weapon-composition runs (lifetime).',
        check: (c) => (c.game.save?.totals?.uniqueBuilds || 0) >= 3
    },
    {
        id: 'zen_5min',
        name: 'Zen Walker',
        icon: '🧘',
        description: 'Survive 5 minutes without picking up a single passive.',
        check: (c) => c.game.gameTime >= 300 && (c.run.passivesPicked || 0) === 0
    },
    // --- iter-20: hidden / easter-egg achievements ------------------------
    // These three are intentionally undocumented in the gallery's tooltip
    // copy until they're earned (the UI reveals them once unlocked). Their
    // `hidden: true` flag is read by ui.js to gate the description preview.
    {
        id: 'konami_code',
        name: 'Konami Code',
        icon: '🎮',
        description: 'Found the legendary cheat. Unlocks the Toy Ray Gun.',
        hidden: true,
        check: (c) => !!c.run.konamiCode
    },
    {
        id: 'speedrun_plus',
        name: 'Speedrunner Plus',
        icon: '⚡',
        description:
            'Cleared a major boss in under 5 minutes of real time. Unlocks a sprite trail.',
        hidden: true,
        // The tracker sets `run.fastBossClear` whenever any boss falls in
        // under 300 wall-clock seconds. Reaper on the Crypt stage (4:00
        // spawn) is the only viable path; on Forest it's intentionally
        // unreachable without pause-abuse, which the speedrun anchor
        // already filters out.
        check: (c) => !!c.run.fastBossClear
    },
    {
        id: 'pacifist_provoked',
        name: 'Pacifist Provoked',
        icon: '🕊️',
        description:
            'Survived 60 seconds with zero kills — let the world do the work. Unlocks a special boss title.',
        hidden: true,
        check: (c) => (c.run.pacifistTimer || 0) >= 60 && c.game.kills === 0
    }
];

// ---------------------------------------------------------------------------
// Unlocks: achievement id → weapon id granted as starter-weapon option.
// ---------------------------------------------------------------------------
export const UNLOCKS = {
    first_blood: { weapon: 'magic_wand' },
    slayer_100: { weapon: 'knife' },
    survive_5min: { weapon: 'orbit' },
    boss_slayer: { weapon: 'lightning' },
    survive_10min: { weapon: 'mine' },
    // v2.4 unlocks
    survive_15min: { weapon: 'boomerang' },
    void_breaker: { weapon: 'frost_nova' },
    speed_demon: { weapon: 'soul_drain' },
    // iter-20: easter-egg unlocks. Konami grants a starter weapon, the
    // other two unlock cosmetic flags consumed by the renderer / UI but
    // are still surfaced as standard UNLOCKS entries so the achievement
    // gallery can show their reward chip consistently.
    konami_code: { weapon: 'retro_blaster' },
    speedrun_plus: { cosmetic: 'sprite_trail' },
    pacifist_provoked: { cosmetic: 'boss_title_pacifist' }
};
