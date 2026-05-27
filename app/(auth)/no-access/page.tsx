import Link from "next/link";

export default function NoAccessPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl text-neutral-900">Нямате достъп</h1>
      <p className="text-base text-neutral-600">
        Тази страница не е достъпна за вашата роля. Свържете се с администратор, ако смятате, че това е грешка.
      </p>
      <Link href="/" className="text-base text-accent-700 hover:text-accent-800">
        Обратно към началото
      </Link>
    </div>
  );
}
