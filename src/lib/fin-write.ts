import { humanError } from "@/lib/fin-errors";

/**
 * Writes that the caller's role forbids are dropped by the database in silence:
 * the row simply isn't there to change, so no error comes back. A plain
 * "no error means saved" check therefore lies to the user.
 *
 * Every write through this helper must ask for the rows it touched
 * (`.select("id")`) so an empty result can be read as "not allowed".
 */

export type WriteOutcome<T> = { ok: true; data: T } | { ok: false; message: string };

type Builder = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

const REFUSED = /permission denied|row-level security|42501/i;

export async function applyWrite<T = unknown[]>(
  run: () => Builder,
  denied: string,
): Promise<WriteOutcome<T>> {
  const { data, error } = await run();
  if (error) {
    // The database refuses a forbidden write two ways: it silently matches no
    // rows, or it raises a security error. Both mean "your role can't do this".
    if (REFUSED.test(error.message ?? "")) return { ok: false, message: denied };
    return { ok: false, message: humanError(error) };
  }
  const changed = Array.isArray(data) ? data.length > 0 : data != null;
  if (!changed) return { ok: false, message: denied };
  return { ok: true, data: data as T };
}
