/**
 * @module audio
 * @description Web Audio synthesised SFX plus a procedural music loop.
 * Zero external assets — every sound is generated at playback time from
 * oscillators and noise buffers. Music is a step sequencer that walks a root
 * note around a minor progression with an arpeggiator on top.
 *
 * Dependencies: browser Web Audio API. Degrades silently when unavailable.
 *
 * Exports:
 *   - class AudioEngine
 */

export class AudioEngine {
    constructor(settings) {
        this.settings = settings;
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.musicInterval = null;
        this.enabled = true;
        this.unlocked = false;
    }

    init() {
        if (this.ctx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) {
                this.enabled = false;
                return;
            }
            this.ctx = new AC();
            this.masterGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();
            this.musicGain = this.ctx.createGain();
            this.sfxGain.connect(this.masterGain);
            this.musicGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);
            this.applyVolumes();
        } catch (err) {
            console.warn('[audio] disabled', err);
            this.enabled = false;
        }
    }

    unlock() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {
                /* ignore */
            });
        }
        this.unlocked = true;
    }

    applyVolumes() {
        if (!this.ctx) return;
        const s = this.settings;
        // iter-13: a global `muted` flag (toggled by the M hotkey) zeroes the
        // master gain without overwriting masterVolume so unmute restores
        // exactly what the player had before.
        const muteMult = s.muted ? 0 : 1;
        this.masterGain.gain.value = (s.masterVolume ?? 0.6) * muteMult;
        this.sfxGain.gain.value = s.sfxVolume ?? 0.8;
        this.musicGain.gain.value = (s.musicEnabled === false ? 0 : 1) * (s.musicVolume ?? 0.4);
    }

    /** Toggle a global mute (zeroes master gain, leaves volumes intact). */
    setMuted(flag) {
        this.settings.muted = !!flag;
        this.applyVolumes();
    }

    // Generic tone helper --------------------------------------------------
    tone({
        freq = 440,
        dur = 0.08,
        type = 'sine',
        volume = 0.2,
        attack = 0.005,
        release = 0.05,
        sweep = 0,
        noise = false
    }) {
        if (!this.enabled || !this.ctx || !this.unlocked) return;
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);
        gain.connect(this.sfxGain);

        let source;
        if (noise) {
            source = this.ctx.createBufferSource();
            source.buffer = this._noiseBuffer();
        } else {
            const osc = this.ctx.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            if (sweep) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), now + dur);
            }
            source = osc;
        }
        source.connect(gain);
        source.start(now);
        source.stop(now + dur + release + 0.01);
    }

    _noiseBuffer() {
        if (this._noise) return this._noise;
        const len = this.ctx.sampleRate * 0.4;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._noise = buf;
        return buf;
    }

    // ---- Playback budget -------------------------------------------------
    // A mob of 30 neighbours must not produce 30 simultaneous voices. Every
    // sound goes through `play()`, which enforces a per-name cooldown and a
    // global cap on how many one-shots may start in the same frame.
    _canPlay(name, cooldownMs) {
        if (!this.enabled || !this.ctx || !this.unlocked) return false;
        const now = performance.now();
        this._lastPlayed ??= Object.create(null);
        if (cooldownMs && now - (this._lastPlayed[name] || 0) < cooldownMs) return false;
        // Global voice budget: at most 6 new one-shots per 60ms window.
        if (now - (this._voiceWindowAt || 0) > 60) {
            this._voiceWindowAt = now;
            this._voicesThisWindow = 0;
        }
        if ((this._voicesThisWindow || 0) >= 6) return false;
        this._voicesThisWindow = (this._voicesThisWindow || 0) + 1;
        this._lastPlayed[name] = now;
        return true;
    }

    /** Fire several tones as one sound, offsets in ms. */
    _seq(steps) {
        for (const st of steps) {
            if (!st.at) this.tone(st);
            else setTimeout(() => this.tone(st), st.at);
        }
    }

    /**
     * The one entry point for sound effects.
     * `audio.play('shoot')`, `audio.play('enemyDeath')`, ...
     * Unknown names are ignored rather than throwing, so gameplay code can
     * name a sound before it exists.
     */
    play(name, opts = {}) {
        const def = this._sfx()[name];
        if (!def) return;
        if (!this._canPlay(name, def.cooldown ?? 0)) return;
        def.run.call(this, opts);
    }

    /**
     * The palette. Volumes are balanced as a hierarchy: player feedback is
     * loudest, enemy personality quietest, so a crowd never buries the
     * information the player actually needs.
     */
    _sfx() {
        if (this._sfxTable) return this._sfxTable;
        const V = { loud: 0.22, mid: 0.15, soft: 0.09, quiet: 0.06 };
        this._sfxTable = {
            // --- player ---------------------------------------------------
            startGame: {
                run: () =>
                    this._seq([
                        { freq: 392, dur: 0.09, type: 'square', volume: V.mid },
                        { freq: 523, dur: 0.09, type: 'square', volume: V.mid, at: 90 },
                        { freq: 784, dur: 0.2, type: 'square', volume: V.loud, at: 180 }
                    ])
            },
            playerHit: {
                cooldown: 120,
                run: () =>
                    this.tone({ freq: 700, dur: 0.09, type: 'square', volume: V.mid, sweep: -420 })
            },
            playerHurt: {
                cooldown: 300,
                run: () =>
                    this._seq([
                        { freq: 300, dur: 0.12, type: 'sawtooth', volume: V.mid, sweep: -60 },
                        { freq: 240, dur: 0.16, type: 'sawtooth', volume: V.mid, sweep: -70, at: 110 }
                    ])
            },
            gameOver: {
                run: () =>
                    this._seq([
                        { freq: 392, dur: 0.18, type: 'square', volume: V.loud },
                        { freq: 330, dur: 0.18, type: 'square', volume: V.loud, at: 190 },
                        { freq: 262, dur: 0.22, type: 'square', volume: V.loud, at: 380 },
                        { freq: 165, dur: 0.75, type: 'sawtooth', volume: V.loud, sweep: -60, at: 600 }
                    ])
            },
            levelUp: {
                run: () =>
                    this._seq([
                        { freq: 523, dur: 0.07, type: 'square', volume: V.mid },
                        { freq: 659, dur: 0.07, type: 'square', volume: V.mid, at: 70 },
                        { freq: 784, dur: 0.07, type: 'square', volume: V.mid, at: 140 },
                        { freq: 1047, dur: 0.16, type: 'square', volume: V.loud, at: 210 }
                    ])
            },
            pickup: {
                cooldown: 45,
                // Was a 1180Hz square sweep -- the same waveform and register
                // as the music's octave sparkle, so candy stopped reading as
                // feedback. Now a quick triangle two-step, well clear of it.
                run: () =>
                    this._seq([
                        { freq: 1568, dur: 0.035, type: 'triangle', volume: V.soft },
                        { freq: 2093, dur: 0.05, type: 'triangle', volume: V.soft, at: 38 }
                    ])
            },
            pickupRare: {
                run: () =>
                    this._seq([
                        { freq: 784, dur: 0.06, type: 'square', volume: V.mid },
                        { freq: 1047, dur: 0.06, type: 'square', volume: V.mid, at: 60 },
                        { freq: 1319, dur: 0.06, type: 'square', volume: V.mid, at: 120 },
                        { freq: 1568, dur: 0.18, type: 'triangle', volume: V.mid, at: 180 }
                    ])
            },
            scare: {
                cooldown: 300,
                run: () =>
                    this._seq([
                        { freq: 180, dur: 0.06, type: 'sawtooth', volume: V.mid },
                        { freq: 900, dur: 0.22, type: 'sawtooth', volume: V.mid, at: 40, sweep: 700 }
                    ])
            },
            screech: {
                cooldown: 140,
                run: () =>
                    this._seq([
                        { freq: 1180, dur: 0.07, type: 'sawtooth', volume: V.quiet, sweep: -420 },
                        { freq: 980, dur: 0.06, type: 'sawtooth', volume: V.quiet, at: 70, sweep: -300 }
                    ])
            },
            hiss: {
                cooldown: 140,
                run: () => this.tone({ noise: true, dur: 0.16, volume: V.quiet, release: 0.12 })
            },
            powerdown: {
                run: () =>
                    this._seq([
                        { freq: 392, dur: 0.1, type: 'square', volume: V.mid },
                        { freq: 294, dur: 0.1, type: 'square', volume: V.mid, at: 95 },
                        { freq: 196, dur: 0.24, type: 'square', volume: V.mid, at: 190 }
                    ])
            },
            doorbell: {
                run: () =>
                    this._seq([
                        { freq: 659, dur: 0.22, type: 'triangle', volume: V.mid },
                        { freq: 523, dur: 0.34, type: 'triangle', volume: V.mid, at: 240 }
                    ])
            },
            // --- combat ---------------------------------------------------
            shoot: {
                cooldown: 70,
                run: () =>
                    this.tone({ freq: 820, dur: 0.035, type: 'square', volume: V.quiet, sweep: -340 })
            },
            impact: {
                cooldown: 55,
                run: () => this.tone({ noise: true, dur: 0.04, volume: V.quiet, release: 0.03 })
            },
            enemyDeath: {
                cooldown: 35,
                run: (o) => {
                    // Combo: each quick successive defeat pops a little higher.
                    const now = performance.now();
                    if (now - (this._comboAt || 0) > 900) this._combo = 0;
                    this._comboAt = now;
                    this._combo = Math.min((this._combo || 0) + 1, 8);
                    const base = (o.freq || 300) * Math.pow(1.06, this._combo);
                    this.tone({
                        freq: base,
                        dur: 0.06,
                        type: 'square',
                        volume: V.soft,
                        sweep: -Math.min(240, base * 0.5)
                    });
                }
            },
            bossDeath: {
                run: () =>
                    this._seq([
                        { noise: true, dur: 0.3, volume: V.loud, release: 0.2 },
                        { freq: 300, dur: 0.4, type: 'sawtooth', volume: V.mid, sweep: -200, at: 60 }
                    ])
            },
            // --- neighbours (quietest layer) ------------------------------
            dad: {
                cooldown: 1400,
                run: () =>
                    this._seq([
                        { freq: 190, dur: 0.07, type: 'square', volume: V.quiet },
                        { freq: 150, dur: 0.1, type: 'square', volume: V.quiet, at: 80 }
                    ])
            },
            mom: {
                cooldown: 1400,
                run: () =>
                    this._seq([
                        { freq: 620, dur: 0.06, type: 'square', volume: V.quiet },
                        { freq: 740, dur: 0.08, type: 'square', volume: V.quiet, at: 70 }
                    ])
            },
            grandma: {
                cooldown: 1800,
                run: () =>
                    this._seq([
                        { freq: 420, dur: 0.09, type: 'triangle', volume: V.quiet, sweep: 60 },
                        { freq: 380, dur: 0.11, type: 'triangle', volume: V.quiet, sweep: -60, at: 90 }
                    ])
            },
            bully: {
                cooldown: 1500,
                run: () =>
                    this._seq([
                        { freq: 330, dur: 0.07, type: 'square', volume: V.quiet },
                        { freq: 262, dur: 0.1, type: 'square', volume: V.quiet, at: 90 }
                    ])
            },
            dog: {
                cooldown: 1200,
                run: () =>
                    this._seq([
                        { noise: true, dur: 0.05, volume: V.soft, release: 0.02 },
                        { noise: true, dur: 0.05, volume: V.quiet, release: 0.02, at: 110 }
                    ])
            },
            cat: {
                cooldown: 1600,
                run: () => this.tone({ noise: true, dur: 0.18, volume: V.quiet, release: 0.12 })
            },
            kid: {
                cooldown: 1500,
                run: () =>
                    this.tone({ freq: 900, dur: 0.06, type: 'square', volume: V.quiet, sweep: 260 })
            },
            // --- world ----------------------------------------------------
            spookyChime: {
                cooldown: 9000,
                run: () =>
                    this._seq([
                        { freq: 622, dur: 0.3, type: 'triangle', volume: V.quiet },
                        { freq: 466, dur: 0.45, type: 'triangle', volume: V.quiet, at: 300 }
                    ])
            },
            ufo: {
                cooldown: 6000,
                run: () =>
                    this.tone({ freq: 520, dur: 0.5, type: 'sine', volume: V.quiet, sweep: 180 })
            },
            // --- title ----------------------------------------------------
            titleSting: {
                run: () =>
                    this._seq([
                        // three ominous notes...
                        { freq: 196, dur: 0.24, type: 'sawtooth', volume: V.mid },
                        { freq: 185, dur: 0.24, type: 'sawtooth', volume: V.mid, at: 260 },
                        { freq: 175, dur: 0.3, type: 'sawtooth', volume: V.mid, at: 520 },
                        // ...nope.
                        { freq: 523, dur: 0.09, type: 'square', volume: V.mid, at: 880 },
                        { freq: 659, dur: 0.09, type: 'square', volume: V.mid, at: 970 },
                        { freq: 784, dur: 0.09, type: 'square', volume: V.mid, at: 1060 },
                        { freq: 1047, dur: 0.22, type: 'square', volume: V.loud, at: 1150 },
                        { noise: true, dur: 0.06, volume: V.soft, at: 1150 }
                    ])
            }
        };
        return this._sfxTable;
    }

    /** Which personality sound a given character uses. */
    voiceFor(id) {
        if (/^dad|zombie/.test(id)) return 'dad';
        if (/^mom|skeleton/.test(id)) return 'mom';
        if (/grandma|golem/.test(id)) return 'grandma';
        if (/bully/.test(id)) return 'bully';
        if (/^pet_cat$/.test(id) || /big_g/.test(id)) return 'cat';
        if (/wolf|pet_/.test(id)) return 'dog';
        if (/duppy/.test(id)) return 'grandma';
        if (/rusty_bot|scrap_drone|robot_rob/.test(id)) return 'ufo';
        if (/vulture/.test(id)) return 'screech';
        if (/snake/.test(id)) return 'hiss';
        if (/cactus/.test(id)) return 'grandma';
        if (/lil_timmy/.test(id)) return 'kid';
        if (/bat|box_kid|pumpkin_kid|bean_always|freddy|jump_scare|owen|pitchy_patchy|ghost|mage/.test(id)) return 'kid';
        return null;
    }

    // High-level SFX -------------------------------------------------------
    // Thin aliases so every existing call site gets the balanced, throttled
    // versions without being rewritten. New code should call play() directly.
    hit() {
        this.play('impact');
    }
    shoot() {
        this.play('shoot');
    }
    explosion() {
        this.play('bossDeath');
    }
    pickup() {
        this.play('pickup');
    }
    levelUp() {
        this.play('levelUp');
    }
    damage() {
        this.play('playerHurt');
    }
    death() {
        this.play('gameOver');
    }
    bossSpawn() {
        this.play('bossDeath');
    }
    bossWarn() {
        this.play('spookyChime');
    }
    achievement() {
        this.play('pickupRare');
    }
    gameOverSting() {
        this.play('gameOver');
    }
    chaseStart() {
        this.play('startGame');
    }

    // ---- Music -----------------------------------------------------------
    // A goofy neighbourhood-mob chase, built as a 16-step loop at a FIXED
    // tempo (~152 BPM). Danger never changes the tempo -- that would fight
    // the sequencer -- it adds LAYERS instead: percussion, harmony, then an
    // octave arpeggio, so the street gets busier without drifting out of time.
    _themes() {
        return {
            // Mischievous, bouncy, slightly ridiculous. Minor with a cheeky
            // major sixth, plenty of syncopation, and a turnaround at the end.
            street: {
                stepMs: 98,
                root: 262,
                wave: 'square',
                // da-da-da DA / da-da-da DA / uh-oh-the-neighbours-are-coming
                melody: [0, 0, 3, 7, null, 7, 3, 0, 5, 5, 8, 12, null, 10, 8, 7],
                bass: [0, null, 0, null, -5, null, -5, null, -3, null, -3, null, 2, 2, 2, 2],
                // The goofy turnaround: a quick chromatic scramble home.
                turnaround: [12, 11, 10, 9]
            },
            // Inside the haunted house: slower, creakier, minor seconds.
            haunted: {
                stepMs: 132,
                root: 220,
                wave: 'triangle',
                melody: [0, null, 1, null, 0, null, -1, null, 0, 1, 3, 1, 0, null, null, null],
                bass: [0, null, null, null, -4, null, null, null, -5, null, null, null, -4, null, null, null],
                turnaround: [3, 2, 1, 0]
            },
            // Area 51: cold, electronic, marching.
            area51: {
                stepMs: 104,
                root: 262,
                wave: 'square',
                melody: [0, 7, 0, 7, 3, 10, 3, 10, 0, 7, 0, 7, 5, 12, 5, 12],
                bass: [0, 0, 0, 0, -2, -2, -2, -2, -4, -4, -4, -4, -2, -2, -2, -2],
                turnaround: [12, 7, 3, 0]
            },
            // Jamaica: the skank. What makes reggae recognisable is a CHORD
            // landing on the off beat while beat one is left open, over a bass
            // that carries the tune. Its own root (196, a fourth below the
            // other stages) and a square lead keep it clear of the triangle
            // bass, so it doesn't blur into the Halloween themes.
            jamaica: {
                stepMs: 122,
                root: 196,
                wave: 'square',
                // Beat one stays open; the melody answers between the stabs.
                melody: [null, null, 12, null, null, null, 10, 12, null, null, 15, null, null, null, 12, 10],
                // Three-note stabs on every off beat -- the skank itself.
                chord: [
                    null, [0, 4, 7], null, [0, 4, 7],
                    null, [0, 3, 7], null, [0, 3, 7],
                    null, [-2, 2, 5], null, [-2, 2, 5],
                    null, [0, 4, 7], null, [0, 4, 7]
                ],
                // The bass is the lead voice: round, walking, always moving.
                bass: [0, null, 0, 7, 5, null, 5, 0, -2, null, -2, 5, 3, null, 0, 2],
                turnaround: [12, 10, 7, 0]
            },
            // Huss Valley: wide, slow and dry. Phrygian dominant (that flat
            // second) is what makes it sound like a desert and not just a
            // sad key, with long gaps so it feels like open space.
            desert: {
                stepMs: 128,
                root: 175,
                wave: 'triangle',
                melody: [0, 1, 4, 1, 0, null, 7, 8, 7, 4, 1, 0, null, 1, 0, null],
                bass: [0, null, 0, null, -5, null, -5, null, -7, null, -7, null, -5, null, -5, null],
                turnaround: [8, 7, 4, 1]
            },
            // Robot Junkyard: a machine, not a tune. A buzzing sawtooth cell
            // hammered over and over like a stamping press, a motor that
            // never stops underneath it, and metal struck on the offbeat.
            junkyard: {
                stepMs: 100,
                root: 110,
                wave: 'sawtooth',
                // The same four-step cell, repeated. Machines don't improvise.
                melody: [0, 0, 12, 0, 0, 0, 12, 0, 3, 3, 15, 3, 3, 3, 15, 3],
                // One low note on every single step: the motor.
                bass: [0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -2, -2, -2, -2, -2],
                // Hammer falls.
                clank: [0, 4, 6, 8, 12, 14],
                turnaround: [12, 12, 0, 0]
            },
            boss: {
                stepMs: 92,
                root: 196,
                wave: 'square',
                melody: [0, 1, 0, -1, 0, 1, 5, 6, 0, 1, 0, -1, 6, 5, 1, 0],
                bass: [0, 0, null, 0, -2, -2, null, -2, -4, -4, null, -4, -1, -1, -1, -1],
                turnaround: [6, 5, 1, 0]
            },
            intro: {
                stepMs: 210,
                root: 196,
                wave: 'triangle',
                melody: [0, null, 4, null, 7, null, 4, null],
                bass: [0, null, null, null, 5, null, null, null],
                turnaround: null
            }
        };
    }

    /** 0 = calm, 1 = the whole street is after you. Adds layers, not speed. */
    setIntensity(level) {
        this._intensity = Math.max(0, Math.min(1, Number(level) || 0));
    }

    /**
     * @param {'street'|'boss'|'intro'} [style]
     */
    startMusic(style = 'street') {
        if (!this.enabled || !this.ctx) return;
        if (this.settings.musicEnabled === false) return;
        // Already playing this theme: leave it alone. Restarting the run must
        // never stack a second sequencer on top of the first.
        if (this.musicInterval && this._musicStyle === style) return;
        this.stopMusic();
        this.unlock();
        this._musicStyle = style;
        this._intensity ??= 0;
        const T = this._themes()[style] || this._themes().street;
        let step = 0;
        let bar = 0;

        const note = (semi, opts) => {
            if (semi === null || semi === undefined) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = opts.wave || T.wave;
            osc.frequency.value = (opts.root || T.root) * Math.pow(2, semi / 12);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(opts.vol, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + (opts.dur || 0.16));
            osc.connect(gain).connect(this.musicGain);
            osc.start(now);
            osc.stop(now + (opts.dur || 0.16) + 0.02);
        };

        const drum = (vol) => {
            const now = this.ctx.currentTime;
            const src = this.ctx.createBufferSource();
            const gain = this.ctx.createGain();
            src.buffer = this._noiseBuffer();
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
            src.connect(gain).connect(this.musicGain);
            src.start(now);
            src.stop(now + 0.06);
        };

        // Struck metal: noise plus a short ringing ping.
        const clank = (vol) => {
            drum(vol);
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 1150 + Math.random() * 250;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(vol * 0.45, now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
            osc.connect(gain).connect(this.musicGain);
            osc.start(now);
            osc.stop(now + 0.09);
        };

        const tick = () => {
            if (!this.ctx) return;
            const I = this._intensity || 0;
            const len = T.melody.length;

            // Layer 1 (always): melody + bass.
            note(T.melody[step % len], { vol: 0.05, dur: T.stepMs / 1000 + 0.04 });
            // Offbeat chord stabs, for themes that define them (Jamaica's
            // skank). Short and quiet so they punctuate rather than drone.
            if (T.chord) {
                const stab = T.chord[step % T.chord.length];
                if (stab) {
                    for (const semi of stab) {
                        note(semi, { vol: 0.03, dur: 0.085, wave: 'square' });
                    }
                }
            }
            note(T.bass[step % T.bass.length], {
                root: T.root / 2,
                wave: 'triangle',
                vol: 0.055,
                dur: 0.2
            });

            // Theme-defined metal percussion, on from the first bar rather
            // than gated behind intensity -- it IS the junkyard.
            if (T.clank && T.clank.includes(step % len)) clank(0.045 + I * 0.03);

            // Layer 2 (medium): noise percussion on the backbeat.
            if (I > 0.33 && step % 4 === 2) drum(0.05 + I * 0.05);

            // Layer 3 (busier): a harmony a fifth up, staccato.
            if (I > 0.55 && T.melody[step % len] !== null && step % 2 === 0) {
                note(T.melody[step % len] + 7, { vol: 0.028, dur: 0.09 });
            }

            // Layer 4 (chaos): octave arpeggio sparkle + extra percussion.
            if (I > 0.75) {
                // Sparkle sits a fifth up on a triangle rather than an octave
                // up on a square: it stays under the gameplay sounds instead
                // of competing with the candy pickup.
                if (step % 2 === 1)
                    note((T.melody[step % len] ?? 0) + 7, {
                        vol: 0.018,
                        dur: 0.06,
                        wave: 'triangle'
                    });
                if (step % 4 === 0) drum(0.04);
            }

            step++;
            if (step >= len) {
                step = 0;
                bar++;
                // Goofy turnaround every fourth bar: a quick chromatic scramble.
                if (T.turnaround && bar % 4 === 0) {
                    T.turnaround.forEach((semi, i) => {
                        setTimeout(() => note(semi, { vol: 0.045, dur: 0.07 }), i * (T.stepMs / 2));
                    });
                }
            }
        };

        tick();
        this.musicInterval = setInterval(tick, T.stepMs);
    }

    stopMusic() {
        this._musicStyle = null;
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
    }

    toggleMusic(on) {
        this.settings.musicEnabled = !!on;
        this.applyVolumes();
        if (on) this.startMusic();
        else this.stopMusic();
    }
}
