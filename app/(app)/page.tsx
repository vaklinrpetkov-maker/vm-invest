import { requireProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-2">
      <h1 className="text-xl text-neutral-900">Здравейте, {profile.fullName}</h1>
      <p className="text-base text-neutral-600">
        Системата се изгражда. Скоро тук ще се появят модулите.
      </p>
    </div>
  );
}
