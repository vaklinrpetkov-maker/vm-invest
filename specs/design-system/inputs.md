# Inputs

Form controls for the ERP, designed to harmonize with the [button system](./buttons.md). Same Attio/Pylon sensibility: soft, rounded, tinted. Separation through background layering rather than borders.

---

## Philosophy

- **Inputs share the visual language of buttons.** Same radius, same heights, same tinted-background approach. They should feel like they belong in the same system.
- **Fills over borders.** Inputs use a subtle background tint to signal "this is a field," not 1px borders on white.
- **Labels do the work.** Clear, consistent labels above fields. No placeholder-as-label nonsense — placeholders are for examples, labels are for names.
- **Density matches data volume.** ERP forms are long. Inputs are compact enough that a 20-field form doesn't require endless scrolling.

---

## Shared Tokens

Values consistent across all input types. Matches button tokens where applicable.

| Property | Value |
|---|---|
| Border radius | `8px` |
| Font size | `13px` |
| Font weight | `400` (inputs), `500` (labels) |
| Letter tracking | `-0.01em` |
| Font feature | `tabular-nums` on numeric inputs |
| Transition | `120ms ease-out` on `background-color`, `box-shadow` |
| Focus ring | `2px` ring, `0px` offset (inset-adjacent), accent color at 40% opacity |

### Height Scale

Matches the button scale exactly so buttons and inputs align on the same row.

| Size | Height | Horizontal padding |
|---|---|---|
| Small | `28px` | `10px` |
| Default | `32px` | `12px` |
| Large | `36px` | `14px` |

**Critical:** input height must match button height in the same size. A 32px input next to a 32px button is the single most common alignment bug and the easiest to prevent.

---

## Text Input

The baseline control. Everything else inherits from it.

**Appearance:**
- Background: `neutral-100` (same tint as Secondary buttons)
- Text: `neutral-900`
- Placeholder: `neutral-400`
- No border, no shadow

**States:**
- Hover: background deepens to `neutral-150`
- Focus: background returns to `neutral-100`, accent ring appears
- Disabled: background `neutral-50`, text `neutral-400`, cursor `not-allowed`
- Read-only: background `transparent`, no hover response, text `neutral-700`
- Error: background `red-50`, focus ring `red-500/40`

**Key detail:** on focus, the background does NOT darken. The ring is the focus signal. Keeping the fill stable prevents a "jumpy" feel when tabbing through a long form.

---

## Label

Above the input, never beside it (except for inline rows).

- Font size: `12px`
- Font weight: `500`
- Color: `neutral-700`
- Margin-bottom: `6px`
- Letter tracking: `-0.005em`

### Required Indicator

A subtle `neutral-400` asterisk after the label. Never red — red is reserved for errors.

### Helper Text

Below the input. `12px`, `neutral-500`, `margin-top: 6px`. Used for format hints, character limits, or context.

### Error Text

Replaces helper text on error. `12px`, `red-600`, `margin-top: 6px`. Specific and actionable — "Must be a valid email" not "Invalid input".

---

## Textarea

Same visual treatment as text input, multi-line.

- Minimum height: `72px` (roughly three lines)
- Padding: `10px 12px`
- Resize: `vertical` only, never horizontal
- Line height: `1.5`

All other tokens match text input.

---

## Select / Dropdown

Looks identical to a text input. Chevron icon on the right.

**Appearance:**
- Same background, text, and state treatment as text input
- Chevron: `14px`, `neutral-500`, right-aligned with `12px` padding from edge
- Chevron rotates 180° when open (120ms ease-out)

**Dropdown panel:**
- Background: pure white (`neutral-0`) — this is where shadows ARE allowed
- Shadow: subtle, layered — `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)`
- Border radius: `8px`
- Padding: `4px`
- Max height: `280px`, then scroll

**Dropdown items:**
- Height: `32px`
- Padding: `0 10px`
- Border radius: `6px` (slightly tighter than the panel)
- Hover: background `neutral-100`
- Selected: background `neutral-100`, a checkmark icon on the right
- Keyboard-focused: background `neutral-150`

---

## Combobox / Searchable Select

Same as Select, but the trigger is a text input. Typing filters the dropdown.

- Filtering is fuzzy, not prefix-only
- Matched characters are emphasized with `font-weight: 500`, not highlighted with background color
- Empty result state: "No matches" in `neutral-500`, `12px`, padded in the panel

---

## Checkbox

Small, tactile, tinted.

**Appearance:**
- Size: `16px × 16px`
- Border radius: `4px`
- Unchecked background: `neutral-100`
- Checked background: accent color (or `neutral-900` for the neutral variant)
- Check icon: `12px`, white, stroke weight `2px`

**States:**
- Hover (unchecked): background `neutral-150`
- Hover (checked): accent color darkens ~8%
- Focus: ring `2px`, offset `2px`, accent at 40%
- Disabled: background `neutral-50`, check icon `neutral-300`
- Indeterminate: same as checked, but with a horizontal bar instead of a checkmark

**Label placement:** `8px` to the right of the box, vertically centered. `13px`, `neutral-900`.

---

## Radio

Same dimensions and tokens as checkbox, but circular.

- Size: `16px × 16px`
- Unchecked: `neutral-100` background, no inner dot
- Checked: `neutral-100` background, `6px` accent-color inner dot centered
- All other states match checkbox

**Key detail:** the outer container does NOT fill with the accent color when selected. Only the inner dot. This is softer and reads better in dense forms.

---

## Toggle / Switch

For binary settings, not for form submission values (use checkbox for those).

**Appearance:**
- Track: `28px × 16px`, border radius `full` (pill)
- Thumb: `12px × 12px`, border radius `full`, `2px` inset from track edge
- Off state: track `neutral-200`, thumb white
- On state: track accent color (or `neutral-900`), thumb white
- Transition: `150ms ease-out` on track color and thumb position

**Do not** use toggles for destructive settings. Toggles feel low-commitment. Destructive settings need explicit confirmation.

---

## Number Input

Visually identical to text input, with behavioral differences.

- Font: `tabular-nums` enforced
- Right-aligned for amounts, quantities, prices (matches table conventions)
- Left-aligned for IDs, years, counts that read like identifiers
- No spinner buttons (browser-default `::-webkit-inner-spin-button` hidden) — keyboard and typing only
- Step buttons, if needed, live outside the input as small Ghost buttons

---

## Date Input

Text input + calendar icon on the right.

**Trigger:**
- Same as text input
- Calendar icon: `14px`, `neutral-500`, right-aligned
- Typing allowed in formats the system accepts (`MM/DD/YYYY`, `YYYY-MM-DD`)

**Calendar panel:**
- Same shadow and border treatment as Select panel
- Day cells: `32px × 32px`, border radius `6px`
- Today: `neutral-900` text, weight 500
- Selected: accent-color background, white text
- Hover: `neutral-100` background
- Out-of-month days: `neutral-300`
- Disabled days: `neutral-200`, cursor not-allowed

---

## Search Input

A text input with specific affordances.

- Search icon `14px` on the left, `10px` padding from edge
- Text padding-left: `32px` to clear the icon
- On focus, the icon darkens from `neutral-500` to `neutral-700`
- Clear button (`×`) appears on the right when there's a value — Ghost-style, `14px` icon

---

## Input Groups

For composite inputs like currency, quantity with unit, or prefixed IDs.

**Structure:**
- Single background fill spanning the full group
- Internal dividers: a 1px `neutral-200` line between sections (this is the one place lines are acceptable)
- Prefix/suffix text: `neutral-500`, same size as input text
- The "main" input section keeps full-width hover/focus treatment

Example: a currency input with `$` prefix and `USD` suffix, all sharing one rounded container.

---

## Form Layout

Not strictly inputs, but they live and die together.

- Field spacing: `16px` between stacked fields, `20px` between field groups
- Label-to-input spacing: `6px`
- Input-to-helper spacing: `6px`
- Two-column forms: `24px` horizontal gap
- Section headers: `13px`, weight 500, `neutral-900`, `24px` top margin, `12px` bottom margin, followed by a 1px `neutral-200` divider

**Never:**
- Put labels inside inputs as placeholders
- Stack more than 8 fields without a section break
- Mix left-aligned and right-aligned labels in the same form

---

## Tailwind Reference Classes

Starting points. Adjust neutral scale to match design tokens.

```tsx
// Text input (default size)
className="h-8 px-3 w-full rounded-lg bg-neutral-100 text-[13px] text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed transition-colors duration-100"

// Textarea
className="min-h-[72px] px-3 py-2.5 w-full rounded-lg bg-neutral-100 text-[13px] text-neutral-900 placeholder:text-neutral-400 tracking-tight leading-relaxed resize-y hover:bg-neutral-150 focus:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors duration-100"

// Label
className="text-[12px] font-medium text-neutral-700 tracking-tight mb-1.5 block"

// Helper text
className="text-[12px] text-neutral-500 mt-1.5"

// Error text
className="text-[12px] text-red-600 mt-1.5"

// Checkbox (using peer for styling)
className="h-4 w-4 rounded bg-neutral-100 checked:bg-neutral-900 hover:bg-neutral-150 checked:hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent/40 transition-colors duration-100"

// Select trigger (same as text input + chevron)
className="h-8 pl-3 pr-8 w-full rounded-lg bg-neutral-100 text-[13px] text-neutral-900 text-left tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors duration-100"

// Dropdown panel
className="bg-white rounded-lg p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] max-h-[280px] overflow-y-auto"

// Dropdown item
className="h-8 px-2.5 rounded-md text-[13px] text-neutral-900 flex items-center hover:bg-neutral-100 data-[selected]:bg-neutral-100 data-[focused]:bg-neutral-150 cursor-pointer"
```

---

## Pre-Ship Checklist

Before any form ships:

- [ ] Every input height matches the corresponding button height on the same row
- [ ] All inputs share the `8px` radius
- [ ] No 1px borders on any input (except internal dividers in input groups)
- [ ] No placeholder-as-label
- [ ] Every field has a visible label
- [ ] Required fields marked with neutral asterisk, not red
- [ ] Error states use `red-50` background and `red-600` text, with specific error messages
- [ ] Numeric inputs use `tabular-nums` and correct alignment (right for amounts, left for IDs)
- [ ] Disabled states are visually distinct but not invisible
- [ ] Focus rings visible and consistent
- [ ] Dropdown panels use the allowed shadow treatment (not default Tailwind shadows)
- [ ] Field spacing follows the 16/20/24 rhythm
