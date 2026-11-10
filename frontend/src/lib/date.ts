/**
 * Today's local calendar date as YYYY-MM-DD.
 *
 * Uses the local get*() accessors on purpose — NOT toISOString(), which returns the
 * UTC date and is a day off from the user's own date early/late in the day (IST is
 * UTC+5:30). This is the value fed to <input type="date"> min= and the submit guards
 * that block past due dates.
 */
export function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
