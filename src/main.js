/**
 * @module main
 * @description Top-level orchestrator. Owns the `Game` instance, the
 * fixed-step update loop, the spawn/wave director, the achievement check
 * heartbeat and the menu/state machine. This is the only module that
 * reaches into nearly every other one — keep new logic out of here when a
 * focused module fits.
 *
 * Dependencies: every other module under `src/`.
 *
 * Exports:
 *   - class Game
 *   - boot()              constructor + window-handle install
 *   - re-exports ACHIEVEMENTS, WAVES from data.js
 */

import { CONFIG, Difficulty, GameState } from './config.js';
import { ACHIEVEMENTS, BOSSES, ENEMIES, WAVES, WEAPONS } from './data.js';
import {
    Enemy,
    ExpOrb,
    FloatingText,
    Particle,
    Player,
    findEnemyDef,
    registerWeaponClass,
    Callout
} from './entities.js';
import { Weapon } from './weapons.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { HapticEngine } from './haptics.js';
import { loadKeymap, saveKeymap } from './keymap.js';
import { UI, buildUpgradePool, isUpgradeLive, pickN } from './ui.js';
import { FpsMeter, ShakeCamera } from './systems.js';
import { SpatialHash } from './spatial-hash.js';
import { Pool, resetFloatingText, resetParticle } from './pool.js';
import { EffectLayer } from './effects.js';
import { AchievementTracker } from './achievements.js';
import {
    SeededRng,
    accumulateTotals,
    getTouchButtonScale,
    loadSave,
    loadSpeedrunScores,
    recordHighScore,
    recordSpeedrunScore,
    resetSave,
    saveSave
} from './storage.js';
import { setLocale, t as _t } from './i18n.js';
import {
    DEFAULT_STAGE_ID,
    getBackgroundFor,
    getBossesFor,
    getStageModifiers,
    getWavesFor,
    pickWeighted
} from './stages.js';
import { dailyChallenge, saveDailyResult } from './daily.js';
import { TutorialState } from './tutorial.js';
import { ReplayPlayer, ReplayRecorder, loadReplay, saveReplay } from './replay.js';
import { KonamiDetector } from './konami.js';
import { submitScore, fetchTopScores, checkInitials, normaliseInitials } from './leaderboard.js';
import { drawSprite, hasSprite, spriteDataUrl } from './sprites.js';

registerWeaponClass(Weapon);

// ---------------------------------------------------------------------------
// Offscreen sprite cache. Pre-rasterising the tiny enemy sprites once and
// blitting the bitmap each frame is measurably faster than redoing the
// gradient/fill path every draw call. Cache key = `${id}-${size}`.
// ---------------------------------------------------------------------------
const SPRITE_CACHE = new Map();

function spriteKey(id, size) {
    return `${id}@${size}`;
}

function getEnemySprite(def, size) {
    const key = spriteKey(def.id, size);
    const cached = SPRITE_CACHE.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined') return null; // SSR / test guard
    const pad = 4;
    // v2.8: pixel-art neighbours go through this same cache, so the fast path
    // stays one drawImage per enemy. A character with art needs a taller
    // canvas than the old blob; everyone without art keeps the circle.
    const usesArt = hasSprite(def.id);
    const targetH = size * 2.6;
    const d = (usesArt ? Math.ceil(targetH * 1.5) : size * 2) + pad * 2;
    const off = document.createElement('canvas');
    off.width = d;
    off.height = d;
    const ox = d / 2;
    const oy = d / 2;
    const c = off.getContext('2d');
    if (!usesArt || !drawSprite(c, def.id, ox, oy, targetH)) {
        c.fillStyle = def.color || '#ff4444';
        c.beginPath();
        c.arc(ox, oy, size, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.beginPath();
        c.arc(ox, oy, size * 0.5, 0, Math.PI * 2);
        c.fill();
    }
    SPRITE_CACHE.set(key, off);
    return off;
}

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.state = GameState.MENU;
        this.lastTime = 0;
        this.gameTime = 0;
        this.kills = 0;
        this.raf = 0;

        // Collections
        this.enemies = [];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.expOrbs = [];
        this.particles = [];
        this.floatingTexts = [];
        this.mines = [];

        this.player = null;

        // Systems
        this.spatial = new SpatialHash(CONFIG.SPATIAL_CELL_SIZE);
        this.camera = new ShakeCamera();
        this.fpsMeter = new FpsMeter();
        this.effects = new EffectLayer();

        // Object pools for the churny entities. `prealloc` avoids the
        // first-level burst triggering an allocation cascade.
        this.pools = {
            floatingText: new Pool(() => new FloatingText('', 0, 0, '#fff'), resetFloatingText, {
                maxSize: 256,
                prealloc: 32
            }),
            particle: new Pool(() => new Particle(0, 0, '#fff'), resetParticle, {
                maxSize: 512,
                prealloc: 64
            })
        };

        // Tab-visibility aware pause so resuming doesn't produce a huge dt.
        this._hiddenPaused = false;
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => this._onVisibilityChange());
        }

        // Save + settings
        this.save = loadSave();
        setLocale(this.save.settings.locale || 'en');
        if (this.save.settings.colorblind) document.body.classList.add('cb-mode');

        // Audio + input + UI
        this.audio = new AudioEngine(this.save.settings);
        this.input = new InputManager();
        // iter-19: haptic feedback engine. Reads the live save.settings ref
        // so toggling the Settings checkbox takes effect on the next event.
        this.haptics = new HapticEngine(this.save.settings);
        // iter-19: load custom keymap (or fall back to default WASD + arrows
        // + Esc/P + H/? + M) and hand it to the input manager. Persisted
        // changes from previous sessions are picked up here.
        this.keymap = loadKeymap();
        this.input.setKeymap(this.keymap);
        this.ui = new UI(this);

        // Achievements tracker persists the lifetime record.
        this.achievements = new AchievementTracker(this.save);

        this._bossesSpawned = new Set();
        this._spawnAccumulator = 0;
        this._bossWarnedAt = new Set();
        this._lastAnnouncedWave = null;

        // Active stage descriptor + per-stage waves/bosses snapshot. Keyed off
        // the persisted setting so a returning player resumes on whatever map
        // they last picked. Re-derived in start() so a stage swap mid-session
        // takes effect on the next run.
        this.stageId = this.save?.settings?.stage || DEFAULT_STAGE_ID;
        this.stageWaves = getWavesFor(this.stageId);
        this.stageBosses = getBossesFor(this.stageId);
        this.currentWave = this.stageWaves[0] || WAVES[0];

        // Speedrun bookkeeping. When `speedrunMode` is truthy, spawn picks
        // are deterministic, real-time splits are tracked and the result
        // lands in the speedrun leaderboard instead of the normal one.
        this.speedrunMode = false;
        this.speedrunRng = null;
        this.speedrunStart = 0;
        this.speedrunSplits = [];
        this._nextSplitIdx = 0;

        // Daily-challenge bookkeeping. When `dailyMode` is true the seed +
        // stage + boss schedule are pinned by `daily.dailyChallenge(...)`.
        this.dailyMode = false;
        this.dailyChallenge = null;

        // Per-run bookkeeping used by achievements.
        this.run = this.achievements.run;

        this._bindInput();
        this._bindDomButtons();
        this._bindLeaderboardImport();
        this._bindGlobalHotkeys();
        // iter-20: Konami code detector. Active only on the main menu (state
        // === MENU); the listener is hot-installed but checks the state on
        // every push so it never interferes with gameplay input.
        this._bindKonamiCode();

        // iter-13: paint the Stage chip on the main menu so a returning
        // player sees which map their next Start Run would launch.
        this.ui.updateStageChip(this.stageId);

        // iter-15: tutorial state machine + replay bookkeeping. Both are
        // inert until explicitly engaged by the player (via Try Tutorial /
        // Replay Last Run). Recorder is created on every run start in
        // `start()` and only persisted when the run ends; replay player is
        // only created on demand.
        this.tutorial = new TutorialState();
        this.replayRecorder = null;
        this.replayPlayer = null;
        this.replayActive = false;
        // Per-frame snapshot of move vector for the recorder (kept on the
        // game so other systems can also peek at the most recent input).
        this._lastMoveVec = { x: 0, y: 0 };
        // Cached tutorial banner element handle; assigned lazily on first
        // tutorial activation so we don't pay for it on returning players.
        this._tutorialBanner = null;

        // First-launch How-to-Play: show once, persist a flag so we don't
        // nag returning players. Wrapped in a microtask so DOM is settled.
        // iter-15: same one-time gate now also offers the 5-step tutorial.
        if (!this.save?.flags?.howToSeen) {
            Promise.resolve().then(() => {
                this.ui.showHowToPlay(() => {
                    this.save.flags = this.save.flags || {};
                    this.save.flags.howToSeen = true;
                    saveSave(this.save);
                    // After the how-to-play closes, offer the interactive
                    // tutorial if it hasn't already been completed.
                    if (!this.save.flags.tutorialDone) this._offerTutorial();
                });
            });
        } else if (!this.save?.flags?.tutorialDone) {
            // Returning player who saw HTP but never finished the tutorial:
            // nudge once on the next cold-boot, no other interruption.
            Promise.resolve().then(() => this._offerTutorial());
        }

        // Apply any persisted mute on boot so a refresh keeps the choice.
        if (this.save.settings.muted) this.audio.setMuted(true);

        // iter-14: apply touch-button scale to CSS custom properties.
        this._applyTouchScale();
        // iter-14: PWA install prompt (one-shot per save). Listens for the
        // browser's `beforeinstallprompt` once; if it fires before the user
        // has dismissed it ever, we surface our own little banner.
        this._wirePwaPrompt();

        window.addEventListener('resize', () => this._resize());
        this._resize();
    }

    /**
     * Bind global hotkeys that operate from the main menu *and* during
     * gameplay: M toggles mute, H (or ?) toggles the help overlay. Pause
     * already has its own binding via InputManager.onTogglePause.
     */
    _bindGlobalHotkeys() {
        // iter-19: M (mute) and H/? (help) are now dispatched by the input
        // layer through the customisable keymap. We keep the per-frame
        // suppression for INPUT/TEXTAREA targets as a capture-phase guard so
        // typing into the leaderboard import textarea doesn't pause/help.
        if (typeof window === 'undefined') return;
        window.addEventListener(
            'keydown',
            (e) => {
                const tag = (e.target && e.target.tagName) || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA') {
                    // Stop the input-manager's default handler from firing
                    // for typed text. We do this rather than gating inside
                    // input.js so keymap remapping stays tiny.
                    e.stopPropagation();
                }
            },
            true
        );
    }

    /**
     * iter-20: install the Konami Code detector. Listens on the main menu
     * only — the gameplay input layer already owns arrows during a run, and
     * we don't want a stray cheat-code press during combat to flicker an
     * unlock toast. On a successful sequence we flip a per-run flag, run
     * the achievement check immediately, and surface a small announcement
     * via the existing live-region helper. The unlock weapon is wired
     * through UNLOCKS so the next Start Run gets it as a starter option.
     */
    _bindKonamiCode() {
        if (typeof window === 'undefined') return;
        this._konami = new KonamiDetector(() => this._onKonamiUnlocked());
        window.addEventListener('keydown', (e) => {
            if (this.state !== GameState.MENU) return;
            // Ignore when typing into the leaderboard import textarea etc.
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            this._konami.push(e.key);
        });
    }

    /** Konami sequence completed: flip the per-run flag and unlock the cheat. */
    _onKonamiUnlocked() {
        // `this.run` is aliased to `this.achievements.run` (see constructor +
        // start()), so setting the flag in one place is enough for the
        // achievement check to read it.
        if (this.run) this.run.konamiCode = true;
        try {
            this.achievements.check(this);
        } catch {
            /* swallow — boot-time miss is fine */
        }
        this._flushAchievementToasts?.();
        this._announce('Cheat code unlocked. Toy Ray Gun available.');
    }

    /** Toggle a global mute and persist so a refresh keeps the choice. */
    toggleMute() {
        const next = !this.save.settings.muted;
        this.save.settings.muted = next;
        saveSave(this.save);
        this.audio.setMuted(next);
        this._announce(next ? 'Audio muted' : 'Audio unmuted');
    }

    /** Open the help overlay; close it if it's already open. */
    toggleHelp() {
        const el = this.ui.els.helpScreen;
        if (el && el.style.display === 'flex') {
            this.ui.hideHelp();
        } else {
            this.ui.showHelp();
        }
    }

    /**
     * Listen for the `vs-leaderboard-import` CustomEvent that `UI.showLeaderboard`
     * dispatches when the user pastes JSON and clicks Import. We merge the
     * incoming runs into both the normal and speedrun stores, dedupe by
     * `date+timeSurvived` (or `date+timeMs` for speedrun), then re-rank and
     * persist. The UI is then refreshed if it's still on screen.
     */
    _bindLeaderboardImport() {
        if (typeof window === 'undefined') return;
        window.addEventListener('vs-leaderboard-import', (ev) => {
            const payload = ev.detail || {};
            try {
                if (Array.isArray(payload.normal)) {
                    const seen = new Set(
                        (this.save.highScores || []).map((r) => `${r.date}|${r.timeSurvived}`)
                    );
                    for (const r of payload.normal) {
                        const k = `${r.date}|${r.timeSurvived}`;
                        if (!seen.has(k)) {
                            recordHighScore(this.save, r);
                            seen.add(k);
                        }
                    }
                    saveSave(this.save);
                }
                if (Array.isArray(payload.speedrun)) {
                    const existing = loadSpeedrunScores();
                    const seen = new Set(existing.map((r) => `${r.date}|${r.timeMs}`));
                    for (const r of payload.speedrun) {
                        const k = `${r.date}|${r.timeMs}`;
                        if (!seen.has(k)) {
                            recordSpeedrunScore(r);
                            seen.add(k);
                        }
                    }
                }
                // Refresh the open leaderboard view if the dialog is still up.
                this.ui.showLeaderboard?.(
                    this.save.highScores || [],
                    loadSpeedrunScores(),
                    () => {}
                );
            } catch (err) {
                console.warn('[main] leaderboard import failed', err);
            }
        });
    }

    // --- Lifecycle --------------------------------------------------------
    _bindInput() {
        this.input.attach(window);
        this.input.onTogglePause = () => this.togglePause();
        // iter-19: help/mute actions are routed through the keymap rather
        // than the legacy global keydown listener. Both still default to
        // H/M but a remap takes effect immediately.
        this.input.onActionHelp = () => this.toggleHelp();
        this.input.onActionMute = () => this.toggleMute();
        // v2.8: drag anywhere to move on touch (replaces the virtual joystick).
        const surface = document.getElementById('gameContainer');
        if (surface) this.input.attachDragMove(surface);
        // iter-14: mobile special-skill button. The button is a placeholder
        // for now — wires through to togglePause until per-build skills are
        // implemented, so the press at least gives the player a way out.
        const special = document.getElementById('specialSkillBtn');
        if (special) {
            this.input.attachSpecialButton(special);
            this.input.onTouchSpecial = () => this.togglePause();
        }
        // iter-14: gamepad confirm/cancel/menu wiring. We map A→togglePause
        // and B→togglePause as well for now (overlay UIs read DOM keystrokes
        // directly), but Start is the canonical pause toggle.
        this.input.onGamepadConfirm = () => {
            // Forward as a synthetic Enter keypress so existing menu close
            // handlers fire without each one having to know about gamepads.
            this._dispatchKey('Enter');
        };
        this.input.onGamepadCancel = () => {
            this._dispatchKey('Escape');
        };
        this.input.onGamepadCycleNext = () => this._dispatchKey('Tab');
        this.input.onGamepadCyclePrev = () => this._dispatchKey('Tab', { shiftKey: true });
    }

    /** Dispatch a synthetic keydown so DOM listeners react to gamepad nav. */
    _dispatchKey(key, opts = {}) {
        if (typeof window === 'undefined' || typeof KeyboardEvent === 'undefined') return;
        const ev = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
        (document.activeElement || document.body).dispatchEvent(ev);
    }

    /**
     * iter-14: write the touch-button scale to CSS custom properties on the
     * document root. Multiplies the base sizes (defined in styles.css under
     * `:root`) by the user's setting so the joystick + special button stay
     * proportional. No-op outside the browser (test env).
     */
    _applyTouchScale() {
        if (typeof document === 'undefined' || !document.documentElement) return;
        const scale = getTouchButtonScale(this.save);
        const base = 140;
        const knob = 58;
        const special = 60;
        const root = document.documentElement.style;
        root.setProperty('--touch-button-size', `${Math.round(base * scale)}px`);
        root.setProperty('--touch-knob-size', `${Math.round(knob * scale)}px`);
        root.setProperty('--touch-special-size', `${Math.round(special * scale)}px`);
    }

    /**
     * iter-14: install-prompt plumbing. Browsers fire `beforeinstallprompt`
     * once when the page meets the install criteria. We stash the deferred
     * event, surface a small in-page banner the first time, and remember the
     * user's choice (install / dismiss) so we never nag them again. We
     * intentionally avoid auto-prompting — Chrome ranks repeated prompts as
     * spam; the user has to click our button.
     */
    _wirePwaPrompt() {
        if (typeof window === 'undefined') return;
        if (this.save?.flags?.pwaPromptSeen) return;
        let deferred = null;
        const banner = document.getElementById('pwaInstallPrompt');
        const installBtn = document.getElementById('pwaInstallBtn');
        const dismissBtn = document.getElementById('pwaInstallDismiss');
        if (!banner || !installBtn || !dismissBtn) return;
        const markSeen = () => {
            this.save.flags = this.save.flags || {};
            this.save.flags.pwaPromptSeen = true;
            saveSave(this.save);
            banner.style.display = 'none';
        };
        window.addEventListener(
            'beforeinstallprompt',
            (e) => {
                e.preventDefault?.();
                deferred = e;
                banner.style.display = 'flex';
            },
            { once: true }
        );
        installBtn.addEventListener('click', async () => {
            if (deferred) {
                deferred.prompt?.();
                try {
                    await deferred.userChoice;
                } catch {
                    /* ignore */
                }
            }
            markSeen();
        });
        dismissBtn.addEventListener('click', markSeen);
    }

    _bindDomButtons() {
        const q = (id) => document.getElementById(id);
        q('btnStart')?.addEventListener('click', () => {
            this.audio.unlock();
            this.speedrunMode = false;
            this.dailyMode = false;
            this.playIntro();
        });
        q('btnSpeedrun')?.addEventListener('click', () => {
            this.audio.unlock();
            this.startSpeedrun();
        });
        q('btnStage')?.addEventListener('click', () => this.openStagePicker());
        q('btnDaily')?.addEventListener('click', () => {
            this.audio.unlock();
            this.startDaily();
        });
        q('btnLeaderboard')?.addEventListener('click', () => this.openLeaderboard());
        q('btnSettings')?.addEventListener('click', () => this.openSettings());
        q('btnAchievements')?.addEventListener('click', () => this.openAchievements());
        q('btnViewStreak')?.addEventListener('click', () => this.openStreak());
        q('btnHowTo')?.addEventListener('click', () => this.openHowToPlay());
        // iter-15: replay-last-run + tutorial entry points on the start menu.
        q('btnReplay')?.addEventListener('click', () => this.openReplay());
        q('btnTutorial')?.addEventListener('click', () => this.startTutorialRun());
        q('btnRetry')?.addEventListener('click', () => {
            this.ui.hideGameOver();
            if (this.dailyMode) this.startDaily();
            else if (this.speedrunMode) this.startSpeedrun();
            else this.start();
        });
        q('btnMenu')?.addEventListener('click', () => {
            this.ui.hideGameOver();
            this.ui.showStart();
        this._paintStartScene();
        this.audio.play?.('titleSting');
            this.state = GameState.MENU;
            this.speedrunMode = false;
        });
        q('btnResume')?.addEventListener('click', () => this.togglePause());
        q('btnQuit')?.addEventListener('click', () => {
            this.state = GameState.MENU;
            this.ui.hidePause();
            this.ui.showStart();
        this._paintStartScene();
            cancelAnimationFrame(this.raf);
            this.audio.stopMusic();
        });
    }

    _resize() {
        const container = document.getElementById('gameContainer');
        if (!container) return;
        // v2.8 mobile: on touch devices the playfield fills the whole screen
        // rather than letterboxing the fixed 1200x800 landscape frame — on a
        // phone that frame collapsed to a ~359x239 strip floating mid-screen.
        // The camera and renderer read CONFIG.CANVAS_* live every frame, so
        // rewriting them here is safe; we cap at the arena size so the camera
        // clamp in _updateCamera() can never invert.
        const touchFirst =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        if (touchFirst) {
            const vw = Math.max(1, Math.min(Math.round(window.innerWidth), CONFIG.ARENA_WIDTH));
            const vh = Math.max(1, Math.min(Math.round(window.innerHeight), CONFIG.ARENA_HEIGHT));
            CONFIG.CANVAS_WIDTH = vw;
            CONFIG.CANVAS_HEIGHT = vh;
            const canvas = this.canvas || document.getElementById('gameCanvas');
            if (canvas) {
                canvas.width = vw;
                canvas.height = vh;
                canvas.style.width = `${vw}px`;
                canvas.style.height = `${vh}px`;
            }
            container.style.width = `${vw}px`;
            container.style.height = `${vh}px`;
            this._updateCamera();
            return;
        }
        const w = Math.min(window.innerWidth - 16, CONFIG.CANVAS_WIDTH);
        const h = Math.min(window.innerHeight - 16, CONFIG.CANVAS_HEIGHT);
        const scale = Math.min(w / CONFIG.CANVAS_WIDTH, h / CONFIG.CANVAS_HEIGHT);
        container.style.width = `${CONFIG.CANVAS_WIDTH * scale}px`;
        container.style.height = `${CONFIG.CANVAS_HEIGHT * scale}px`;
    }

    /**
     * v2.8: the moment the premise happens. The kid walks down his own street,
     * a neighbour turns and spots him, and the compliment curdles into a
     * manhunt. Runs in its own state so nothing spawns or collides mid-scene,
     * and any key or tap skips straight to the run -- kids replay constantly.
     */
    /**
     * v2.8: fill the start screen's scene strip with the real cast -- the kid
     * out front and the mob closing in behind him. Built from the same sprite
     * art the game uses, so the menu can never drift from what you meet.
     */
    _paintStartScene() {
        const host = document.getElementById('startScene');
        if (!host) return;
        const chasers = ['zombie', 'skeleton', 'wolf', 'golem', 'bat', 'mage', 'pumpkin_kid'];
        const hero = spriteDataUrl('player', 96);
        const parts = [];
        if (hero) parts.push(`<img class="hero-sprite" src="${hero}" alt="" width="64" height="64">`);
        for (const key of chasers) {
            const url = spriteDataUrl(key, 80);
            if (url) parts.push(`<img class="chaser" src="${url}" alt="" width="56" height="56">`);
        }
        host.innerHTML = parts.join('');
    }

    playIntro() {
        if (this.save.settings.reducedMotion) return this.start();
        this.ui.hideStart();
        this.state = GameState.CUTSCENE;
        this.gameTime = 0;
        this.enemies = [];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.expOrbs = [];
        this.particles = [];
        this.floatingTexts = [];
        this.callouts = [];
        this.mines = [];
        this._metNeighbours = new Set();

        const W = CONFIG.ARENA_WIDTH ?? CONFIG.CANVAS_WIDTH;
        const H = CONFIG.ARENA_HEIGHT ?? CONFIG.CANVAS_HEIGHT;
        const midY = H * 0.5;
        this.player = new Player(W * 0.3, midY);
        this._updateCamera();

        // Neighbours start at their houses and step out into the road.
        this._introActors = [
            { key: 'zombie', x: W * 0.47, y: midY - 210, tx: W * 0.47, ty: midY - 70, size: 18, out: 2.0 },
            { key: 'skeleton', x: W * 0.56, y: midY + 215, tx: W * 0.55, ty: midY + 80, size: 17, out: 2.3 },
            { key: 'box_kid', x: W * 0.63, y: midY - 200, tx: W * 0.62, ty: midY - 50, size: 16, out: 2.6 },
            { key: 'golem', x: W * 0.5, y: midY + 230, tx: W * 0.5, ty: midY + 140, size: 26, out: 2.9 },
            { key: 'wolf', x: W * 0.66, y: midY + 210, tx: W * 0.65, ty: midY + 60, size: 16, out: 3.1 }
        ];
        this._introT = 0;
        this._introDone = false;
        this._introSaid = new Set();
        this.audio.unlock?.();

        const skip = () => this._endIntro();
        this._introSkip = skip;
        window.addEventListener('keydown', skip, { once: true });
        window.addEventListener('pointerdown', skip, { once: true });

        // The scene needs the frame loop running: it only started when a run
        // began, so the cutscene rendered nothing at all.
        cancelAnimationFrame(this.raf);
        this.lastTime = performance.now();
        this._scheduleFrame();
        this.audio.startMusic('intro');

        this._introTimer = setTimeout(() => this._endIntro(), 6000);
    }

    /** Leave the scene exactly once, however it ended. */
    _endIntro() {
        if (this._introDone) return;
        this._introDone = true;
        clearTimeout(this._introTimer);
        window.removeEventListener('keydown', this._introSkip);
        window.removeEventListener('pointerdown', this._introSkip);
        this._introActors = null;
        this.start({ fromIntro: true });
    }

    /**
     * The beats: the kid strolls home, a dad compliments the costume, then
     * the street works out it is not one. Everything is said in-world by the
     * neighbours themselves rather than as a banner across the screen.
     */
    _updateIntro(dt) {
        this._introT += dt;
        const t = this._introT;
        if (this.player) this.player.x += 74 * dt;

        for (const a of this._introActors || []) {
            if (t >= a.out) {
                a.x += (a.tx - a.x) * Math.min(1, 2.2 * dt);
                a.y += (a.ty - a.y) * Math.min(1, 2.2 * dt);
            }
        }

        const say = (id, text, actorIdx, accent, big) => {
            if (this._introSaid.has(id)) return;
            this._introSaid.add(id);
            const a = (this._introActors || [])[actorIdx];
            if (!a) return;
            this.callouts.push(
                new Callout(text, a.x, a.y - a.size - 30, { accent, big, life: 2.2 })
            );
        };

        if (t >= 1.3) say('a', 'Nice costume, kid!', 0, '#FFC830', false);
        if (t >= 2.6) say('b', "That's not a costume.", 1, '#FF4B4B', false);
        if (t >= 3.5) {
            say('c', 'GET THEM!', 3, '#FF4B4B', true);
            this.audio.bossWarn?.();
        }
        if (t >= 4.0 && !this._introSaid.has('d')) {
            this._introSaid.add('d');
            // Everyone turns and starts closing in.
            for (const a of this._introActors || []) {
                a.tx = this.player.x + (a.x - this.player.x) * 0.45;
                a.ty = this.player.y + (a.y - this.player.y) * 0.45;
                a.out = 0;
            }
        }

        for (let i = this.callouts.length - 1; i >= 0; i--) {
            const c = this.callouts[i];
            c.update(dt);
            if (c.shouldRemove) this.callouts.splice(i, 1);
        }
        this._updateCamera();
    }

    /** The scene is drawn with the ordinary street + sprite pipeline. */
    _renderIntro() {
        const ctx = this.ctx;
        const bg = getBackgroundFor(this.stageId);
        ctx.fillStyle = bg.fill;
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        ctx.save();
        ctx.translate(-this.camera.worldX, -this.camera.worldY);
        this._drawStreet();
        for (const a of this._introActors || []) {
            drawSprite(ctx, a.key, a.x, a.y, a.size * 2.6);
        }
        if (this.player) this.player.render(ctx);
        for (const c of this.callouts || []) c.render(ctx);
        ctx.restore();
    }

    start(opts = {}) {
        this.state = GameState.PLAYING;
        // The cutscene already played these beats in-world; only shout them
        // when it was skipped (or reduced motion turned it off).
        if (!opts.fromIntro) {
            this.ui.showStreetShout?.("THAT'S NOT A COSTUME - GET THEM!", 2200);
        }
        this.gameTime = 0;
        this.kills = 0;
        this.enemies = [];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.expOrbs = [];
        this.particles = [];
        this.floatingTexts = [];
        this.mines = [];
        this._bossesSpawned.clear();
        // v2.8: the names are half the joke, so each neighbour gets introduced
        // the first time you meet them in a run.
        this._metNeighbours = new Set();
        this.callouts = [];
        this._bullyTimer = 0;
        this._buildDoorbells();
        this._bossWarnedAt.clear();
        this._spawnAccumulator = 0;
        this._lastAnnouncedWave = null;
        this._nextSplitIdx = 0;
        // iter-16 bug-bash: clear stale pause-anchor from any prior paused run.
        this._pauseStartedAt = 0;

        // Re-derive the stage snapshot at run start. Daily mode pins the
        // stage from the challenge spec; otherwise we honour the saved
        // setting so a stage-picker change between runs takes effect here.
        const stageOverride =
            this.dailyMode && this.dailyChallenge ? this.dailyChallenge.stage : null;
        this.stageId = stageOverride || this.save?.settings?.stage || DEFAULT_STAGE_ID;
        this.stageWaves = getWavesFor(this.stageId);
        this.stageBosses = this._applyDailyBossOffset(getBossesFor(this.stageId));
        this.currentWave = this.stageWaves[0];
        // iter-14: cache the active stage's gameplay modifiers (player speed,
        // enemy HP, cold tick). Looked up here so the per-frame hot path
        // doesn't pay the indirection — `getStageModifiers` walks STAGES.
        this.stageMods = getStageModifiers(this.stageId);
        this._coldTickAccum = 0;

        // Reset per-run achievement state.
        this.achievements.resetRun();
        this.run = this.achievements.run;
        // Seed the fields the v2.4 achievements depend on. Kept here (rather
        // than in AchievementTracker) because these tie together weapons/ui.
        this.run.passivesPicked = 0;
        this.run.maxedWeaponCount = 0;
        this.run.evolvedBefore = {};
        this.run.realSecondsToVoidLord = Infinity;
        this.run.noHitBoss = false;
        this.run.tookAnyDamage = false; // flipped by Player.takeDamage; drives no-hit badge
        this.run.bossFightNoHit = new Set(); // ids of bosses whose fight we've tracked
        this._runStartWallClock = performance.now();
        this.speedrunSplits = [];

        this.player = new Player(
            (CONFIG.ARENA_WIDTH ?? CONFIG.CANVAS_WIDTH) / 2,
            (CONFIG.ARENA_HEIGHT ?? CONFIG.CANVAS_HEIGHT) / 2
        );
        this.player.weapons.push(new Weapon(WEAPONS.WHIP));
        // Snap camera to player at run start so the first frame doesn't show
        // a one-tick lerp from (0,0).
        this._updateCamera();

        this.ui.hideStart();
        this.ui.hideGameOver();
        this.ui.hideLevelUp();
        this.ui.hidePause();

        this.save.runs = (this.save.runs || 0) + 1;
        saveSave(this.save);

        // iter-15: spin up a fresh replay recorder for the new run, unless
        // we're playing back an existing replay. We use a deterministic seed
        // when one is available (speedrun / daily) so playback can recreate
        // identical spawns. Outside those modes, the recorder records the
        // wall-clock seed so replay still mostly reproduces the run, but
        // RNG-driven systems (Math.random) will diverge — documented in
        // docs/USER_GUIDE.md and the CHANGELOG.
        if (!this.replayActive) {
            const seed = this.speedrunRng?.state || Date.now() & 0xffffffff || 1;
            this.replayRecorder = new ReplayRecorder({
                seed,
                stage: this.stageId,
                difficulty: this.save.settings.difficulty || 'normal',
                dt: 1 / 60
            });
        } else {
            this.replayRecorder = null;
        }

        this.audio.unlock();
        // The transition into the run should be audible: a short rising
        // flourish, then the chase theme.
        this.audio.chaseStart();
        this.audio.startMusic('street');

        this.lastTime = performance.now();
        this._scheduleFrame();
    }

    /**
     * Speedrun mode: deterministic seed, fixed boss timeline (the `spawnAt`
     * fields in data.js are already fixed), real-time millisecond clock,
     * separate leaderboard. We toggle `speedrunMode` before delegating to
     * `start()` so the spawn path can branch on the seeded RNG.
     */
    startSpeedrun() {
        this.speedrunMode = true;
        this.dailyMode = false;
        this.speedrunRng = new SeededRng(CONFIG.SPEEDRUN_SEED);
        this.speedrunStart = performance.now();
        this.start();
        this._announce('Speedrun started — deterministic seed.');
    }

    /**
     * Daily challenge: deterministic seed pinned to the UTC date, stage is
     * also pinned (rotates daily), and boss timings are nudged by a per-day
     * offset. Final entry lands in `daily-{date}-{stage}` rather than the
     * regular leaderboard so the global ranks aren't polluted.
     */
    startDaily() {
        this.dailyMode = true;
        this.speedrunMode = false;
        this.dailyChallenge = dailyChallenge();
        // Re-use SeededRng for spawn determinism — same plumbing as speedrun.
        this.speedrunRng = new SeededRng(this.dailyChallenge.seed);
        this.speedrunStart = performance.now();
        this.start();
        this._announce(`Daily Challenge ${this.dailyChallenge.date} — ${this.stageId}.`);
    }

    /** Apply the daily challenge's bossOffset to a `getBossesFor` result. */
    _applyDailyBossOffset(bosses) {
        if (!this.dailyMode || !this.dailyChallenge?.bossOffset) return bosses;
        const off = this.dailyChallenge.bossOffset;
        return bosses.map((b) => ({ ...b, spawnAt: Math.max(30, b.spawnAt + off) }));
    }

    /** Show the stage picker overlay; persists the choice via `save.settings.stage`. */
    openStagePicker() {
        this.ui.showStagePicker(this.stageId, (newStageId) => {
            this.stageId = newStageId;
            this.save.settings.stage = newStageId;
            saveSave(this.save);
            // Refresh the chip on the main menu Stage button.
            this.ui.updateStageChip(newStageId);
        });
    }

    openStreak() {
        this.ui.showStreak();
    }

    openHowToPlay() {
        this.ui.showHowToPlay(() => {
            this.save.flags = this.save.flags || {};
            this.save.flags.howToSeen = true;
            saveSave(this.save);
        });
    }

    /**
     * iter-15: surface a small "Try Tutorial" prompt above the start menu
     * on first launch. Yes/skip button writes `tutorialDone=true` either way
     * so the prompt never re-appears.
     */
    _offerTutorial() {
        if (typeof document === 'undefined') return;
        if (this.save?.flags?.tutorialDone) return;
        // Ensure the host overlay exists (created lazily so the DOM stays
        // unchanged for users who never trigger it).
        let overlay = document.getElementById('tutorialOffer');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'tutorialOffer';
            overlay.className = 'tutorial-offer';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-live', 'polite');
            overlay.style.display = 'none';
            const container = document.getElementById('gameContainer');
            container?.appendChild(overlay);
        }
        const dismiss = () => {
            overlay.style.display = 'none';
            this.save.flags = this.save.flags || {};
            this.save.flags.tutorialDone = true;
            saveSave(this.save);
        };
        const accept = () => {
            overlay.style.display = 'none';
            this.startTutorialRun();
        };
        overlay.innerHTML = `
            <div class="overlay-card tutorial-offer-card">
                <h2>${_t('tutorialOffer')}</h2>
                <div class="btn-row">
                    <button id="tutorialOfferYes" class="btn primary">${_t('tryTutorial')}</button>
                    <button id="tutorialOfferNo" class="btn ghost">${_t('skipTutorial')}</button>
                </div>
            </div>`;
        overlay.style.display = 'flex';
        overlay.querySelector('#tutorialOfferYes')?.addEventListener('click', accept);
        overlay.querySelector('#tutorialOfferNo')?.addEventListener('click', dismiss);
    }

    /**
     * Begin the tutorial: hand the menu off to a normal `start()` then flip
     * the tutorial state on. Esc skips at any point. Once the last step is
     * acknowledged we persist `tutorialDone=true`.
     */
    startTutorialRun() {
        this.tutorial = new TutorialState();
        this.tutorial.start();
        this.audio.unlock();
        this.speedrunMode = false;
        this.dailyMode = false;
        this.start();
        this._renderTutorialBanner();
        // Esc handler that explicitly skips the tutorial. Only fires while
        // the tutorial is active and a step is on screen — once the run is
        // over (success or skip) we detach the listener.
        if (typeof window !== 'undefined') {
            const onKey = (e) => {
                if (!this.tutorial.active) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.tutorial.skip();
                    this._renderTutorialBanner();
                    this.save.flags = this.save.flags || {};
                    this.save.flags.tutorialDone = true;
                    saveSave(this.save);
                    window.removeEventListener('keydown', onKey, true);
                }
            };
            window.addEventListener('keydown', onKey, true);
            this._tutorialKeyHandler = onKey;
        }
    }

    /** Lazily mount + repaint the tutorial banner overlay. */
    _renderTutorialBanner() {
        if (typeof document === 'undefined') return;
        let banner = this._tutorialBanner;
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'tutorialBanner';
            banner.className = 'tutorial-banner';
            banner.setAttribute('aria-live', 'polite');
            const container = document.getElementById('gameContainer');
            container?.appendChild(banner);
            this._tutorialBanner = banner;
        }
        const prompt = this.tutorial.currentPrompt();
        if (!prompt) {
            banner.style.display = 'none';
            // If the tutorial just completed cleanly, persist the flag.
            if (this.tutorial.completed) {
                this.save.flags = this.save.flags || {};
                this.save.flags.tutorialDone = true;
                saveSave(this.save);
                this._announce(_t('tutorialDone'));
            }
            return;
        }
        banner.innerHTML = `
            <strong>${prompt.title}</strong>
            <span class="tutorial-body">${prompt.body}</span>
            <span class="tutorial-skip-hint">${_t('tutorialSkipHint')}</span>`;
        banner.style.display = 'block';
    }

    /**
     * iter-15: open the replay menu. Loads the most recent saved replay
     * (single-slot) and lets the player pick a 1× / 2× / 4× playback speed.
     * If no replay is saved, surface a friendly note.
     */
    openReplay() {
        const blob = loadReplay();
        this.ui.showReplayMenu(blob, (speed) => {
            if (!blob) return;
            this._beginReplay(blob, speed);
        });
    }

    /**
     * Engage replay playback: build a ReplayPlayer, start the run with the
     * persisted seed/stage/difficulty, and route input through the player.
     */
    _beginReplay(blob, speed) {
        this.replayPlayer = new ReplayPlayer(blob, { speed });
        this.replayActive = true;
        // Pin the same stage + difficulty so spawn determinism holds.
        if (blob.stage) this.save.settings.stage = blob.stage;
        if (blob.difficulty) this.save.settings.difficulty = blob.difficulty;
        // Reuse the speedrun seeding plumbing for spawn determinism. We
        // explicitly toggle off speedrunMode (no leaderboard write) but keep
        // the seeded RNG branch alive by setting `_replaySeededRng`.
        this.speedrunMode = false;
        this.dailyMode = false;
        this.speedrunRng = new SeededRng(blob.seed);
        // Use start() to do the rest of the setup (player, weapons, UI).
        this.start();
        // After start() resets state, force-feed the replay seed back in
        // because start() does not touch speedrunRng outside its modes.
        this.speedrunRng = new SeededRng(blob.seed);
        // Banner the user so they know inputs are disabled.
        this._announce(_t('replayPlaying'));
    }

    /**
     * End an active replay session — called when the player runs out of
     * frames or hits Esc / Quit. Returns the engine to the menu cleanly.
     */
    _endReplay() {
        this.replayActive = false;
        this.replayPlayer = null;
        this.state = GameState.MENU;
        cancelAnimationFrame(this.raf);
        this.audio.stopMusic();
        this.ui.hideGameOver();
        this.ui.showStart();
        this._paintStartScene();
    }

    togglePause() {
        if (this.state === GameState.PLAYING) {
            this.state = GameState.PAUSED;
            this.ui.showPause();
            this.audio.stopMusic();
            // iter-16 bug-bash: stamp the pause moment so we can subtract the
            // paused duration from the speedrun wall-clock when we resume.
            // Without this, leaderboard timeMs (and split realMs) silently
            // counted seconds spent in the pause menu — penalising players
            // who paused to read a level-up dialog or take a breath.
            this._pauseStartedAt = performance.now();
            // iter-15: tutorial step 5 waits for a pause toggle.
            if (this.tutorial?.active) {
                this.tutorial.notifyPause();
                this._renderTutorialBanner();
            }
        } else if (this.state === GameState.PAUSED) {
            this.state = GameState.PLAYING;
            this.ui.hidePause();
            // Resume the theme that fits the moment -- unpausing mid-boss
            // should not drop back to the street music -- and no flourish,
            // which would fire every time a kid pauses to read something.
            this.audio.startMusic(this.enemies.some((e) => e.boss) ? 'boss' : 'street');
            this.lastTime = performance.now();
            // iter-16 bug-bash: shift the speedrun + run-start anchors forward
            // by however long we were paused so wall-clock readings exclude
            // pause time. Both anchors are floats, so a simple addition keeps
            // the existing `performance.now() - anchor` math correct.
            if (this._pauseStartedAt) {
                const paused = performance.now() - this._pauseStartedAt;
                if (paused > 0 && Number.isFinite(paused)) {
                    if (this.speedrunStart) this.speedrunStart += paused;
                    if (this._runStartWallClock) this._runStartWallClock += paused;
                }
                this._pauseStartedAt = 0;
            }
            this._scheduleFrame();
        }
    }

    /**
     * v2.8: let the player post the finished run to the shared online board.
     * Everything degrades quietly — a missing form, a blocked word or no
     * network must never stop the game-over screen working.
     */
    _wireGlobalScore() {
        const row = document.getElementById('globalScoreRow');
        const input = document.getElementById('initialsInput');
        const btn = document.getElementById('btnSubmitScore');
        const status = document.getElementById('globalScoreStatus');
        if (!row || !input || !btn || !status) return;
        // Daily runs already have their own slot; keep them off the global board.
        row.style.display = this.dailyMode ? 'none' : '';
        if (this.dailyMode) return;

        status.textContent = '';
        btn.disabled = false;
        try {
            input.value = localStorage.getItem('vs_last_initials') || '';
        } catch {
            input.value = '';
        }
        input.oninput = () => {
            input.value = normaliseInitials(input.value);
        };
        btn.onclick = async () => {
            const check = checkInitials(input.value);
            if (!check.ok) {
                status.textContent =
                    check.reason === 'blocked'
                        ? 'Those letters are not allowed — pick others.'
                        : 'Use 3 letters, A to Z.';
                return;
            }
            btn.disabled = true;
            status.textContent = 'Sending...';
            const out = await submitScore({
                initials: input.value,
                kills: this.kills,
                timeSurvived: this.gameTime,
                level: this.player?.level || 1,
                stage: this.stageId
            });
            if (out.ok) {
                try {
                    localStorage.setItem('vs_last_initials', normaliseInitials(input.value));
                } catch {
                    /* private mode — not worth failing over */
                }
                status.textContent = 'You are on the world board!';
            } else if (out.error === 'blocked') {
                status.textContent = 'Those letters are not allowed — pick others.';
                btn.disabled = false;
            } else {
                status.textContent = 'Could not send it — check the internet.';
                btn.disabled = false;
            }
        };
    }

    /**
     * Fetch and render the shared board inside the leaderboard dialog. Rows
     * come from the internet, so every field is re-sanitised before it is put
     * into HTML.
     */
    async _renderGlobalBoard() {
        const card = document.querySelector('#leaderboardScreen .leaderboard-card');
        if (!card) return;
        let sec = card.querySelector('.lb-global');
        if (!sec) {
            sec = document.createElement('section');
            sec.className = 'lb-section lb-global';
            const title = card.querySelector('h2');
            if (title && title.nextSibling) card.insertBefore(sec, title.nextSibling);
            else card.appendChild(sec);
        }
        const head = '<h3>World board</h3>';
        sec.innerHTML = head + '<div class="hs-empty">Loading...</div>';
        const { ok, rows } = await fetchTopScores(20);
        if (!ok) {
            sec.innerHTML = head + '<div class="hs-empty">Offline — try again later.</div>';
            return;
        }
        if (!rows.length) {
            sec.innerHTML = head + '<div class="hs-empty">No scores yet. Be the first!</div>';
            return;
        }
        sec.innerHTML =
            head +
            '<div class="hs-list scroll">' +
            '<div class="hs-head"><span>#</span><span>Who</span><span>Time</span><span>Lv</span><span>Kills</span></div>' +
            rows
                .map((r, i) => {
                    const secs = Math.max(0, Math.floor(Number(r.time_survived) || 0));
                    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
                    const ss = String(secs % 60).padStart(2, '0');
                    const who = String(r.initials || '')
                        .toUpperCase()
                        .replace(/[^A-Z]/g, '')
                        .slice(0, 3);
                    const lvl = Math.max(1, Math.floor(Number(r.level) || 1));
                    const kills = Math.max(0, Math.floor(Number(r.kills) || 0));
                    return `<div class="hs-row"><span>${i + 1}</span><span>${who}</span><span>${mm}:${ss}</span><span>${lvl}</span><span>${kills}</span></div>`;
                })
                .join('') +
            '</div>';
    }

    gameOver() {
        this.state = GameState.GAMEOVER;
        cancelAnimationFrame(this.raf);
        this.audio.stopMusic();
        this.audio.death();
        this.audio.gameOverSting();
        // iter-19: long death-knell pattern. Fired once at the moment of
        // game over, before any leaderboard / replay finalisation work.
        this.haptics?.gameOver();
        // iter-15: snapshot + persist the recorded replay (single slot).
        // We do this before any of the leaderboard / achievement logic so a
        // crash inside those paths never loses the replay. Skipped during
        // playback (no recorder).
        if (this.replayRecorder) {
            try {
                this.replayRecorder.finalize({
                    kills: this.kills,
                    time: this.gameTime,
                    level: this.player?.level || 1
                });
                saveReplay(this.replayRecorder.serialize());
            } catch (err) {
                console.warn('[main] failed to persist replay', err);
            }
            this.replayRecorder = null;
        }

        // Update lifetime "unique builds" counter: a build = the sorted set
        // of weapon ids at death. If we haven't seen this combination before,
        // append it. Hard-cap the array at SEEN_BUILDS_CAP (1000) to keep the
        // save under a reasonable byte budget — older keys roll out FIFO.
        this.save.totals ??= { kills: 0, timePlayed: 0, runs: 0, bossKills: 0 };
        this.save.totals.seenBuilds ??= [];
        const buildKey = this.player.weapons
            .map((w) => w.id)
            .sort()
            .join('+');
        if (buildKey && !this.save.totals.seenBuilds.includes(buildKey)) {
            this.save.totals.seenBuilds.push(buildKey);
            const cap = CONFIG.SEEN_BUILDS_CAP || 1000;
            if (this.save.totals.seenBuilds.length > cap) {
                this.save.totals.seenBuilds.splice(0, this.save.totals.seenBuilds.length - cap);
            }
            this.save.totals.uniqueBuilds = this.save.totals.seenBuilds.length;
        }

        // Final achievement check.
        this.achievements.check(this);
        this._flushAchievementToasts();

        // Record run -------------------------------------------------------
        const weaponIds = this.player.weapons.map((w) => w.id);
        const entry = {
            kills: this.kills,
            timeSurvived: this.gameTime,
            level: this.player.level,
            date: Date.now(),
            weapons: weaponIds,
            // v2.6: stage tag so per-stage leaderboards split correctly.
            stage: this.stageId,
            // Authoritative: was the player hit even once across the whole
            // run? Falls back to the unhit-timer proxy for backwards compat
            // if a custom path bypassed Player.takeDamage.
            noHit: !this.run.tookAnyDamage
        };
        // Daily-mode runs go to the per-day slot rather than the global
        // leaderboard so they don't pollute the speedrun/normal pools.
        if (this.dailyMode && this.dailyChallenge) {
            saveDailyResult({
                ...entry,
                date: this.dailyChallenge.date,
                seed: this.dailyChallenge.seed,
                won: !!this.run.bossesDefeated?.void_lord
            });
        } else {
            recordHighScore(this.save, entry);
        }
        accumulateTotals(this.save, {
            kills: this.kills,
            gameTime: this.gameTime,
            bossKills: Object.keys(this.run.bossesDefeated).length
        });
        saveSave(this.save);

        // Speedrun: write to its own leaderboard, and store the split timeline
        // on the game so the UI can render it in the game-over screen.
        if (this.speedrunMode) {
            const sEntry = {
                timeMs: performance.now() - this.speedrunStart,
                splits: this.speedrunSplits,
                level: this.player.level,
                kills: this.kills,
                date: Date.now(),
                weapons: weaponIds,
                noHit: entry.noHit
            };
            const rank = recordSpeedrunScore(sEntry);
            this._speedrunRank = rank;
            this._speedrunEntry = sEntry;
        }

        this.ui.showGameOver(this);
        this._wireGlobalScore();
    }

    openLeaderboard() {
        // Rendered after showLeaderboard() has written its markup.
        setTimeout(() => this._renderGlobalBoard(), 0);
        this.ui.showLeaderboard(this.save.highScores || [], loadSpeedrunScores(), () => {
            /* closed */
        });
    }

    // --- Frame loop -------------------------------------------------------
    _scheduleFrame() {
        this.raf = requestAnimationFrame((t) => this._frame(t));
    }

    _onVisibilityChange() {
        if (typeof document === 'undefined') return;
        if (document.hidden) {
            if (this.state === GameState.PLAYING) {
                this._hiddenPaused = true;
                this.state = GameState.PAUSED;
                this.ui.showPause();
                this.audio.stopMusic();
                // iter-16 bug-bash: track tab-hidden start so when the player
                // hits Resume the speedrun anchor shifts past the hidden
                // window. Mirrors togglePause()'s logic.
                this._pauseStartedAt = performance.now();
            }
        } else if (this._hiddenPaused && this.state === GameState.PAUSED) {
            // Don't auto-resume: leave the pause menu up so the player
            // explicitly opts back in. Just reset the clock to avoid a
            // massive dt when they do click Resume.
            this._hiddenPaused = false;
            this.lastTime = performance.now();
        }
    }

    _frame(now) {
        // The cutscene drives itself from this loop, so it has to be allowed
        // through. Returning early here also skipped _scheduleFrame(), which
        // killed the loop after a single frame and left the scene black.
        if (
            this.state !== GameState.PLAYING &&
            this.state !== GameState.LEVEL_UP &&
            this.state !== GameState.CUTSCENE
        )
            return;
        // Clamp dt so that (a) a paused+resumed tab does not nuke the sim in
        // one step, and (b) frame-rate spikes don't create tunneling bugs.
        // `now` is the rAF timestamp, but lastTime is captured from
        // performance.now() on start/resume/unpause. The rAF timestamp can be
        // slightly OLDER than that, which made dt negative and ran timers and
        // effect radii backwards (arc() then threw on a negative radius and
        // killed the frame). Clamp the bottom as well as the top.
        const dt = Math.max(0, Math.min((now - this.lastTime) / 1000, CONFIG.DT_CLAMP));
        this.lastTime = now;
        // iter-14: pull the gamepad once per frame so axes + button edges
        // are fresh by the time update() reads `getMoveVector`. Safe no-op
        // when no pad is attached.
        this.input.pollGamepad?.();
        if (this.state === GameState.CUTSCENE) {
            this._updateIntro(dt);
        } else if (this.state === GameState.PLAYING) {
            this.update(dt);
        }
        // iter-20: pass the canvas viewport so EffectLayer can recycle
        // off-screen emoji rain drops without reaching back into the DOM.
        this.effects.update(dt, {
            w: this.canvas?.width || CONFIG.CANVAS_WIDTH,
            h: this.canvas?.height || CONFIG.CANVAS_HEIGHT
        });
        this.render(dt);
        this.fpsMeter.tick(dt);
        this.ui.setFps(this.fpsMeter.fps, this.save.settings.showFps);
        this._scheduleFrame();
    }

    update(dt) {
        this.gameTime += dt;

        // v2.8 audio: how hectic the street feels right now drives how many
        // music layers play. Tempo never changes -- that would fight the
        // sequencer -- so danger adds percussion, harmony and sparkle.
        this._intensityAt = (this._intensityAt || 0) + dt;
        if (this._intensityAt > 0.75) {
            this._intensityAt = 0;
            const crowd = Math.min(1, this.enemies.length / 26);
            const elapsed = Math.min(1, this.gameTime / 300);
            const boss = this.enemies.some((e) => e.boss) ? 0.25 : 0;
            this.audio.setIntensity?.(Math.min(1, crowd * 0.55 + elapsed * 0.45 + boss));
        }

        const { hpMult, dmgMult, diff } = this._computeDifficultyMults();
        this.enemyDmgMult = dmgMult; // used by enemy projectile spawn

        this.currentWave = this._selectWave();

        // iter-15: replay playback drives input by replacing
        // `input.getMoveVector` with the recorded vector for the current
        // frame. We tick the player AFTER this swap; the swap is undone via
        // `input.getMoveVector = original` only when the replay finishes.
        if (this.replayActive && this.replayPlayer) {
            const v = this.replayPlayer.getMoveVector();
            this.input.getMoveVector = () => v;
            this.replayPlayer.tick();
            if (this.replayPlayer.done) {
                // Out of frames: end the replay before computing player update
                // so the run terminates cleanly on the next loop iteration.
                this._endReplay();
                return;
            }
        }

        // iter-15: snapshot the current input so the recorder + tutorial
        // both see the same vector this frame. Reading `getMoveVector`
        // twice would otherwise be cheap but inconsistent under replay.
        const moveSnapshot = this.input.getMoveVector();
        this._lastMoveVec = { x: moveSnapshot.x, y: moveSnapshot.y };
        if (this.replayRecorder && !this.replayActive) {
            this.replayRecorder.record(this._lastMoveVec);
        }
        // Tutorial state-machine tick. Cheap no-op unless active.
        if (this.tutorial?.active) {
            this.tutorial.tick(dt, this._lastMoveVec);
            this._renderTutorialBanner();
        }

        this.player.update(dt, this);
        if (this.player.dead) {
            this.gameOver();
            return;
        }
        // iter-14: stage modifiers — cold tick (no-op on forest/crypt).
        this._applyColdTick(dt);

        // iter-20: pacifist-provoked timer. Counts up while the player has
        // zero kills; a single kill breaks the streak and forfeits the
        // window for the rest of the run (we cap at 60 + 1 to avoid
        // unbounded float growth and to make the achievement check trivial).
        if (this.run) {
            if (this.kills === 0) {
                if ((this.run.pacifistTimer || 0) < 61) {
                    this.run.pacifistTimer = (this.run.pacifistTimer || 0) + dt;
                }
            }
        }

        // Spatial hash rebuild BEFORE anyone queries it.
        this.spatial.insertAll(this.enemies);

        this._updateEnemies(dt, hpMult, dmgMult);
        this._updateProjectiles(dt);
        this._updateEnemyProjectiles(dt);
        this._updateMines(dt);
        this._updateExpOrbs(dt);
        this._updateDoorbells(dt);
        this._maybeTriggerLevelUp();
        this._updateParticlesAndText(dt);
        if (this.callouts?.length) {
            for (let i = this.callouts.length - 1; i >= 0; i--) {
                const c = this.callouts[i];
                c.update(dt);
                if (c.shouldRemove) this.callouts.splice(i, 1);
            }
        }

        this._spawnLogic(dt, hpMult, dmgMult, diff.spawnMult);

        // Speedrun splits: push once per threshold as gameTime crosses them.
        if (this.speedrunMode) {
            const thresholds = CONFIG.SPEEDRUN_SPLITS;
            while (
                this._nextSplitIdx < thresholds.length &&
                this.gameTime >= thresholds[this._nextSplitIdx]
            ) {
                const mark = thresholds[this._nextSplitIdx];
                this.speedrunSplits.push({
                    mark,
                    realMs: performance.now() - this.speedrunStart
                });
                this._nextSplitIdx++;
            }
        }

        // Achievement ticks (cheap: most checks short-circuit).
        this.achievements.check(this);
        this._flushAchievementToasts();

        // HUD
        this.ui.updateHud(this);

        // Camera
        this.camera.update(dt, this.save.settings.screenShake);
        this._updateCamera();
    }

    /**
     * Position the camera so the player sits in the centre of the viewport,
     * clamped so the camera never shows arena out-of-bounds. Called every
     * frame from `update()` and once from `start()` to avoid a first-frame
     * snap. Stored on `this.camera.worldX/worldY` (top-left of the viewport
     * in arena coords). Render translates by `-worldX + shake.x` etc.
     */
    _updateCamera() {
        if (!this.player) return;
        const vw = CONFIG.CANVAS_WIDTH;
        const vh = CONFIG.CANVAS_HEIGHT;
        const aw = CONFIG.ARENA_WIDTH ?? vw;
        const ah = CONFIG.ARENA_HEIGHT ?? vh;
        let wx = this.player.x - vw / 2;
        let wy = this.player.y - vh / 2;
        if (wx < 0) wx = 0;
        if (wy < 0) wy = 0;
        if (wx > aw - vw) wx = aw - vw;
        if (wy > ah - vh) wy = ah - vh;
        this.camera.worldX = wx;
        this.camera.worldY = wy;
    }

    // --- update() helpers (kept close to the orchestrator for locality) ---
    _computeDifficultyMults() {
        const diff =
            Difficulty[(this.save.settings.difficulty || 'normal').toUpperCase()] ||
            Difficulty.NORMAL;
        const timeDiff = 1 + Math.floor(this.gameTime / 60) * 0.3;
        // Stage modifier folds into hpMult at the source so every spawn path
        // (waves, splitter children, bosses) inherits the +20% on tundra
        // without each call site reaching back into stages.js.
        const stageHpMult = this.stageMods?.enemyHpMult ?? 1;
        return {
            diff,
            hpMult: diff.hpMult * timeDiff * stageHpMult,
            dmgMult: diff.dmgMult * timeDiff
        };
    }

    /**
     * iter-14: tundra cold tick. Drains 1 HP every `coldTickInterval` seconds
     * (default 10) on stages that opt in. Skipped on stages with
     * `coldTickInterval == 0` (forest, crypt). Bypasses i-frames and armor on
     * purpose — it's an attrition mechanic, not damage — and never kills the
     * player outright (clamps at 1 HP) so death is always attributable to a
     * real hit.
     */
    _applyColdTick(dt) {
        const mods = this.stageMods;
        if (!mods || !mods.coldTickInterval) return;
        if (!this.player || this.player.dead) return;
        this._coldTickAccum += dt;
        while (this._coldTickAccum >= mods.coldTickInterval) {
            this._coldTickAccum -= mods.coldTickInterval;
            const dmg = mods.coldTickDamage || 1;
            // Drain HP without going through takeDamage so we don't refresh
            // i-frames or trigger the no-hit invalidation (cold is ambient).
            const next = Math.max(1, this.player.hp - dmg);
            if (next < this.player.hp) {
                this.player.hp = next;
                this.createFloatingText(`-${dmg}❄`, this.player.x, this.player.y - 36, '#88ccff');
            }
        }
    }

    _updateEnemies(dt, hpMult, dmgMult) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(dt, this);

            // v2.8: name a neighbour the first time the player can actually
            // SEE them. Spawns happen ~900px off-camera, so introducing at
            // spawn named people who were not on screen yet.
            if (this._metNeighbours && !this._metNeighbours.has(e.id) && this._isOnScreen(e)) {
                this._introduceNeighbour(e.type, e.x, e.y);
            }

            const dx = e.x - this.player.x;
            const dy = e.y - this.player.y;
            const d = Math.hypot(dx, dy);
            if (d < e.size + this.player.size && !this.player.invincible) {
                if (e.type?.stealsCandy) this._stealCandy(e);
                this.player.takeDamage(e.damage, this);
                this.createFloatingText(
                    Math.round(e.damage),
                    this.player.x,
                    this.player.y - 30,
                    '#ff3333'
                );
            }

            if (e.hp <= 0) {
                this._onEnemyKilled(e, hpMult, dmgMult);
                this.enemies.splice(i, 1);
                continue;
            }

            if (d > CONFIG.DESPAWN_RADIUS && !e.boss) {
                this.enemies.splice(i, 1);
            }
        }
    }

    _onEnemyKilled(e, hpMult, dmgMult) {
        this.kills++;
        this.createConfetti(e.x, e.y, e.boss ? 40 : 12);
        // Bigger neighbours pop lower; the registry pitches each successive
        // defeat a little higher so clearing a mob builds.
        if (e.boss) this.audio.play?.('bossDeath');
        else this.audio.play?.('enemyDeath', { freq: Math.max(160, 520 - e.size * 11) });
        this.effects.hit(e.x, e.y, this._rgbFromHex(e.color));
        this.dropExp(e.x, e.y, e.expValue);
        if (e.boss) {
            this.shake(0.5);
            this.audio.explosion();
            this.achievements.onBossDefeated(e.id);
            // Back to the chase once the last boss on screen is down.
            if (!this.enemies.some((x) => x.boss && x !== e)) this.audio.startMusic('street');
            this._announce(`${e.id.replace('_', ' ')} defeated`);
            // Mark no-hit-boss if the player's unhit streak is longer than
            // the fight itself. We use the unhit timer (seconds without
            // damage) as a cheap proxy; any damage during the fight resets it.
            if (this.player.unhitTimer >= 8) this.run.noHitBoss = true;
            // Speedrun: record wall-clock seconds until each boss.
            if (e.id === 'void_lord') {
                this.run.realSecondsToVoidLord =
                    (performance.now() - this._runStartWallClock) / 1000;
            }
            // iter-20: hidden Speedrunner Plus achievement. Any boss kill in
            // under 5 minutes wall-clock counts. The pause anchor inside
            // `togglePause` keeps `_runStartWallClock` honest, so a player
            // can't pad the timer by sitting in the pause menu.
            if (this._runStartWallClock) {
                const realSec = (performance.now() - this._runStartWallClock) / 1000;
                if (realSec < 300) this.run.fastBossClear = true;
            }
        }
        if (e.splitter && e.type.splitInto) {
            const childDef = findEnemyDef(e.type.splitInto);
            if (childDef) {
                const n = e.type.splitCount || 2;
                for (let k = 0; k < n; k++) {
                    const a = (k / n) * Math.PI * 2;
                    this.enemies.push(
                        new Enemy(
                            e.x + Math.cos(a) * 14,
                            e.y + Math.sin(a) * 14,
                            childDef,
                            hpMult,
                            dmgMult
                        )
                    );
                }
            }
        }
        this.audio.hit();
    }

    _updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this);
            if (p.shouldRemove) {
                this.projectiles.splice(i, 1);
                continue;
            }

            const range = p.size + 32;
            for (const enemy of this.spatial.queryRect(p.x, p.y, range)) {
                if (p.hitEnemies.has(enemy)) continue;
                const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
                if (d < enemy.size + p.size) {
                    let dmg = p.damage;
                    const chance = this.player.getCritChance();
                    const crit = chance > 0 && Math.random() < chance;
                    if (crit) dmg *= 2;
                    enemy.takeDamage(dmg);
                    p.hitEnemies.add(enemy);
                    if (enemy.hp > 0) {
                        this.createFloatingText(
                            Math.round(dmg),
                            enemy.x,
                            enemy.y - 20,
                            crit ? '#ffee44' : '#fff',
                            { crit }
                        );
                    }
                    // iter-15 polish: brief red flash on critical hits, opt-out
                    // via Settings → criticalFlash. Suppressed when reduced
                    // motion is on so it never overrides accessibility.
                    if (
                        crit &&
                        this.save.settings.criticalFlash !== false &&
                        !this.save.settings.reducedMotion
                    ) {
                        this.effects.criticalHit();
                    }
                    this.effects.hit(enemy.x, enemy.y);
                    if (!p.piercing) {
                        p._onEnd(this);
                        p.shouldRemove = true;
                        break;
                    }
                }
            }
        }
    }

    _updateEnemyProjectiles(dt) {
        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const ep = this.enemyProjectiles[i];
            ep.update(dt, this);
            if (ep.shouldRemove) this.enemyProjectiles.splice(i, 1);
        }
    }

    _updateMines(dt) {
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const m = this.mines[i];
            m.update(dt, this);
            if (m.shouldRemove) this.mines.splice(i, 1);
        }
    }

    _updateExpOrbs(dt) {
        // iter-15: snapshot the orb-collected counter before the per-frame
        // update so we can fire `tutorial.notifyOrbPickup()` on the rising
        // edge. ExpOrb.update bumps `game.run.orbsCollected`; comparing the
        // two values is cheaper than wrapping ExpOrb.
        const before = this.run?.orbsCollected || 0;
        for (let i = this.expOrbs.length - 1; i >= 0; i--) {
            const o = this.expOrbs[i];
            o.update(dt, this);
            if (o.shouldRemove) this.expOrbs.splice(i, 1);
        }
        if (this.tutorial?.active) {
            const after = this.run?.orbsCollected || 0;
            for (let k = 0; k < after - before; k++) {
                this.tutorial.notifyOrbPickup();
            }
            if (after !== before) this._renderTutorialBanner();
        }
    }

    _maybeTriggerLevelUp() {
        if (this._pendingLevelUps > 0 && this.state === GameState.PLAYING) {
            this._pendingLevelUps--;
            this.state = GameState.LEVEL_UP;
            this.audio.levelUp();
            this.effects.levelUp(this.player.x, this.player.y);
            // iter-19: ascending-ramp vibration. Distinct shape from the
            // hurt single-pulse and the boss triple so the player can
            // tell what just happened from the haptic alone.
            this.haptics?.levelUp();
            this._announce(`Level ${this.player.level}! Choose an upgrade.`);
            // iter-15: notify the tutorial state machine — its "level up"
            // step waits for exactly this event.
            if (this.tutorial?.active) {
                this.tutorial.notifyLevelUp();
                this._renderTutorialBanner();
            }
            this.ui.showLevelUp(this.player, (choice) => this._applyUpgrade(choice));
        }
    }

    _updateParticlesAndText(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const part = this.particles[i];
            part.update(dt);
            if (part.life <= 0) {
                this.pools.particle.release(part);
                this.particles.splice(i, 1);
            }
        }
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.update(dt);
            if (ft.life <= 0) {
                this.pools.floatingText.release(ft);
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    /** Broadcast a short message to screen readers via the a11y live region. */
    _announce(msg) {
        if (typeof document === 'undefined') return;
        const el = document.getElementById('a11yLiveRegion');
        if (!el) return;
        // Toggle textContent to force SR re-announce if the message repeats.
        el.textContent = '';
        // Microtask flush before writing so ATs pick up the change.
        Promise.resolve().then(() => {
            el.textContent = msg;
        });
    }

    _applyUpgrade(choice) {
        if (choice) {
            if (choice.type === 'weapon') {
                const existing = this.player.weapons.find((w) => w.id === choice.data.id);
                if (existing) {
                    const prevLvl = existing.level;
                    existing.levelUp();
                    if (existing.level >= CONFIG.WEAPON_MAX_LEVEL) {
                        this.achievements.onWeaponMaxed();
                        // Track how many distinct weapons have been maxed this run.
                        if (prevLvl < CONFIG.WEAPON_MAX_LEVEL) {
                            this.run.maxedWeaponCount = (this.run.maxedWeaponCount || 0) + 1;
                        }
                    }
                    // Early-Evolve achievement: fire when the weapon actually
                    // crosses into its evolution tier before 7:00.
                    if (
                        existing.def.evolveLevel &&
                        prevLvl < existing.def.evolveLevel &&
                        existing.level >= existing.def.evolveLevel &&
                        this.gameTime < CONFIG.EARLY_EVOLVE_THRESHOLD
                    ) {
                        this.run.evolvedBefore = this.run.evolvedBefore || {};
                        this.run.evolvedBefore.sevenMin = true;
                    }
                } else {
                    this.player.weapons.push(new Weapon(choice.data));
                }
            } else {
                this.player.passives[choice.data.id] ??= { def: choice.data, count: 0 };
                if (this.player.passives[choice.data.id].count < CONFIG.PASSIVE_MAX_STACK) {
                    this.player.passives[choice.data.id].count++;
                    this.player.recalculateStats();
                    this.run.passivesPicked = (this.run.passivesPicked || 0) + 1;
                }
            }
        }
        this.ui.hideLevelUp();
        this.state = GameState.PLAYING;
        this.lastTime = performance.now();
    }

    _selectWave() {
        const t = this.gameTime;
        const list = this.stageWaves && this.stageWaves.length ? this.stageWaves : WAVES;
        let match = list[list.length - 1];
        for (const w of list) {
            if (t >= w.from && t < w.to) {
                match = w;
                break;
            }
        }
        if (this._lastAnnouncedWave !== match.label) {
            this._lastAnnouncedWave = match.label;
        }
        return match;
    }

    _spawnLogic(dt, hpMult, dmgMult, diffSpawnMult) {
        const wave = this.currentWave;
        const waveMult = wave.spawnMult || 1;
        const maxEnemies = Math.min(CONFIG.MAX_ENEMIES, 20 + Math.floor(this.gameTime / 10));
        const interval = Math.max(0.2, 1.2 - this.gameTime / 200) / (diffSpawnMult * waveMult);
        this._spawnAccumulator += dt;

        while (this._spawnAccumulator >= interval && this.enemies.length < maxEnemies) {
            this._spawnAccumulator -= interval;
            this._spawnOne(wave.pool, hpMult, dmgMult);
        }

        // v2.8: the Big Bully. Deliberately not in any wave pool -- pools pick
        // near-uniformly, which would make "one huge rare bully" common. One
        // at a time, first appearing a couple of minutes in.
        this._bullyTimer = (this._bullyTimer || 0) + dt;
        if (this.gameTime > 120 && this._bullyTimer > 70 && !this.enemies.some((e) => e.id === 'bully')) {
            this._bullyTimer = 0;
            const def = findEnemyDef('bully');
            if (def) {
                const a = Math.random() * Math.PI * 2;
                const aw = CONFIG.ARENA_WIDTH ?? CONFIG.CANVAS_WIDTH;
                const ah = CONFIG.ARENA_HEIGHT ?? CONFIG.CANVAS_HEIGHT;
                const bx = Math.max(24, Math.min(aw - 24, this.player.x + Math.cos(a) * 620));
                const by = Math.max(24, Math.min(ah - 24, this.player.y + Math.sin(a) * 620));
                this.enemies.push(new Enemy(bx, by, def, hpMult, dmgMult));
            }
        }

        // Boss triggers (warning 5s before). Use the per-stage boss list so
        // stage-specific timing overrides (e.g. crypt's earlier Reaper) fire.
        const bossList =
            this.stageBosses && this.stageBosses.length ? this.stageBosses : Object.values(BOSSES);
        for (const boss of bossList) {
            const warnAt = boss.spawnAt - 5;
            if (this.gameTime >= warnAt && !this._bossWarnedAt.has(boss.id)) {
                this._bossWarnedAt.add(boss.id);
                this.audio.bossWarn();
            }
            if (this.gameTime >= boss.spawnAt && !this._bossesSpawned.has(boss.id)) {
                this._bossesSpawned.add(boss.id);
                this._spawnBoss(boss, hpMult, dmgMult);
            }
        }
    }

    /**
     * v2.8: name a neighbour the first time they turn up in a run. Bosses get
     * their own banner already, so they are announced bigger and higher.
     */
    /** True when `e` is inside the visible viewport (small inset so the
     *  nameplate appears with the character, not as they clip the edge). */
    _isOnScreen(e) {
        // A central band, not the whole viewport: introducing someone the
        // instant they clip the edge puts the callout where nobody is
        // looking (and off the side of the screen).
        const vw = CONFIG.CANVAS_WIDTH;
        const vh = CONFIG.CANVAS_HEIGHT;
        const insetX = vw * 0.2;
        const insetY = vh * 0.22;
        return (
            e.x >= this.camera.worldX + insetX &&
            e.x <= this.camera.worldX + vw - insetX &&
            e.y >= this.camera.worldY + insetY &&
            e.y <= this.camera.worldY + vh - insetY
        );
    }

    _introduceNeighbour(type, x, y) {
        if (!type?.name) return;
        this._metNeighbours ??= new Set();
        if (this._metNeighbours.has(type.id)) return;
        this._metNeighbours.add(type.id);
        this.callouts ??= [];
        const boss = !!type.boss;
        this.callouts.push(
            new Callout(type.name, x, y - (type.size || 16) - 26, {
                accent: boss ? '#FF4B4B' : '#FFC830',
                big: boss,
                life: boss ? 2.8 : 2.2
            })
        );
        const voice = this.audio.voiceFor?.(type.id);
        if (voice) this.audio.play?.(voice);
        this._announce(`${type.name} ahead`);
    }

    /**
     * The Big Bully knocks candy out of your pillowcase. It is not deleted --
     * it scatters back onto the street, so it stings but you can chase it
     * down, which keeps him annoying rather than punishing.
     */
    _stealCandy(bully) {
        const pieces = bully.type.stealsCandy || 2;
        const each = 12;
        const taken = Math.min(this.player.exp, pieces * each);
        this.player.exp = Math.max(0, this.player.exp - taken);
        for (let i = 0; i < pieces; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 90 + Math.random() * 70;
            this.dropExp(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, each);
        }
        this.createFloatingText('CANDY!', this.player.x, this.player.y - 52, '#FF4B4B', {
            size: 18,
            crit: true,
            life: 1.2
        });
        this.audio.play?.('bully');
        this.haptics?.hurt?.();
    }

    /**
     * v2.8: doorbells. One per porch, one ring each -- ring it and you get a
     * random upgrade, never shown in advance. Positions mirror the house
     * layout in _drawStreet so a bell always sits on a real doorstep.
     */
    _buildDoorbells() {
        const W = CONFIG.ARENA_WIDTH ?? CONFIG.CANVAS_WIDTH;
        const H = CONFIG.ARENA_HEIGHT ?? CONFIG.CANVAS_HEIGHT;
        const roadTop = H * 0.28;
        const roadH = H * 0.44;
        const roadBottom = roadTop + roadH;
        const walk = 26;
        const spacing = 330;
        const hw = 230;
        const hh = 150;
        const bells = [];
        for (let i = 0; i * spacing + 44 <= W - 140; i++) {
            const hx = i * spacing + 44;
            for (const side of [0, 1]) {
                const top = side === 0 ? roadTop - walk - 54 - hh : roadBottom + walk + 54;
                const front = side === 0 ? top + hh : top;
                const doorY = side === 0 ? front - 31 : front + 45;
                bells.push({ x: hx + hw / 2 + 34, y: doorY, used: false, t: Math.random() * 6 });
            }
        }
        this.doorbells = bells;
    }

    /**
     * A lit button on every porch, pulsing so it reads as "press me". Once a
     * house has been rung it goes dark, which is how you see at a glance
     * which doors are left.
     */
    _renderDoorbells(ctx) {
        if (!this.doorbells?.length) return;
        const cx = this.camera.worldX;
        const cy = this.camera.worldY;
        const vw = CONFIG.CANVAS_WIDTH;
        const vh = CONFIG.CANVAS_HEIGHT;
        for (const b of this.doorbells) {
            if (b.x < cx - 40 || b.x > cx + vw + 40 || b.y < cy - 40 || b.y > cy + vh + 40) continue;
            if (b.used) {
                ctx.fillStyle = 'rgba(120,130,160,0.5)';
                ctx.beginPath();
                ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            const pulse = 0.5 + Math.sin(b.t * 3) * 0.5;
            const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 26);
            glow.addColorStop(0, `rgba(255,200,48,${0.25 + pulse * 0.25})`);
            glow.addColorStop(1, 'rgba(255,200,48,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(b.x - 26, b.y - 26, 52, 52);
            ctx.fillStyle = '#1A1F3A';
            ctx.fillRect(b.x - 7, b.y - 9, 14, 18);
            ctx.fillStyle = pulse > 0.5 ? '#FFF04D' : '#FFC830';
            ctx.fillRect(b.x - 4, b.y - 5, 8, 8);
        }
    }

    /** Ring when the player reaches a porch, once per house. */
    _updateDoorbells(dt) {
        if (!this.doorbells?.length || !this.player) return;
        for (const b of this.doorbells) {
            b.t += dt;
            if (b.used) continue;
            const dx = b.x - this.player.x;
            const dy = b.y - this.player.y;
            if (dx * dx + dy * dy > 46 * 46) continue;
            b.used = true;
            this._ringDoorbell(b);
        }
    }

    /** A random upgrade from the same pool the level-up screen uses. */
    _ringDoorbell(bell) {
        this.audio.play?.('doorbell');
        const pool = buildUpgradePool(this.player).filter((u) => isUpgradeLive(this.player, u));
        const choice = pickN(pool, 1)[0];
        if (!choice) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
            this.createFloatingText('+25 HP', bell.x, bell.y - 30, '#8EE06B', { size: 16, crit: true });
            return;
        }
        this._applyUpgradeSilently(choice);
        this.callouts ??= [];
        this.callouts.push(
            new Callout(`${choice.data.icon || ''} ${choice.data.name}!`.trim(), bell.x, bell.y - 40, {
                accent: '#FFC830',
                life: 2.2
            })
        );
        this.audio.play?.('pickupRare');
        this.effects.levelUp?.(bell.x, bell.y);
        this._announce(`Doorbell: ${choice.data.name}`);
    }

    /** _applyUpgrade closes the level-up dialog; the doorbell has none. */
    _applyUpgradeSilently(choice) {
        const prevState = this.state;
        this._applyUpgrade(choice);
        this.state = prevState;
    }

    _spawnOne(pool, hpMult, dmgMult) {
        // Speedrun + Daily both want determinism; either uses speedrunRng.
        const rng =
            (this.speedrunMode || this.dailyMode) && this.speedrunRng ? this.speedrunRng : null;
        const frnd = rng ? () => rng.nextFloat() : Math.random;
        // pickWeighted honours the active stage's poolOverrides; with default
        // stage (forest) all weights are 1 so it degrades to a uniform pick.
        const pick =
            pickWeighted(pool, this.stageId, frnd) || pool[Math.floor(frnd() * pool.length)];
        const type = findEnemyDef(pick) || ENEMIES.BAT;
        const angle = frnd() * Math.PI * 2;
        const dist = CONFIG.SPAWN_RADIUS + frnd() * 120;
        const aw = CONFIG.ARENA_WIDTH ?? CONFIG.CANVAS_WIDTH;
        const ah = CONFIG.ARENA_HEIGHT ?? CONFIG.CANVAS_HEIGHT;
        // v2.8: keep neighbours on the street. Unclamped spawns put a chunk of
        // every wave outside the arena, where the player never sees them.
        const x = Math.max(24, Math.min(aw - 24, this.player.x + Math.cos(angle) * dist));
        const y = Math.max(24, Math.min(ah - 24, this.player.y + Math.sin(angle) * dist));
        this.enemies.push(new Enemy(x, y, type, hpMult, dmgMult));
    }

    _spawnBoss(bossDef, hpMult, dmgMult) {
        const angle = Math.random() * Math.PI * 2;
        const d = CONFIG.SPAWN_RADIUS * 0.8;
        const x = this.player.x + Math.cos(angle) * d;
        const y = this.player.y + Math.sin(angle) * d;
        this.enemies.push(new Enemy(x, y, bossDef, hpMult, dmgMult));
        this.ui.showBossBanner(bossDef.name);
        this.audio.bossSpawn();
        this.audio.startMusic('boss');
        this.effects.bossSpawn();
        // iter-15 polish: bump boss-spawn camera shake by +50% (0.8 → 1.2).
        // The reduced-motion gate inside `shake()` still applies so
        // accessibility users are unaffected.
        this.shake(1.2);
        // iter-19: triple-pulse vibration so the player feels the warning
        // even with audio off / sleeve-pocket play.
        this.haptics?.bossSpawn();
        this._announce(`Boss incoming: ${bossDef.name || bossDef.id}`);
    }

    _flushAchievementToasts() {
        const toasts = this.achievements.takeToasts();
        for (const ach of toasts) {
            this.ui.showAchievementToast(ach);
            this.audio.achievement();
            this.effects.achievement();
            this._announce(`Achievement unlocked: ${ach.name}. ${ach.description}`);
            // iter-20: harmless emoji-rain celebration the first time the
            // player crosses the 15-minute Survivor threshold. We trigger
            // off the achievement-just-unlocked event rather than polling
            // the save flag so a returning player who already has the
            // achievement doesn't get rained on every run.
            if (ach.id === 'survive_15min') {
                const w = this.canvas?.width || CONFIG.CANVAS_WIDTH;
                const h = this.canvas?.height || CONFIG.CANVAS_HEIGHT;
                this.effects.celebrate(w, h);
            }
        }
    }

    _rgbFromHex(hex) {
        // Accept '#rrggbb' and return 'r,g,b' for effects layer.
        if (!hex || hex[0] !== '#') return '255,255,255';
        const n = parseInt(hex.slice(1), 16);
        return `${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff}`;
    }

    // --- Helpers ----------------------------------------------------------
    dropExp(x, y, amount) {
        this.expOrbs.push(new ExpOrb(x, y, amount));
    }
    /**
     * v2.8: a burst of confetti every time a neighbour goes down -- small,
     * fast, colourful, gone in half a second. Replaces the old puff of dots
     * in the enemy's own colour.
     */
    createConfetti(x, y, n) {
        const colours = ['#FFC830', '#FF5E5E', '#9B5CFF', '#00D1FF', '#8EE06B', '#FF70E6'];
        if (this.save.settings.reducedMotion) n = Math.min(n, 3);
        for (let i = 0; i < n; i++) {
            this.particles.push(
                this.pools.particle.acquire(x, y, colours[(Math.random() * colours.length) | 0], {
                    confetti: true,
                    size: 2 + Math.random() * 2,
                    life: 0.5 + Math.random() * 0.3,
                    decay: 1.6 + Math.random(),
                    speed: 120 + Math.random() * 220,
                    friction: 0.08
                })
            );
        }
    }

    createParticles(x, y, color, n) {
        if (this.save.settings.reducedMotion) n = Math.min(n, 2);
        for (let i = 0; i < n; i++) {
            this.particles.push(this.pools.particle.acquire(x, y, color));
        }
    }
    createFloatingText(text, x, y, color, opts) {
        if (this.save.settings.reducedMotion) return;
        // damageNumbers toggle (default on). Backwards-compatible: an older
        // save without the field still gets numbers because we treat
        // `undefined` as on.
        if (this.save.settings.damageNumbers === false) return;
        this.floatingTexts.push(this.pools.floatingText.acquire(text, x, y, color, opts || {}));
    }
    shake(amount) {
        // Reduced-motion users get no camera shake even if the setting is on.
        const prm =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (this.save.settings.screenShake && !prm && !this.save.settings.reducedMotion) {
            this.camera.shake(amount);
        }
    }

    // called by Player via takeDamage
    onPlayerHurt(_amount) {
        this.audio.damage();
        this.shake(0.25);
        // iter-19: short single-pulse vibration. No-ops on platforms without
        // navigator.vibrate or when the user has switched it off.
        this.haptics?.hurt();
    }

    onBossAbility(boss) {
        if (boss.ability === 'summon') {
            const childDef = findEnemyDef('skeleton');
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = 80;
                this.enemies.push(
                    new Enemy(boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r, childDef, 2, 1.5)
                );
            }
            this.createParticles(boss.x, boss.y, '#aa33ff', 20);
        } else if (boss.ability === 'charge') {
            const dx = this.player.x - boss.x;
            const dy = this.player.y - boss.y;
            const d = Math.hypot(dx, dy) || 1;
            boss.x += (dx / d) * 120;
            boss.y += (dy / d) * 120;
            this.createParticles(boss.x, boss.y, '#ff3366', 15);
        }
    }

    // --- Rendering --------------------------------------------------------
    render(_dt) {
        const ctx = this.ctx;
        if (this.state === GameState.CUTSCENE) {
            this._renderIntro();
            return;
        }
        // 1) Background fill in screen space (no transform). This guarantees
        //    the viewport is always cleared even when the camera sits flush
        //    against an arena edge and a sliver would otherwise be unfilled.
        const bg = getBackgroundFor(this.stageId);
        ctx.fillStyle = bg.fill;
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // 2) World-space pass: translate by -camera + shake so entity coords
        //    (which live in arena space) project into the viewport.
        ctx.save();
        ctx.translate(-this.camera.worldX + this.camera.x, -this.camera.worldY + this.camera.y);

        this._drawStreet();
        this._renderDoorbells(ctx);

        for (const o of this.expOrbs) o.render(ctx);
        for (const m of this.mines) m.render(ctx);
        this._renderEnemies(ctx);
        if (this.player) {
            this.player.render(ctx);
            // Orbit shards live on the weapon, so render per-weapon extras here.
            for (const w of this.player.weapons) w.renderExtras?.(ctx);
        }
        for (const p of this.projectiles) p.render(ctx);
        for (const ep of this.enemyProjectiles) ep.render(ctx);
        for (const p of this.particles) p.render(ctx);
        for (const t of this.floatingTexts) t.render(ctx);
        if (this.callouts) for (const c of this.callouts) c.render(ctx);

        ctx.restore();

        // 3) Screen-space effects (flash, pulses, vignette) on top — these
        //    render relative to the viewport, not the world.
        this.effects.render(ctx, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    }

    /**
     * Draw enemies using the cached offscreen sprite when available. Bosses
     * and flashing enemies still go through the full per-frame path because
     * their visuals include HP bars and hit-flash highlights that the cached
     * bitmap cannot reproduce. This cuts per-enemy drawing calls from ~4
     * (gradient + two arcs + fill) to a single drawImage for the common case.
     */
    _renderEnemies(ctx) {
        for (const e of this.enemies) {
            if (e.boss || e.flashTimer > 0 || e.shielded) {
                e.render(ctx);
                continue;
            }
            const sprite = getEnemySprite(e.type, e.size);
            if (sprite) {
                ctx.drawImage(sprite, e.x - sprite.width / 2, e.y - sprite.height / 2);
                // Cheap HP bar (cached sprite can't reflect current HP).
                const pct = Math.max(0, e.hp / e.maxHp);
                if (pct < 1) {
                    const w = 30;
                    ctx.fillStyle = '#222';
                    ctx.fillRect(e.x - w / 2, e.y - e.size - 10, w, 3);
                    ctx.fillStyle = pct > 0.5 ? '#44ff44' : pct > 0.25 ? '#ffaa33' : '#ff4444';
                    ctx.fillRect(e.x - w / 2, e.y - e.size - 10, w * pct, 3);
                }
            } else {
                e.render(ctx);
            }
        }
    }

    /**
     * Draws a faint grid in arena/world space. Because we're inside the
     * world-space transform (-camera + shake) we can just iterate from
     * the first grid line >= camera.worldX to the last one <= worldX+vw,
     * which auto-clips to the visible region without any per-frame guess.
     */
    /**
     * v2.8: the cul-de-sac. Drawn in world space (we are already inside the
     * camera transform) and clipped to the visible window, so cost does not
     * grow with arena size: lawns, a road with a dashed centre line,
     * sidewalks, a turning circle at the end, and house fronts with lit
     * windows and a pumpkin on every porch.
     *
     * House details are derived from the house index, never random, so a
     * porch light cannot flicker between frames.
     */
    _drawStreet() {
        const ctx = this.ctx;
        const W = CONFIG.ARENA_WIDTH ?? CONFIG.CANVAS_WIDTH;
        const H = CONFIG.ARENA_HEIGHT ?? CONFIG.CANVAS_HEIGHT;
        const cx = this.camera.worldX;
        const cy = this.camera.worldY;
        const vw = CONFIG.CANVAS_WIDTH;
        const vh = CONFIG.CANVAS_HEIGHT;
        const stage = this.stageId;
        const area51 = stage === 'tundra';
        const haunted = stage === 'crypt';

        // Same layout everywhere -- the road, its edges and the turning circle
        // are the arena the gameplay is tuned around. What changes per stage is
        // what lines the sides of it.
        const PALETTES = {
            forest: {
                lawn: '#1A1F3A', walk: '#49577A', road: '#2E3556', line: '#6B7DA0',
                walls: ['#6B7DA0', '#5A6B8C', '#7A8CB0'], roof: '#1A1F3A',
                win: '#FFD37A', dark: '#2E3556', door: '#4E2F1E', trim: '#E8720C'
            },
            // Inside the haunted house: a corridor with rooms off it.
            crypt: {
                // Lifted well above the stage fill: at the first values the
                // rooms sank into the floor and the corridor read as a black
                // band with nothing either side of it.
                lawn: '#241733', walk: '#3A2547', road: '#4A3528', line: '#7A5C42',
                walls: ['#5A3F6B', '#6B4A7D', '#4C3459'], roof: '#2A1B38',
                win: '#FFB703', dark: '#2A1B38', door: '#7A4A22', trim: '#9B5CFF'
            },
            // Area 51: bunkers dug into the property, not houses.
            tundra: {
                lawn: '#12201C', walk: '#3A5A50', road: '#2A3A33', line: '#5E8A78',
                walls: ['#33443D', '#3D5049', '#2B3A34'], roof: '#1B2B26',
                win: '#A7FFEB', dark: '#16241F', door: '#1C2E28', trim: '#8EE06B'
            }
        };
        const P = PALETTES[stage] || PALETTES.forest;

        // Lawn under everything, covering exactly the visible window.
        ctx.fillStyle = P.lawn;
        ctx.fillRect(cx, cy, vw, vh);

        // A wide street: the road is the play space, so it takes most of the
        // arena and the houses frame it.
        const roadTop = H * 0.28;
        const roadH = H * 0.44;
        const roadBottom = roadTop + roadH;
        const walk = 26;

        ctx.fillStyle = P.walk;
        ctx.fillRect(cx, roadTop - walk, vw, walk);
        ctx.fillRect(cx, roadBottom, vw, walk);
        ctx.fillStyle = P.road;
        ctx.fillRect(cx, roadTop, vw, roadH);

        // Turning circle at the closed end.
        // The bulb is a turning circle, not a plaza: at 0.26 of arena height
        // it filled half the viewport.
        const bulbX = W - H * 0.16;
        const bulbY = roadTop + roadH / 2;
        const bulbR = H * 0.15;
        if (bulbX + bulbR + walk > cx && bulbX - bulbR - walk < cx + vw) {
            ctx.fillStyle = P.walk;
            ctx.beginPath();
            ctx.arc(bulbX, bulbY, bulbR + walk, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = P.road;
            ctx.beginPath();
            ctx.arc(bulbX, bulbY, bulbR, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = P.line;
        const dash = 46;
        const startDash = Math.floor(cx / (dash * 2)) * (dash * 2);
        for (let x = startDash; x < cx + vw; x += dash * 2) {
            if (x > bulbX - bulbR) break;
            ctx.fillRect(x, bulbY - 3, dash, 6);
        }

        // Houses. Each one is a body, a gable roof, lit windows, a porch with
        // a door and pumpkins, and a driveway running down to the sidewalk.
        const spacing = 330;
        const hw = 230;
        const hh = 150;
        const first = Math.max(0, Math.floor((cx - hw) / spacing));
        const last = Math.ceil((cx + vw) / spacing);
        for (let i = first; i <= last; i++) {
            const hx = i * spacing + 44;
            if (hx > W - 140) continue;
            const hash = (i * 2654435761) >>> 0;
            const wall = P.walls[hash % P.walls.length];

            for (const side of [0, 1]) {
                // side 0 sits above the road and faces down; side 1 is below
                // the road and faces up. `front` is the edge facing the street.
                const top = side === 0 ? roadTop - walk - 54 - hh : roadBottom + walk + 54;
                const front = side === 0 ? top + hh : top;
                if (top + hh + 60 < cy || top - 60 > cy + vh) continue;

                const doorX = hx + hw / 2 - 24;
                const doorY = side === 0 ? front - 62 : front + 14;

                if (haunted) {
                    // A room off the corridor: papered wall, a dark doorway,
                    // a candle in the window and a cobweb in one corner.
                    ctx.fillStyle = wall;
                    ctx.fillRect(hx, top, hw, hh);
                    ctx.fillStyle = P.roof;
                    ctx.fillRect(hx, side === 0 ? top : top + hh - 10, hw, 10);
                    // Wallpaper stripes.
                    ctx.fillStyle = 'rgba(255,255,255,0.04)';
                    for (let k = 0; k < 6; k++) ctx.fillRect(hx + 12 + k * 38, top + 14, 10, hh - 28);
                    // Candlelight through the gap.
                    const lit = (hash & 1) === 1;
                    ctx.fillStyle = lit ? P.win : P.dark;
                    ctx.fillRect(hx + 28, side === 0 ? top + 34 : top + hh - 74, 44, 40);
                    if (lit) {
                        const g2 = ctx.createRadialGradient(hx + 50, side === 0 ? top + 54 : top + hh - 54, 0, hx + 50, side === 0 ? top + 54 : top + hh - 54, 90);
                        g2.addColorStop(0, 'rgba(255,183,3,0.18)');
                        g2.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = g2;
                        ctx.fillRect(hx - 40, top - 40, hw + 80, hh + 80);
                    }
                    // Cobweb in the upper corner.
                    ctx.strokeStyle = 'rgba(244,241,228,0.18)';
                    ctx.lineWidth = 1.5;
                    for (let r = 10; r <= 30; r += 10) {
                        ctx.beginPath();
                        ctx.arc(hx + hw - 8, side === 0 ? top + 8 : top + hh - 8, r, 0, Math.PI / 2);
                        ctx.stroke();
                    }
                    // Doorway into the corridor.
                    ctx.fillStyle = P.dark;
                    ctx.fillRect(doorX - 6, doorY, 60, 62);
                    ctx.fillStyle = P.door;
                    ctx.fillRect(doorX, doorY, 48, 62);
                    ctx.fillStyle = P.trim;
                    ctx.fillRect(doorX + 36, doorY + 30, 6, 6);
                } else if (area51) {
                    // A bunker: low concrete, blast door, hazard stripes and a
                    // floodlight washing the apron in front of it.
                    const bh = hh - 26;
                    const btop = side === 0 ? top + 26 : top;
                    ctx.fillStyle = P.walk;
                    ctx.fillRect(hx - 10, btop - 8, hw + 20, bh + 16);
                    ctx.fillStyle = wall;
                    ctx.fillRect(hx, btop, hw, bh);
                    ctx.fillStyle = P.roof;
                    ctx.fillRect(hx, side === 0 ? btop : btop + bh - 14, hw, 14);
                    // Hazard stripes along the front lip.
                    for (let k = 0; k < 8; k++) {
                        ctx.fillStyle = k % 2 ? P.trim : P.dark;
                        ctx.fillRect(hx + 8 + k * 27, side === 0 ? btop + bh - 12 : btop + 2, 22, 8);
                    }
                    // Floodlight cone onto the apron.
                    const fy = side === 0 ? btop + bh + 30 : btop - 30;
                    const g2 = ctx.createRadialGradient(hx + hw / 2, fy, 0, hx + hw / 2, fy, 150);
                    g2.addColorStop(0, 'rgba(167,255,235,0.16)');
                    g2.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g2;
                    ctx.fillRect(hx + hw / 2 - 150, fy - 150, 300, 300);
                    // Blast door, split down the middle.
                    ctx.fillStyle = P.door;
                    ctx.fillRect(doorX - 4, doorY, 56, 62);
                    ctx.fillStyle = P.dark;
                    ctx.fillRect(doorX + 22, doorY, 4, 62);
                    ctx.fillStyle = P.win;
                    ctx.fillRect(doorX + 40, doorY + 26, 6, 10);
                } else {
                    // The cul-de-sac: houses, porches, pumpkins.
                    ctx.fillStyle = P.walk;
                    const driveX = hx + hw - 70;
                    if (side === 0) ctx.fillRect(driveX, front, 54, 54);
                    else ctx.fillRect(driveX, front - 54, 54, 54);

                    const lightY = side === 0 ? front + 30 : front - 30;
                    const glow = ctx.createRadialGradient(hx + 60, lightY, 0, hx + 60, lightY, 130);
                    glow.addColorStop(0, 'rgba(255,183,3,0.20)');
                    glow.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = glow;
                    ctx.fillRect(hx + 60 - 130, lightY - 130, 260, 260);

                    ctx.fillStyle = wall;
                    ctx.fillRect(hx, top, hw, hh);

                    ctx.fillStyle = P.roof;
                    ctx.beginPath();
                    if (side === 0) {
                        ctx.moveTo(hx - 16, top);
                        ctx.lineTo(hx + hw + 16, top);
                        ctx.lineTo(hx + hw / 2, top - 54);
                    } else {
                        ctx.moveTo(hx - 16, top + hh);
                        ctx.lineTo(hx + hw + 16, top + hh);
                        ctx.lineTo(hx + hw / 2, top + hh + 54);
                    }
                    ctx.closePath();
                    ctx.fill();

                    if ((hash & 4) === 0) {
                        ctx.fillRect(hx + hw - 56, side === 0 ? top - 46 : top + hh + 18, 22, 30);
                    }

                    for (let wI = 0; wI < 2; wI++) {
                        const lit = ((hash >> (wI + 1)) & 1) === 1;
                        const wx = hx + 24 + wI * 118;
                        const wy = side === 0 ? top + 30 : top + hh - 78;
                        ctx.fillStyle = lit ? P.win : P.dark;
                        ctx.fillRect(wx, wy, 62, 48);
                        ctx.fillStyle = P.roof;
                        ctx.fillRect(wx + 28, wy, 6, 48);
                        ctx.fillRect(wx, wy + 21, 62, 6);
                    }

                    ctx.fillStyle = P.door;
                    ctx.fillRect(doorX, doorY, 48, 62);
                    ctx.fillStyle = P.win;
                    ctx.fillRect(doorX + 36, doorY + 30, 6, 6);
                    ctx.fillStyle = P.trim;
                    ctx.fillRect(doorX - 26, doorY + 40, 20, 20);
                    ctx.fillRect(doorX + 56, doorY + 44, 14, 14);
                }
            }
        }
    }

    _drawGrid() {
        const ctx = this.ctx;
        const alpha = (getBackgroundFor(this.stageId).gridAlpha ?? 0.04).toFixed(3);
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1;
        const size = CONFIG.GRID_SIZE;
        const cx = this.camera.worldX;
        const cy = this.camera.worldY;
        const vw = CONFIG.CANVAS_WIDTH;
        const vh = CONFIG.CANVAS_HEIGHT;
        const startX = Math.floor(cx / size) * size;
        const startY = Math.floor(cy / size) * size;
        for (let x = startX; x <= cx + vw; x += size) {
            ctx.beginPath();
            ctx.moveTo(x, cy);
            ctx.lineTo(x, cy + vh);
            ctx.stroke();
        }
        for (let y = startY; y <= cy + vh; y += size) {
            ctx.beginPath();
            ctx.moveTo(cx, y);
            ctx.lineTo(cx + vw, y);
            ctx.stroke();
        }
    }

    openAchievements() {
        this.ui.showAchievements(this.save.achievements || {}, () => {
            /* closed */
        });
    }

    // --- Settings ---------------------------------------------------------
    openSettings() {
        this.ui.showSettings(
            this.save.settings,
            (key, value) => {
                this.save.settings[key] = value;
                saveSave(this.save);
                if (key === 'masterVolume' || key === 'sfxVolume' || key === 'musicVolume')
                    this.audio.applyVolumes();
                if (key === 'musicEnabled') this.audio.toggleMusic(value);
                // iter-14: re-apply CSS custom properties when the touch
                // button scale changes so the player sees the buttons
                // resize live without reloading the page.
                if (key === 'touchButtonScale') this._applyTouchScale();
            },
            () => {
                /* closed */
            },
            () => {
                resetSave();
                this.save = loadSave();
                this.achievements = new AchievementTracker(this.save);
                this.run = this.achievements.run;
                this.audio.applyVolumes();
                this.ui.hideSettings();
            },
            {
                // iter-19: only render the vibration row when the host
                // actually has the API; the UI hides it otherwise so it
                // isn't a dead control.
                vibrationSupported: this.haptics?.isSupported() ?? false,
                onRemap: () => this.openRemap()
            }
        );
    }

    // --- Keymap remap -----------------------------------------------------
    /**
     * iter-19: open the Customize Controls dialog. Saves the new keymap to
     * localStorage and re-arms the input manager so the rebind takes effect
     * on the next keystroke.
     */
    openRemap() {
        this.ui.showRemap(
            this.keymap,
            (next) => {
                this.keymap = next;
                this.input.setKeymap(next);
                saveKeymap(next);
            },
            () => {
                /* closed; settings panel stays open behind */
            }
        );
    }
}

// Level-up batching. Called from gainExp via Player; we patch Player here to notify.
const origGainExp = Player.prototype.gainExp;
Player.prototype.gainExp = function (amount) {
    const ups = origGainExp.call(this, amount);
    if (ups.length && window.__vsGame) {
        window.__vsGame._pendingLevelUps = (window.__vsGame._pendingLevelUps || 0) + ups.length;
    }
    return ups;
};

// Bootstrap
export function boot() {
    const g = new Game();
    window.__vsGame = g;
    // The menu is already on screen at boot -- nothing calls showStart() for
    // the first view -- so the cast strip has to be painted here or the very
    // first thing a player sees is an empty box where the mob should be.
    g._paintStartScene?.();
    // Dev-only debug hooks. Gated on hostname so they never fire on the
    // GitHub Pages build; the smoke harness loads from localhost so it
    // does. Used by scripts/runtime-smoke.js to fast-forward to bosses,
    // force a level-up, and trigger game-over without having to actually
    // play 5 minutes per scene.
    const isDev =
        typeof location !== 'undefined' &&
        (location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1' ||
            location.hostname === '');
    if (isDev) {
        window.__SURV_DEBUG__ = {
            /** Fast-forward simulated game time. Triggers everything that's
             * gated on `gameTime`: wave director, boss spawns, difficulty
             * scaling. Spawn accumulator follows along so a chunk of enemies
             * appears proportionate to the elapsed window. */
            advance(seconds = 30) {
                if (!g.player || g.state !== 'playing') return false;
                g.gameTime += seconds;
                // Keep the spawn director from emptying its bag in one frame.
                g._spawnAccumulator = 0;
                return true;
            },
            /** Push enough XP that the next update() flushes one level-up. */
            grantLevel(n = 1) {
                if (!g.player) return false;
                for (let i = 0; i < n; i++) g.player.gainExp(g.player.expToNext + 1);
                return true;
            },
            /** Knock the player to 1 HP so the next enemy hit ends the run. */
            killPlayer() {
                if (!g.player) return false;
                g.player.hp = 0;
                g.player.dead = true;
                return true;
            },
            /** Spawn the named boss right now (skipping its scheduled time). */
            spawnBoss(id) {
                const def = Object.values(BOSSES).find((b) => b.id === id);
                if (!def) return false;
                g._spawnBoss(def, 1, 1);
                g._bossesSpawned.add(def.id);
                return true;
            }
        };
    }
    return g;
}

// Re-export for any external script that needs the catalogue.
export { ACHIEVEMENTS, WAVES };
