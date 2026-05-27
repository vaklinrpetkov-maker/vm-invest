import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { IngestForm } from "./ingest-form";

export const dynamic = "force-dynamic";

export default async function IngestTestPage() {
  await requireRole("admin");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link
          href="/leads"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно към лийдовете
        </Link>
        <h1 className="text-xl text-neutral-900">Тест на имейл-парсъра</h1>
        <p className="text-base text-neutral-600">
          Поставете съдържанието на .eml файл. Системата ще го пусне през
          същата ingestion pipeline, която ще обслужва входящите имейли.
          Идемпотентно — повторно поставяне на същия имейл се игнорира по
          Message-ID.
        </p>
      </div>
      <IngestForm />
    </div>
  );
}
