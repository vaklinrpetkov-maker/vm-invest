// Bulgarian locale formatters. Currency uses EUR with bg-BG separators
// (e.g. "12 500,00 €") and dates use DD.MM.YYYY in Europe/Sofia time.

const TIMEZONE = "Europe/Sofia";
const LOCALE = "bg-BG";

const currencyFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatEUR(amount: number) {
  return currencyFmt.format(amount);
}

export function formatDate(value: Date | string) {
  return dateFmt.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string) {
  return dateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}
