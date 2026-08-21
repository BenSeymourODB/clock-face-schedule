/**
 * README's pin table, read back off the arcs the dial actually draws (#104).
 *
 * The sibling guard in `clock-pin.test.ts` links README's *numeric* fixture figures to the fixture.
 * This is the other duplicated paragraph, and the more load-bearing one: the counts tell a reader
 * the dial empties in the afternoon, but the pin table is the map a reviewer uses to reach a state
 * at all — `CLAUDE.md` sends them to it by name. A wrong row sends them to a pin that does not show
 * what they came to look at, and they cannot tell that from a fixture that changed. Two rows had
 * been wrong for a month when #104 was filed: #67 added a fourth member to the cluster and both
 * rows went on calling it three-deep.
 *
 * The cells are prose, parsed — the approach #103 took, with the objection to it answered rather
 * than accepted. "Still live", "elapsed beside it" and "running past the window's end" are three
 * vocabularies for a state, so the cells were first rewritten against one: `live` / `draining` /
 * `elapsed` / `clamped`, each of which is a property of the rendered arc rather than a description
 * of it.
 *
 * Read through `?raw` rather than `node:fs`, for the reason `raw.d.ts` gives.
 */
import { describe, expect, it } from "vitest";
import readme from "../../README.md?raw";
import {
  angleForTime,
  assignRings,
  dialOrigin,
  dialScale,
  dialWindow,
  eventsToClockEvents,
  filterEventsForPeriod,
} from "../shared/clock";
import { fixtureAnchor, readClockPin } from "./clock-pin";
import { analogClock } from "./render/analog-clock";
import { TWELVE_HOUR_FIXTURE, recurringSampleEvents, sampleEvents } from "./sample-events";

/**
 * When the page is loaded, for a pinned dial. Arbitrary and load-bearing at once: every row below
 * is a claim about a *displaced* pin, which re-anchors the fixture to that pin's own midnight, so
 * the wall clock at load may not change a single one of them.
 */
const AT = new Date(2026, 7, 18, 14, 37);

/** The three temporal states, which are what the separator and the elapsed outline encode. */
type Temporal = "live" | "draining" | "elapsed";

/** Which end of the window cut an arc off, if either. */
type Edge = "leading" | "trailing";

/**
 * The vocabulary the cells are written in. The legend table in README names exactly these, which is
 * asserted below — a parser and a legend that drift apart would leave a reader following a rule the
 * guard does not check.
 */
const VOCABULARY = ["live", "draining", "elapsed", "clamped"] as const;

/** Written out in the prose the counts sentence uses, so the sentence stays readable English. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

// ---------------------------------------------------------------------------------------------
// What the dial draws
// ---------------------------------------------------------------------------------------------

function dialHost(): HTMLElement {
  const element = document.createElement("div");
  element.id = "dial";
  return element;
}

interface ArcState {
  temporal: Temporal;
  /** The window edges this arc fades at — a clamp is orthogonal to the three temporal states. */
  edges: Edge[];
}

interface DrawnDial {
  /** Rendered state per event id, `d@1` included: the recurring fixture's copies reach the DOM. */
  states: Map<string, ArcState>;
  /** Event ids the dial assigns to a cluster of each depth. */
  clusters: Map<number, Set<string>>;
}

/**
 * Render the demo dial at a pin and read every arc's state back out of it.
 *
 * The states come from the DOM rather than from the event times, which is the whole point: an event
 * finishing and an arc *drawn* as finished are two facts, and every legibility defect this repo has
 * had lived in the gap between them. `event-arc.ts` draws the separator while an event is not
 * elapsed and the elapsed outline once it is elapsed **or** draining, so the pair is a partition.
 */
function drawAtPin(pinQuery: string, at = AT): DrawnDial {
  const pin = readClockPin(dialHost(), pinQuery, at);
  const now = pin ? pin.origin : at;
  const scale = dialScale("12h");
  const view = dialWindow(now, scale);
  const events = filterEventsForPeriod(
    recurringSampleEvents(TWELVE_HOUR_FIXTURE, fixtureAnchor(pin, now), view),
    view.windowStart,
    view.windowEnd
  );
  const root = analogClock({ events, time: now }).element;

  const states = new Map<string, ArcState>();
  for (const event of events) {
    const group = root.querySelector(`[data-testid="event-arc-group-${event.id}"]`);
    if (!group) continue;

    const separator = group.querySelector('[data-arc-part="separator"]') !== null;
    const outline = group.querySelector('[data-arc-part="outline"]') !== null;
    const gradients = [
      ...group.querySelectorAll(`mask[id="arc-fade-${event.id}"] linearGradient`),
    ].map((node) => node.getAttribute("id") ?? "");

    // Neither would mean an arc with no boundary treatment at all, which no branch of
    // `eventArc` produces — so it is a renderer change this guard should not paper over.
    if (!separator && !outline) {
      throw new Error(
        `${event.id} rendered with neither a separator nor an elapsed outline at ${pinQuery}, so ` +
          "its state cannot be read. `event-arc.ts` changed shape — update the reader above."
      );
    }

    const edges: Edge[] = [];
    if (gradients.some((id) => id.endsWith("-start"))) edges.push("leading");
    if (gradients.some((id) => id.endsWith("-end"))) edges.push("trailing");

    states.set(event.id, {
      temporal: separator && outline ? "draining" : outline ? "elapsed" : "live",
      edges,
    });
  }

  // The same call `analog-clock.ts` makes, on the same angles, rather than a second derivation of
  // the layout: what a cluster claim asserts is what the dial was told, not what a test recomputed.
  const periodStart = dialOrigin(now, scale);
  const resolved = eventsToClockEvents(
    events,
    periodStart,
    view.windowStart,
    view.windowEnd,
    scale.periodMinutes
  );
  const rings = assignRings(
    resolved.map((event) => ({
      id: event.id,
      startAngle: event.trueStartAngle,
      endAngle: event.trueEndAngle,
    })),
    angleForTime(view.windowStart, periodStart, scale.periodMinutes)
  );

  const clusters = new Map<number, Set<string>>();
  for (const [id, assignment] of rings) {
    const members = clusters.get(assignment.clusterDepth) ?? new Set<string>();
    members.add(id);
    clusters.set(assignment.clusterDepth, members);
  }

  return { states, clusters };
}

// ---------------------------------------------------------------------------------------------
// What README claims
// ---------------------------------------------------------------------------------------------

interface Claim {
  /** The subject as README writes it, for a failure message a reader can find in the file. */
  written: string;
  /** The rendered arc it resolves to, `@`-suffixed for a copy other than the first. */
  id: string;
  temporal?: Temporal;
  edge?: Edge;
  /** Whether the claim sits after a cluster phrase, which is how membership is stated. */
  inCluster: boolean;
}

interface ClusterClaim {
  depth: number;
  /** As written, so a failure names the phrase rather than a number. */
  written: string;
}

interface Row {
  pin: string;
  cell: string;
  claims: Claim[];
  cluster?: ClusterClaim;
}

/** Fixture titles, longest first, against the ids they reach the DOM as. */
const FIXTURE_TITLES: Array<[string, string]> = sampleEvents(new Date(2026, 7, 18))
  .map((event): [string, string] => [event.title.replace(/\s+/g, " ").trim(), event.id])
  .sort(([left], [right]) => right.length - left.length);

/**
 * Words a cell may put between a subject and its state. Deliberately short: anything not on it
 * fails to resolve and throws, which is the direction an unreadable cell should fail in.
 */
const CONNECTIVES = ["and", "with", "then", "is", "was", "already", "both", "all"];

/** Trailing prose between the name and the state word — including an earlier state of its own. */
function stripTrailingProse(text: string): string {
  const trailing = new RegExp(`(?:^|\\s)(?:${[...VOCABULARY, ...CONNECTIVES].join("|")})$`);
  let trimmed = text;

  for (;;) {
    const before = trimmed;
    trimmed = trimmed
      .replace(/[\s,;:.—–-]+$/, "")
      .replace(/\s+at the (?:leading|trailing) edge$/, "")
      .replace(trailing, "");
    if (trimmed === before) return trimmed;
  }
}

/**
 * The event a claim is about: the longest suffix of the text before the state word that prefixes
 * exactly one fixture title.
 *
 * A prefix rather than the whole title, so a cell can say `⚫ Staff Debrief` for
 * `⚫ Staff Debrief and Planning` and stay readable — and a *suffix* of the preceding text, so
 * ordinary prose may sit in front of a claim without the parser having to understand it. Longest
 * first, so the match is the intended name rather than a shorter accident inside it.
 *
 * Throws rather than skipping. A subject that resolves to nothing is the failure mode of the whole
 * exercise one level down: a guard that quietly matched nothing stays green while asserting
 * nothing, which is what let README go stale in the first place.
 */
function resolveSubject(before: string, pin: string): { written: string; id: string } {
  let text = stripTrailingProse(before);
  let copy = 0;

  const asCopy = /\(copy (-?\d+)\)$/.exec(text);
  if (asCopy) {
    copy = Number(asCopy[1]);
    text = stripTrailingProse(text.slice(0, asCopy.index));
  }

  const words = text.split(" ");
  for (let start = 0; start < words.length; start += 1) {
    const candidate = words.slice(start).join(" ");
    const matches = FIXTURE_TITLES.filter(([title]) => title.startsWith(candidate));

    if (matches.length === 1) {
      const [, id] = matches[0] as [string, string];
      return { written: candidate, id: copy === 0 ? id : `${id}@${copy}` };
    }
    if (matches.length > 1) {
      throw new Error(
        `README's ${pin} row names "${candidate}", which prefixes ${matches.length} fixture ` +
          `titles (${matches.map(([title]) => title).join(", ")}). Name enough of the title to ` +
          "pick one."
      );
    }
  }

  throw new Error(
    `README's ${pin} row makes a claim about "${text}", which is not the start of any event in ` +
      "`sample-events.ts`. Either the fixture's title moved or the cell names an event that is " +
      "not in it — a claim nothing can check is worse than no claim."
  );
}

function parseCell(cell: string, pin: string): { claims: Claim[]; cluster?: ClusterClaim } {
  // `[^:]*` lets the phrase carry a word of its own ("the four-deep cluster mid-drain:") without
  // reaching past the colon that opens the membership list.
  const clusterPhrase = /the ([a-z]+)-deep cluster\b[^:]*:/i.exec(cell);
  let cluster: ClusterClaim | undefined;

  // The near miss, found by mutating README: the 01:30 row read "The four-deep cluster mid-drain:"
  // against a pattern wanting `cluster:`, so the row carried no membership claim at all and
  // deleting a member from it stayed green. A phrase this guard cannot read has to say so.
  if (/cluster/i.test(cell) && clusterPhrase === null) {
    throw new Error(
      `README's ${pin} row mentions a cluster in a phrasing this guard cannot read. Write ` +
        "`the <number>-deep cluster[ …]:` followed by its members, so the depth and the membership " +
        "are both checked, or keep the word out of the cell."
    );
  }

  if (clusterPhrase) {
    const [written, word] = clusterPhrase as unknown as [string, string];
    const depth = NUMBER_WORDS[word.toLowerCase()];
    if (depth === undefined) {
      throw new Error(
        `README's ${pin} row says "${written}", and "${word}" is not a number this guard knows. ` +
          `Write one of ${Object.keys(NUMBER_WORDS).join(", ")}.`
      );
    }
    cluster = { depth, written };
  }

  const claims: Claim[] = [];
  const stated = new RegExp(`\\b(${VOCABULARY.join("|")})\\b`, "g");

  for (let found = stated.exec(cell); found; found = stated.exec(cell)) {
    const word = found[1] as string;
    const inCluster = clusterPhrase !== null && found.index > clusterPhrase.index;
    const subject = resolveSubject(cell.slice(0, found.index), pin);

    if (word !== "clamped") {
      claims.push({ ...subject, temporal: word as Temporal, inCluster });
      continue;
    }

    // Which end is half the claim: a bare "clamped" passes on an arc feathered at either edge, and
    // the two are different facts about the fixture — one says the event began before the window,
    // the other that it runs past it.
    const direction = /^ at the (leading|trailing) edge\b/.exec(cell.slice(found.index + word.length));
    if (!direction) {
      throw new Error(
        `README's ${pin} row says "${subject.written} clamped" without saying which edge. Write ` +
          "`clamped at the leading edge` or `clamped at the trailing edge`."
      );
    }
    claims.push({ ...subject, edge: direction[1] as Edge, inCluster });
  }

  return { claims, cluster };
}

/**
 * The rows of a markdown table, found by its header line.
 *
 * By header rather than by cell shape: README carries several tables, and a pattern loose enough to
 * find this one's rows anywhere would quietly start reading another table's.
 */
function tableRows(header: string): string[][] {
  const lines = readme.split("\n");
  const at = lines.indexOf(header);

  if (at < 0) {
    throw new Error(
      `README no longer carries the table headed \`${header}\`, so this guard is asserting ` +
        "nothing. Fix the header or restore the table."
    );
  }
  if (!(lines[at + 1] ?? "").trim().startsWith("| ---")) {
    throw new Error(`The line after \`${header}\` is not a markdown table rule.`);
  }

  const rows: string[][] = [];
  for (let index = at + 2; index < lines.length && (lines[index] ?? "").startsWith("|"); index += 1) {
    rows.push(
      (lines[index] as string)
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.replace(/[*`]/g, "").replace(/\s+/g, " ").trim())
    );
  }
  if (rows.length === 0) throw new Error(`The table headed \`${header}\` has no rows.`);

  return rows;
}

const PIN_TABLE_HEADER = "| `?now=` | What it shows |";
const LEGEND_HEADER = "| state | what the dial draws |";

const ROWS: Row[] = tableRows(PIN_TABLE_HEADER).map(([pin, cell]) => {
  const at = (pin ?? "").trim();

  if (!/^\d{2}:\d{2}$/.test(at)) {
    throw new Error(
      `README's pin table has a row whose first cell is "${at}" rather than a clock time, so a ` +
        "row is going unchecked."
    );
  }
  return { pin: at, cell: cell ?? "", ...parseCell(cell ?? "", at) };
});

// ---------------------------------------------------------------------------------------------
// The two put together
// ---------------------------------------------------------------------------------------------

/** Every way a row's cell disagrees with the dial, as prose — one entry per broken claim. */
function problemsWith(row: Row, dial: DrawnDial): string[] {
  const problems: string[] = [];

  for (const claim of row.claims) {
    const state = dial.states.get(claim.id);

    if (!state) {
      problems.push(
        `${claim.written} (${claim.id}) is not drawn at all — a pin the table sends a reviewer to ` +
          "for that event shows them nothing"
      );
      continue;
    }
    if (claim.temporal && state.temporal !== claim.temporal) {
      problems.push(
        `${claim.written} is claimed ${claim.temporal} and renders ${state.temporal}`
      );
    }
    if (claim.edge && !state.edges.includes(claim.edge)) {
      problems.push(
        `${claim.written} is claimed clamped at the ${claim.edge} edge and fades at ` +
          `${state.edges.length === 0 ? "neither end" : `the ${state.edges.join(" and ")} edge`}`
      );
    }
  }

  if (row.cluster) {
    const drawn = [...(dial.clusters.get(row.cluster.depth) ?? new Set<string>())].sort();
    const named = [...new Set(row.claims.filter((claim) => claim.inCluster).map((c) => c.id))].sort();

    // Membership, not just depth. #67's fourth member was an *absence* from the cell, which no
    // per-event claim can catch: every event the row named was in the state it claimed, and the
    // row was still wrong.
    if (drawn.join(",") !== named.join(",")) {
      problems.push(
        `"${row.cluster.written}" names ${named.length ? named.join(", ") : "nothing"} and the ` +
          `dial puts ${drawn.length ? drawn.join(", ") : "nothing"} in a ${row.cluster.depth}-deep ` +
          "cluster"
      );
    }
  }

  return problems;
}

describe("README's pin table", () => {
  it("names the same states this guard knows how to read", () => {
    const legend = tableRows(LEGEND_HEADER).map(([state]) => (state ?? "").trim());

    expect(legend).toEqual([...VOCABULARY]);
  });

  /**
   * That the table was read at all. Every assertion below is derived from the parse, so a parse
   * that silently matched nothing would leave the whole file green while checking nothing — the
   * failure mode one level down from the one this file exists for.
   */
  it("parses a claim out of every row", () => {
    expect(ROWS.map((row) => row.pin)).toEqual(
      tableRows(PIN_TABLE_HEADER).map(([pin]) => (pin ?? "").trim())
    );
    expect(ROWS.length).toBeGreaterThanOrEqual(5);

    for (const row of ROWS) {
      expect(row.claims.length, `?now=${row.pin} states nothing checkable`).toBeGreaterThan(0);
    }

    // A floor, not today's figure (18), for the reason the counts guard gives: with every other
    // assertion here biting, *deleting* a claim is otherwise the cheap way past a red one.
    expect(ROWS.reduce((total, row) => total + row.claims.length, 0)).toBeGreaterThanOrEqual(12);
  });

  /**
   * The vocabulary is only worth having if the table exercises it. A row set that had lost every
   * `clamped` claim would pass every assertion above while leaving the window's own two edges —
   * the states hardest to reach by waiting — undescribed.
   */
  it("exercises every state in the vocabulary, and both window edges", () => {
    const claims = ROWS.flatMap((row) => row.claims);

    expect(new Set(claims.map((claim) => claim.temporal).filter(Boolean))).toEqual(
      new Set(["live", "draining", "elapsed"])
    );
    expect(new Set(claims.map((claim) => claim.edge).filter(Boolean))).toEqual(
      new Set(["leading", "trailing"])
    );
  });

  it.each(ROWS.map((row): [string, Row] => [row.pin, row]))(
    "renders what the ?now=%s row says it renders",
    (pin, row) => {
      expect(problemsWith(row, drawAtPin(`?now=${pin}&freeze=1`))).toEqual([]);
    }
  );

  /**
   * The sentence under the table, which is the same class of copy: it states the unpinned dial's
   * arc count *and its state partition*, and #103's guard only reaches the count.
   */
  it("states the unpinned partition the 03:00 row reproduces", () => {
    const sentence =
      /the dial always draws the same (\d+) arcs, ([a-z]+) of them elapsed and ([a-z]+) draining/;
    const found = sentence.exec(readme.replace(/[*`]/g, "").replace(/\s+/g, " "));

    if (!found) {
      throw new Error(
        `README no longer carries ${sentence} — the sentence moved or was reworded, so this guard ` +
          "is asserting nothing."
      );
    }
    const [, arcs, elapsed, draining] = found as unknown as [string, string, string, string];

    for (const hour of [1, 9, 14, 22]) {
      const dial = drawAtPin("", new Date(2026, 7, 18, hour, 37));
      const states = [...dial.states.values()];
      const where = `unpinned at ${hour}:37`;

      expect(states.length, where).toBe(Number(arcs));
      expect(states.filter((state) => state.temporal === "elapsed").length, where).toBe(
        NUMBER_WORDS[elapsed]
      );
      expect(states.filter((state) => state.temporal === "draining").length, where).toBe(
        NUMBER_WORDS[draining]
      );
    }
  });
});

/**
 * The parser, against the failing side.
 *
 * A guard built on a parser is only as good as what the parser refuses, and every case here is one
 * a rewritten cell could plausibly land on: a name that no longer matches the fixture, a name short
 * enough to match two, a `clamped` with no direction, and a claim that is simply wrong.
 */
describe("parsing a cell", () => {
  const claimsIn = (cell: string) => parseCell(cell, "00:00").claims;

  it("resolves a unique prefix of a fixture title", () => {
    expect(claimsIn("⚫ Staff Debrief draining")).toEqual([
      { written: "⚫ Staff Debrief", id: "w", temporal: "draining", inCluster: false },
    ]);
  });

  it("reads a claim that follows prose it cannot understand", () => {
    const [claim] = claimsIn("with copy 1 of the band already full: that copy's 🔵 Yoga live");

    expect(claim?.id).toBe("j");
  });

  it("reaches a later copy of the recurring fixture", () => {
    const [claim] = claimsIn("🟡 🍽️ Lunch (copy 1) clamped at the trailing edge");

    expect(claim).toEqual({
      written: "🟡 🍽️ Lunch",
      id: "d@1",
      edge: "trailing",
      inCluster: false,
    });
  });

  it("attaches a second state to the subject that came before the first", () => {
    expect(claimsIn("⚪ Breakfast Club elapsed and clamped at the leading edge")).toEqual([
      { written: "⚪ Breakfast Club", id: "z", temporal: "elapsed", inCluster: false },
      { written: "⚪ Breakfast Club", id: "z", edge: "leading", inCluster: false },
    ]);
  });

  it("marks the claims a cluster phrase precedes, and only those", () => {
    const claims = claimsIn(
      "🔵 Yoga live; then the four-deep cluster: 🔴 Deadline elapsed, 🟣 Study Skills elapsed"
    );

    expect(claims.map((claim) => [claim.id, claim.inCluster])).toEqual([
      ["j", false],
      ["b", true],
      ["c", true],
    ]);
  });

  it("refuses a name the fixture does not carry", () => {
    expect(() => claimsIn("🟢 Afternoon Club elapsed")).toThrow(/not the start of any event/);
  });

  it("refuses a name short enough to mean two events", () => {
    expect(() => claimsIn("⚫ elapsed")).toThrow(/prefixes 2 fixture titles/);
  });

  it("refuses a clamp that does not say which edge", () => {
    expect(() => claimsIn("🟢 Aftercare clamped")).toThrow(/which edge/);
  });

  it("refuses a cluster mentioned in a phrasing it cannot read", () => {
    expect(() => claimsIn("the cluster mid-drain: 🔴 Deadline draining")).toThrow(
      /phrasing this guard cannot read/
    );
  });

  it("reads a cluster phrase carrying a word of its own", () => {
    const claims = claimsIn("The four-deep cluster mid-drain: 🔴 Deadline draining");

    expect(claims.map((claim) => [claim.id, claim.inCluster])).toEqual([["b", true]]);
  });

  it("refuses a cluster depth written as a word it cannot read", () => {
    expect(() => claimsIn("the fourish-deep cluster: 🔴 Deadline elapsed")).toThrow(
      /not a number this guard knows/
    );
  });
});

/**
 * That the comparison bites. A test asserting `[]` says nothing about what would have been in the
 * list, and this repo has shipped a spec that encoded the same wrong assumption as the code it
 * guarded — so the mutations are checked here rather than trusted.
 */
describe("a cell that is wrong", () => {
  const dial = drawAtPin("?now=03:00&freeze=1");
  const row = (cell: string): Row => ({ pin: "03:00", cell, ...parseCell(cell, "03:00") });

  it("fails on the wrong temporal state", () => {
    expect(problemsWith(row("🟡 Tidy Up and Line Up elapsed"), dial)).toEqual([
      "🟡 Tidy Up and Line Up is claimed elapsed and renders draining",
    ]);
  });

  it("fails on the wrong window edge", () => {
    expect(problemsWith(row("⚪ Breakfast Club clamped at the trailing edge"), dial)).toEqual([
      "⚪ Breakfast Club is claimed clamped at the trailing edge and fades at the leading edge",
    ]);
  });

  it("fails on an event the pin does not draw", () => {
    expect(problemsWith(row("🟢 Aftercare (copy 4) live"), dial)).toEqual([
      "🟢 Aftercare (y@4) is not drawn at all — a pin the table sends a reviewer to for that " +
        "event shows them nothing",
    ]);
  });

  it("fails on a cluster whose membership has moved", () => {
    const problems = problemsWith(
      row("the four-deep cluster: 🔴 Deadline elapsed, 🟣 Study Skills elapsed"),
      dial
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/names b, c and the dial puts a, b, c, k, n/);
  });

  it("fails on a cluster claimed at a depth the dial does not open", () => {
    const problems = problemsWith(row("the six-deep cluster: 🔴 Deadline elapsed"), dial);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/the dial puts nothing in a 6-deep cluster/);
  });
});
