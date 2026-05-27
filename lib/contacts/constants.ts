// Canonical Bulgarian strings — stored as-is in the DB `type` column.
// Per specs/contacts.md §3.2 these are the values the team thinks in.
// Ordered by frequency in the current CSV. Admins will edit this list in
// Phase 2; for now it's hard-coded.
export const CONTACT_TYPES = [
  "Клиент",
  "Електронно запитване",
  "Наш човек",
  "Телефонно запитване",
  "Обезщетен собственик",
  "VIP Клиент",
  "Собственик на парцел",
  "Сфера на влияние",
  "ПАРТНЬОР",
  "От Брокер",
  "Брокер",
  "Подизпълнител",
  "Архитект",
  "Бохем и творец",
  "Вещо лице",
] as const;

// `Система` is reserved for system-generated contacts (auto-created from
// inbound email in Phase 2). Never user-selectable.
export const CONTACT_TYPE_SYSTEM = "Система";

export type ContactType = (typeof CONTACT_TYPES)[number] | typeof CONTACT_TYPE_SYSTEM;

export function isValidContactType(v: string): boolean {
  return (CONTACT_TYPES as readonly string[]).includes(v) || v === CONTACT_TYPE_SYSTEM;
}

// NOTE: The legacy hardcoded `BUILDINGS` list and `Building` type used to
// live here. They were deleted in Properties Phase 1 (specs/properties.md
// §3.3.2) because buildings are now a first-class table with admin CRUD.
// Callers should fetch the runtime list from `listActiveBuildings()` in
// `lib/buildings/queries.ts`.

// Max results returned by the contact typeahead (see lib/contacts/search.ts).
// Lives here rather than in search.ts because "use server" files can only
// export async functions — and both the server action and the client picker
// component need this value.
export const CONTACT_SEARCH_LIMIT = 25;
