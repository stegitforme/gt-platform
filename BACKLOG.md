# Backlog

Filed-but-not-yet-built items. Each entry should be self-contained enough that
a fresh session can pick it up cold.

---

## Audit: Analytics tab P&L reconciliation against Fidelity Closed Positions

**Filed:** 2026-04-25
**Severity:** medium — numbers shown to user are wrong / inconsistent
**Scope:** Analytics tab only. Do NOT touch trading logic, SA tab, SG Score,
Planner, Trade Manager, Roll Review, or TENX.

### The discrepancy

| View | Period | Total |
|---|---|---|
| Fidelity Closed Positions | This Month | **+$76,257.17** |
| Fidelity Closed Positions | 2026 (YTD) | **+$61,943.40** |
| GOGO Analytics → Options | Last 1 month | +$48,935 |
| GOGO Analytics → Options | Year to date | +$38,967 |

App is under-counting in both windows. Two places to look first:
1. **Period definition** — "Last 1 month" is rolling-30-day, Fidelity's
   "This Month" is calendar-month-to-date. Different windows → different sums.
2. **Type filter** — `Type=Options` may be excluding stock-leg components of
   rolls (or the opposite — including covered-call legs Fidelity reports as
   "Stock"). Need to verify the inclusion rule against Fidelity's own
   bucket.

### Required fixes

1. **Period option clarity**
   Either rename `"Last 1 month"` → `"Last 30 days"` to make the rolling
   window obvious, OR add a new `"This Month"` calendar-month-to-date
   option that matches Fidelity exactly. (Probably both — keep rolling for
   trend, add calendar for reconciliation.)

2. **Type=Options scope verification**
   Confirm whether the Options bucket should:
   - match Fidelity's **option-only** closed positions (current intent?), or
   - include the equity legs of rolled positions (covered-call exits etc.)

   Document the answer in the renamed period label or a tooltip.

3. **Reconciliation/debug table**
   Add a collapsible debug panel (like the existing Stop Comparison detail
   pane) showing per-lot inclusion:

   | ticker | sold date | type (Stock/Option) | realizedPnl | included? | exclusion reason |
   |---|---|---|---|---|---|

   Source: `FID_CLOSED.lots[]` (already loaded by Trade Manager from the
   Closed Lots CSV).

4. **Date parsing + timezone**
   Inspect how `sold` dates are parsed against the period boundary. Common
   trap: `new Date('2026-04-01')` in a non-UTC zone parses to UTC midnight
   = local previous day. Verify the period filter uses the user's local
   calendar day, not UTC.

5. **Roll lot accounting**
   Fidelity reports each leg of a roll as a separate closed lot. Verify:
   - We're not double-counting (same `lot_id` included twice)
   - We're not silently dropping partial lots (qty < initial)
   - The `seqCounter`-based dedupe in `parseFidelityClosedLotsCSV`
     (~line 11340) is producing one row per actual lot and not collapsing
     real same-day same-strike fills

6. **Headline comparison strip**
   At the top of the Analytics tab, when a Fidelity target is known
   (user can enter it manually OR we read it from a Fidelity Performance
   CSV if available), show:
   ```
   App included P&L: $XX,XXX
   Fidelity target:  $YY,YYY
   Δ:               $ZZ,ZZZ  (X excluded lots — see debug table)
   ```

### Constraints
- Read-only of `FID_CLOSED.lots[]` — do not mutate
- Do not change `parseFidelityClosedLotsCSV` parser unless a defect is
  proven; if changed, also re-test Roll Review which depends on the same
  closed-lot dedupe
- Do not change SG Score, SA tab, Planner, Trade Manager, Roll Review,
  TENX, or order logic

### Suggested entry points (current code)
- `FID_CLOSED.lots` — array populated by `parseFidelityClosedLotsCSV`
  (~line 11305 in `index.html`)
- Analytics tab page id: `#analytics`
- Existing period selector + Type=Options filter live inside the
  Analytics render path — grep for `analytics` / period dropdown to find
  the current sum loop

### Acceptance criteria
- "This Month" period option returns the same number as Fidelity Closed
  Positions → This Month, within $1
- Year-to-date period option returns the same as Fidelity 2026 within $1
- Debug table shows every closed lot with included? flag and reason for
  any exclusion (rolling-window cutoff, type filter, qty=0, etc.)
- Headline comparison strip lets the user spot mismatches at a glance
