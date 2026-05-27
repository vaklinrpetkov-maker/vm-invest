# Modals

Modal dialogs for the ERP. Used for focused tasks that interrupt the main flow: creating a record, confirming a destructive action, stopping a timer with a required comment, or collecting a structured input that doesn't warrant a full page.

Inherits the visual language from [buttons.md](./buttons.md) and [inputs.md](./inputs.md).

\---

## Philosophy

* **Modals are interruptions. Use them sparingly.** If a task takes more than 10 fields or branches across steps, it belongs on a dedicated page, not in a modal.
* **One modal at a time.** Never stack modals. If a modal needs to trigger another confirmation, the first modal replaces its content rather than opening a second overlay.
* **Keyboard-first.** Every modal closes on Esc (with appropriate safeguards for destructive/in-progress actions). Every modal has a default focus target and a sensible Enter/Cmd+Enter submit behavior.
* **Shadows and overlays are earned here.** Modals are one of the few places where shadows and backdrop dimming are allowed. Use them deliberately.

\---

## Shared Tokens

|Property|Value|
|-|-|
|Modal border radius|`12px`|
|Modal background|`neutral-0` (pure white)|
|Modal shadow|`0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.06)`|
|Backdrop|`rgba(17, 17, 17, 0.4)` with `backdrop-filter: blur(2px)`|
|Header padding|`20px 24px 16px 24px`|
|Body padding|`0 24px 20px 24px`|
|Footer padding|`16px 24px 20px 24px`|
|Footer top border|`1px solid neutral-150`|
|Transition (open)|`150ms ease-out`|
|Transition (close)|`120ms ease-in`|

### Width Scale

Fixed widths, not responsive percentages. Modals should feel composed, not stretched.

|Size|Width|Use for|
|-|-|-|
|`xs`|`360px`|Confirmations, single-field prompts|
|`sm`|`440px`|Short forms (2–5 fields), simple choices|
|`md`|`560px`|Standard forms (5–10 fields), record creation|
|`lg`|`720px`|Complex forms, multi-column layouts|
|`xl`|`880px`|Only when strictly necessary — consider a page instead|

On viewports narrower than the modal width + 32px, the modal becomes `calc(100vw - 32px)` with `16px` margins on each side.

### Max Height

Modals never exceed `calc(100vh - 80px)`. When content overflows, only the **body** scrolls. Header and footer remain fixed.

\---

## Structure

All modals share the same three-section structure: header, body, footer. Sections are visually defined by padding and a single divider above the footer.

### Header

* Title: `16px`, weight `500`, `neutral-900`, letter tracking `-0.01em`
* Optional subtitle/description below title: `13px`, `neutral-500`, `6px` top margin
* Close button: Ghost-style icon button (`×`, `16px`), top-right, `16px` from the edges
* No border below the header — the visual break comes from body padding

### Body

* Content area
* Scrolls independently when overflowing
* No background color (inherits modal `neutral-0`)
* For forms, follows the field spacing conventions from [inputs.md](./inputs.md) (16px between fields, 20px between groups)

### Footer

* Top border: `1px solid neutral-150` — the only structural line in the modal
* Buttons right-aligned
* Primary action on the far right, Secondary/Cancel to its left, `8px` gap between buttons
* Optional left-aligned content (e.g., "Changes saved automatically" in `neutral-500`, `12px`)

\---

## Backdrop

* Color: `rgba(17, 17, 17, 0.4)` — warm near-black, not pure black
* Light blur: `backdrop-filter: blur(2px)` for a subtle depth cue
* Clicking the backdrop closes the modal ONLY for non-destructive, non-in-progress modals (see [Closing Behavior](#closing-behavior))
* Backdrop fades in over `120ms`, out over `100ms`

\---

## Motion

### Opening

* Backdrop fades in (0 → 1) over `120ms ease-out`
* Modal panel: simultaneously scales from `0.96` to `1.0` and translates up `8px`, with opacity `0 → 1`, over `150ms ease-out`
* Default focus target (see below) receives focus after the animation completes

### Closing

* Modal panel: scales to `0.98`, translates down `4px`, opacity to `0`, over `120ms ease-in`
* Backdrop fades out over `100ms ease-in`
* Returning focus to the element that triggered the modal

**Never:**

* Bouncy or spring-based animations
* Slide-in from a corner or edge (modals are centered, not drawers)
* Flip or rotate transitions

\---

## Default Focus

When a modal opens, focus moves to:

1. The first editable field in the body, OR
2. If no editable field, the primary action button in the footer, OR
3. If no primary button, the modal container itself (so Esc still works)

The close button (`×`) is never the default focus target.

\---

## Keyboard Behavior

|Key|Action|
|-|-|
|`Esc`|Close the modal (see [Closing Behavior](#closing-behavior) for exceptions)|
|`Tab`|Focus cycles within the modal — focus is trapped|
|`Shift+Tab`|Reverse focus cycle|
|`Enter`|Submits the form IF focus is in a single-line input AND the modal has a clear primary action|
|`Cmd+Enter` / `Ctrl+Enter`|Submits the form from any field, including textareas|
|`Esc` while typing in a field|First press: leaves the field (blurs). Second press: closes the modal. This prevents accidental close when the user just wanted to cancel a specific edit.|

\---

## Closing Behavior

Modals close via: Esc key, close button (`×`), backdrop click, or Cancel button.

### Safeguards

**Destructive confirmation modals** — backdrop click does NOT close. Only explicit Cancel or Esc. This prevents accidental dismissal of important prompts.

**In-progress modals** — when a submit is pending (network request in flight), ALL close actions are disabled: Esc, backdrop, close button, and Cancel button all become inert. The primary button shows a disabled state. No spinners inside the button (per button spec) — instead, a thin **indeterminate progress bar** appears at the top of the modal, flush with the top edge, `2px` tall, accent color. The bar animates as a sliding segment (not a pulse) — a `30%`-wide segment moves from left to right over `1200ms ease-in-out`, loops continuously until the action completes.

**Dirty forms** — when the user has made changes and attempts to close (any method), show an inline confirmation BELOW the form content, replacing the footer's Cancel/Primary buttons:

> "Discard changes?" with `Keep editing` (Secondary) and `Discard` (Destructive ghost) buttons.

This is inline, not a second modal. Stacking modals is forbidden.

\---

## Modal Types

Specific patterns for common use cases. All inherit the shared structure above.

### 1\. Confirmation Modal

For verifying an intentional action before executing it.

* Size: `xs` (360px)
* Header: direct, action-phrased title ("Delete invoice #INV-2041?")
* Body: one sentence describing the consequence (`13px`, `neutral-700`)
* Footer: Cancel (Secondary) + Confirm (Primary or Destructive)

**Destructive confirmation variants:**

* The primary button uses the destructive style from `buttons.md` (red label, red-50 hover → solid red confirmed-destructive style)
* Default focus goes to the Cancel button, not the destructive one
* Backdrop click does NOT close

### 2\. Form Modal

For creating or editing records.

* Size: `sm` or `md` depending on field count
* Header: "Create lead", "Edit property", etc.
* Body: form fields per [inputs.md](./inputs.md)
* Footer: Cancel (Secondary) + Save/Create (Primary)
* Cmd+Enter submits from any field
* On validation error: inline field errors per inputs.md; modal does NOT close on failed submit
* On success: modal closes and optionally navigates to the created record

### 3\. Comment-Required Modal

For actions that require a textual justification. Used by Stop Timer, Delete with reason, and similar flows.

* Size: `sm` (440px)
* Header: action title + brief context ("Stop response timer — Lead #L-0042")
* Body: a single textarea with label "Comment" and helper text "Minimum 15 characters"
* Character counter below the textarea, right-aligned, `12px`, `neutral-500` (`12 / 15` → turns `neutral-900` when minimum is met)
* Primary button is disabled until the minimum is met
* Footer: Cancel (Secondary) + Submit (Primary)

### 4\. Selection Modal

For picking one or many items from a list (e.g., assigning an owner, picking properties).

* Size: `sm` or `md`
* Header: "Assign owner", "Add properties", etc.
* Body: search input at the top (sticky), list of options below
* Each option: `36px` row, hover `neutral-50`, selected `neutral-100` with checkmark
* Keyboard: `↑` / `↓` to navigate, `Enter` to select/toggle
* For multi-select: footer shows selection count ("3 selected") on the left
* Footer: Cancel (Secondary) + Confirm (Primary)

### 5\. Detail Modal

For viewing a record without navigating away. Read-only or with light edit capability.

* Size: `md` or `lg`
* Header: record title + status badge
* Body: key-value pairs or structured detail view
* Footer: Close (Secondary) + optional "Open full view" (Ghost link-style button)

Use sparingly. For records with more than \~10 fields or any complex relationships, link to the full page instead.

\---

## Accessibility

* Modals use `role="dialog"` with `aria-modal="true"`
* Every modal has an `aria-labelledby` pointing to the header title
* Every modal has an `aria-describedby` pointing to the primary body content when applicable
* Focus is trapped within the modal while open
* On close, focus returns to the triggering element
* Screen readers announce the modal title on open
* All interactive elements remain keyboard-reachable in logical order

\---

## What to Avoid

* **Stacked modals.** A modal opening another modal. Always replace content inline instead.
* **Modals for navigation.** Don't use a modal as a "page" — if it feels like a page, it should be one.
* **Modals with tabs.** If a modal has tabs, it's doing too much. Split it.
* **Full-screen modals on desktop.** The "modal that covers the whole screen" pattern belongs to mobile.
* **Modals that auto-open on page load.** Unless it's a required action (e.g., accepting updated terms), never interrupt a user who just arrived.
* **Spinners inside modals.** Use the top progress bar instead.
* **Animations longer than 200ms.** Modals should feel instant, not cinematic.
* **Close buttons in the body instead of the header.** The `×` lives in the top-right, always.

\---

## Tailwind Reference Classes

Starting points. Adjust to match design tokens.

```tsx
// Backdrop
className="fixed inset-0 bg-neutral-900/40 backdrop-blur-\[2px] transition-opacity duration-100 data-\[state=open]:opacity-100 data-\[state=closed]:opacity-0"

// Modal container (positioning)
className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"

// Modal panel (md size)
className="w-\[560px] max-w-full max-h-\[calc(100vh-80px)] bg-white rounded-xl pointer-events-auto shadow-\[0\_1px\_2px\_rgba(0,0,0,0.04),0\_8px\_24px\_rgba(0,0,0,0.08),0\_24px\_48px\_rgba(0,0,0,0.06)] flex flex-col overflow-hidden data-\[state=open]:animate-in data-\[state=closed]:animate-out data-\[state=open]:fade-in data-\[state=closed]:fade-out data-\[state=open]:zoom-in-\[0.96] data-\[state=closed]:zoom-out-\[0.98] data-\[state=open]:duration-150 data-\[state=closed]:duration-120"

// Modal header
className="px-6 pt-5 pb-4 relative"

// Modal title
className="text-\[16px] font-medium text-neutral-900 tracking-tight"

// Modal subtitle
className="text-\[13px] text-neutral-500 mt-1.5"

// Close button (top-right of header)
className="absolute top-4 right-4 h-7 w-7 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent/40 flex items-center justify-center transition-colors duration-100"

// Modal body
className="px-6 pb-5 flex-1 overflow-y-auto"

// Modal footer
className="px-6 pt-4 pb-5 border-t border-neutral-150 flex items-center justify-end gap-2"

// Progress bar (in-progress state, top of modal)
// Requires a custom keyframe animation in tailwind.config — example:
//   keyframes: { slideIndeterminate: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(400%)' } } }
//   animation: { 'slide-indeterminate': 'slideIndeterminate 1200ms ease-in-out infinite' }
className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden"
// Inner sliding segment:
className="h-full w-\[30%] bg-accent animate-slide-indeterminate"

// Character counter (comment-required modal)
className="text-\[12px] text-neutral-500 mt-1.5 text-right tabular-nums"
// (turns neutral-900 when minimum met)
```

\---

## Pre-Ship Checklist

Before any modal ships:

* \[ ] Width matches the scale (360/440/560/720/880), not an arbitrary value
* \[ ] Border radius is `12px` — larger than buttons/inputs (`8px`) to signal a higher surface
* \[ ] Shadow uses the three-layer spec, not a default Tailwind `shadow-xl`
* \[ ] Backdrop uses warm near-black `rgba(17,17,17,0.4)` with `2px` blur
* \[ ] Only one modal open at any time — no stacking
* \[ ] Default focus lands on the first editable field, never the close button
* \[ ] Esc closes (with the double-Esc safeguard for inputs)
* \[ ] Cmd+Enter submits from any field
* \[ ] Destructive modals: backdrop click disabled, focus defaults to Cancel
* \[ ] In-progress modals: all close actions disabled, top progress bar instead of button spinner
* \[ ] Dirty form close attempts show inline discard confirmation, never a stacked modal
* \[ ] Modal opens in `150ms ease-out`, closes in `120ms ease-in`, no bouncy transitions
* \[ ] Footer uses the top border, right-aligned buttons, `8px` gap
* \[ ] Focus trap active while open, returns focus on close
* \[ ] `role="dialog"`, `aria-modal="true"`, `aria-labelledby` set correctly

