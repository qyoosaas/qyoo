/** Turns raw Postgres / PostgREST errors into something a finance user can act on. */

type Rule = { test: RegExp; message: string };

const RULES: Rule[] = [
  {
    test: /column .* does not exist|relation .* does not exist|function .* does not exist/i,
    message:
      "The finance engine could not complete this step because of a configuration problem. Nothing was saved. Please retry — if it keeps failing, report the reference below.",
  },
  {
    test: /uq_suppliers_code/i,
    message: "Another supplier already uses this code. Choose a different supplier code.",
  },
  { test: /uq_suppliers_trn/i, message: "Another supplier is already registered with this TRN." },
  { test: /uq_suppliers_email/i, message: "Another supplier already uses this email address." },
  {
    test: /duplicate key value|unique constraint/i,
    message: "A record with these details already exists. Change the duplicated field and try again.",
  },
  {
    test: /Posted ledger records are immutable/i,
    message: "Posted ledger entries cannot be changed. Post a reversal or correction entry instead.",
  },
  {
    test: /cannot be deleted\. Void it instead/i,
    message: "This document is posted, so it cannot be deleted. Void it to create a reversing entry.",
  },
  {
    test: /only .* remaining of .* ordered/i,
    message: "", // keep the database message: it already names the line and the remaining quantity
  },
  {
    test: /permission denied|row-level security/i,
    message: "You do not have permission to perform this action. Ask an administrator for access.",
  },
  {
    test: /JWT|not authenticated|401/i,
    message: "Your session has expired. Sign in again and retry.",
  },
  {
    test: /Failed to fetch|NetworkError|fetch failed/i,
    message: "The app could not reach the finance backend. Check your connection and retry.",
  },
];

export function humanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.message || raw;
  }
  // Messages raised deliberately by the accounting engine are already user-facing.
  if (/^[A-Z]/.test(raw) && raw.length < 240 && !/\bERROR\b|SQLSTATE|pg_/.test(raw)) return raw;
  return "This action could not be completed and nothing was saved. Please retry.";
}

/** Technical detail goes to the console only — never into the toast. */
export function logTechnical(scope: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[fin:${scope}]`, error);
}
