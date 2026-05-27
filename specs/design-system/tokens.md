# Design Tokens

The foundational values that every other document references. Colors, typography, spacing, radii, motion, and shadows. Until these are locked in code, every other spec is floating on placeholders.

This file is the **single source of truth**. If a component spec references `neutral-150` or `accent-500`, the value is defined here. Nowhere else.

---

## Philosophy

- **Warm, not cool.** Neutrals lean slightly warm (off-white, not gray-blue). The whole system should feel more like paper than like screen.
- **Restrained palette.** One accent color. Tinted semantic colors. No default Tailwind blues or slates anywhere.
- **Named by role, not by hue.** Use `neutral-100`, `accent-500`, `danger-50` — not `gray-100`, `blue-500`, `red-50`. This lets the system theme without renaming everything.
- **Scales are deliberate.** Neutral has 12 stops, not 10 — because enterprise density benefits from two extra subtle steps between 100 and 200.

---

## Color — Neutrals

A warm neutral scale. Built from an off-white base with a slight warm cast rather than pure gray.

| Token | Hex | Use |
|---|---|---|
| `neutral-0` | `#FFFFFF` | Pure white — modals, dropdown panels, elevated surfaces only |
| `neutral-25` | `#FCFCFA` | Warmest base — optional page background, deepest tree levels |
| `neutral-50` | `#F7F7F4` | Page background, row hover, sub-row tint |
| `neutral-75` | `#F2F2EE` | Intermediate hover, subtle emphasis |
| `neutral-100` | `#EDEDE8` | Input fills, secondary button fills, selected rows |
| `neutral-150` | `#E5E5DF` | Hover state for input/secondary button fills, dividers |
| `neutral-200` | `#DCDCD5` | Stronger dividers, subtotal row top borders |
| `neutral-300` | `#BDBDB4` | Disabled element outlines, null-value placeholder (`—`) |
| `neutral-400` | `#96968B` | Placeholder text, disabled text |
| `neutral-500` | `#6E6E62` | Helper text, header labels, muted metadata |
| `neutral-600` | `#565649` | Secondary text |
| `neutral-700` | `#3F3F34` | Body text emphasis, leaf-level tree rows |
| `neutral-800` | `#2A2A22` | Stronger body text |
| `neutral-900` | `#17170F` | Primary text, primary button background |

### Why 12 stops instead of 10

Most Tailwind-based systems use 50/100/200/...900. In dense ERP contexts you need finer control between 100 and 200 for input hover states and between tree-depth backgrounds. The extra `25`, `75`, and `150` stops fill real gaps.

### Dark mode (not yet in scope)

All tokens above are for light mode. A parallel dark-mode scale will mirror the structure. Do not build ad-hoc dark variants in components — wait for a dark scale to be defined here.

---

## Color — Accent

ONE accent color, used for: primary actions (when black-primary isn't wanted), focus rings, selected states, links, and "currently active" indicators.

**Recommendation: a warm amber/ochre.** It pairs with the warm neutral base without fighting it, and it's distinct from the default Tailwind blue-600 that every unedited project uses.

| Token | Hex | Use |
|---|---|---|
| `accent-50` | `#FBF3E4` | Inline edit flash, selected-day hover in date picker |
| `accent-100` | `#F5E1B9` | Active filter chip background |
| `accent-200` | `#EDCA85` | Hover for accent-100 surfaces |
| `accent-300` | `#E0AE52` | Subtle accent surfaces |
| `accent-400` | `#CC922C` | Hover for accent-500 |
| `accent-500` | `#B07A1A` | **Default accent** — focus rings, keyboard-focused row left border, selected day in date picker |
| `accent-600` | `#8E6213` | Accent hover |
| `accent-700` | `#6D4B0E` | Accent active |
| `accent-800` | `#4E3509` | High-contrast accent on light surfaces |

**Focus ring usage:** `accent-500` at `40%` opacity (rgba equivalent: `rgba(176, 122, 26, 0.4)`).

### Alternatives if amber doesn't fit

If the brand wants something different, keep it warm and distinct from Tailwind defaults:
- **Terracotta:** `#B45F3D` for accent-500
- **Deep teal:** `#1E6B6B` for accent-500
- **Oxblood:** `#8B2E3C` for accent-500

Whatever you pick, commit to ONE scale and never introduce a second accent.

---

## Color — Semantic

For success, warning, danger, and info states. All tinted (50) + text (700) pairs, never saturated fills. Calibrated to sit harmoniously with the warm neutrals — NOT the default Tailwind greens and reds.

### Success (muted olive-green)

| Token | Hex | Use |
|---|---|---|
| `success-50` | `#EEF4E6` | Badge background (paid, shipped, active) |
| `success-100` | `#D9E5C4` | Secondary success surfaces |
| `success-500` | `#5C7A2E` | Success icons, small accents |
| `success-700` | `#3E5220` | Badge text, success messages |

### Warning (deep amber, distinct from accent)

| Token | Hex | Use |
|---|---|---|
| `warning-50` | `#FAEEDB` | Badge background (due soon, low stock) |
| `warning-100` | `#F0D9A8` | Secondary warning surfaces |
| `warning-500` | `#B87914` | Warning icons |
| `warning-800` | `#6B4408` | Badge text (warnings need higher contrast than success/danger) |

Because this is close to `accent`, use warning ONLY for status contexts (badges, timer escalation, stock alerts). Never for buttons or interactive accents.

### Danger (warm red, not Tailwind `red-500`)

| Token | Hex | Use |
|---|---|---|
| `danger-50` | `#F9E6E1` | Error input background, badge background, destructive hover |
| `danger-100` | `#EEC5BB` | Secondary danger surfaces |
| `danger-500` | `#B03A1E` | Destructive solid fill (confirmed destructive buttons) |
| `danger-600` | `#8E2D16` | Destructive hover |
| `danger-700` | `#6D2210` | Destructive text, error messages, negative numbers |

### Info (muted blue, distinct from Tailwind default)

| Token | Hex | Use |
|---|---|---|
| `info-50` | `#E4ECF2` | Badge background (in review, processing) |
| `info-100` | `#C2D3E0` | Secondary info surfaces |
| `info-500` | `#3A6B8E` | Info icons |
| `info-700` | `#264558` | Badge text |

---

## Typography — Fonts

### UI (Display and Body)

Primary choice: **Geist** (free, modern grotesque, pairs well with warm neutrals)

```css
font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

**Alternatives** (in priority order if Geist isn't preferred):
- **ABC Diatype** — paid, excellent for dense UI
- **Söhne** — paid, slightly more neutral
- **Inter** — free, safe choice but loses distinctiveness
- System stack only — acceptable fallback, loses brand identity

### Monospace (Numerics, IDs, Timestamps)

Primary choice: **Geist Mono** (pairs with Geist, free)

```css
font-family: 'Geist Mono', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
```

**Alternatives:**
- **JetBrains Mono** — free, slightly more character
- **Berkeley Mono** — paid, best-in-class for financial data
- **Commit Mono** — free, open-source alternative

### Universal Font Features

Applied globally:

```css
font-feature-settings: 'cv11', 'ss01', 'ss03';  /* Geist-specific refinements */
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
text-rendering: optimizeLegibility;
```

### Numeric Cells and Inputs

Always apply `font-variant-numeric: tabular-nums` so numbers align in columns. This is non-negotiable for tables and financial inputs.

---

## Typography — Scale

Conservative scale — enterprise density means most text lives at 12–14px. Large sizes are reserved for specific surfaces (page titles, dashboard stats).

| Token | Size | Line Height | Weight | Use |
|---|---|---|---|---|
| `text-xs` | `11px` | `14px` | 500 | Status badges, micro-labels |
| `text-sm` | `12px` | `16px` | 500 | Input labels, helper text, table headers |
| `text-base` | `13px` | `18px` | 400 | Body text, buttons, inputs, table cells |
| `text-md` | `14px` | `20px` | 500 | Emphasized body, grand total rows |
| `text-lg` | `16px` | `22px` | 500 | Modal titles, section headers |
| `text-xl` | `20px` | `26px` | 500 | Page titles |
| `text-2xl` | `28px` | `34px` | 500 | Dashboard stat values (mono for numbers) |
| `text-3xl` | `36px` | `42px` | 500 | Large dashboard figures only |

### Letter Tracking

- All body text (`text-base` and below): `-0.01em`
- Labels and headers: `-0.005em`
- Large sizes (`text-xl` and above): `-0.02em`

Tight tracking reads as "considered." The values are subtle but the compound effect across a dense UI is significant.

### Weights Used

Only these weights, period:

- `400` — default body
- `500` — labels, headers, emphasis, buttons
- `600` — grand total row, occasional emphasis (use sparingly)

**Never** 700+ weights. They read as shouting in a dense UI.

---

## Spacing

A 4-based scale. Every margin, padding, and gap snaps to one of these.

| Token | Value | Common uses |
|---|---|---|
| `space-0` | `0` | Zero reset |
| `space-0.5` | `2px` | Icon optical adjustments, hairline offsets |
| `space-1` | `4px` | Icon-to-text in tight contexts, micro-gaps |
| `space-1.5` | `6px` | Label-to-input, icon-to-label in buttons |
| `space-2` | `8px` | Button gap, tight stack |
| `space-2.5` | `10px` | Small button padding, search icon offset |
| `space-3` | `12px` | Input horizontal padding, cell padding |
| `space-4` | `16px` | Form field spacing, modal body outer padding |
| `space-5` | `20px` | Form group spacing, modal header padding |
| `space-6` | `24px` | Modal body horizontal padding, two-column form gap |
| `space-8` | `32px` | Section spacing, page header padding |
| `space-10` | `40px` | Major section spacing |
| `space-12` | `48px` | Dashboard card spacing |
| `space-16` | `64px` | Top-of-page spacing |

No arbitrary values. If a design needs something between these, the design is wrong, not the scale.

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `radius-none` | `0` | Full-bleed containers, image-adjacent surfaces |
| `radius-xs` | `2px` | Progress bar tips, very small chips |
| `radius-sm` | `4px` | Status badges, checkboxes |
| `radius-md` | `6px` | Dropdown menu items, column-menu items |
| `radius-lg` | `8px` | **Default** — buttons, inputs, selects, dropdown panels |
| `radius-xl` | `12px` | Modals — elevated surfaces |
| `radius-full` | `9999px` | Toggle tracks/thumbs, avatar circles |

The `8px` default carries almost everything. `12px` marks elevation. Nothing else.

---

## Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-instant` | `80ms` | `ease-out` | Checkbox state, tiny toggles |
| `motion-fast` | `120ms` | `ease-out` | Button hovers, input state changes, row hovers, dropdown chevrons, cell transitions |
| `motion-default` | `150ms` | `ease-out` | Modal opens, panel slides, tooltip appears, motion the user should register |
| `motion-exit` | `120ms` | `ease-in` | Modal closes, dismissals — slightly snappier than opens |
| `motion-slow` | `200ms` | `ease-out` | Expand/collapse animations, complex state changes |

**Ceiling:** nothing in the system animates longer than `200ms`. If a transition needs more time, it's probably a navigation (use routing) or a loading state (use skeletons), not an animation.

### Easing Curves

- `ease-out` — default for all UI transitions (snappy start, gentle finish)
- `ease-in` — only for exits/dismissals (gentle start, decisive finish)
- `ease-in-out` — only for indeterminate loading animations (progress bars)
- **Never** `ease-in-out` for state transitions. It feels sluggish.
- **Never** spring/bounce curves. They feel decorative.

### Indeterminate Progress

```css
@keyframes slide-indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
animation: slide-indeterminate 1200ms ease-in-out infinite;
```

Used in modal in-progress bars, page-top loading bars, and any other "working" indicator that isn't a spinner.

---

## Shadows

Shadows are reserved for **elevated surfaces only**. Not buttons. Not inputs. Not static cards.

| Token | Value | Use |
|---|---|---|
| `shadow-none` | `none` | Default for everything |
| `shadow-popover` | `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)` | Dropdown panels, comboboxes, date pickers, tooltips |
| `shadow-modal` | `0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.06)` | Modals — three layers for deep elevation |
| `shadow-sticky` | `0 1px 2px rgba(0,0,0,0.04)` | Sticky headers when scroll > 0, pinned columns when horizontal scroll > 0 |
| `shadow-footer-up` | `0 -1px 2px rgba(0,0,0,0.04)` | Frozen footer (running totals) when not scrolled to bottom |

No `shadow-sm`, `shadow-md`, `shadow-lg` from Tailwind defaults. They read as "unedited."

### 0.5px borders

The `aesthetic.md` document mentions `0.5px hairline borders`. In practice, this is difficult to render consistently across displays. The system uses:

- `1px` borders in `neutral-150` or `neutral-200` for all standard dividers
- The visual "hairline" effect comes from the low-contrast tone, not a literal 0.5px width

If 0.5px is attempted on retina-only deployments in the future, it can be introduced as a `border-hairline` token. For now, 1px hairlines in muted neutrals is the standard.

---

## Z-Index Stack

Explicit stacking order to prevent the "random number soup" anti-pattern.

| Token | Value | Use |
|---|---|---|
| `z-base` | `0` | Default |
| `z-sticky` | `10` | Sticky table headers, sticky group headers |
| `z-pinned` | `20` | Pinned table columns |
| `z-dropdown` | `100` | Select dropdowns, comboboxes, column menus |
| `z-overlay` | `200` | Tooltips |
| `z-modal-backdrop` | `900` | Modal backdrop |
| `z-modal` | `1000` | Modal panel |
| `z-command-palette` | `1100` | ⌘K palette (above modals) |
| `z-toast` | `1200` | Toasts, snackbars — above everything |

Never use arbitrary z-index values. If a component needs a new stacking level, add a token.

---

## Breakpoints

The ERP is desktop-first. Mobile support is secondary, and some views (dense tables) are explicitly desktop-only.

| Token | Value | Use |
|---|---|---|
| `screen-sm` | `640px` | Smallest "mobile landscape / small tablet" |
| `screen-md` | `768px` | Tablet portrait |
| `screen-lg` | `1024px` | Tablet landscape / small desktop — **minimum for full feature set** |
| `screen-xl` | `1280px` | Standard desktop — **target design width** |
| `screen-2xl` | `1536px` | Large desktop |

Below `screen-lg`, some components (dense tables, multi-column forms) show a "This view is optimized for desktop" message and collapse to a simplified version.

---

## Tailwind Config

Drop-in extension for `tailwind.config.js`. Adjust as tokens evolve.

```js
export default {
  theme: {
    extend: {
      colors: {
        neutral: {
          0:   '#FFFFFF',
          25:  '#FCFCFA',
          50:  '#F7F7F4',
          75:  '#F2F2EE',
          100: '#EDEDE8',
          150: '#E5E5DF',
          200: '#DCDCD5',
          300: '#BDBDB4',
          400: '#96968B',
          500: '#6E6E62',
          600: '#565649',
          700: '#3F3F34',
          800: '#2A2A22',
          900: '#17170F',
        },
        accent: {
          50:  '#FBF3E4',
          100: '#F5E1B9',
          200: '#EDCA85',
          300: '#E0AE52',
          400: '#CC922C',
          500: '#B07A1A',
          600: '#8E6213',
          700: '#6D4B0E',
          800: '#4E3509',
        },
        success: {
          50:  '#EEF4E6',
          100: '#D9E5C4',
          500: '#5C7A2E',
          700: '#3E5220',
        },
        warning: {
          50:  '#FAEEDB',
          100: '#F0D9A8',
          500: '#B87914',
          800: '#6B4408',
        },
        danger: {
          50:  '#F9E6E1',
          100: '#EEC5BB',
          500: '#B03A1E',
          600: '#8E2D16',
          700: '#6D2210',
        },
        info: {
          50:  '#E4ECF2',
          100: '#C2D3E0',
          500: '#3A6B8E',
          700: '#264558',
        },
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs':   ['11px', { lineHeight: '14px', letterSpacing: '-0.005em' }],
        'sm':   ['12px', { lineHeight: '16px', letterSpacing: '-0.005em' }],
        'base': ['13px', { lineHeight: '18px', letterSpacing: '-0.01em' }],
        'md':   ['14px', { lineHeight: '20px', letterSpacing: '-0.01em' }],
        'lg':   ['16px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        'xl':   ['20px', { lineHeight: '26px', letterSpacing: '-0.02em' }],
        '2xl':  ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        '3xl':  ['36px', { lineHeight: '42px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        'none': '0',
        'xs':   '2px',
        'sm':   '4px',
        'md':   '6px',
        'lg':   '8px',
        'xl':   '12px',
        'full': '9999px',
      },
      boxShadow: {
        'popover':     '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
        'modal':       '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.06)',
        'sticky':      '0 1px 2px rgba(0,0,0,0.04)',
        'footer-up':   '0 -1px 2px rgba(0,0,0,0.04)',
      },
      transitionDuration: {
        '80':  '80ms',
        '120': '120ms',
        '150': '150ms',
        '200': '200ms',
      },
      zIndex: {
        'sticky':          '10',
        'pinned':          '20',
        'dropdown':        '100',
        'overlay':         '200',
        'modal-backdrop':  '900',
        'modal':           '1000',
        'command-palette': '1100',
        'toast':           '1200',
      },
      keyframes: {
        'slide-indeterminate': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'slide-indeterminate': 'slide-indeterminate 1200ms ease-in-out infinite',
      },
    },
  },
};
```

---

## Reconciliation With Existing Docs

This file supersedes placeholder references in all earlier docs. Specifically:

- **`aesthetic.md`** mentions "0.5px hairlines" — the practical implementation is 1px in `neutral-150`/`neutral-200` (explained in the Shadows section above). `aesthetic.md` can be left as aspirational; this file is the implementation truth.
- **`aesthetic.md`** says "avoid default Tailwind greens and reds" — the `success`, `warning`, `danger`, and `info` scales above fulfill that requirement.
- **`buttons.md`**, **`inputs.md`**, **`tables.md`**, **`tables-advanced.md`**, **`modals.md`** all reference `neutral-150`, `neutral-50`, `red-50`, `red-600`, `red-700`, `amber-50`, `amber-800`, `green-50`, `green-700`, `blue-50`, `blue-700`, and accent colors. All of these now resolve to the tokens defined in this file:
  - `red-*` → `danger-*`
  - `amber-*` → `warning-*`
  - `green-*` → `success-*`
  - `blue-*` → `info-*`
  - `accent` → `accent-500` (or `accent-500/40` for focus rings)

Component specs should be updated incrementally to use these token names directly, but until then, developers should apply the mapping above.

---

## Pre-Ship Checklist

Before the tokens are considered locked:

- [ ] All hex values reviewed against the actual brand color of vminvest.bg (if any brand constraints exist)
- [ ] Geist and Geist Mono licensing confirmed (both are free for commercial use as of writing)
- [ ] Dark mode scale deferred, not attempted ad-hoc
- [ ] All component specs migrated from `red-*` / `amber-*` / `green-*` / `blue-*` to `danger-*` / `warning-*` / `success-*` / `info-*`
- [ ] `neutral-150`, `accent-500`, and all semantic tokens defined in `tailwind.config.js`
- [ ] Keyframe `slide-indeterminate` registered in Tailwind config
- [ ] Z-index scale exclusively sourced from tokens (no arbitrary values in components)
- [ ] Font fallback stacks tested without Geist loaded (to confirm graceful degradation)
- [ ] Tabular-nums applied globally via CSS to numeric contexts (tables, inputs, stats)
