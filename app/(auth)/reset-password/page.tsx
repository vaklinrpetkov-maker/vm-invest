import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl text-neutral-900">Линкът е невалиден или изтекъл</h1>
        <p className="text-base text-neutral-600">
          Помолете за нов линк за смяна на парола.
        </p>
        <Link href="/forgot-password" className="text-base text-accent-700 hover:text-accent-800">
          Поискай нов линк
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl text-neutral-900">Нова парола</h1>
        <p className="text-base text-neutral-600">Задайте нова парола за акаунта си.</p>
      </div>
      <ResetForm />
    </div>
  );
}
