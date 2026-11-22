import { z } from 'zod';

const ApiErrorSchema = z.object({ error: z.object({ message: z.string() }) });

export async function readApiError(response: Response | null, fallback: string): Promise<string> {
  if (!response) return fallback;
  const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : fallback;
}
