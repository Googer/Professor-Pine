/**
 * Why a download failed. undici's `fetch failed` hides the real reason in `cause`, so this is the
 * first non-empty of: the cause's message, its code, its first nested error, the error's own
 * message.
 */
export function failureReason(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause: unknown = err.cause;
  const candidates: unknown[] = [];
  if (cause instanceof Error) {
    candidates.push(cause.message, (cause as { code?: unknown }).code);
    const nested: unknown = (cause as { errors?: unknown }).errors;
    if (Array.isArray(nested) && nested[0] instanceof Error) candidates.push(nested[0].message);
  }
  candidates.push(err.message);
  const found = candidates.find((value) => typeof value === 'string' && value !== '');
  return typeof found === 'string' ? found : String(err);
}
