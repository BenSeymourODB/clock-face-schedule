# Review issues

Review all open issues on this repository (`BenSeymourODB/clock-face-schedule`).
Identify blockers, co-dependencies and synergies: which must be addressed first
to let others proceed, and which are not strictly blocked but become easier once
others land. For each connection, update the description of both issues tagging
the connected one. This grooming makes `/implement-issue` sequence work sensibly.

> Where this shows `gh ...`, use the GitHub MCP tools (`mcp__github__*`) instead
> when your environment provides them; fall back to the `gh` CLI locally.

## Instructions

1. **Fetch all open issues:**
   `gh issue list --state open --json number,title,labels,body --limit 100`

2. **Note the existing structure before adding to it.** Work is already organised
   as epics with **native GitHub sub-issues** — read them with
   `gh api repos/BenSeymourODB/clock-face-schedule/issues/<n>/sub_issues`. Do not
   duplicate that hierarchy as prose; add only the *cross-epic* links it cannot
   express.

3. **Analyse dependencies**, grounded in `README.md`, `docs/DESIGN.md` (the ADRs
   and Platform constraints) and `docs/brainstorms/`. For each issue identify:
   - **Blockers** — must be completed first. Real examples in this repo: wrap-aware
     geometry precedes any rolling or 1-hour window; the shared card component
     precedes agenda cards; hand outlines precede drawing anything on the face.
   - **Enables** — what this unblocks.
   - **Synergies** — issues sharing infrastructure. The live clusters are the
     contrast helpers (`contrast.ts` and everything that picks a colour), the
     mask machinery (feathering, elapsed arcs, the drain boundary), the text
     packing (`pack-lines.ts`, arc titles, labels, agenda cards), and the
     **horizontal-space allocation** shared by labels and the agenda panel.
   - **Benefits from** — not strict blockers, but easier if done first.

4. **Record readiness, not just order.** Each sub-issue states whether it is ready
   to build or blocked on named decisions. Where a decision has since been made —
   in a comment, an ADR, or a brainstorm — **say so explicitly in the issue** so
   `/implement-issue` stops skipping it. Stale decision-blocks are the most
   common reason ready work sits untouched.

5. **Group into tiers** by dependency depth:
   - **Tier 0** — no blockers, enables many others.
   - **Tier 1** — depends only on Tier 0 or external factors.
   - **Tier 2 / 3+** — deeper chains.

6. **Write two documentation files:**
   - `docs/issue-dependency-analysis.md` — the dependency graph with tiers, a
     per-issue connection map, recommended order, and synergy clusters.
   - `docs/issue-cross-reference-updates.md` — the exact markdown appended to each
     affected issue.

7. **Update each affected issue:**
   - Append a "Cross-References" section to its description.
   - Preserve the existing body: `gh issue view <n> --json body -q .body`, then
     `gh issue edit <n> --body "<existing + new>"`.
   - Tag connected issues (`#<n>`) and name each connection's nature
     (blocks / enables / synergy / benefits-from).
   - Apply `priority` (`p0`–`p2`) and/or `blocked` labels where warranted.

8. **Report a summary** of all updates made.
