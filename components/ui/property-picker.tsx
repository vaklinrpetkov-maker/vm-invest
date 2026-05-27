"use client";

// Single-select typeahead for picking ONE property in forms. Adapted from
// `<PropertyMultiPicker>` — same lookup + dropdown UX, single hidden
// `<input name>` carries the chosen id (vs. the multi version's repeated
// inputs that feed `formData.getAll`). Used by the renovation form where
// one renovation = one property.

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchProperties, type PropertySuggestion } from "@/lib/properties/search";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  initial?: PropertySuggestion | null;
  required?: boolean;
  placeholder?: string;
};

const DEBOUNCE_MS = 200;

export function PropertyPicker({
  name,
  initial = null,
  required,
  placeholder = "Търси по име или сграда…",
}: Props) {
  const [selected, setSelected] = useState<PropertySuggestion | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertySuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [, startSearch] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const h = setTimeout(() => {
      startSearch(async () => {
        const rows = await searchProperties(q);
        setResults(rows);
        setHighlight(0);
        setOpen(true);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function pick(p: PropertySuggestion) {
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
    } else if (e.key === "Backspace" && query.length === 0 && selected) {
      e.preventDefault();
      clear();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      <div
        className={cn(
          "flex flex-wrap gap-1.5 items-center px-2 py-1.5 rounded-lg bg-neutral-100 min-h-9 focus-within:ring-2 focus-within:ring-accent-500/40",
        )}
      >
        {selected && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-0 text-sm text-neutral-900 ring-1 ring-neutral-200"
            title={`${selected.buildingDisplayName} / ${selected.name}${selected.entrance ? ` · вх.${selected.entrance}` : ""}${selected.floor !== null ? ` · ет.${selected.floor}` : ""} (${selected.type}, ${selected.status})`}
          >
            <span className="text-neutral-500">{selected.buildingDisplayName}</span>
            <span className="text-neutral-400">/</span>
            <span>{selected.name}</span>
            {selected.entrance && (
              <span className="text-neutral-500 text-xs">вх.{selected.entrance}</span>
            )}
            <button
              type="button"
              onClick={clear}
              className="ml-1 text-neutral-400 hover:text-danger-700"
              aria-label="Премахни"
            >
              ×
            </button>
          </span>
        )}
        {!selected && (
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            className="flex-1 min-w-32 bg-transparent border-0 px-1 py-0 h-7 focus:ring-0"
            required={required && !selected}
          />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          className="absolute z-popover left-0 right-0 mt-1 bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 max-h-64 overflow-y-auto"
          role="listbox"
        >
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer",
                i === highlight ? "bg-accent-50 text-accent-700" : "hover:bg-neutral-50 text-neutral-900",
              )}
            >
              <span className="text-neutral-500">{r.buildingDisplayName}</span>
              <span className="text-neutral-400 mx-1">/</span>
              <span>{r.name}</span>
              {r.entrance && (
                <span className="text-neutral-500 text-xs ml-2">вх.{r.entrance}</span>
              )}
              {r.floor !== null && (
                <span className="text-neutral-500 text-xs ml-1">ет.{r.floor}</span>
              )}
              <span className="text-neutral-400 text-xs ml-2">
                ({r.type}, {r.status})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
