"use client";

// Single-select typeahead for picking a team member (Profile). Used by the
// contract form to assign the deal consultant ("Консултант на сделката")
// and reusable by future modules (task ownership, lead routing).
//
// Pattern mirrors `<ContactPicker>`: type → 200ms debounce → server action
// → up to N results in a dropdown. Selection renders as a pill with an
// `×` button. A single hidden `<input name>` carries the chosen profile id
// to the form so it round-trips through `formData.get(name)`.

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchProfiles, type ProfileSuggestion } from "@/lib/profiles/search";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  initial?: ProfileSuggestion | null;
  required?: boolean;
  placeholder?: string;
};

const DEBOUNCE_MS = 200;

export function UserPicker({
  name,
  initial = null,
  required,
  placeholder = "Търси по име или имейл…",
}: Props) {
  const [selected, setSelected] = useState<ProfileSuggestion | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [, startSearch] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    const h = setTimeout(() => {
      startSearch(async () => {
        const rows = await searchProfiles(q);
        setResults(rows);
        setHighlight(0);
        setOpen(true);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [query]);

  // Click-outside-to-close.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function pick(p: ProfileSuggestion) {
    setSelected(p);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="hidden"
        name={name}
        value={selected?.id ?? ""}
        // The picker behaves as required when the parent says so AND nothing
        // is currently selected. Once a value is picked, the hidden input
        // satisfies the browser-side requirement.
        required={required && !selected}
      />

      {selected ? (
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-neutral-100">
          <span className="text-base text-neutral-900">{selected.fullName}</span>
          <span className="text-xs text-neutral-500">{selected.email}</span>
          <button
            type="button"
            onClick={clear}
            className="ml-auto text-neutral-400 hover:text-danger-700"
            aria-label="Изчисти"
          >
            ×
          </button>
        </div>
      ) : (
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
        />
      )}

      {open && !selected && results.length > 0 && (
        <ul
          className="absolute z-popover left-0 right-0 mt-1 bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 max-h-64 overflow-y-auto"
          role="listbox"
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "px-3 py-1.5 text-sm cursor-pointer flex items-baseline gap-2",
                i === highlight ? "bg-accent-50 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50",
              )}
            >
              <span>{p.fullName}</span>
              <span className="text-xs text-neutral-500">{p.email}</span>
              <span className="text-xs text-neutral-400 ml-auto capitalize">{p.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
