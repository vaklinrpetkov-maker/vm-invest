import { ForgotPasswordForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl text-neutral-900">Забравена парола</h1>
        <p className="text-base text-neutral-600">
          Въведете имейла си и ще ви изпратим линк за нова парола.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
