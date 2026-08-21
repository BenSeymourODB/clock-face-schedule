# CLAUDE.md

An analog dial whose outer band carries one coloured arc per calendar event, built as a Google Apps
Script web app. It is a **visual aid for tracking time**, aimed at classrooms and wall displays and
particularly at people who find clock arithmetic hard. That audience is not decoration on the README
— it decides arguments. When a change makes the dial prettier but needs a second glance to read, the
second glance wins the argument and the change loses.

`README.md` has the purpose, `docs/DESIGN.md` the ADRs and platform limits, `docs/brainstorms/` the
open design reasoning, and `.claude/commands/` the agentic workflows.

## Quality gate

```bash
npm run build        # esbuild bundles both entry points and generates the server footer
npm run check-types  # both tsconfigs — catches ES2019 violations and the shared/ split
npm test             # vitest: node for shared/ + server/, jsdom for client/, node for scripts/
```

All three must pass before a commit. `npm run push` deploys via clasp.

## Measure before you assert

**The single most valuable habit in this repo.** A claim about geometry, contrast or legibility is
not credible until it is computed, and `node -e` takes under a minute. Claims made without it have
been wrong often enough to be untrustworthy by default — including several confident ones:

| Claim | What computing it showed |
| --- | --- |
| "Exact one-minute timer bands and second-hand alignment are mutually exclusive" | False. They are simultaneously satisfiable — the error was assuming the band seam must sit at twelve o'clock. |
| "Mid-ramp colours clear contrast in both themes, so no theme-swapping is needed" | True at 3:1, false at 4.5:1. Nothing on either ramp straddles the real threshold. |
| "Push the labels further out to stop them overlapping" | Restoring 40 units of radius buys 1.9° of separation — under four minutes of dial time. Useless for that purpose. |
| "An elliptical label locus helps most where the frame is tightest (3 and 9 o'clock)" | The opposite: +78% separation at 12 and 6, **0%** at 3 and 9. |
| "Pushing labels outward is monotonically better" | It has an optimum. Usable width peaks at a 350-unit locus and falls away sharply past it. |

Three of those reversed a recommendation. The cost of checking is a minute; the cost of not checking
is a design built on a false premise.

The same discipline is what makes **pushback land**. Every objection that changed a decision here
carried a number — "the hour hand is 130.8 units against a timer wanting 130, so it is entirely
hidden"; "⚫ measures 1.21:1, which is not a faint edge but no edge"; "nine of Google's eleven colours
fail on white"; "at 330° the band wraps at every time of day". Unquantified concerns get waved past,
and they deserve to be.

## Render before you believe it works

**Tests do not catch legibility.** Every visual defect this project has had passed a full green
suite:

- White arc titles measuring **1.9:1 on yellow** — invisible to 217 passing tests
- A three-deep overlap cluster thinning *every* arc on the dial, hours away and uninvolved
- An emoji overlapping a two-line title by 8.7 units
- Two-line titles reading bottom-up on the lower half of the dial
- A floating label lying across the numerals and the hands
- A 0.38-unit hairline of the elapsed outline painted straight through the mask built to hide it, on
  the side of the arc that has not happened yet — and 1.66 units on a four-deep ring, wider than the
  whole separator beside it
- An elapsed arc's outline at 1.56 units — **thinner than the live separator it replaced** — because
  it was sized from the ring rather than the band

That last one is the sharpest lesson: the test written alongside it asserted `elapsed > live × 2`
and passed, because it used a full-band arc. **A test can encode the same wrong assumption as the
code.** Rendering is what breaks the tie.

**A state that depends on the time is not a state you have to wait for.** `?now=04:15&freeze=1`
pins the dial's clock, on the preview and the deployed app alike; README has the parameters and a
table of which times show which fixture states. The fixture is anchored to the window's own start,
so every event's offset from `now` is a constant: the arc set and every arc's *state* are the same at
any time of day. It does carry one draining arc (🟡 Tidy Up and Line Up, added with #71's fix), so an
unpinned look is no longer blind to the drain the way it was when a drain that never drained shipped
through two releases. But that arc is inside the four-deep cluster, drawn on a 15.56-unit ring
against a lone arc's 75.92, so anything about a drain's *own* geometry wants `?now=04:15` where one
is drawn clear of the cluster.

**The states are invariant; the picture is not, and conflating the two cost a review** (#153). The
angle origin is the period's start, so the dial rotates continuously and title overflow follows
angular position — the frame is tightest at 3 and 9. Measured across pins, the fixture draws five
floating labels at `?now=03:00`, four at `04:15`, three at `08:30`, and **unpinned the set drifts
minute to minute as the dial turns.** So an unpinned screenshot of a card collision is not
reproducible, including by you: judge label placement and crowding on a pinned dial and name the pin.
The *drain* set is no longer among the things that drift: the load frame used to carry **two** drains
for about a second, because 🔴 Deadline ends exactly on the anchor boundary and the anchor was read
after the clock the first frame drew with, and #152 made both reads one. So the arc a screenshot
catches mid-drain is the same at 150 ms as at 2 s — but only *because* one instant now feeds the dial
and the fixture, and a second `now()` read anywhere on the way up brings it back.

**Every preview dial is one line of text smaller than the board's** (#115). The dial is sized from
the display now, so a notice no longer changes its *width* — but it is still a grid row, and demo
mode posts one of its own ("Sample events — not a real calendar") whether or not you pin. So the
preview draws 807.9 px against a healthy board's 922.3 at 1920×1080, about 12% down, in *every*
state: pinning costs nothing further. Geometry and contrast are in viewBox units and unaffected —
judge them on a pinned screenshot as before — but check anything about *size* with `#status` hidden,
which is what a working board shows.

**Physical figures come from the dial's rendered size, which is 85.4% of the board's height** — the
rest is the frame floating labels paint into, sized in `Styles.html` from how far a card can reach
(#121 is the cheaper way to get it back). At 1920×1080 that is 1.5372 px per viewBox unit. Anything
quoted in millimetres has to be derated by that, not by the 600 px the dial used to render at.

So: for any change to rendered output, `npm run build`, serve `build/preview.html`, screenshot it,
and look. Query the DOM for the attributes you changed as a cross-check — but measurement confirms
what you intended, and screenshots find what you did not. Look at the neighbours of what you
changed, too; several of these were collisions with an adjacent element.

**When looking finds a defect, write the test that missed it.** Not "test harder" in general — one
targeted assertion capturing the specific property that was wrong.

## The fixture is the stress case

`src/client/sample-events.ts` drives `build/preview.html` and the deployed `?demo=1`. It deliberately
contains a four-deep cluster — as many rings as `maxRings` opens — carrying a two-line title on its
innermost ring and one-line titles beside it, an isolated arc beside the cluster, a ten-minute event
held open by the minimum span, an overflowing title, a two-line title carrying an emoji, an event
crossing each end of the period, an event **straddling `now`** so the drain is in the *default*
picture rather than a state a reviewer has to know to ask for (#71/#76 — this is the one whose
absence let masks that drained nothing ship through two releases), and a `⚫` event whose colour
measures **1.21:1** on the dial background. Add to it when your change has a stress case none of
those covers; do not quietly make it easier.

A demo mode that ships to production was a deliberate call: legibility has to be judged on the smart
board, and waiting for someone's real day to contain a useful overlap is not a plan.

## Platform facts that cost real time

- **The generated server footer is structurally required.** `google.script.run`'s method list comes
  from a *static scan of top-level function declarations*, so a `globalThis` assignment is invisible
  to it. Omitting a footer entry fails silently in the browser — which is why the footer is derived
  from the bundle's export list rather than hand-maintained.
- **esbuild only reports exports for `esm` output**, so the build runs a throwaway in-memory `esm`
  pass beside the real IIFE one purely to harvest them.
- **The origin rotates between sessions.** That one fact kills service workers, the Notification API,
  *and* cookies/`localStorage`. Preferences belong in `PropertiesService`; `doGet` can template them
  into the page so reads cost no round trip.
- **Target is ES2019.** No `matchAll`, no `replaceAll`. `check-types` catches it.
- **`GoogleAppsScript.Base.Date` is not a `Date`.** Coerce at the boundary with
  `new Date(x.getTime())` so `map-event.ts` stays free of host types and runnable in node.
- **clasp 3 dropped `--type webapp`** while `--help` still advertises it; use `standalone`.
- **`npm run push` passes `--force`** because the Apps Script UI writes back to `appsscript.json`.
  Without it, a scripted push silently uploads nothing and exits 0.

## Conventions

- **Comments explain decisions, not code.** If a plain reading of the name says it, delete the
  comment. Mention a road not taken only if a later coder would try it.
- **Evidence and decision logs go in issues and PRs**, as reader-opt-in `<details>` blocks — not in
  source. Source comments are read by everyone forever; rationale is read once, by a reviewer.
- **Brainstorms are written to be picked up cold.** State the constraints any answer must keep, name
  what is still undecided, and record what was rejected and why.
- **Issues state their readiness explicitly** — "fully implementable as specified" or "not ready to
  build" with the open decisions listed. `/implement-issue` triages on that line.
- **A plan's status header must still be true after its own PR merges.** Three states, checked by
  `scripts/plan-status.test.mjs`: `done` — write `done — shipped in #NN` in the shipping PR, once its
  number exists — or `in progress` / `superseded`, each **naming the issue or PR** that says what is
  outstanding or what replaced it. `in review` is retired: it means a PR is open, and the merge that
  ends the review is the one edit that PR cannot make to itself, so 20 of the first 24 plans landed
  on `main` needing a later correction (#111). `npm run check-plans` reports it offline; `npm test`
  gates it.
- **SVG attribute names are the real ones** — `stroke-width`, not `strokeWidth`. A camelCase name is
  not an error; it sets an attribute nothing reads, and the element renders unstyled with nothing
  logged. Specs assert on rendered attribute names for this reason.

## Environment notes (Windows)

- **Python file I/O needs `encoding="utf-8"` explicitly.** The default is cp1252 here, and it has
  silently mangled em-dashes in committed source more than once. Round-trip with
  `read_text(encoding="utf-8")` / `write_text(..., encoding="utf-8")`.
- **Long markdown in a bash heredoc breaks the tool's parser.** Write files with the Write tool or a
  script; use heredocs only for short bodies.
- **Multi-line commit messages: `git commit -F <file>`.** PowerShell here-strings do not pipe into
  `git commit -F -` reliably.
- **Scratch artefacts belong in the scratchpad**, not the parent directory. A stray screenshot once
  sat outside the repo where `git status` could not see it.
