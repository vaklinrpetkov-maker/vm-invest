import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-neutral-50">
      <div className="w-full max-w-sm bg-neutral-0 rounded-xl p-8 shadow-modal">
        {children}
      </div>
    </main>
  );
}
