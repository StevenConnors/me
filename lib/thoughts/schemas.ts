import { z } from 'zod';

const timestampSchema = z.iso.datetime({ precision: 3 });
const cursorSchema = z.union([
  timestampSchema.transform((createdAt) => ({ createdAt, id: undefined })),
  z.string().max(49).transform((value) => {
    const [createdAt, id] = value.split('_');
    return { createdAt, id };
  }).pipe(z.object({ createdAt: timestampSchema, id: z.string().regex(/^[a-fA-F0-9]{24}$/) })),
]);

export const thoughtsPaginationSchema = z.object({
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(50),
  cursor: cursorSchema.optional(),
});
