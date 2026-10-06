# Making the Bingo Engine Smarter

A plain-language guide to what the engine does today and how to improve it without making the project needlessly complicated.

## The Short Version

The engine currently uses a **one-draw lookahead heuristic**. It scores placements for the current piece, then estimates the value of the next move using the stored piece and the configured piece-drop rates.

This is smarter than a purely immediate scorer, but it only estimates one future draw. It does not yet plan through the rest of the board or evaluate a user-selected end goal.

The next step is an offline simulator that compares strategies on identical seeded games. Once we can measure results for configurable end goals, we can use the same game rules to build and validate full-game lookahead.

## What the Engine Does Today

The main logic is in `app/src/game.ts`.

For each possible placement, the engine roughly asks:

- How many new cells will this piece cover?
- Which unfinished bingo lines will it advance?
- Does it complete any lines?
- Are those lines considered important by the current weights?

It estimates an immediate placement score, adds a discounted expected value for the next turn, then sorts placements. The score is a **ranking tool**, not a number of leaves, star candy, certificates, or a probability of winning. The one-draw discount is experimental and has not yet been validated in batches of complete games.

When there is a piece in storage, the next-turn estimate considers keeping that piece available alongside the next random draw. This gives storage some flexibility value, but only over one future turn. It cannot yet answer which sequence of choices is best through the end of the board.

### The numbers that look like rates

There are two different kinds of numbers, and they do different jobs:

- **Piece rates** are estimates of how often each type of piece appears. They help adjust how achievable rows, columns, and diagonals seem.
- **Piece affinity** is a score multiplier for shapes that naturally help certain line types. For example, `1.35` means a Cross gets 35% extra line-progress score for a diagonal. It does **not** mean a 35% chance of drawing a Cross or completing a bingo.

The priority weights and affinity multipliers are hand-picked tuning knobs. They are not learned from data and are not guaranteed to be optimal.

## What “Looking Ahead” Means

Imagine choosing between two moves:

- Move A earns a small amount of value now, but leaves a great piece in storage for later.
- Move B scores more immediately, but uses up that piece where it may not help much.

The current engine looks through one draw: it asks what good next placement might be possible after each candidate move. Future draws are weighted by the configured rates, and the stored piece remains available. It does **not** continue this process until the board ends.

A future full-game planner would simulate several possible sequences of draws and placements through the selected end goal. It would estimate the average final outcome of each current move rather than only the next move.

In plain language, it tries to answer:

> Value of this move = immediate heuristic score + discounted expected value of a next move.

“Average” matters because the next piece is random. If piece rates say a shape is common, the engine gives that possible draw more influence than a rare shape. The result is still an experimental heuristic score, not a measured reward or a full-game guarantee.

## A Practical Upgrade Path

### 1. Define end goals separately from strategies

The user should be able to compare the same strategy under different goals:

- **Fill the board:** continue until all 49 tiles are covered.
- **Priority bingos, then skip:** stop when both diagonals, Column D, and Row 4 are complete **and** the configured skip threshold has been reached. Reaching only one condition is not enough; a fully covered board is the hard stopping cap.

Do not silently convert leaves, star candy, and certificates into one score. Report those totals separately, alongside bingo count and priority-line completion. Only use a combined reward score when the user has explicitly chosen conversion values.

### 2. Give strategies one shared interface

A strategy receives the current board, hand piece, stored piece, piece rates, and end-goal context, then chooses which available piece to place and where. The end goal decides when a game ends; it should not be baked into a strategy's identity. This lets the same strategy be tested against multiple goals.

### 3. Build the deterministic simulator

The simulator applies the real rules: placements, overlap, hand/storage swaps, random draws, and the selected stopping condition. Use a seed so a complete piece sequence can be replayed exactly.

When comparing strategies, give every strategy the same initial state and the same piece sequence. The simulator is an evaluation harness; it measures strategies but does not automatically invent a better one.

### 4. Establish the baselines

Compare at least:

- The simple 4×3 human strategy
- The current immediate/priority heuristic
- The current one-draw adaptive heuristic

Track complete-game bingo counts, separate resource totals, priority lines completed, tiles covered, and whether/when the selected goal was reached. Test both configured goals and varied piece distributions.

### 5. Add full-game planning

Once the simulator is trusted, evaluate each candidate move with future rollouts through the selected end goal:

1. Apply a candidate placement.
2. Draw possible future pieces according to the configured rates.
3. Let the strategy choose placements, including free hand/storage swaps.
4. Continue until the goal's stopping condition is met.
5. Average the final outcome vector across many rollouts.

Use bounded Monte Carlo rollouts or beam search rather than assuming exhaustive search is feasible. The same simulator transition rules should power both offline comparisons and live full-game recommendations.

### 6. Validate on unseen games

Use separate seeded sequences for tuning and final evaluation. Compare the full-game planner with the baselines across both goals and multiple piece distributions. A strategy is better when it improves repeatable game outcomes, not merely because its internal score is higher.

## What Not to Do Yet

You probably do not need machine learning. There is no reliable training data yet, and the game is small enough that a simulator and short lookahead can provide useful evidence first.

Also avoid adding more unexplained multipliers as the first fix. A few well-tested rules are more useful than a complicated score that nobody can explain.

## Tiny Glossary

- **Heuristic:** A shortcut for estimating which move looks good.
- **Piece rate:** An estimate of how often a piece appears.
- **Affinity:** A score bonus for a piece shape that naturally advances a kind of line.
- **Lookahead:** Trying a move, then estimating what good moves may be possible afterward.
- **Simulator:** A program that plays many complete games automatically so strategies can be compared.
