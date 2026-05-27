"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchContacts, type ContactSuggestion } from "@/lib/contacts/search";
import { CONTACT_SEARCH_LIMIT } from "@/lib/contacts/constants";
import { cn } from "@/lib/cn";

// Typeahead picker for selecting a Contact in forms of other modules. Writes
// the chosen contactId into a hidden input with the given `name`. Exposes the
// selected contact as a pill with a clear button.
//
// Debounces 200ms on input, shows up to 10 results, keyboard-navigable (↑↓ Enter Esc).

type Props = {
  name: string; // hidden input name for the selected id
  initial?: ContactSuggestion | null;
  required?: boolean;
  placeholder?: string;
  onChange?: (contact: ContactSuggestion | null) => void;
};

export function ContactPicker({ name, initial, required, placeholder, onChange }: Props) {
  const [selected, setSelected] = useState<ContactSuggestion | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [, startSearch] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const h = setTimeout(() => {
      startSearch(async () => {
        const rows = await searchContacts(query);
        setResults(rows);
        setHighlight(0);
      });
    }, 200);
    return () => clearTimeout(h);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (c: ContactSuggestion) => {
    setSelected(c);
    setQuery("");
    setResults([]);
    setOpen(false);
    onChange?.(c);
  };

  const clear = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    onChange?.(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      {selected ? (
        <div className="flex items-center justify-between gap-3 h-8 px-3 rounded-lg bg-neutral-100">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-base text-neutral-900 truncate">{selected.fullName}</span>
            <span className="text-sm text-neutral-500 truncate">
              {[selected.phone, selected.email].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-120 shrink-0"
          >
            Смени
          </button>
        </div>
      ) : (
        <>
          <Input
            type="text"
            placeholder={placeholder ?? "Търси контакт по име, телефон или имейл…"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
          />
          {open && results.length > 0 && (
            <div className="absolute left-0 right-0 top-9 z-dropdown bg-neutral-0 rounded-lg p-1 shadow-popover max-h-64 overflow-y-auto">
              {results.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(c)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md",
                    i === highlight ? "bg-neutral-100" : "hover:bg-neutral-50",
                  )}
                >
                  <div className="text-base text-neutral-900 truncate">{c.fullName}</div>
                  <div className="text-sm text-neutral-500 truncate">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              ))}
              {results.length === CONTACT_SEARCH_LIMIT && (
                <div className="px-2.5 py-1.5 text-xs text-neutral-500 border-t border-neutral-150">
                  Показани първите {CONTACT_SEARCH_LIMIT}. Уточнете търсенето, ако не виждате търсения контакт.
                </div>
              )}
            </div>
          )}
          {open && query.trim().length >= 2 && results.length === 0 && (
            <div className="absolute left-0 right-0 top-9 z-dropdown bg-neutral-0 rounded-lg p-3 shadow-popover">
              <div className="text-sm text-neutral-500">
                Няма съвпадения. Създайте нов контакт от{" "}
                <a
                  href="/contacts/new"
                  target="_blank"
                  className="text-accent-700 hover:text-accent-800 underline"
                  rel="noreferrer"
                >
                  тук
                </a>
                .
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
