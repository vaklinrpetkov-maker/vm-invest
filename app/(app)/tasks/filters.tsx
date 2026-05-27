"use client";

// Filter bar for `/tasks`. Two orthogonal filters that compose with the
// tab selector (Мои / Всички / Завършени):
//   - Статус (multi-select) — overrides the default open/done split.
//     On the "Завършени" tab the server pins status=done regardless of
//     this selection; on "Мои" and "Всички" the picks narrow the open set.
//   - Отговорник (multi-select) — only takes effect on the "Всички" and
//     "Завършени" tabs (Мои pins owner=current-user upstream).
//
// URL sync mirrors `app/(app)/leads/filters.tsx`: debounced router.replace,
// fresh URLSearchParams built from local state, `tab` param preserved so
// changing filters doesn't kick the user back to "Мои".
//
// Plumbing matches what `lib/tasks/filters.ts` already parses — we write
// the same multi-value `?status=todo&status=in_progress` shape the parser
// reads via Next's `searchParams`.

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/tasks/constants";
import { useDebouncedQueryReplace } from "@/lib/use-filter-url";

type Owner = { id: string; fullName: string };

type Props = {
  owners: Owner[];
};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

export function TaskFilters({ owners }: Props) {
  const params = useSearchParams();

  const tab = params.get("tab") ?? "mine";

  // Initial state read from URL. `getAll` handles the multi-value shape
  // (`?status=todo&status=in_progress`) that `parseTaskFilters` expects.
  const [statuses, setStatuses] = useState<string[]>(params.getAll("status"));
  const [assignees, setAssignees] = useState<string[]>(params.getAll("assignee"));

  const hasAnyFilter = statuses.length > 0 || assignees.length > 0;
  const [open, setOpen] = useState(hasAnyFilter);

  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    // Preserve the tab so filter changes don't bounce the user back to "Мои".
    if (tab !== "mine") p.set("tab", tab);
    for (const s of statuses) p.append("status", s);
    for (const a of assignees) p.append("assignee", a);
    // Page intentionally dropped by the shared hook — filter changes reset
    // to page 1.
    return p.toString();
  }, [tab, statuses, assignees]);

  const { pending } = useDebouncedQueryReplace({ pathname: "/tasks", targetQs });

  // Resync local state if the tab changes from outside (e.g. user clicks
  // a tab) — the tabs link reset filters when they're switched, so the
  // URL drops `status` / `assignee` and our local state needs to follow.
  useEffect(() => {
    setStatuses(params.getAll("status"));
    setAssignees(params.getAll("assignee"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  const clear = () => {
    setStatuses([]);
    setAssignees([]);
  };

  const selectValues = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={open ? "secondary" : "ghost"}
          onClick={() => setOpen((x) => !x)}
        >
          {open ? "Скрий филтри" : "Филтри"}
          {hasAnyFilter && !open && (
            <span className="ml-2 inline-block w-2 h-2 rounded-full bg-accent-500" />
          )}
        </Button>
        {hasAnyFilter && (
          <Button type="button" variant="ghost" onClick={clear}>
            Изчисти
          </Button>
        )}
        <div
          className={cn(
            "text-sm text-neutral-500 ml-auto",
            !pending && "invisible",
          )}
        >
          Обновяване…
        </div>
      </div>

      {open && (
        <div className="bg-neutral-0 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Статус</label>
            <select
              multiple
              size={3}
              value={statuses}
              onChange={(e) => setStatuses(selectValues(e))}
              className={SELECT_CLS}
              // On the "Завършени" tab the server pins status=done regardless,
              // so changing this is a no-op there. Disable the control so the
              // affordance matches the actual effect.
              disabled={tab === "done"}
              title={
                tab === "done"
                  ? "На таба „Завършени“ статусът е фиксиран на „Завършен“."
                  : undefined
              }
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">
              Отговорник
            </label>
            <select
              multiple
              size={5}
              value={assignees}
              onChange={(e) => setAssignees(selectValues(e))}
              className={SELECT_CLS}
              // The "Мои" tab pins owner = current user upstream, so any
              // assignee selection here would be ignored. Disable + hint.
              disabled={tab === "mine"}
              title={
                tab === "mine"
                  ? "На таба „Мои“ виждаш само свои задачи."
                  : undefined
              }
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
