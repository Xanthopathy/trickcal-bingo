# Making the Bingo Engine Smarter

A plain-language guide to what the engine does today and how to improve it without making the project needlessly complicated.

## The Short Version

The engine is currently a **one-move-at-a-time scorer**. It tries the possible places for a piece, gives each placement points for covering useful cells and advancing bingo lines, and recommends the highest-scoring placement.

It can compare the piece in your hand with the stored piece, but that comparison is also about the board **right now**. It does not yet figure out which piece will be more useful after future pieces arrive.

The most useful next upgrade is to teach it to value real bingo rewards, then test strategies in simulated games. After that, add a small amount of future planning.

## What the Engine Does Today

The main logic is in `app/src/game.ts`.

For each possible placement, the engine roughly asks:

- How many new cells will this piece cover?
- Which unfinished bingo lines will it advance?
- Does it complete any lines?
- Are those lines considered important by the current weights?

It then sorts placements from highest score to lowest. The score is a **ranking tool**, not a number of LVs, SC, CRTs, or a probability of winning.

When there is a piece in storage, the app also finds the stored piece's best placement on the same board and compares its score with the hand piece's best score. That can answer, “Which piece fits better right now?” It cannot answer, “Which piece should I save because it will be more valuable later?”

### The numbers that look like rates

There are two different kinds of numbers, and they do different jobs:

- **Piece rates** are estimates of how often each type of piece appears. They help adjust how achievable rows, columns, and diagonals seem.
- **Piece affinity** is a score multiplier for shapes that naturally help certain line types. For example, `1.35` means a Cross gets 35% extra line-progress score for a diagonal. It does **not** mean a 35% chance of drawing a Cross or completing a bingo.

The priority weights and affinity multipliers are hand-picked tuning knobs. They are not learned from data and are not guaranteed to be optimal.

## What “Looking Ahead” Means

Imagine choosing between two moves:

- Move A earns a small amount of value now, but leaves a great piece in storage for later.
- Move B scores more immediately, but uses up that piece where it may not help much.

A one-move scorer sees the current score difference. A lookahead engine also imagines what could happen next: a new piece is drawn, you choose a placement, and the board changes again.

In plain language, it tries to answer:

> Value of this move = value earned now + the average value of the good choices it leaves you later.

“Average” matters because the next piece is random. If piece rates say a shape is common, the engine should expect to see it more often than a rare shape. It should not pretend to know the exact next draw.

## A Practical Upgrade Path

### 1. Decide what “good” means

The project has different bingo rewards: LVs, SC, and CRTs. The engine needs a clear way to compare them. For example, you might want to maximize total reward value, prefer some reward types, or simply maximize the number of completed bingos.

Until that choice is explicit, weights like “diagonals are worth 6” are just convenient guesses. They may rank moves consistently, but they do not directly represent the rewards shown to the player.

### 2. Build a game simulator

A simulator plays through a board using the same rules as the app: pieces, overlaps, the storage slot, and the skip threshold. Give it a starting random seed so the same piece sequence can be replayed.

Then compare a few strategies on the **same** piece sequences:

- The simple 4×3 human strategy from the project notes
- The current placement scorer
- A new version of the engine

Track actual rewards and completed bingos over many boards. This tells us whether a change really helps, rather than only making its internal score look bigger.

### 3. Score actual rewards

When a move completes a line, use that line's real reward in the score. For incomplete lines, estimate how likely they are to be finished before the board ends. A line missing one cell should generally be treated differently from a line missing five.

The estimate can start simple. It does not need to predict the future perfectly; the simulator will show whether the estimate is useful.

### 4. Add a small lookahead

For each promising current move:

1. Apply the move to a copy of the board.
2. Consider possible next pieces, weighted by their estimated rates.
3. Find the best next move for each possible piece, including the stored piece.
4. Average those future scores and add them to the value of the current move.

Start with only a few top current moves and one future draw. That keeps it understandable and quick. If simulation results show a benefit, increase the search depth later.

### 5. Check that it improved

Keep a set of piece sequences for tuning and a separate set for final checks. Compare average rewards, bingo counts, and how often each strategy wins or loses against the baseline. Include awkward cases, such as getting very few Horizontal or Vertical pieces.

A strategy is better because it performs better across many games, not because its hand-tuned score is larger.

## What Not to Do Yet

You probably do not need machine learning. There is no reliable training data yet, and the game is small enough that a simulator and short lookahead can provide useful evidence first.

Also avoid adding more unexplained multipliers as the first fix. A few well-tested rules are more useful than a complicated score that nobody can explain.

## Tiny Glossary

- **Heuristic:** A shortcut for estimating which move looks good.
- **Piece rate:** An estimate of how often a piece appears.
- **Affinity:** A score bonus for a piece shape that naturally advances a kind of line.
- **Lookahead:** Trying a move, then estimating what good moves may be possible afterward.
- **Simulator:** A program that plays many complete games automatically so strategies can be compared.
