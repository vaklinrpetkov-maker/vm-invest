import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createTask } from "../actions";
import { TaskForm } from "../task-form";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const me = await requireProfile();

  const owners = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/tasks"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Задачи
        </Link>
        <h1 className="text-xl text-neutral-900 mt-1">Нова задача</h1>
      </div>

      <TaskForm
        mode="create"
        // Default the new-task owner to the current user. Easy to clear via
        // the dropdown if it's a team task assigned to someone else.
        initial={{ ownerId: me.id }}
        owners={owners}
        action={createTask}
      />
    </div>
  );
}
