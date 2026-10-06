# Bingo Optimization Calculator — Project Description

## 1. Project Goal

Build a small interactive site that helps players maximize the number/value of bingos they obtain on a 7×7 bingo board.

The site should not require the player to memorize a complicated strategy. Instead, it should model the current board, the piece currently available, and the estimated piece distribution, then recommend useful placements and visually explain why those placements are good.

The project should also provide tools for comparing different placement algorithms/heuristics through simulation so that the strategy can be improved empirically rather than relying only on intuition.

---

## 2. Established Game Rules

### Board

The play area is a **7×7 grid**, with coordinates:

```text
      A B C D E F G
    ---------------
 1  | . . . . . . .
 2  | . . . . . . .
 3  | . . . . . . .
 4  | . . . . . . .
 5  | . . . . . . .
 6  | . . . . . . .
 7  | . . . . . . .
```

There are **16 possible bingo lines**:

- 7 rows
- 7 columns
- 2 main diagonals

A bingo is completed when all seven cells in a line are occupied.

### Bingo rewards (LVs = leaves, SC = star candy, CRTs = certificates)

Columns:

| Line |  Reward |
| ---- | ------: |
| A    | ×10 LVs |
| B    |  ×10 SC |
| C    | ×10 LVs |
| D    | ×5 CRTs |
| E    | ×10 LVs |
| F    |  ×10 SC |
| G    | ×10 LVs |

Rows:

| Line |  Reward |
| ---- | ------: |
| 1    | ×10 LVs |
| 2    | ×10 LVs |
| 3    |  ×10 SC |
| 4    | ×5 CRTs |
| 5    | ×10 LVs |
| 6    |  ×10 SC |
| 7    | ×10 LVs |

Each main diagonal is worth **×50 leaves**, for a combined ×100 leaves if both are completed.

Therefore, the four especially valuable structural targets are:

1. Main diagonal A1 → G7
2. Main diagonal G1 → A7
3. Column D
4. Row 4

### Pieces

There are five piece types:

1. **Plus** — a 5-cell `+` shape
2. **Cross** — a 5-cell `X` shape
3. **3×3 Square** — a 9-cell solid square
4. **Horizontal** — a 7-cell horizontal line
5. **Vertical** — a 7-cell vertical line

The exact random distribution has not yet been measured. The current player estimate is:

- Plus and Cross are the most common pieces.
- Horizontal and Vertical are somewhat rarer, approximately one every 2-3 common pieces.
- The 3×3 Square is the rarest, approximately one every 6-7 pieces.

These frequencies must be treated as **configurable estimates**, not established facts, until actual gameplay data is collected.

### Storage slot

The player has one slot that can hold one piece in addition to the piece currently in hand. The player may freely swap the current piece with the stored piece at any time; swapping does not consume a turn or either piece. The slot can therefore be used to save a useful piece and bring it back into hand later. The stored piece does not carry over when moving to a new board.

### Overlap

Pieces may be placed over already occupied cells.

An overlapping tile contributes nothing new. It does not remove the existing tile or otherwise damage the board, and it does not trigger that tile's reward again.

This means a piece can safely be placed directly across an already occupied line. The relevant calculation is which previously empty cells the piece adds.

### Resetting

The current estimate is that about **39 of the 49 tiles** (roughly 80%) must be covered to skip to a new board, after which rewards are refreshed. This number is based on the player's impression from gameplay and is not confirmed; keep the threshold configurable.

### Tile rewards

Use **cover** consistently to mean that a piece lands on a tile. Covering a tile unlocks it and triggers its random reward once; covering it again with an overlapping piece does not trigger another reward. Tile rewards are separate from bingo rewards, which are earned by completing a line.

### Future mechanic: rare 100K-coin tile

Each board has a **100K-coin tile** mixed randomly among its 49 tiles; it is called out because it is the most valuable tile reward. In the future, add a player-controlled setting toggle for whether to stay on the current board and try to cover this tile after reaching the estimated skip threshold. When disabled, the player can skip to a new board as soon as the threshold is reached.

Because tracking every tile's reward is cumbersome, use a manual checkbox to record whether the 100K-coin tile has been covered rather than requiring players to log every tile reward. The board is randomly mixed each round, so do not assume the coin tile's location is known in advance. Recommendation and simulation logic should treat waiting for it as an optional objective, separate from bingo scoring and board progression.

---

## 3. Established Simple Strategy: The 4×3 Strategy

The current easy-to-teach strategy divides the 7×7 board conceptually into four 3×3 chunks around the central row and column:

```text
┌─────┬─────┬─────┐
│     │     │     │
│ 3×3 │     │ 3×3 │
│     │     │     │
├─────┼─────┼─────┤
│     │  X  │     │
├─────┼─────┼─────┤
│     │     │     │
│ 3×3 │     │ 3×3 │
│     │     │     │
└─────┴─────┴─────┘
```

The idea is:

- Use the common **Plus/Cross pieces** primarily inside the four outer 3×3 regions.
- Preserve the **middle row and middle column** for the Horizontal and Vertical pieces.
- Eventually use one Horizontal piece to fill Row 4.
- Eventually use one Vertical piece to fill Column D.

The strategy is attractive because it is extremely easy to communicate and execute. A random player does not need to evaluate the entire board state or understand piece-substitution logic.

Its main weakness is RNG sensitivity: if the expected H/V pieces do not arrive at useful times, the reserved space can become inefficient, and the rigid quadrant structure can brick.

The project should therefore treat the 4×3 strategy as the **baseline human heuristic**, not assume it is mathematically optimal.

---

## 4. Theoretical Adaptive Strategy

A more flexible strategy has emerged from analyzing the interaction between the pieces.

### Core priority

Prioritize:

1. Both diagonals
2. Column D
3. Row 4
4. Remaining high-value rows/columns

The key insight is that each piece type has a natural role:

- **Crosses:** excellent for building the two diagonals.
- **Horizontal:** ideally Row 4; after that, an outer/high-value row.
- **Vertical:** ideally Column D; after that, an outer/high-value column.
- **Pluses:** flexible repair/fill pieces for incomplete lines. D4 is a useful candidate because it contributes to Row 4 and Column D, but it should not be assumed to be the optimal opening placement.
- **3×3 Square:** rare wildcard that can cover a large concentration of valuable missing cells.

On an empty board, the current heuristic ranks a Plus at D3 above D4: D3 advances each diagonal by two cells (through C3/E3 and the shared D4 cell), while D4 advances each diagonal by one. D4 adds more progress to Row 4, but the current diagonal weights make D3 score higher. Treat this as a result of the current heuristic weights, not proof that D3 is universally optimal; compare candidate placements and validate the weights through simulation.

### Cross diagonal skeleton

A useful target pattern for four Crosses is to center them around:

- B2
- F2
- B6
- F6

These positions collectively build most of the two diagonals while leaving D4 as their shared central gap.

A Horizontal piece on Row 4 and a Vertical piece on Column D then provide the central structure.

This should be treated as a **target pattern**, not a mandatory sequence. The adaptive strategy should react to the actual board state.

### Excess H/V pieces

Once Row 4 / Column D have already been handled, an excess Horizontal or Vertical piece should generally be placed directly on another useful line rather than being preserved.

In particular, an H/V placed on an outer side can effectively "free" future Cross/Plus pieces from having to complete that line.

For example:

- H → Row 1 or Row 7
- V → Column A or Column G

This introduces the concept of **piece-substitution value**:

> A placement is valuable not only because of the bingo it immediately completes, but because it can reduce the future work required from more common pieces.

This is one of the main reasons a purely greedy "complete the most immediate bingos" algorithm may not be optimal.

### Adaptive rather than rigid

The theoretical strategy should evaluate every legal placement against the current board rather than forcing a predetermined pattern.

A candidate placement can be scored according to:

- Immediate bingos completed
- Reward of those bingos
- New cells added to high-value lines
- Future flexibility
- Piece-substitution value
- Expected future bingo production under the piece distribution
- Risk of producing a board state that is difficult to finish

The ultimate goal is to determine whether this adaptive approach actually outperforms the simple 4×3 strategy.

---

## 5. Site Plan

Build a simple, fast interactive site centered around the 7×7 board.

### Separate the planner, strategy, and end goal

The site has two related workflows:

- **Player planner:** model one live board, inspect the recommended move, and place pieces manually. The planner can select which strategy to use, but it does not run batches of games.
- **Simulation Lab page:** choose one or more strategies and an end goal, then compare their results across the same reproducible game sequences.

Keep three concepts separate:

- A **strategy** chooses a placement, including whether to use the hand piece or the stored piece.
- An **end goal** defines when a simulated board ends and which outcomes matter.
- The **simulator** applies game rules, draws pieces, and measures strategy outcomes. It evaluates strategies; it does not automatically invent or improve them.

The end goal is a user setting, not part of a strategy. Initial goal options:

1. **Fill the board:** continue until all 49 tiles are covered. Compare bingo count and the separate leaves, star candy, and certificate totals.
2. **Priority bingos, then skip:** continue until both conditions are met: both diagonals, Column D, and Row 4 are complete, and the configured skip threshold has been reached. Reaching the threshold alone does not end this goal; completing the four lines alone does not end it either. A fully covered board is the hard stopping cap.

Do not combine leaves, star candy, and certificates into one score unless the user explicitly supplies conversion weights. Keep reward totals as a vector so players can compare goals according to their own preferences.

### Core interface

The main screen should contain:

- Interactive 7×7 board
- Current occupied/empty state
- Current piece and the one-piece placeholder/item slot, including a free swap control
- Piece selector for all five piece types:
  - Plus
  - Cross
  - Horizontal
  - Vertical
  - 3×3 Square
- Legal placement visualization
- Placement preview
- Bingo indicators
- Current bingo/reward status
- Reset/clear board controls

The user should be able to select the piece currently in hand or swap with the stored piece, then preview where the active piece can be placed. Swapping should not advance the turn.

### Placement preview

When hovering/tapping a legal placement:

- Show the exact cells the piece would occupy.
- Distinguish newly occupied cells from overlapping/nullified cells.
- Highlight any bingo lines that would be completed.
- Show the immediate reward/bingo change.
- Allow the user to commit the placement.

The interface should make it immediately obvious why a particular placement is recommended.

### Recommendation engine

For the current board, current piece, and placeholder/item slot contents, calculate legal placements for either piece. The recommendation should consider whether swapping first enables a better move; because swapping is free, compare the best placement for each available piece without treating the swap as a turn cost.

For every candidate placement, calculate at minimum:

- Number of newly occupied cells
- Bings completed
- Bingo types/lines completed
- Immediate reward
- Progress toward incomplete bingos
- Relevant priority-line coverage

Then rank candidate placements using the selected algorithm.

The UI should display:

> **Recommended placement**

along with a small explanation such as:

> Completes Row 4 and adds 3 cells toward the main diagonal.

Multiple alternatives should optionally be shown.
The planner should let the user select the strategy used for recommendations. Keep this selection independent from the end goal; the end goal controls simulation and eventual full-game planning, not the rules of the board.

---

## 6. Configurable Piece-Frequency Model

The simulator/recommendation engine needs a configurable probability model for incoming pieces.

Example default model:

```text
Cross      35%
Plus       35%
Horizontal 12.5%
Vertical   12.5%
Square     5%
```

These numbers are placeholders and should not be treated as measured probabilities.

The UI should allow the user to change the distribution, either through:

- individual percentage inputs, or
- sliders with automatic normalization.

A future data-entry mode could allow players to enter observed piece counts from real games and estimate the distribution empirically.

The model should support arbitrary valid distributions over the five pieces.

---

## 7. Algorithms to Implement and Compare

The site should support several strategy implementations.

### A. 4×3 Baseline

Implement the simple established strategy as a fixed heuristic.

Purpose:

- Human baseline
- Easy to understand
- Provides a benchmark for more sophisticated methods

### B. Priority-Line Heuristic

Prioritize:

1. Diagonals
2. D
3. Row 4
4. Other valuable lines

Piece-specific placement rules are applied based on the current board.

Purpose:

- Simple adaptive strategy
- More flexible than 4×3
- Still explainable to humans

### C. Greedy Reward Heuristic

For every legal placement:

1. Calculate immediate bingos.
2. Calculate their rewards.
3. Choose the placement with the highest immediate value.

Potential extensions:

- Number of bingos as a secondary criterion
- Number of newly filled high-value cells
- Tie-breaking by future flexibility

Purpose:

- Establish a straightforward algorithmic baseline.

### D. Current Adaptive Heuristic

The current adaptive ranker adds a **one-draw expected continuation** to the immediate placement score. It evaluates the preserved stored piece and possible next draws weighted by the configured piece rates. Its future-value discount is experimental.

This is a short lookahead heuristic, not a full-game solver. Its score is a ranking value, not an actual combined amount of leaves, star candy, and certificates.

### E. Full-Game Planner (Future)

Evaluate candidate moves by simulating possible draws and good placements through the selected end goal. Use a bounded method such as Monte Carlo rollouts or beam search rather than assuming exhaustive search is practical.

The full-game planner must use the same transition rules and goals as the offline simulator. Compare it against the baselines on held-out seeded sequences before presenting it as stronger.

### F. Monte Carlo Lookahead

For each legal current placement:

1. Apply the candidate placement.
2. Generate many possible future piece sequences according to the configured distribution.
3. Have the selected policy play those simulated sequences.
4. Measure resulting bingos/reward.
5. Average the results.
6. Recommend the candidate with the highest simulated expected outcome.

Configurable parameters:

- Number of simulations
- Lookahead depth / number of future pieces
- Reward metric
- Reset behavior

This should allow experimentation with the tradeoff between calculation time and prediction quality.

### G. Search / Dynamic Programming

Explore a more exact state-space approach where feasible.

Potential approaches include:

- Memoized state search
- Beam search
- Dynamic programming over reachable board states
- Expectimax-style search over piece randomness
- Hybrid search + heuristic evaluation

The full state space may become too large for exhaustive solving, so this algorithm should be implemented incrementally and benchmarked before assuming it is practical.

---

## 8. Algorithm Comparison Visualizer

A major feature should be a simulation comparison page.

Given the same:

- Initial board
- Current piece and initial placeholder/item slot contents
- Piece distribution
- Reset rule
- Selected end goal
- Number of trials
- Reward model

run multiple algorithms against identical random sequences. Each algorithm may swap the hand piece and stored piece freely before placing; simulations should model that choice and use the same starting slot state for every algorithm.

Compare metrics such as:

- Average bingos per board
- Average leaves, star candy, and certificates, reported separately
- Median bingos
- Distribution of bingos
- Probability of reaching the selected end goal
- Average number of pieces used
- Leaves, star candy, and certificates earned per piece, reported separately
- Completion rate for each of the 16 bingo lines
- Priority lines completed at the configured stopping point

### Visualization ideas

Use charts for:

- Average leaves, star candy, and certificates by algorithm
- Average bingos by algorithm
- Distribution/histogram of outcomes
- Cumulative reward over pieces
- Bingo completion rates by line
- Performance under different piece distributions

Also include a **board replay mode** where a simulation can be stepped through piece-by-piece, showing what each algorithm chose.

---

## 9. Heuristic Comparison Visualizer

In addition to aggregate simulation statistics, provide a way to compare candidate placements on the same board.

Example:

```text
Current piece: Cross

Candidate A   +2 immediate value
Candidate B   +1 immediate value
Candidate C   +0 immediate value
```

Selecting a candidate should show:

- Board before placement
- Board after placement
- Newly occupied cells
- Overlapping/nullified cells
- Completed bingo lines
- Immediate reward
- Algorithm score
- Optional simulated expected future reward

This will make it possible to understand _why_ algorithms disagree.

---

## 10. Data Collection / Calibration

Because the actual piece frequencies are currently estimates, the project should eventually support collecting real observations.

A lightweight tracker could allow a player to record:

```text
Cross:      42
Plus:       39
Horizontal: 17
Vertical:   18
Square:      7
```

The site can then calculate empirical frequencies and feed them into the simulator.

This will allow the project to answer an important question:

> Is the theoretical strategy actually better under the real game's RNG, rather than under our guessed distribution?

---

## 11. Success Criteria

The project is successful if it can:

1. Accurately represent the 7×7 board.
2. Accurately model all five pieces.
3. Correctly handle overlap/nullification.
4. Detect all 16 bingo lines.
5. Calculate bingo rewards.
6. Preview every legal placement.
7. Recommend a placement using multiple algorithms.
8. Simulate games under configurable piece distributions.
9. Compare algorithms using reproducible random sequences.
10. Demonstrate empirically whether sophisticated strategies outperform the simple 4×3 baseline.

The ultimate objective is **not to assume the adaptive strategy is optimal**, but to build a tool capable of testing that claim.

---

## 12. Suggested Development Order

### Phase 1 — Rules engine

Implement:

- 7×7 board
- Five pieces
- Legal placements
- Overlap handling
- Bingo detection
- Reward calculation

### Phase 2 — Interactive board

Add:

- Piece selector
- Placement preview
- Placement confirmation
- Bingo/reward display
- Reset

### Phase 3 — Baseline strategies

Implement:

- 4×3 strategy
- Priority-line heuristic
- Greedy reward heuristic
- Shared strategy interface for the planner and simulator

### Phase 4 — Simulation

Implement:

- User-selectable end goals and stopping rules
- Configurable piece distributions
- Random sequence generation
- Reproducible seeds
- Identical piece sequences across compared strategies
- Batch simulations
- Separate bingo and reward-vector metrics

### Phase 5 — Advanced optimization

Implement:

- Evaluate the current one-draw heuristic in simulation
- Full-game rollouts to each selected end goal
- Beam search / expectimax experiments if rollouts are promising
- Piece-substitution scoring
- Future-flexibility scoring

### Phase 6 — Comparison UI

Add:

- Algorithm comparison charts
- Board replay
- Candidate-placement comparison
- Strategy explanations
- Distribution sensitivity analysis

---

## 13. Important Design Principle

The site should keep the **game interface simple even if the underlying optimizer is complicated**.

A player should ultimately be able to:

> **Select the piece → see the recommended placement → place it → update the board.**

The complicated mathematics belongs behind the interface.

The 4×3 strategy remains valuable as the simple human baseline, while the calculator provides an option for players who want to maximize their results and are willing to follow algorithmically generated placements.
