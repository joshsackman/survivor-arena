# Prompt: write up how we built "Nice Costume" with our kids

Copy everything below the line into Claude.

---

Write an overview document about how I built a video game together with my two
9-year-olds using Claude Code, so that other parents can copy the approach.

This is **not** a technical write-up. The reader is a parent who wants to do
this with their own kid on a Saturday. Almost none of the document should be
about code. It should be about **how we worked**: how we got ideas out of the
kids, how those ideas turned into things on screen, and what we learned about
running the process.

Keep the technology to a single short paragraph near the end. The interesting
story is the collaboration.

---

## 1. What the project was, and how we worked

We took an existing open-source browser game and turned it into the kids' own
game over a single long session.

The premise was entirely theirs: **it's Halloween night, your alien costume is
so convincing that the whole cul-de-sac thinks a real alien got loose, and the
only way out is straight through everybody.** They named it **Nice Costume**.

The working arrangement, which is the thing worth copying:

- **The kids talked. I typed.** I relayed what they said almost word for word,
  including when it was vague. Claude did not get clean specifications and it
  did not need them.
- **Claude built and explained back in one sentence.** A house-rules file told
  it who it was really working for: two 9-year-olds, explain every change in
  one sentence a 9-year-old understands, never show them code, never break the
  game, commit and push after every change that works.
- **Every change was live in about a minute.** That loop — say it, see it,
  react to it — is what held their attention for hours.
- **The kids were the testers.** They found things I did not. One of them
  spotted that a boss was teleporting onto the player within a minute of
  playing, after the change had already been declared working.

## 2. The questions we asked the kids

Most of the good material came from asking, not waiting for inspiration.
Please make this a real section, because it is the most copyable part.

What worked:

- **Closed questions with options beat open ones.** Not "what should the
  power-up be?" but "should the doorbell give you a random power-up, or should
  it call a neighbour over?" They answer instantly and confidently.
- **Ask for families, not items.** Instead of "what enemies do you want?" we
  asked what *groups* were out there. That produced "mom book club, dad pack,
  neighbourhood bullies, ferocious pets" — which is a whole roster, not one
  idea.
- **Ask what happens when, not how it works.** "What happens when the bully
  catches you?" got "he takes your candy back." That is a complete mechanic in
  a child's sentence.
- **Ask them to name things.** Naming is the part kids love most. Every boss
  in the final game has a name they invented.
- **Ask for the feeling, then translate.** For music: "upbeat, silly, chase"
  is a direction. They should never be asked about tempo or instruments.
- **Come back with numbers and ask if it feels right.** "Is a boss at one
  minute too early?" "Are upgrades coming too slowly now?" They have strong,
  reliable opinions about pacing even though they cannot express it in
  numbers.
- **Ask permission to decide.** A few times the honest answer was "I need a
  decision here or I'll guess." Sometimes they said "you choose" — and that is
  a useful answer too.

## 3. Where we started vs where we ended

Please present this as a clear before/after. The numbers are real:

| | Before (the fork) | After (one session) |
|---|---|---|
| Name | *Survivor — Open Source Roguelite* | **Nice Costume** |
| Enemies | 11 | 35 |
| Bosses | 5 | 9 |
| Levels | 3 | 6 |
| Character artwork | none — everything was coloured circles | 63 hand-drawn pixel characters |
| Costumes to play as | none | 8, including a secret |
| Commits | — | 42, each deployed live |

Before, the enemies were Bat, Zombie, Skeleton, Cultist, Golem. The levels
were Whisperwood, Sunken Crypt, Frozen Tundra. It was a competent, generic
vampire game.

After, the enemies are Flashlight Dad, Robe Mom, Nightgown Grandma, the Egg
Thrower, Pitchy-Patchy and the Walking Cactus. The levels are a cul-de-sac, a
haunted house interior, Area 51, Jamaica, a robot junkyard and a desert
valley. The bosses include Lil Timmy, Robot Rob and Big G.

Make the point that **the biggest single change was the art**: the original
game drew everything as circles. When the kids said "make them look like
things," that one sentence produced 63 characters and changed the entire feel
of the project.

## 4. The kinds of input they gave, and how a level got made

The inputs came in wildly different forms, and all of them worked:

- **A written wish-list.** They dictated a document renaming every enemy,
  boss, weapon, level and upgrade. That became the spine of the whole reskin.
- **A photo of a colour palette** they liked, which became the game's look.
- **A drawn character sheet** — three dads, three mums, three pets, two
  grandmas, bullies — which became the full roster.
- **One-line reactions while playing:** "the dog doesn't look enough like a
  dog and it's giant", "the bosses are too big", "there's weird red text".
- **Bug reports in their own words:** "I press send and it's never going on
  the leaderboard." (It *was* saving — they just couldn't see themselves on
  the board. The fix was showing them where they landed.)
- **Themselves.** Two characters are named after the kids: a skateboarder with
  a blue streak in his hair, and an animator who became a boss.
- **A secret they invented,** with precise rules: type three particular
  letters into the scoreboard and you get a one-round costume that one-hits
  everything.
- **Numbers they picked** that I pushed back on. They wanted a costume
  unlocked at 100 points; testing showed a single run scores 600. We raised it
  so it felt earned.

Then explain **how a level actually got built from "I want a desert level"**,
because this is the repeatable bit. Each new level got the same five things:

1. **Its own look** — the buildings change. Houses became caves in the desert,
   crushed cars in the junkyard, rooms with a carpet runner in the haunted
   house.
2. **Its own locals** — two or three characters that only live there.
3. **Its own music.**
4. **Its own boss.**
5. **Sometimes its own pickups** — food in Jamaica, screws in the junkyard.

Once the first level was built that way, "add a desert with cacti, vultures
and snakes" was a short, predictable job rather than a big one.

Also cover **doing someone else's culture with care**: when they asked for a
Jamaica level, rather than reaching for clichés we used real food, the actual
flag, the Jamaican word *duppy* for a ghost, and Jonkonnu masquerade
characters — a real costume tradition that happened to fit a game about
costumes perfectly. Getting that right took ten extra minutes and made the
level the best one in the game.

## 5. The process others can follow

End with practical guidance:

- **Start from something that already runs.** Fork a working game. The kids
  never sat and watched nothing happen.
- **Write the house rules down first.** One file telling the AI who it is
  working for changed every response for the whole session. Include it as a
  copyable example.
- **Deploy continuously from minute one.** The magic is a child saying
  something and playing it before they get bored.
- **Let them test.** Kids are merciless and fast, and they report what they
  *saw*, which is exactly what is useful.
- **Watch the thing, don't read about it.** Repeatedly, something was reported
  as working and was visibly wrong when actually played. Trust the screen.
- **Use their own data to decide what matters.** Their scoreboard showed
  typical games lasting two minutes, while every boss appeared after four.
  They had never met most of the characters we had built. Moving the bosses
  earlier was worth more than any new feature.
- **Be honest with them when it breaks.** They were completely unbothered by
  bugs and genuinely interested in why.
- **Expect to be wrong about difficulty.** We made it harder, then too hard,
  then eased it back, three times, purely on their reactions.

## Format

Headings, short sections, plain language. Include the before/after table and
the house-rules example. Write it so a parent who has never done this could
sit down with their kid this weekend and have something playable on screen in
the first half hour. Around 1,200–1,600 words.
