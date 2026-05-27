import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getTaskById } from "@/lib/tasks/queries";
import { updateTask } from "../../actions";
import { TaskForm } from "../../task-form";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const task = await getTaskById(id);
  if (!task) notFound();

  const owners = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  // Bind the task id into updateTask so the form's action signature stays
  // (prev, formData) → state. Same pattern contacts/[id]/edit/page.tsx uses.
  const action = updateTask.bind(null, task.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← {task.title}
        </Link>
        <h1 className="text-xl text-neutral-900 mt-1">Редактиране на задача</h1>
      </div>

      <TaskForm
        mode="edit"
        initial={{
          title: task.title,
          description: task.description,
          dueDateIso: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
          ownerId: task.ownerId,
        }}
        owners={owners}
        action={action}
      />
    </div>
  );
}
