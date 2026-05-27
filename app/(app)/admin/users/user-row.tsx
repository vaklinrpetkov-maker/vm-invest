"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TR, TD } from "@/components/ui/table";
import { changeUserRole, setUserActive, type ActionResult } from "./user-actions";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  manager: "Мениджър",
  user: "Потребител",
};

type UserRowProps = {
  profile: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    active: boolean;
  };
  isSelf: boolean;
};

export function UserRow({ profile, isSelf }: UserRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(profile.role);

  const runAction = (action: (fd: FormData) => Promise<ActionResult>, fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) setError(result.error);
    });
  };

  const onRoleChange = (next: Role) => {
    setRole(next);
    const fd = new FormData();
    fd.set("profileId", profile.id);
    fd.set("role", next);
    runAction(changeUserRole, fd);
  };

  const onToggleActive = () => {
    const fd = new FormData();
    fd.set("profileId", profile.id);
    fd.set("active", String(!profile.active));
    runAction(setUserActive, fd);
  };

  return (
    <TR>
      <TD>{profile.fullName}</TD>
      <TD muted>{profile.email}</TD>
      <TD>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as Role)}
          disabled={pending || isSelf}
          className="h-7 px-2.5 rounded-md bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed transition-colors duration-120"
          title={isSelf ? "Не можете да променяте собствената си роля." : undefined}
        >
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </TD>
      <TD>
        <StatusBadge tone={profile.active ? "success" : "neutral"}>
          {profile.active ? "Активен" : "Деактивиран"}
        </StatusBadge>
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-2">
          {error && <span className="text-sm text-danger-700">{error}</span>}
          <Button
            type="button"
            variant={profile.active ? "ghost" : "secondary"}
            size="sm"
            disabled={pending || isSelf}
            onClick={onToggleActive}
            title={isSelf ? "Не можете да деактивирате собствения си акаунт." : undefined}
          >
            {profile.active ? "Деактивирай" : "Активирай"}
          </Button>
        </div>
      </TD>
    </TR>
  );
}
