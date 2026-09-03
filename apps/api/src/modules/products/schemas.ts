import { z } from 'zod';

const priceSatang = z
  .number()
  .int({ message: 'ราคาต้องเป็นจำนวนเต็มสตางค์' })
  .min(0, { message: 'ราคาต้องไม่ติดลบ' })
  .max(100_000_000, { message: 'ราคาสูงเกินไป' });

const stock = z
  .number()
  .int({ message: 'จำนวนต้องเป็นจำนวนเต็ม' })
  .min(0, { message: 'จำนวนต้องไม่ติดลบ' })
  .max(1_000_000, { message: 'จำนวนสูงเกินไป' });

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'กรุณากรอกชื่อสินค้า' })
    .max(120, { message: 'ชื่อสินค้ายาวเกินไป' }),
  description: z.string().trim().max(1000, { message: 'ยาวเกินไป' }).optional(),
  priceSatang,
  stock: stock.default(0),
});

/**
 * Name and description only. Price and stock are deliberately NOT accepted
 * here — they have their own endpoints so that product.price_changed and
 * product.stock_changed stay separately countable. api-spec.md: "A single
 * PATCH /products/:id that accepted every field would collapse them into
 * product.updated, which the study cannot separate again."
 */
export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const changePriceSchema = z.object({ priceSatang });
export const changeStockSchema = z.object({ stock });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ChangePriceInput = z.infer<typeof changePriceSchema>;
export type ChangeStockInput = z.infer<typeof changeStockSchema>;
