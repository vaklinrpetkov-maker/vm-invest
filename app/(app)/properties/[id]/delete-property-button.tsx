"use client";

// Confirm-on-click delete button for /properties/[id]. Extracted to its own
// client component because Next.js 15 disallows passing event handlers
// (like onClick) from Server Components to Client Components — the `<Button>`
// itself is a Client Component, so its onClick has to be wired from inside
// another Client Component.
//
// The surrounding `<form action={deleteProperty}>` stays in the Server
// Component; only the button's confirm hook is here.

import { Button } from "@/components/ui/button";

export function DeletePropertyButton() {
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      onClick={(e) => {
        if (
          !confirm(
            "Изтриване на имота? Това действие не може да се върне директно.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      Изтрий
    </Button>
  );
}
