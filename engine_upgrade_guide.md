# Making the Bingo Engine Smarter

A plain-language guide to what the engine does today and how to improve it without making the project needlessly complicated.

## The Short Version

The planner now uses a **bounded full-board search**. For every possible current placement, it explores likely future piece draws, legal placements, and hand/storage choices, then estimates the eventual board.

Projected tile coverage after the next four draws is the primary comparison. Bingo count and enclosed empty gaps break close ties. The search currently evaluates eight shared, repeatable draw samples using a narrow beam; it is useful guidance, not an exhaustive solver or a real-world probability guarantee.

The planner recommends one move at a time and replans after the board, hand, storage, or estimated piece rates change. The offline simulator remains separate and compares baseline strategies on identical seeded games.

## What the Engine Does Today

The main logic is in `app/src/game.ts`.

For each possible placement, the engine roughly asks:

- How much of the board can likely be covered after future draws?
- Can the current and stored pieces be used in a useful order?
- Does a move leave enclosed empty cells or awkward regions?
- How many bingos are likely, after coverage has been considered?

The planner evaluates eight repeatable future draw sequences, each up to four turns, with a narrow beam of candidate board states. It ranks projected coverage at that horizon first, then bingo count and trapped-gap risk. The displayed comparisons describe these sampled searches; they are not guarantees or validated estimates over all possible games.

When a piece is in storage, every simulated turn can use either the new draw or the stored piece, placing the unused piece into storage. Both the hand and storage-piece plans are compared for swap advice.

### The numbers that look like rates

There are two different kinds of numbers, and they do different jobs:

- **Piece rates** are estimates of how often each type of piece appears. They help adjust how achievable rows, columns, and diagonals seem.
- **Piece affinity** is a score multiplier for shapes that naturally help certain line types. For example, `1.35` means a Cross gets 35% extra line-progress score for a diagonal. It does **not** mean a 35% chance of drawing a Cross or completing a bingo.

Piece rates affect the planner's future draws. The adjustable heuristic priorities are used only by Simulation strategies; the live planner ignores them and counts bingos equally as a secondary criterion.

## What “Looking Ahead” Means

Imagine choosing between two moves:

- Move A earns a small amount of value now, but leaves a great piece in storage for later.
- Move B scores more immediately, but uses up that piece where it may not help much.

The current planner looks through several sampled draws after each candidate move. It follows placements and hand/storage choices in each sequence, stopping when the board is full or the search horizon ends.

Notable tile reward locations remain unknown to this search; it does not predict or assign them. The player’s manually observed reward tracking and skip advice are separate from this move recommendation.

In plain language, it tries to answer:

> Value of this move = projected final tile coverage first, then completion speed, bingo value, and open-space quality.

Future pieces are sampled using the configured rates, and each candidate sees the same deterministic sequences for a fair comparison. The small sample and narrow beam make the result an estimate, not a measured reward or proof of optimal play.

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

Track complete-game bingo counts, separate reward totals, priority lines completed, notable rewards collected, tiles covered, and whether/when the skip suggestion became valid. Test varied piece distributions and hidden reward layouts.

### 5. Validate and expand full-board planning

Once the simulator is trusted, evaluate each candidate move with future rollouts through skip readiness or the full-board cap:

1. Apply a candidate placement.
2. Draw possible future pieces according to the configured rates.
3. Let the strategy choose placements, including free hand/storage swaps.
4. Continue until the skip-suggestion conditions are met or the board is full.
5. Average the final outcome vector across many rollouts.

Use bounded Monte Carlo rollouts or beam search rather than assuming exhaustive search is feasible. The same simulator transition rules should power both offline comparisons and live full-game recommendations.

### 6. Validate on unseen games

Use separate seeded games for tuning and final evaluation. Compare the full-board planner with the baselines across multiple piece distributions and hidden reward layouts. A strategy is better when it improves repeatable game outcomes, not merely because its internal score is higher.

## What Not to Do Yet

You probably do not need machine learning. There is no reliable training data yet, and the game is small enough that a simulator and short lookahead can provide useful evidence first.

Also avoid adding more unexplained multipliers as the first fix. A few well-tested rules are more useful than a complicated score that nobody can explain.

## Tiny Glossary

- **Heuristic:** A shortcut for estimating which move looks good.
- **Piece rate:** An estimate of how often a piece appears.
- **Affinity:** A score bonus for a piece shape that naturally advances a kind of line.
- **Lookahead:** Trying a move, then estimating what good moves may be possible afterward.
- **Simulator:** A program that plays many complete games automatically so strategies can be compared.
