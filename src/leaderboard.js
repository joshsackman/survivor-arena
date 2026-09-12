/**
 * @module leaderboard
 * @description Global online leaderboard backed by Supabase REST.
 *
 * Anonymous and deliberately tiny: the key below is a *publishable* key and is
 * meant to ship in the page. Row-level security on the table allows exactly
 * two things — read every row, insert a new row. There is no update or delete
 * policy, so nobody can edit or erase someone else's score.
 *
 * Initials are validated twice: here (so kids get instant feedback) and again
 * in Postgres by a trigger against `banned_initials`, so a hand-crafted
 * request can't bypass the word filter.
 *
 * Dependencies: fetch (browser only). Import is side-effect free so Node-side
 * tests can load it.
 */

const SUPABASE_URL = 'https://mussfrhdbeqoksrjkctc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_b3TJ-30OrExvF5W7zu04Fg_A74N8mPh';
const REST = `${SUPABASE_URL}/rest/v1/scores`;
const REQUEST_TIMEOUT_MS = 8000;

/** Mirror of public.banned_initials. Server-side is authoritative. */
export const BLOCKED_INITIALS = new Set([
    'ASS','ASZ','FUK','FUC','FCK','FUQ','PHK','CUM','KUM',
    'SEX','SXX','TIT','TTS','FAG','FGT','NIG','NGR','KKK','NAZ',
    'HIT','JEW','WTF','STF','PIS','PSS','SHT','SHI','DIK',
    'DIC','DCK','CCK','COK','KOK','PEN','VAG','HOE','SLT','WHR',
    'RAP','GAY','JIZ','BUT','POO','PEE','FAP','MFK','KYS','DIE',
    'BCH','BIH','CNT','KNT','TWT','PRN','XXX','STD','HIV','DMN'
]);

/** Upper-case, strip anything that isn't A-Z, clamp to 3 characters. */
export function normaliseInitials(raw) {
    return String(raw ?? '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 3);
}

/**
 * @returns {{ok: boolean, reason?: 'length'|'blocked'}}
 */
export function checkInitials(raw) {
    const s = normaliseInitials(raw);
    if (s.length !== 3) return { ok: false, reason: 'length' };
    if (BLOCKED_INITIALS.has(s)) return { ok: false, reason: 'blocked' };
    return { ok: true };
}

function headers(extra = {}) {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...extra
    };
}

async function withTimeout(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Post one run to the global board.
 * @returns {Promise<{ok: boolean, error?: string}>} never throws — the game
 *          must keep working when the network (or Supabase) is unavailable.
 */
export async function submitScore({ initials, kills, timeSurvived, level, stage }) {
    const check = checkInitials(initials);
    if (!check.ok) return { ok: false, error: check.reason };
    const row = {
        initials: normaliseInitials(initials),
        kills: Math.max(0, Math.round(kills || 0)),
        time_survived: Math.max(0, Math.round(timeSurvived || 0)),
        level: Math.max(1, Math.round(level || 1)),
        stage: stage ?? null
    };
    try {
        const res = await withTimeout(REST, {
            method: 'POST',
            headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify(row)
        });
        if (!res.ok) return { ok: false, error: `http ${res.status}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'offline' };
    }
}

/**
 * Top runs, longest survival first.
 * @returns {Promise<{ok: boolean, rows: Array<object>, error?: string}>}
 */
export async function fetchTopScores(limit = 20) {
    const url =
        `${REST}?select=initials,kills,time_survived,level,stage,created_at` +
        `&order=time_survived.desc,kills.desc,created_at.asc&limit=${Math.max(1, Math.min(100, limit))}`;
    try {
        const res = await withTimeout(url, { headers: headers() });
        if (!res.ok) return { ok: false, rows: [], error: `http ${res.status}` };
        const rows = await res.json();
        return { ok: true, rows: Array.isArray(rows) ? rows : [] };
    } catch (err) {
        return { ok: false, rows: [], error: err?.name === 'AbortError' ? 'timeout' : 'offline' };
    }
}
