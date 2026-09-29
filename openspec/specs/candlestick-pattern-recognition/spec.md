# Candlestick Pattern Recognition

## Purpose

TBD

## Requirements

### Requirement: Algorithm library detects 32 classic candlestick patterns
The system SHALL provide a pure-function algorithm library under `shared/patterns/` that detects exactly the 32 classic Japanese candlestick patterns listed in the change's PRD (single-candle 9, two-candle 10, three-or-more-candle 13). Each pattern SHALL be defined independently as a `PatternDefinition` and registered in `registry.ts`. The library SHALL be importable from the renderer process and SHALL NOT depend on `fs` or `electron`.

#### Scenario: All 32 patterns are registered
- **WHEN** the registry is initialized
- **THEN** it contains exactly 32 `PatternDefinition` entries covering: doji, long_legged_doji, gravestone_doji, dragonfly_doji, hammer, hanging_man, inverted_hammer, shooting_star, marubozu, bullish_engulfing, bearish_engulfing, dark_cloud_cover, piercing_pattern, bullish_harami, bearish_harami, tweeter_top, tweeter_bottom, on_neck, in_neck, morning_star, evening_star, bullish_abandoned_baby, bearish_abandoned_baby, three_white_soldiers, three_black_crows, deliberation, rising_three_methods, falling_three_methods, thrusting, belt_hold_confirmed, separating_lines, mat_hold

#### Scenario: Pure-function detector returns hit or null
- **WHEN** a single pattern detector is invoked with a `PatternContext` (candles, index, trend)
- **THEN** it returns either a `PatternHit` (containing code, name, direction, startIndex, endIndex, strength, trendContext) or `null`
- **AND** it performs no I/O and has no side effects

#### Scenario: Detection entry deduplicates same-position same-pattern hits
- **WHEN** `detectPatterns(candles)` is invoked and multiple definitions hit the same pattern at the same endIndex
- **THEN** only the hit with the highest strength is retained in the returned array

### Requirement: Pattern detection enforces trend preconditions
The system SHALL validate each pattern's required trend context before reporting a hit. Reversal patterns SHALL require either a downtrend (bullish reversal) or uptrend (bearish reversal). Continuation patterns SHALL require the trend to be consistent with the pattern direction. Trend SHALL be computed from MA5 vs MA10 plus the close price 10 bars ago. When the precondition is not met, the detector MUST return `null`.

#### Scenario: Hammer requires downtrend
- **WHEN** a hammer-shaped candle occurs but MA5 > MA10 and close is above the close 10 bars ago
- **THEN** the hammer detector returns `null`
- **AND** no hit is added to the result list

#### Scenario: Shooting star requires uptrend
- **WHEN** a shooting-star-shaped candle occurs but MA5 < MA10 and close is below the close 10 bars ago
- **THEN** the shooting star detector returns `null`

#### Scenario: Rising three methods requires uptrend
- **WHEN** a five-bar rising three methods formation occurs but MA5 < MA10
- **THEN** the rising three methods detector returns `null`

### Requirement: Strength scoring reflects geometric conformity
Each pattern SHALL compute a strength score in `[0, 1]` based on how closely the geometric ratios satisfy the textbook thresholds. A score of `1.0` indicates a textbook-standard formation; lower scores indicate proximity to the threshold floor. Scores SHALL be monotonically related to geometric conformity.

#### Scenario: Hammer strength is monotonic in lower-shadow ratio
- **WHEN** two hammer-shaped candles are detected, one with lower-shadow = 2.0× body, another with lower-shadow = 3.5× body (both above the 2.0 floor)
- **THEN** the second hammer's strength is greater than or equal to the first

#### Scenario: All strengths are bounded
- **WHEN** any pattern detector returns a hit
- **THEN** its `strength` field satisfies `0 <= strength <= 1`

### Requirement: Page lets user select one watchlist stock to scan
The system SHALL provide a `PatternScanView` page reachable via the side nav item "形态检测" and the route `/pattern-scan`. The page SHALL provide a stock selector scoped to the user's watchlist. Stocks without downloaded K-line data SHALL be disabled in the selector with an inline prompt "请先下载 K 线".

#### Scenario: Side nav exposes the entry
- **WHEN** the user opens the app side nav
- **THEN** a "形态检测" menu item is visible and navigates to `/pattern-scan`

#### Scenario: Selector disables stocks without K-line data
- **WHEN** the watchlist contains a stock with no records in `kline_data`
- **THEN** that stock is shown as disabled in the selector with the prompt "请先下载 K 线"

#### Scenario: User selects a single stock
- **WHEN** the user picks one enabled stock from the selector
- **THEN** the page loads that stock's K-line data via the existing `kline:get-chart-data` IPC

### Requirement: User can choose adjustment type and date window
The page SHALL expose a `adjustType` control with default `'qfq'` (forward-adjusted) and the option to switch to `'none'` (unadjusted). The page SHALL expose a date window filter with a default of "近 30 日" and adjustable options. Switching the stock or the adjustment type SHALL automatically re-fetch data and re-run detection without manually clicking the "检测" button. The "检测" button is reserved for manual re-runs under the same conditions.

#### Scenario: Default state on first load
- **WHEN** the user first opens `/pattern-scan` after selecting a stock
- **THEN** `adjustType` is `'qfq'` and the date window is "近 30 日"

#### Scenario: Switching stock triggers automatic re-scan
- **WHEN** the user picks a different stock in the selector
- **THEN** the page re-fetches K-line data and re-runs detection automatically

#### Scenario: Switching adjustment triggers automatic re-scan
- **WHEN** the user toggles `adjustType` between `'qfq'` and `'none'`
- **THEN** the page re-fetches K-line data and re-runs detection automatically

### Requirement: Results list shows pattern, date, direction, strength, trend precondition
The page SHALL render a results list with one row per `PatternHit`. Each row SHALL display: pattern name, date of the endIndex candle, direction (bullish/bearish/warning), strength (with a visual bar and percentage), and the trend precondition (up/down/flat) under which the pattern fired. The list SHALL be sorted by strength descending by default and SHALL support switching the sort to date.

#### Scenario: Default sort by strength
- **WHEN** the user loads the page and detection completes
- **THEN** the result rows are ordered by `strength` descending

#### Scenario: Switch sort to date
- **WHEN** the user activates the "按日期排序" toggle
- **THEN** the rows are re-ordered by `endIndex` ascending

### Requirement: User can filter results by date window, direction, and pattern
The page SHALL expose three filters: date window, direction (全部/看涨/看跌/转折预警), and pattern (全部 + 32 specific values). The filtered list SHALL be a `computed` derivation of the full hits array and the current filters, with no separate stored copy.

#### Scenario: Direction filter narrows the list
- **WHEN** the user sets direction = "看涨"
- **THEN** only hits with `direction = 'bullish'` are visible

#### Scenario: Pattern filter narrows the list
- **WHEN** the user sets pattern = "morning_star"
- **THEN** only hits with `code = 'morning_star'` are visible

### Requirement: Result rows drive chart linkage
The page SHALL embed the existing K-line chart (composable `useKlineChart`). Clicking a result row SHALL scroll the embedded chart to the candle at `endIndex` and render that hit's pattern marker on the candle.

#### Scenario: Click row scrolls chart to pattern candle
- **WHEN** the user clicks a result row whose `endIndex = 42`
- **THEN** the embedded chart's horizontal scroll position centers on candle 42

#### Scenario: Click row highlights the marker
- **WHEN** the user clicks a result row
- **THEN** the corresponding pattern marker on the embedded chart is rendered with a highlight style

### Requirement: useKlineChart exposes a pattern marker drawing method
The composable `useKlineChart` SHALL expose a new method `drawPatternMarkers(hits: PatternHit[])` that draws pattern markers on a dedicated drawing layer, coexisting with the existing `drawTradeMarkers` without visual conflict. Bullish patterns SHALL render an up-arrow below the candle in a green palette; bearish patterns SHALL render a down-arrow above the candle in a red palette; warning patterns SHALL render a diamond marker in a yellow palette. Markers SHALL show the pattern name on hover.

#### Scenario: Bullish marker is drawn below the candle
- **WHEN** `drawPatternMarkers` is invoked with a bullish hit at `endIndex = 10`
- **THEN** an up-arrow is drawn below the candle at index 10 using a green palette

#### Scenario: Bearish marker is drawn above the candle
- **WHEN** `drawPatternMarkers` is invoked with a bearish hit at `endIndex = 12`
- **THEN** a down-arrow is drawn above the candle at index 12 using a red palette

#### Scenario: Warning marker is drawn as a diamond
- **WHEN** `drawPatternMarkers` is invoked with a warning hit at `endIndex = 15`
- **THEN** a diamond marker is drawn near the candle at index 15 using a yellow palette

#### Scenario: Marker layer does not collide with trade marker layer
- **WHEN** `drawPatternMarkers` and `drawTradeMarkers` are both invoked for the same canvas
- **THEN** both layers render without overwriting each other

### Requirement: Pattern detection surfaces clear error and empty states
The page SHALL surface the following states distinctly:
- **Insufficient data**: K-line count < 20 → show "数据不足，无法检测".
- **No K-line data**: stock not yet downloaded → selector disables the stock and shows "请先下载 K 线".
- **No hits**: full pipeline succeeds but `detectPatterns` returns `[]` → show "近期未发现蜡烛图形态信号".
- **IPC failure**: K-line fetch fails → reuse the existing Toast error notification.

#### Scenario: Insufficient data message
- **WHEN** the selected stock has fewer than 20 K-line records
- **THEN** the page displays "数据不足，无法检测" instead of running detection

#### Scenario: Empty hits message
- **WHEN** detection completes with zero hits
- **THEN** the page displays "近期未发现蜡烛图形态信号"

### Requirement: Types are centralized in shared/types
All pattern-related types (`CandlestickPatternCode`, `PatternDirection`, `PatternHit`, `TrendInfo`, `PatternContext`) SHALL be declared in `shared/types/index.ts`. The `CandlestickPatternCode` SHALL be a TypeScript string literal union covering exactly the 32 pattern codes. Types SHALL be shared between renderer and main process (no duplicate declarations).

#### Scenario: Type covers all 32 codes
- **WHEN** `shared/types/index.ts` is imported
- **THEN** `CandlestickPatternCode` includes exactly the 32 codes listed in this spec

#### Scenario: Pattern interfaces are reusable
- **WHEN** the renderer imports `PatternHit` / `TrendInfo` / `PatternContext`
- **THEN** the same types are available to the main process without redefinition

### Requirement: Algorithm library is covered by unit tests
The system SHALL provide unit tests under `tests/unit/patterns/` covering, at minimum:
- A positive case for each of the 32 patterns (textbook geometry + valid trend precondition).
- Two negative case families for each pattern: (a) geometric condition broken, (b) trend precondition not satisfied.
- Strength monotonicity for at least three representative patterns.
- `TrendInfo` correctness in up/down/flat regimes.

#### Scenario: Positive case per pattern passes
- **WHEN** the test suite runs the positive-case suite
- **THEN** every one of the 32 patterns has at least one passing positive test

#### Scenario: Trend-violation negative case suppresses hit
- **WHEN** the test suite runs the trend-violation negative-case suite for hammer
- **THEN** the hammer detector returns `null` for an uptrend hammer-shaped candle

#### Scenario: Geometric-violation negative case suppresses hit
- **WHEN** the test suite runs the geometric-violation negative-case suite for morning star
- **THEN** the morning star detector returns `null` for a non-star middle bar

### Requirement: Non-goals are explicitly excluded
The system SHALL NOT implement, in this change, any of the following:
- Batch scanning of the entire watchlist (single-stock only).
- Weekly / intraday timeframe pattern detection (daily K-line only).
- Persistent storage of detection results.
- Historical pattern backtesting or win-rate statistics.

#### Scenario: No batch scan entry point
- **WHEN** the user inspects the side nav and page
- **THEN** there is no control to trigger a "scan all watchlist" operation

#### Scenario: No persistence layer
- **WHEN** the user reloads `/pattern-scan`
- **THEN** no prior hits are restored from disk; detection re-runs from scratch against the loaded K-line data
