import { z } from 'zod';
import { STORE_CATEGORIES } from '@dtbi/shared';

/**
 * The slug is the storefront URL, so it is restricted to characters that
 * survive a URL unescaped. Generated from the name when the seller does not
 * supply one.
 */
const slug = z
  .string()
  .trim()
  .min(3, { message: 'ต้องมีอย่างน้อย 3 ตัวอักษร' })
  .max(40, { message: 'ยาวเกินไป' })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น',
  });

export const createStoreSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'กรุณากรอกชื่อร้าน' })
    .max(80, { message: 'ชื่อร้านยาวเกินไป' }),
  slug: slug.optional(),
  description: z.string().trim().max(500, { message: 'ยาวเกินไป' }).optional(),
  category: z.enum(STORE_CATEGORIES, { message: 'กรุณาเลือกหมวดหมู่' }),
  contactChannel: z
    .string()
    .trim()
    .max(120, { message: 'ยาวเกินไป' })
    .optional(),
});

export const updateStoreSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.enum(STORE_CATEGORIES).optional(),
  contactChannel: z.string().trim().max(120).optional(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

/** Best-effort slug from a Thai or English store name. */
export function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // A wholly Thai name leaves nothing behind, so fall back to a short random
  // suffix rather than rejecting the name.
  return ascii.length >= 3
    ? ascii.slice(0, 40)
    : `store-${Math.random().toString(36).slice(2, 8)}`;
}
