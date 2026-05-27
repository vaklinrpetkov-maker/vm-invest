# Tables — Advanced Patterns

Deeper table patterns for the ERP. This is where most enterprise apps fall apart visually — grouped invoices, subtotal rows, expandable BOMs, nested categories. Done poorly, these feel like Excel from 2003. Done well, they feel like a serious financial tool.

Builds on [tables.md](./tables.md). All base tokens, alignments, and conventions from that doc still apply.

\---

## Philosophy

* **Visual hierarchy through weight and spacing, not color.** A total row is not "green and bold" — it's a slightly heavier weight, a slightly different background, and deliberate spacing.
* **Expandability should feel lightweight.** Expanding a row is a common action. It should not feel like opening a modal.
* **Groups are metadata, not decoration.** Group headers carry real information (count, subtotal, status). They earn their height.
* **Depth is communicated through indentation, never color-coding.** Tree levels indent by a consistent amount. Level 3 does not become purple.

\---

## Expandable Rows

For master-detail patterns where a row reveals more context without navigating away. Common use: an invoice row that expands to show line items, or an order row that expands to show shipment tracking.

### Trigger

* A chevron icon (`14px`, `neutral-500`) in the leftmost cell, right before the first content cell
* Cell reserved for the chevron: `32px` width, fixed
* Chevron rotates 90° on expand (`120ms ease-out`)
* Clicking anywhere in the parent row expands/collapses — the chevron is a visual affordance, not the only hit target
* Keyboard: `→` expands, `←` collapses

### Expanded Content

Two acceptable patterns:

**Pattern 1 — Inline sub-rows**
Sub-rows appear directly below the parent, indented by `32px` (aligned with where the parent's content starts, after the chevron column).

* Sub-rows share the same row height as parent rows (`36px`)
* Sub-row background: `neutral-50` (subtle tint to visually group them with the parent)
* No chevron column in sub-rows
* Last sub-row has a slightly darker bottom border (`neutral-200`) to cleanly terminate the group
* Sub-rows inherit all cell conventions from the parent table

Use when the child data has the same schema as the parent, or very similar.

**Pattern 2 — Detail panel**
A full-width content area appears below the parent row, spanning all columns.

* Background: `neutral-50`
* Padding: `16px 16px 16px 44px` (left padding aligns content with parent's first content cell)
* Top border: `1px solid neutral-150`
* Bottom border: `1px solid neutral-150`
* Contains arbitrary content: a nested table, a form, a timeline, key-value pairs, etc.

Use when the child content is structurally different from the parent (e.g., an order row expanding to show a map, tracking events, and customer notes).

### Expand Animation

* `height: auto` transition with a subtle fade-in of content
* Duration: `150ms ease-out`
* Never use `max-height` tricks that cause janky timing on variable content
* If rendering is expensive (nested table with 50 rows), render the content lazily on first expand and keep it mounted afterward

### Multiple Expanded Rows

By default, allow multiple rows to be expanded simultaneously. Users often compare.

Only constrain to single-expand when there's a specific reason (e.g., a detail panel that's too tall to usefully have two open).

\---

## Grouped Rows

For data that naturally clusters by category, date, status, owner, etc. Common use: invoices grouped by customer, transactions grouped by month, orders grouped by status.

### Group Header Row

Sits above each group. Contains summary information about the group.

**Appearance:**

* Height: `32px` (slightly shorter than data rows)
* Background: `neutral-50`
* Top border: `1px solid neutral-150`
* Bottom border: none (flows into the group's first data row)
* Padding matches data cells

**Content (left to right):**

* Collapse chevron (same style as expandable rows, `14px`, `neutral-500`)
* Group label: `13px`, weight `500`, `neutral-900`
* Count badge: small, `neutral-200` background, `neutral-700` text, `11px`, e.g. `12`
* Optional metadata (e.g., date range, status): `12px`, `neutral-500`
* Right-aligned summary (e.g., subtotal): mono, `13px`, weight `500`, `neutral-900`

**Example header content:**

```
▸  Acme Corporation   12   Mar 2025                    $48,320.00
```

### Collapsed State

When a group is collapsed:

* Chevron rotates to point right (0°)
* All data rows in the group are hidden
* Group header remains visible with its summary values
* Clicking the header or pressing `→` expands

### Expanded State (default)

* Chevron rotates down (90°)
* All data rows in the group render below the header
* The group visually flows as one unit — no extra spacing between the group header and its first data row

### Group Separation

Between groups, use a single `1px solid neutral-150` border (the top border of the next group header). No extra whitespace. Groups should feel like continuous sections of the same table, not cards.

### Multi-Level Grouping

For nested groups (e.g., region → country → city):

* Each group header indents by `20px` per level
* Group header background gets slightly lighter per level: L1 `neutral-50`, L2 `neutral-25` (between base and `neutral-50`), L3 transparent
* Avoid going beyond 3 levels — readability collapses

### Sticky Group Headers

When scrolling through long grouped lists, the current group header should stick to the top of the scroll container (below the table header).

* Implementation: `position: sticky; top: {headerHeight}px`
* When a new group's header reaches the top, it replaces the previous sticky header
* The sticky header gets a slight shadow (`0 1px 2px rgba(0,0,0,0.04)`) only when it's actually stuck (scroll position > 0)

\---

## Aggregation Rows

Subtotals, totals, averages. These are not data rows — they are summary rows and must visually declare themselves.

### Subtotal Row

Appears at the end of a group (inside grouped tables) or at logical breakpoints.

**Appearance:**

* Height: `36px` (same as data rows)
* Background: `neutral-50`
* Top border: `1px solid neutral-200` (slightly darker than regular row dividers)
* Text: `13px`, weight `500`, `neutral-900`
* Label cell: left-aligned, something like "Subtotal" or "Subtotal — Acme Corp"
* Numeric cells: same right-alignment and mono as data cells, but weight `500`
* Non-aggregated cells: empty (do NOT repeat the last data row's value)

### Grand Total Row

Appears at the very end of the table.

**Appearance:**

* Height: `40px` (taller than data rows — signals importance)
* Background: `neutral-100`
* Top border: `2px solid neutral-900` (the only place a 2px border is used in tables)
* Bottom border: none
* Text: `14px`, weight `600`, `neutral-900`
* Numeric cells: same mono/right-alignment, but `14px` and weight `600`

The double-line-above-totals convention comes from accounting ledgers. A single 2px border gets the same signal in a modern idiom.

### Average / Median / Count Rows

Sometimes a table shows multiple aggregate types (average and total, or count and sum). Stack them:

* Each aggregate row at `36px` height
* Background `neutral-50`
* Label distinguishes them ("Average", "Median", "Total")
* Top border on the first aggregate row only; subsequent aggregates separated by `neutral-150` dividers

### Aggregation in Grouped Tables

When both grouping and aggregation are active:

1. Data rows within the group
2. Subtotal row for the group
3. (Next group starts)
4. ...
5. Grand total row at the very bottom

The group header can also carry the subtotal value (right-aligned, matching the aggregate column). In that case, the in-group subtotal row can be omitted to reduce visual redundancy — choose one, not both.

\---

## Tree Tables

Hierarchical data where rows have parent-child relationships. Common use: chart of accounts, BOMs (bills of materials), nested category trees, organizational hierarchies.

### Indentation

* Each depth level indents by `20px` in the first content cell
* Indentation is applied via `padding-left`, not margin, so hover backgrounds still span the full row
* All other cells stay aligned across levels (no cascade)

### Expand/Collapse Chevron

* Same as expandable rows: `14px` chevron, `neutral-500`, `120ms ease-out` rotation
* Reserved `20px` of horizontal space at each level for the chevron (whether or not the row has children)
* Rows without children show a `4px` dot (`neutral-300`) in the chevron position instead, to maintain alignment

### Visual Depth Cues

Beyond indentation, use subtle cues:

* Root-level rows: `neutral-900` text, weight `500` on the label cell
* Mid-level rows: `neutral-900` text, weight `400`
* Leaf-level rows: `neutral-700` text, weight `400`

This weights the tree visually toward the structure it represents — parents stand out, leaves recede.

**Do not** use different background colors per depth. Trees beyond 2–3 levels become unreadable rainbows.

### Connecting Lines (Optional)

For deep trees, faint connecting lines can help trace parent-child relationships:

* `1px solid neutral-200`
* Drawn from the chevron of the parent down to the chevron of each child
* Bend 90° right at the child's row
* Very subtle — should barely register unless the user is tracing a specific branch

Only add connecting lines when trees commonly go beyond 3 levels. For shallower trees, indentation alone is clearer.

### Keyboard Navigation

* `↓` / `↑`: move to next/previous visible row (skips collapsed descendants)
* `→`: expand (or move to first child if already expanded)
* `←`: collapse (or move to parent if already collapsed)
* `Enter`: activate the row (open detail, edit, etc.)

### Bulk Operations on Trees

When a user selects a parent row:

* Default: only that row is selected
* With `Shift` held: the parent and all descendants are selected
* The checkbox state reflects descendant selection:

  * Unchecked: no descendants selected
  * Checked: all descendants selected
  * Indeterminate: some but not all descendants selected

\---

## Frozen Headers and Footers

For tables where totals need to stay visible while scrolling.

### Frozen Header

Already covered in `tables.md` — the header row sticks to the top during vertical scroll.

### Frozen Footer (Running Totals)

When a table has a grand total row, freeze it to the bottom of the scroll container.

* `position: sticky; bottom: 0`
* Background remains `neutral-100`
* Top border stays at `2px solid neutral-900`
* A subtle upward shadow (`0 -1px 2px rgba(0,0,0,0.04)`) appears only when the user is not scrolled to the bottom
* Shadow animates in/out at `120ms ease-out`

This lets users see the running total as they scan through hundreds of rows.

**Do not** freeze subtotals. They lose meaning when separated from their group.

\---

## Column Groups (Two-Row Headers)

For tables where columns cluster into logical sets. Common use: a revenue report with columns grouped under "Q1 2025", "Q2 2025", "Q3 2025", each containing "Revenue", "Costs", "Profit".

### Structure

Two header rows:

**Top row — group labels:**

* Height: `28px`
* Background: `neutral-50`
* Font: `12px`, weight `500`, `neutral-700`
* Cells span multiple columns (via `colspan`)
* Centered text (this is the one place centered text is allowed in tables)
* Bottom border: `1px solid neutral-150`

**Bottom row — column labels:**

* Height: `32px` (standard header height)
* Same styling as regular table headers (`12px`, weight `500`, `neutral-500`)
* Regular cell alignment (left for text, right for numbers)
* Bottom border: `1px solid neutral-150`

### Group Separators

Between column groups, use a slightly stronger vertical divider in the cells below:

* `1px solid neutral-200` right border on the last column of each group
* Only between groups, never within a group

This lets the eye follow the groupings down the table without losing its place.

### When Not to Use

Column groups only make sense when the groups are meaningfully parallel (same sub-columns under each group). If every quarter has different columns, you're better off with separate tables or a toggle to switch views.

\---

## Combining Patterns

Real ERP tables often combine several of these patterns. Guidance for keeping it readable:

### Grouped + Expandable

Common pattern: group by customer, each row expandable to show invoice line items.

* Group headers stay at their size (`32px`)
* Parent rows carry the expand chevron in the leftmost cell
* Expanded sub-rows indent with the existing group indentation

### Tree + Aggregation

Common pattern: chart of accounts with subtotals per branch.

* Each parent row shows the aggregate value of its descendants, right-aligned in the aggregate column
* The parent row uses `weight: 500` for emphasis
* No separate subtotal row is needed — the parent IS the subtotal

### Grouped + Tree

Avoid. Pick one primary organization. If both are truly needed, use a tree and treat the top level as the "group."

### Column Groups + Grouped Rows

Acceptable but visually dense. Reduce row height to `32px` (compact) to compensate.

\---

## Pre-Ship Checklist

Before any advanced table view ships:

* \[ ] Expandable rows use a chevron that rotates `90°` on expand, not a `+/−` or separate icon
* \[ ] Expanded sub-rows visually group with their parent via a subtle background tint, not a heavy border
* \[ ] Group headers are `32px`, lighter than data rows, and carry a count badge
* \[ ] Group headers can be collapsed and support sticky positioning when scrolled
* \[ ] Subtotal rows use `neutral-50` background and weight `500`
* \[ ] Grand total uses `2px solid neutral-900` top border — the ONLY place 2px borders appear in tables
* \[ ] Tree indentation is consistent (`20px` per level) and applied via padding, not margin
* \[ ] Tree depth is visible through type weight and color, never background color per level
* \[ ] Rows without children in a tree show a dot placeholder to maintain chevron column alignment
* \[ ] Keyboard navigation supports `→` / `←` for tree/group expand/collapse
* \[ ] Frozen footer applies only to grand totals, never subtotals
* \[ ] Column groups use a two-row header with merged cells and a group-separator border
* \[ ] Combining patterns is intentional — not every table needs to do everything

