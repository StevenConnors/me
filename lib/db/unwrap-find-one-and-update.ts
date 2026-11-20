export function unwrapFindOneAndUpdate<T>(result: unknown): T | null {
  if (result === null) return null;
  if (typeof result === 'object' && result && 'value' in result) {
    return ((result as { value?: T | null }).value ?? null) as T | null;
  }
  return result as T;
}
