# Making the Bingo Engine Smarter

A plain-language guide to what the engine does today and how to improve it without making the project needlessly complicated.

## The Short Version

The live planner evaluates each legal first placement with **complete-board rollouts**. It forces that move, then uses the Simulation Lab's adaptive-priority policy for later moves, sharing the same board transitions, hand/storage swaps, draws, hidden reward locations, and stop conditions.

Settings offer five sample counts, from 4 to 24 complete-board rollouts; Balanced uses 8. Each scenario can draw up to 60 future pieces and stops when the board is skip-ready or full. More samples reduce sampling noise but do not make the continuation policy optimal. This is not an exhaustive solver or a real-world probability guarantee.

The planner recommends one move at a time and replans after the board, hand, storage, or estimated piece rates change. The offline simulator remains separate and compares baseline strategies on identical seeded games.

## What the Engine Does Today

The shared game loop is in `app/src/simulation/engine.ts`; candidate generation and rollout aggregation are in `app/src/bingo/fullBoardPlanner.ts`.

For each possible placement, the engine roughly asks:

- How much of the board is covered at the simulated stopping point?
- How often do the priority lines and skip-ready conditions complete?
- What are the separate expected bingo rewards at that stopping point?
- Does a move leave enclosed empty cells or awkward regions?

Every candidate sees the same seeded draw sequences and hidden reward locations. Future moves follow the adaptive-priority strategy; only the first move is varied. The planner ranks the resulting expected board outcomes, so its quality still depends on that continuation policy and configured piece rates.

When a piece is in storage, every simulated turn can use either the new draw or the stored piece, placing the unused piece into storage. Both the hand and storage-piece plans are compared for swap advice.

### The numbers that look like rates

There are two different kinds of numbers, and they do different jobs:

- **Piece rates** are estimates of how often each type of piece appears. They help adjust how achievable rows, columns, and diagonals seem.
- **Piece affinity** is a score multiplier for shapes that naturally help certain line types. For example, `1.35` means a Cross gets 35% extra line-progress score for a diagonal. It does **not** mean a 35% chance of drawing a Cross or completing a bingo.

Piece rates affect the rollout draws and continuation policy. The planner returns separate coverage, bingo, priority-line, and reward projections; the resource types are not converted into one combined reward total.

## What “Looking Ahead” Means

Imagine choosing between two moves:

- Move A earns a small amount of value now, but leaves a great piece in storage for later.
- Move B scores more immediately, but uses up that piece where it may not help much.

The planner plays each candidate through sampled future sequences until the skip-ready conditions are met or the board is full. This estimates the outcome of the candidate under adaptive-priority future play; it does not search every possible future policy.

Notable tile reward locations remain unknown to this search; it does not predict or assign them. The player’s manually observed reward tracking and skip advice are separate from this move recommendation.

In plain language, it tries to answer:

> For this first move, what does adaptive-priority play tend to achieve by the end of the board?

Future pieces and hidden notable-reward locations are sampled using the configured model, and each candidate sees the same scenarios for a fair comparison. The sample is still small, and the rollout policy is fixed, so this is evidence for comparing moves rather than proof of optimal play.

## A Practical Upgrade Path

### 1. Define when the planner should suggest skipping

The planner should show a skip suggestion when:

- The configured tile-coverage threshold has been reached.
- Both diagonals, Column D, and Row 4 are complete.
- The player has manually marked all configured notable individual-tile rewards as seen or claimed.

These conditions produce advice, not an automatic skip. The player may skip earlier. Covering the whole board is the natural upper limit if the player chooses to continue.

The engine does not know the locations of shuffled special-reward tiles. The player records when those rewards appear in the actual game; the planner must not imply that it has discovered their locations. Keep leaves, star candy, certificates, and tile rewards separate unless the player explicitly supplies conversion values.

### 2. Give strategies one shared interface

A strategy receives the current board, hand piece, stored piece, piece rates, and which notable rewards the player has recorded. It chooses which available piece to place and where. Skip readiness is shown separately from strategy identity.

### 3. Build the deterministic simulator

The simulator applies the real rules: placements, overlap, hand/storage swaps, random piece draws, randomly assigned notable reward locations, and the skip-suggestion policy. Use a seed so the same complete game can be replayed exactly.

When comparing strategies, give every strategy the same initial state, hidden reward assignment, and piece sequence. The simulator is an evaluation tool; it measures strategies but does not automatically invent a better one.

### 4. Establish the baselines

Compare at least:

- The simple 4×3 human strategy
- The current immediate/priority heuristic
- The current one-draw adaptive heuristic
- The live full-board rollout planner with adaptive-priority continuation

Track complete-game bingo counts, separate reward totals, priority lines completed, notable rewards collected, tiles covered, and whether/when the skip suggestion became valid. Test varied piece distributions and hidden reward layouts.

### 5. Validate full-board planning

The live planner now evaluates each candidate through complete-board rollouts:

1. Apply a candidate placement.
2. Draw possible future pieces according to the configured rates.
3. Let the strategy choose placements, including free hand/storage swaps.
4. Continue until the skip-suggestion conditions are met or the board is full.
5. Average the final outcome vector across many rollouts.

The remaining work is to compare this planner against the established baselines across held-out seeds and several plausible piece distributions. More samples reduce Monte Carlo noise; they do not prove that the fixed adaptive-priority continuation policy is optimal.

### 6. Validate on unseen games

Use separate seeded games for tuning and final evaluation. Compare the full-board planner with the baselines across multiple piece distributions and hidden reward layouts. A strategy is better when it improves repeatable game outcomes, not merely because its internal score is higher.

## What Not to Do Yet

You probably do not need machine learning yet. There is no reliable real-game training data, and full-board rollouts already let us test strategies directly. First validate the simulator and calibrate piece rates against observed games.

Also avoid adding more unexplained multipliers as the first fix. A few well-tested rules are more useful than a complicated score that nobody can explain.

## Tiny Glossary

- **Heuristic:** A shortcut for estimating which move looks good.
- **Piece rate:** An estimate of how often a piece appears.
- **Affinity:** A score bonus for a piece shape that naturally advances a kind of line.
- **Lookahead:** Trying a move, then estimating what good moves may be possible afterward.
- **Simulator:** A program that plays many complete games automatically so strategies can be compared.
