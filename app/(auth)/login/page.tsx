import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { isBootstrap } from "@/lib/auth/bootstrap";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isBootstrap()) redirect("/bootstrap");
  if (await getCurrentProfile()) redirect("/");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl text-neutral-900">Вход в системата</h1>
        <p className="text-base text-neutral-600">vminvest ERP</p>
      </div>
      <LoginForm />
    </div>
  );
}
