# Stop a hand's halo erasing the numeral the hand is pointing at

**Status:** done — shipped in [#182](https://github.com/BenSeymourODB/clock-face-schedule/pull/182)
**Issue:** [#112](https://github.com/BenSeymourODB/clock-face-schedule/issues/112)
**Docs:** #107 / #113 (the same defect on the AM/PM indicator, and the halo mechanism this plan
declines to reuse), #44 (why the hands carry a halo at all), #34 (the quiet hand, and the 1-hour
scale's second numeral ring), ADR 0009 (the millimetre scale every physical figure here derates by)

## What #112 asked for, and what the look found

The build half of #112 was settled on the issue thread before this plan: **do not halo the
numerals.** Twelve more elements per rebuild, twelve more `textContent` writes on the 1-hour ring,
and — the real objection — every hand visibly interrupted wherever it crosses the numeral ring,
which is most of the time rather than the hour a day #107's indicator was affected for. Decision 4
stays recorded as a trap: drawing the numerals *after* the hands with no halo puts
`--card-foreground` on `--card-foreground` at 1:1 and the numeral vanishes into the hand.

What remained was **one look** — `?now=18:30&freeze=1` at 1×, at the dial's current post-#115/#120
size — and the instruction attached to it: *"If it reads as damage, this reopens as a build."*

It reads as damage. Measured on the built preview at 1920×1080, sampling the rendered raster at 4×
supersample over the twelve pins where the minute hand points straight at a numeral, and comparing
each numeral's ink against the same dial with the hands hidden:

| pin | numeral | ink erased back to `--card` |
| --- | --- | --- |
| 18:30 | 6 | **31.3%** |
| 17:25 | 5 | 25.8% |
| 16:20 | 4 | 25.2% |
| 13:05 | 1 | 23.1% |
| 22:50 | 10 | 18.1% |
| 14:10 | 2 | 15.4% |
| 20:40 | 8 | 14.3% |
| 21:45 | 9 | 14.0% |
| 23:55 | 11 | 11.8% |
| 15:15 | 3 | 11.4% |
| 19:35 | 7 | 10.1% |
| 12:00 | 12 | 7.5% |
| **all twelve** | | **16.4%** |

The percentage understates it, and the render is what says so. The erasure is not a bite out of one
edge — it is a `var(--card)` stripe 4.09 units wide (2.04 either side of the hand's own line)
straight through the glyph's middle, so what is left is **detached**. At 18:30 the "6" renders as
three disconnected white shapes; at 13:05 the "1" renders as two specks that read as debris on the
face; at 19:35 the "7" keeps its crossbar and nothing else, floating clear of the hand as a stray
tick. The low percentages are the worst cases visually, not the mildest — a glyph the hand runs
*along* loses its stroke and keeps only the fragment that identifies nothing.

## The fix, and why it is not #107's

#107's mechanism — a duplicate glyph filled and stroked in `var(--card)`, the pair mounted last —
solves this by putting the numerals *above* the hands. That is what the issue thread priced and
rejected.

There is a cheaper answer neither the issue nor its decision comment lists, and it costs no new
elements at all: **mount the numerals between the halos and the hands' own lines.**

`clock-face.ts` appends each numeral inside the same loop as its hour marker, so the numerals sit
underneath everything that follows — including `hourHalo` and `minuteHalo`, which are `var(--card)`
and paint over whatever is beneath them. Collecting the numerals into a `hour-numerals` group and
appending that group after the halos and before the hands changes exactly one relationship:

- **The halo can no longer erase a numeral.** The numeral repaints over it. Measured the same way:
  16.4% → **0.0%** across all twelve pins.
- **The hand still paints over the numeral**, so the pointer stays unbroken, keeps its full colour
  and stays on top. Nothing about the hands changes.
- **The numeral's remaining ink abuts the hand** instead of standing 2.04 units clear of it. That
  is the reading a mechanical clock has, and it is the reading #112 named as the acceptable one.

What it gives up is the halo's separation *at the crossing*. That separation is what the halo exists
for — but its own docstring says the job is holding a hand off "anything drawn on the face", and on
the face there is nothing else: the arcs are a different layer, outside the face radius. Under the
numerals the halo had nothing to separate and was destroying the thing it crossed.

The residual cost is where hand and numeral share a colour. On the 12-hour dial the crossing hand is
the minute hand, which is `--muted-foreground` (#34's quiet hand), so the boundary is a real edge.
On the 1-hour dial the minute hand is the emphasised one and the outer ring is `--card-foreground`
too, so the two merge — rendered, the hand passes between the digits of a two-digit value and reads
as one continuous line with both digits whole. The 1-hour scale's *inner* ring is
`--muted-foreground` and its own hour hand tips at 87.9, seven units inside that ring's ink at 95.0,
so the grey-on-grey pairing #112's decision 3 worried about never arises.

## Scope held

- **The hour markers stay where they are.** A hand only reaches the marker annulus (0.84–0.96) at
  angles near its own, so a marker is erased only when the hand is lying along it — and there the
  hand *is* the mark. A numeral is the opposite: it carries something the hand does not.
- **The AM/PM indicator is untouched.** It keeps its own halo and still mounts last, above
  everything including the numerals.
- **`HAND_HALO_RATIO` does not move.** The halo is still correct for what it was sized against.

## Tests

Two, both at the level the defect lived at, since 1,662 tests were green through it:

1. **Paint order** — every `hour-number-*` (and, on the 1-hour scale, every `hour-number-inner-*`)
   is later in document order than every hand halo and earlier than every hand's own line. Both
   scales.
2. **Over the whole day, not one sampled hour** — sweeping every minute of the day, any halo whose
   swept rectangle covers a numeral's glyph box must be earlier than that numeral, with a floor on
   the number of crossings found so the assertion cannot pass by never firing. This mirrors the
   sweep #107 landed for the indicator, and reuses its `glyphBox` / `haloCoversBox` helpers.

## Verify by rendering

`?now=18:30&freeze=1` for the "6", `?now=13:05` for the "1", `?now=19:35` for the "7" — the three
the raster measurement flags — plus `?scale=1h&now=04:35&freeze=1` for the emphasised hand over a
two-digit value and for the inner ring beneath it.
