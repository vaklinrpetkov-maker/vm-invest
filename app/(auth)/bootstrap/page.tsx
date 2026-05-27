import { redirect } from "next/navigation";
import { isBootstrap } from "@/lib/auth/bootstrap";
import { BootstrapForm } from "./bootstrap-form";

export const dynamic = "force-dynamic";

export default async function BootstrapPage() {
  if (!(await isBootstrap())) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl text-neutral-900">Създаване на първи администратор</h1>
        <p className="text-base text-neutral-600">
          Този акаунт получава пълен достъп до системата. Следващите потребители се поканват от него.
        </p>
      </div>
      <BootstrapForm />
    </div>
  );
}
