"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "@/components/ui/field-help";
import { Input } from "@/components/ui/input";
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PROPERTY_STATUS_DEFAULT,
} from "@/lib/properties/constants";
import type { PropertyFormState } from "@/lib/properties/parse";
import { createProperty, findDuplicateProperty } from "./actions";

type BuildingOpt = { id: string; displayName: string };

type Props = {
  buildings: readonly BuildingOpt[];
  open: boolean;
  onClose: () => void;
};

const initialState: PropertyFormState = {};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

export function CreatePropertyModal({ buildings, open, onClose }: Props) {
  const [state, formAction, pending] = useActionState(createProperty, initialState);
  const [buildingId, setBuildingId] = useState("");
  const [name, setName] = useState("");
  const [dupId, setDupId] = useState<string | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  // On-blur duplicate check — §5.1 in specs/properties.md. Non-blocking on its
  // own (server action hard-blocks); this just surfaces the warning sooner.
  async function checkDuplicate() {
    if (!buildingId || !name.trim()) {
      setDupId(null);
      return;
    }
    setDupChecking(true);
    try {
      const dup = await findDuplicateProperty(buildingId, name.trim());
      setDupId(dup?.id ?? null);
    } finally {
      setDupChecking(false);
    }
  }

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // When the redirect from the server action fires, the modal will unmount
  // along with the page. Keep a failsafe in case the user clicks back before
  // router navigation settles.
  useEffect(() => {
    if (!state.errors && !state.warnings && pending === false && state !== initialState) {
      // form succeeded → state was reset by redirect; no-op.
    }
  }, [state, pending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal bg-neutral-900/40 flex items-start justify-center pt-20 px-4">
      <div
        className="bg-neutral-0 rounded-xl p-6 w-full max-w-lg shadow-popover"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Нов имот</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 transition-colors duration-120"
          >
            ✕
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Сграда *</label>
            <select
              name="buildingId"
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                setDupId(null);
              }}
              className={SELECT_CLS}
              required
            >
              <option value="">— Избери сграда —</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.displayName}
                </option>
              ))}
            </select>
            {state.errors?.buildingId && (
              <span className="text-sm text-danger-700">{state.errors.buildingId}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Име *</label>
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={checkDuplicate}
              placeholder="напр. Ап.14 или ПМ 11"
              required
            />
            {dupChecking && <span className="text-xs text-neutral-500">Проверка…</span>}
            {dupId && (
              <span className="text-sm text-warning-800">
                Вече има имот с това име в тази сграда.
              </span>
            )}
            {state.errors?.name && (
              <span className="text-sm text-danger-700">{state.errors.name}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-neutral-700">Тип *</label>
                <FieldHelp
                  title="Тип имот"
                  content={
                    <ul className="space-y-1">
                      <li>
                        <strong>Едностаен / Двустаен / Тристаен / Четиристаен / Многостаен</strong> —
                        брой стаи в апартамента (без кухня и баня).
                      </li>
                      <li>
                        <strong>Апартамент</strong> — общо обозначение, когато конкретен брой стаи не е приложим.
                      </li>
                      <li>
                        <strong>Гараж</strong> — закрит гараж (отделен имот).
                      </li>
                      <li>
                        <strong>ПМ</strong> — паркомясто (вътре в сградата или подземно).
                      </li>
                      <li>
                        <strong>ВПМ</strong> — външно паркомясто (на открит паркинг).
                      </li>
                      <li>
                        <strong>Мазе / Склад / Офис</strong> — спомагателни помещения.
                      </li>
                    </ul>
                  }
                />
              </div>
              <select name="type" className={SELECT_CLS} required defaultValue="">
                <option value="">— Избери —</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {state.errors?.type && (
                <span className="text-sm text-danger-700">{state.errors.type}</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-neutral-700">Статус</label>
                <FieldHelp
                  title="Статус на имота"
                  content={
                    <ul className="space-y-1">
                      <li><strong>Свободен</strong> — на пазара, готов за оферти.</li>
                      <li><strong>Запазен</strong> — устен ангажимент, без депозит.</li>
                      <li><strong>Депозит</strong> — клиентът е дал капаро.</li>
                      <li><strong>Предварителен договор</strong> — подписан предварителен.</li>
                      <li><strong>Продаден Нот. Акт</strong> — финализирана продажба.</li>
                      <li><strong>Обезщетение</strong> — даден като обезщетение (на собственик на земя или партньор).</li>
                      <li><strong>Отложена продажба</strong> — временно изваден от продажба.</li>
                      <li><strong>Отказал се</strong> — клиентът се е отказал след резервация.</li>
                    </ul>
                  }
                />
              </div>
              <select name="status" className={SELECT_CLS} defaultValue={PROPERTY_STATUS_DEFAULT}>
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-700">Вход</label>
              <Input name="entrance" placeholder="напр. А" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-700">Етаж</label>
              <Input name="floor" type="number" placeholder="напр. 3" />
              {state.errors?.floor && (
                <span className="text-sm text-danger-700">{state.errors.floor}</span>
              )}
            </div>
          </div>

          {state.errors?.form && (
            <div className="text-sm text-danger-700">{state.errors.form}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отказ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Запис…" : "Създай"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

