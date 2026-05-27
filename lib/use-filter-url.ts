"use client";

// Shared URL-sync machinery for the per-module filter bars (`/contacts`,
// `/leads`, `/meetings`, `/contracts`, `/properties`, `/tasks`, `/renovations`).
// Every filter component was hand-rolling the same debounce + stable
// comparison + page-drop + `router.replace` plumbing — extracted here so
// each component only deals with its module-specific state + `targetQs`.
//
// Hook behaviour matches the previous hand-rolled idiom exactly:
//   - First effect fire skipped (avoids redundant navigation on mount when
//     local state matches URL state).
//   - 250ms debounce on the navigation. Configurable via `debounceMs`.
//   - Current URL has `page` dropped before comparison so any filter change
//     bounces the user back to page 1. Configurable via `dropFromCurrent`
//     for callers that need to drop more (none today).
//   - No-op guard: navigation only fires when the sorted-key string of the
//     target differs from the current. Prevents render loops when the
//     consumer's targetQs reads from current URL.
//   - Navigation runs inside `startTransition`, so the returned `pending`
//     flag drives the "Обновяване…" indicator each filter bar shows.

import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useEffect, useRef, useTransition } from "react";

type Options = {
  // Path WITHOUT the leading `?` query string — e.g. `/contacts`.
  pathname: string;
  // Pre-built query string (no leading `?`). Empty string means "no query".
  targetQs: string;
  // Keys to drop from the current URL BEFORE comparing against `targetQs`.
  // Defaults to `["page"]` because filter changes universally reset to
  // page 1. Pass `[]` to disable the page-drop behaviour.
  dropFromCurrent?: readonly string[];
  // Debounce delay in milliseconds. Default 250. Set to 0 to navigate
  // synchronously (rare — useful for tests).
  debounceMs?: number;
};

// Stable sorted-key string of a URLSearchParams — used as the
// no-op-comparison key. Deterministic ordering matters because
// `URLSearchParams` preserves insertion order and we don't.
function paramsKey(p: URLSearchParams): string {
  return [...p.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export function useDebouncedQueryReplace({
  pathname,
  targetQs,
  dropFromCurrent = ["page"],
  debounceMs = 250,
}: Options): { pending: boolean } {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const current = new URLSearchParams(params.toString());
    for (const key of dropFromCurrent) current.delete(key);
    const target = new URLSearchParams(targetQs);
    if (paramsKey(current) === paramsKey(target)) return;

    const h = setTimeout(() => {
      startTransition(() => {
        const url = targetQs ? `${pathname}?${targetQs}` : pathname;
        router.replace(url as Route);
      });
    }, debounceMs);
    return () => clearTimeout(h);
    // `dropFromCurrent` is expected to be a stable reference (a literal
    // array from the caller's render scope). If a caller passes a new
    // array each render we'd re-fire the effect every render — flag in
    // review if it ever happens. `pathname` + `debounceMs` likewise stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetQs, params, router]);

  return { pending };
}

// Read a CSV-encoded multi-value param from a `URLSearchParams` instance
// (the runtime object returned by `useSearchParams()`). The 5 filter bars
// that emit CSV (`?type=a,b,c`) call this on init to seed local state.
//
// Distinct from `csvParam` in `lib/url-params.ts` — that one operates on
// the `string | string[] | undefined` shape Next gives server components
// via `searchParams` props.
export function paramArray(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key) ?? "";
  return raw ? raw.split(",").filter(Boolean) : [];
}
