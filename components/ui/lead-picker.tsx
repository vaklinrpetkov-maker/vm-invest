"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchLeads, type LeadSuggestion } from "@/lib/leads/search";
import {
  LEAD_STATUS_LABELS,
} from "@/lib/leads/constants";
import { cn } from "@/lib/cn";
import type { LeadStatus } from "@prisma/client";

// Typeahead picker for selecting a Lead in forms of downstream modules
// (meetings, contracts). Writes leadId into a hidden input with the given
// `name`. Mirrors the ContactPicker pattern.

type Props = {
  name: string;
  initial?: LeadSuggestion | null;
  required?: boolean;
  placeholder?: string;
};

export function LeadPicker({ name, initial, required, placeholder }: Props) {
  const [selected, setSelected] = useState<LeadSuggestion | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadSuggestion[]>([]);
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
        const rows = await searchLeads(query);
        setResults(rows);
        setHighlight(0);
      });
    }, 200);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (l: LeadSuggestion) => {
    setSelected(l);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const clear = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
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
            <span className="text-base text-neutral-900 truncate">
              {selected.contactName}
            </span>
            <span className="text-sm text-neutral-500 truncate">
              {LEAD_STATUS_LABELS[selected.status as LeadStatus]}
              {selected.firstProperty ? ` · ${selected.firstProperty}` : ""}
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
            placeholder={placeholder ?? "Търси лийд по име или контакт…"}
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
              {results.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(l)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md",
                    i === highlight ? "bg-neutral-100" : "hover:bg-neutral-50",
                  )}
                >
                  <div className="text-base text-neutral-900 truncate">
                    {l.contactName}
                  </div>
                  <div className="text-sm text-neutral-500 truncate">
                    {LEAD_STATUS_LABELS[l.status as LeadStatus]}
                    {l.firstProperty ? ` · ${l.firstProperty}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
          {open && query.trim().length >= 2 && results.length === 0 && (
            <div className="absolute left-0 right-0 top-9 z-dropdown bg-neutral-0 rounded-lg p-3 shadow-popover">
              <div className="text-sm text-neutral-500">
                Няма съвпадения. Създайте нов лийд от{" "}
                <a
                  href="/leads/new"
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
