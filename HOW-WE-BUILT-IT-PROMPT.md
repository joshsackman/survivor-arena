# Prompt: write up how we built "Nice Costume"

Copy everything below the line into Claude.

---

I want you to write a document explaining how my kids and I built a browser
game with Claude Code, so other parents and hobbyists can copy the approach.

Audience: people who are technical enough to run a dev server but who have
never built software *with* their kids. The document should be practical, not
a puff piece — the reader should finish it knowing exactly what to do on a
Saturday morning, and what will bite them.

## What we made

A browser survivor game called **Nice Costume**. The premise came from two
9-year-olds: it's Halloween night, your alien costume is so convincing the
entire cul-de-sac thinks a real alien got loose, and the only way out is
straight through everybody.

Built in one long session on top of a forked open-source game:

- 40 commits, each deployed live within about a minute
- 6 stages: a cul-de-sac, a haunted house interior, Area 51, Jamaica, a robot
  junkyard, and a desert valley
- 35 enemies, 9 bosses, 7 playable costumes plus 1 secret
- 63 hand-written pixel sprites, all drawn in code — no image files
- A procedural 8-bit soundtrack with a different theme per stage
- A global leaderboard shared between friends
- 279 tests, all green at the end
- 25 source files, zero dependencies

## How we worked

**The kids drove; I relayed.** They said things like "make Robot Rob throw
powerful things and be the hardest boss" or "the dog doesn't look enough like
a dog and it's giant." I pasted that in almost verbatim. Claude did not get
polished specs, and that turned out to be fine.

**A house-rules file did the heavy lifting.** A `CLAUDE.md` at the project
root told Claude who it was working with: two 9-year-olds, explain every
change in one sentence a 9-year-old understands, never show them code, never
break the game, smallest possible edit, commit and push after every change
that works. That single file shaped every response for the whole session.

**We started from something that already worked.** Forking a functioning
open-source game meant there was always something playable on screen. The kids
never sat through a build phase with nothing to look at.

**Every change went live immediately.** Push to GitHub, Netlify deploys in
about a minute. The kids would say an idea and be playing it before they got
bored. This is the single biggest reason it held their attention for hours.

**All the art is code.** Sprites are grids of characters plus a colour
palette, drawn in the source. That keeps every detail promptable — "make his
nose red", "the eyes are too small" — instead of being an asset hunt.

## The lessons worth writing about

These are the real ones. Please give them proper weight — they're what
separates this from a generic "I used AI to build a game" post.

**1. Verifying by reading code does not work. You have to play it.**
Repeatedly, the code looked correct and was wrong. A boss "charge" that read
perfectly was an instant 120-pixel teleport onto the player. A cardboard-box
character's face was dark brown on brown and effectively invisible. A zombie
costume rendered as a featureless green blob. Every one of those was caught by
rendering it and *looking*, never by review.

**2. Measuring the wrong thing is worse than not measuring.**
Claude tested that boss charge, measured "moved 120 pixels", and reported the
feature as working. The number was correct and the interpretation was exactly
backwards — that 120px *was* the bug. My son found it in about a minute of
play.

**3. Cached code will waste your afternoon.**
The game had an offline cache that kept serving an old copy of a source file.
The fix was on disk, the tests passed, and the browser kept running the bug.
About six rounds went into chasing a phantom before the cache turned out to be
it. If you add offline support, bump the cache version on every deploy, and
when something is "impossible", check what the browser actually loaded.

**4. Let real data pick your priorities.**
Partway through, we looked at the kids' own leaderboard: 23 runs, median 2
minutes, best 4 minutes 20. Every boss in the game arrived between 4 and 12
minutes. They had literally never seen most of what we'd built. Moving the
whole boss schedule into the first 4 minutes was worth more than any new
feature that day.

**5. Small features are silently inert surprisingly often.**
Several times a flag was added to a data file with no code reading it: an
"ambush" enemy that never ambushed, a boss ability that did nothing, a
"faster enemies" penalty referencing data the game never passes. None of them
errored. Always confirm the new thing actually changes behaviour.

**6. Tests written with fixed dates become time bombs.**
Two tests failed the entire session. Both wrote a hard-coded date through a
function that prunes anything older than two weeks, so each test deleted its
own data the moment the calendar moved past it. They passed the day they were
written.

**7. Copy the pattern that already works in your codebase.**
A settings panel kept pushing its buttons off the bottom of the screen. Three
fixes in a row looked right in code and failed on screen. What worked was
copying the layout pattern from another panel in the same file that had
already solved that exact problem.

## Also worth covering

- Doing cultural content with care: the kids asked for a Jamaica level, and
  rather than reaching for clichés we used real food, the actual flag, the
  Jamaican word *duppy* for a ghost, and Jonkonnu masquerade characters — a
  genuine costume tradition that happened to fit the game's premise perfectly.
- Kid-proofing the interface: plain words instead of jargon ("Shake the
  screen", not "Screen shake"; "Erase everything", not "Reset all saved
  data").
- Being honest with the kids when something broke, and why. They were
  completely unbothered by bugs and very interested in the explanations.

## What I want back

A clear document — headings, short sections, concrete examples. Include a
"start here on a Saturday" section with the actual setup steps, and a "what
will bite you" section from the lessons above. Include the house-rules file as
a copyable example, since that's the part most people could reuse tomorrow.

Write it so someone who has never done this could sit down with their kid and
get a playable change on screen within the first half hour.
