"use client";

// Multi-select typeahead for picking properties in forms. Used by the
// contract create/edit form to attach one or more properties to a contract
// (apartment + parking + storage etc.). Pattern mirrors `<ContactPicker>`:
//
//   - Type → 200ms debounce → searchProperties() server action → up to
//     PROPERTY_SEARCH_LIMIT results in a dropdown.
//   - Click / Enter on a result → adds to the selection, clears the query.
//   - Backspace on an empty query removes the last selection.
//   - Each selection renders as a pill with an `×` button.
//   - Hidden inputs (`name=propertyIds` repeated) carry the ids to the form
//     so `formData.getAll("propertyIds")` returns the array server-side.

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchProperties, type PropertySuggestion } from "@/lib/properties/search";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  initial?: PropertySuggestion[];
  required?: boolean;
  placeholder?: string;
};

const DEBOUNCE_MS = 200;

export function PropertyMultiPicker({
  name,
  initial = [],
  required,
  placeholder = "Търси по име или сграда…",
}: Props) {
  const [selected, setSelected] = useState<PropertySuggestion[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertySuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [, startSearch] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced typeahead. Skip when the user has nothing or too little typed —
  // the server-side `searchProperties` also rejects sub-2-char queries, but
  // we short-circuit here to avoid the round-trip.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const h = setTimeout(() => {
      startSearch(async () => {
        const rows = await searchProperties(q);
        // Filter out items already selected so the dropdown doesn't suggest
        // duplicates.
        const taken = new Set(selected.map((s) => s.id));
        setResults(rows.filter((r) => !taken.has(r.id)));
        setHighlight(0);
        setOpen(true);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [query, selected]);

  // Click-outside-to-close.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function add(p: PropertySuggestion) {
    setSelected((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
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
      add(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query.length === 0 && selected.length > 0) {
      e.preventDefault();
      remove(selected[selected.length - 1].id);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Hidden inputs feed the form. Repeated `name` → formData.getAll(). */}
      {selected.map((p) => (
        <input key={p.id} type="hidden" name={name} value={p.id} />
      ))}

      <div
        className={cn(
          "flex flex-wrap gap-1.5 items-center px-2 py-1.5 rounded-lg bg-neutral-100 min-h-9 focus-within:ring-2 focus-within:ring-accent-500/40",
        )}
      >
        {selected.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-0 text-sm text-neutral-900 ring-1 ring-neutral-200"
            title={`${p.buildingDisplayName} / ${p.name}${p.entrance ? ` · вх.${p.entrance}` : ""}${p.floor !== null ? ` · ет.${p.floor}` : ""} (${p.type}, ${p.status})`}
          >
            <span className="text-neutral-500">{p.buildingDisplayName}</span>
            <span className="text-neutral-400">/</span>
            <span>{p.name}</span>
            {p.entrance && (
              <span className="text-neutral-500 text-xs">вх.{p.entrance}</span>
            )}
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="ml-1 text-neutral-400 hover:text-danger-700"
              aria-label={`Премахни ${p.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKey}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-32 bg-transparent border-0 px-1 py-0 h-7 focus:ring-0"
          // Required only when nothing is selected — the server still
          // validates, but this gives a nicer hint via browser-native UI.
          required={required && selected.length === 0}
        />
      </div>

      {open && results.length > 0 && (
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
                add(p);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2",
                i === highlight ? "bg-accent-50 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50",
              )}
            >
              <span className="text-neutral-500">{p.buildingDisplayName}</span>
              <span className="text-neutral-400">/</span>
              <span>{p.name}</span>
              {/* Entrance + floor disambiguate same-name units across the
                  building. Floor 0 is rendered as "пар." (партер) per the
                  Bulgarian construction convention. */}
              {p.entrance && (
                <span className="text-xs text-neutral-500">вх.{p.entrance}</span>
              )}
              {p.floor !== null && (
                <span className="text-xs text-neutral-500">
                  {p.floor === 0 ? "пар." : `ет.${p.floor}`}
                </span>
              )}
              <span className="text-xs text-neutral-400 ml-auto">{p.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
