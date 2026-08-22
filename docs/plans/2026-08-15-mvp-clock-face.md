# MVP — clock-face schedule dial on Apps Script

**Status:** in progress — W1–W9 shipped ([#1](https://github.com/BenSeymourODB/clock-face-schedule/issues/1)–[#9](https://github.com/BenSeymourODB/clock-face-schedule/issues/9) closed); W10 outstanding as [#10](https://github.com/BenSeymourODB/clock-face-schedule/issues/10)
**Issue:** [#1](https://github.com/BenSeymourODB/clock-face-schedule/issues/1)–[#10](https://github.com/BenSeymourODB/clock-face-schedule/issues/10) — W1–W10, one issue per work item below
**Docs:** [../DESIGN.md](../DESIGN.md) (the architecture this breaks down), [../../README.md](../../README.md)
**Date:** 2026-08-15
**Goal:** an analog dial on a wall display showing today's current 12-hour period from **one**
Google Calendar, at full visual parity with what `next-digital-wall-calendar` shipped.

Architecture and the reasoning behind it are in [../DESIGN.md](../DESIGN.md). This document is
the work breakdown.

## In scope

Everything NDWC shipped for the dial:

- Clock face — ticks, numerals, hour/minute hands, AM/PM indicator
- One donut arc per timed event, positioned by start/end time across the 12-hour period
- Colour from a colour-dot emoji prefix (`🔴 Deadline`), falling back to the event's own colour
- Event emoji rendered on the arc (`🟢 🎮 Family Game Night` → green arc carrying 🎮)
- Curved title along the arc via `textPath`, wrapping to two lines on arcs ≥ 30°
- Concentric ring stacking for overlapping events
- Floating off-arc labels with connector lines for titles that overflow their arc
- Live tick, 5-minute event polling, AM→PM rollover

## Out of scope for MVP

- Multiple calendars, and the calendar-selection contract that implies
- All-day events aside (they cannot be drawn on the dial; `filterEventsForPeriod` drops them)
- Click-to-open event detail — the dial lands read-only, `role="img"`
- Upcoming-events list and time-remaining countdown
- Event creation or editing

## Target layout

```
src/
  shared/clock/         # lifted verbatim from yuvomi-kiosk ff18a19 — no framework, no host API
    clock-utils.ts  fit-title.ts  arc-title-layout.ts  ring-layout.ts
    text-arc.ts     rect-edge.ts  clamp-label.ts       types.ts  index.ts
  server/               # bundles to build/Code.gs — the only code that may touch Apps Script APIs
    main.ts             # doGet, include()
    calendar.ts         # CalendarApp fetch + CacheService
    map-event.ts        # pure: CalendarApp.CalendarEvent → ClockEventInput
  client/               # bundles to build/Client.html
    main.ts             # bootstrap, tick loop, polling, failure states
    svg.ts              # svg(tag, attrs, children) helper
    render/
      clock-face.ts  event-arc.ts  floating-label.ts  analog-clock.ts
static/                 # copied into build/ unmodified
  appsscript.json  Index.html  Styles.html
build/                  # generated; clasp rootDir; gitignored
```

The `shared/` ↔ `server/` boundary is load-bearing: nothing under `shared/` may reference an
Apps Script global, so the whole geometry layer stays runnable under vitest in node.

---

## Work items

Ordered. W1 gates everything; W2 and W3 are then independent of each other.

### W1 — Scaffold: build, test, and push pipeline

Stand up the loop before writing any dial code, so every later item lands on a working push.

- `package.json`, `tsconfig.json` (strict), vitest config with a node-environment project for
  `shared/` + `server/` and a jsdom project for `client/`
- esbuild script producing `build/Code.gs` (IIFE + entry-point footer) and `build/Client.html`
  (IIFE wrapped in `<script>`), plus a copy step for `static/`
- `@google/clasp` v3 as a dev dependency; `.clasp.json` from the example; `clasp login`
- `static/appsscript.json` — V8 runtime, household `timeZone`, `webapp` block, and the
  `https://www.googleapis.com/auth/calendar.readonly` scope
- A `doGet` returning "hello", pushed and opened in a browser

**Done when:** `npm run build && npx clasp push` puts a reachable page on a web app URL, and
`npm test` runs green with zero specs.

**Resolves:** the ADR 0002 open question about whether entry points survive the IIFE bundle.
Find out here, where the answer is cheap, not in W8.

### W2 — Lift the pure geometry layer

Copy the eight modules and their four specs from `yuvomi-kiosk` `ff18a19`
(`src/lib/clock/`) into `src/shared/clock/`. This is the 526 LOC that transfers verbatim.

- Copy modules and specs; adjust import paths only
- Add direct specs for `ring-layout`, `text-arc`, and `rect-edge` if the copied set is missing
  any (yuvomi-kiosk added these when extracting them from NDWC's components)
- Correct `ring-layout.ts`'s docstring: first-fit in start order is optimal in ring count, not
  merely "greedy rather than optimal" (see DESIGN.md)
- Strip residual Svelte/Yuvomi references from comments

**Done when:** `npm test` runs the full inherited suite green with no source edits beyond
imports and comments.

### W3 — Server calendar adapter

Split so the interesting half is pure and testable.

- `map-event.ts` — pure. Takes the fields read off a `CalendarApp.CalendarEvent` and returns
  `ClockEventInput`. Owns the Google-palette ordinal→hex table and the fallback chain:
  event colour → calendar colour → a hard default.
- `calendar.ts` — thin. `CalendarApp.getCalendarById(...)`, `getEvents(periodStart, periodEnd)`,
  map, and memoise in `CacheService.getUserCache()` for 60 s (ADR 0006).
- Timestamps serialised as ISO-8601 **with offset** (ADR 0005)
- Calendar id read from `PropertiesService.getScriptProperties()`, defaulting to the owner's
  default calendar, so the id is not committed

**Done when:** `map-event.ts` has vitest coverage over the colour fallback chain, all-day
flagging, and offset formatting; `getEvents()` returns a sane payload from the deployed script.

### W4 — SVG helper and clock face

- `svg.ts` — `svg(tag, attrs, children)` over `createElementNS`, so builders read close to the
  TSX they replace
- `render/clock-face.ts` — port of NDWC `clock-face.tsx`: minute ticks, hour markers with
  quarter emphasis, numerals, AM/PM, hour/minute hands, centre dot
- `static/Styles.html` — define `--card`, `--border`, `--card-foreground`, `--muted-foreground`,
  `--destructive` (ADR 0007), dark wall-display palette

**Done when:** the dial renders standing still at a fixed time, under jsdom in a spec and on
the deployed page.

### W5 — Event arc

Port of NDWC `event-arc.tsx`. The densest single item.

- Donut arc via `describeArc`, filled at 0.85 opacity with a `var(--card)` separator stroke
- Emoji at `innerRadius + arcHeight × 0.28`, counter-rotated on the bottom half
- Curved title via `<textPath>` against `describeTextArc` paths, one `<text>` per line, up to
  two lines at `titleRadius ± fontSize × 0.55`
- Visibility gates: emoji at ≥ 10° span, in-arc title at ≥ 20°
- Accepts a precomputed `ArcTitleLayout` so it and the floating label cannot disagree about
  overflow
- Lands read-only: `role="img"`, no click handler, no `tabIndex`

### W6 — Floating label

Port of NDWC `floating-label.tsx`. Independent of W5; both need W4's token set.

- Label centre on a circle at `outerRadius + arcThickness × 0.6`, vertically clamped by
  `clampLabelPosition` so overflow labels never grow the layout box
- Connector line from the arc's outer midpoint to the label rect edge via `rectEdgeIntersection`
- Rounded rect + centred text, stroked in the event colour

### W7 — Dial orchestration and tick

Port of NDWC `analog-clock.tsx` — the piece that binds W4–W6.

- Resolve period bounds, filter, and convert raw events to `ClockEvent`s
- Ring assignment; split the band into `ringCount` rings with gaps
- Compute `ArcTitleLayout` once per event; route overflowing titles (`didOverflow` **and**
  span ≥ 10°) to floating labels and suppress their in-arc titles
- Layer order: arcs → floating labels → clock face
- Tick: rebuild on data change or period rollover; between rebuilds mutate only the hands'
  `transform` (ADR 0004)

**Done when:** a fixture payload renders a dial matching NDWC's output structurally, including
a deliberate overlap and a deliberate overflow.

### W8 — Page shell and client bootstrap

- `static/Index.html` — page shell, SVG mount, `<?!= include('Styles') ?>` and
  `<?!= include('Client') ?>`
- Promise wrapper around `google.script.run` (it is callback-based)
- Poll every 5 minutes and on rollover
- Failure states: keep the last good payload and mark it visibly stale rather than blanking the
  dial; render an empty dial, not an error, when the period simply has no events

**Done when:** the deployed web app shows live calendar events and keeps correct time unattended
overnight, including across the noon and midnight rollovers.

### W9 — Density fixes for a single busy calendar

The two gaps identified in DESIGN.md. Deliberately after W7, so the fix is measured against a
dial that renders.

- **Decouple ring assignment from arc widening.** Assign rings from true event times; use
  `MIN_ARC_DEGREES`-widened angles only for drawing. Removes phantom rings caused by short
  back-to-back events.
- **Cap ring count.** Below a minimum workable ring thickness, stop opening rings and give the
  innermost ring an overflow treatment (a count, or a collapsed marker) instead of rendering
  arcs too thin to carry an emoji.

Both changes live in `shared/clock/`, so both are specified as pure-function tests first.

### W10 — Wall deployment

- Decide the deployment mode (execute-as / access) — an open question in DESIGN.md
- Chromium kiosk flags, sleep inhibition, boot-to-app on the display device
- A note on re-authorising after the Apps Script token lapses, which is the predictable
  unattended failure

---

## Sequencing

```
W1 ──┬── W2 ──┬── W4 ──┬── W5 ──┐
     │        │        │        ├── W7 ── W8 ── W10
     │        │        └── W6 ──┘         │
     └── W3 ─────────────────────────────-┘
                                W7 ── W9
```

W2 and W3 can run in parallel once W1 lands. W5 and W6 can run in parallel once W4 establishes
the token set. W9 is independent of W8 and needs only W7.

## Risks

- **Emoji rendering on the display device.** The dial leans on colour-dot and event emoji. A
  Raspberry Pi Chromium build without a colour emoji font renders tofu, and nothing in the code
  will indicate why. Check the font stack on the target device early — ideally during W1, when a
  hello-world page can carry a test string at no cost.
- **`textPath` support in the HtmlService iframe.** Expected to be fine — it is standard SVG in
  a normal browser context — but the iframe sandbox is the one part of this stack neither
  predecessor exercised. W4 confirms it.
- **`google.script.run` latency.** If a round trip is slow enough to be visible, the 60-second
  server cache (ADR 0006) covers reloads but not the first paint. Rendering the dial and hands
  before events arrive, then filling arcs in, avoids a blank wall during startup.
- **Sparse-to-dense assumption.** Every layout constant inherited here — arc thickness, font
  ratios, the 10°/20°/30° gates — was tuned against NDWC's aggregated calendars. A single
  personal calendar has a different density profile, and W9 may turn out to be a re-tune rather
  than the two discrete fixes it is scoped as.
