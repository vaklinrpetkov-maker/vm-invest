// ЕГН (Bulgarian personal ID) validator.
// 10 digits. The last digit is a checksum mod-11 over the first 9 with
// fixed weights 2, 4, 8, 5, 10, 9, 7, 3, 6.

const WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6];

export function isValidEGN(input: string): boolean {
  if (!/^\d{10}$/.test(input)) return false;

  const digits = input.split("").map(Number);
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * digits[i], 0);
  const checksum = sum % 11 === 10 ? 0 : sum % 11;
  if (checksum !== digits[9]) return false;

  // Birth date sanity check — month encodes century:
  // 01-12 = 1900s, 21-32 = 1800s, 41-52 = 2000s.
  let year = 1900 + digits[0] * 10 + digits[1];
  const monthCode = digits[2] * 10 + digits[3];
  let month: number;
  if (monthCode >= 1 && monthCode <= 12) month = monthCode;
  else if (monthCode >= 21 && monthCode <= 32) {
    month = monthCode - 20;
    year -= 100;
  } else if (monthCode >= 41 && monthCode <= 52) {
    month = monthCode - 40;
    year += 100;
  } else return false;

  const day = digits[4] * 10 + digits[5];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
