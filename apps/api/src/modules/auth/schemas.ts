import { z } from 'zod';
import { PUBLIC_SIGNUP_ROLES } from '@dtbi/shared';

/**
 * Messages are Thai because they are displayed to the seller as-is
 * (api-spec.md: `message` is Thai and safe to display).
 */
export const registerSchema = z.object({
  email: z.email({ message: 'อีเมลไม่ถูกต้อง' }).max(254),
  password: z
    .string()
    .min(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
    .max(200, { message: 'รหัสผ่านยาวเกินไป' }),
  displayName: z
    .string()
    .trim()
    .min(1, { message: 'กรุณากรอกชื่อ' })
    .max(80, { message: 'ชื่อยาวเกินไป' }),
  /**
   * seller or buyer only. `admin` is not in this list, and that omission is the
   * control: this endpoint is public and unauthenticated, so any role it
   * accepts is a role a stranger can grant themselves. Administrators are
   * created out of band by `pnpm admin:create`.
   */
  role: z.enum(PUBLIC_SIGNUP_ROLES).default('seller'),
});

export const loginSchema = z.object({
  email: z.email({ message: 'อีเมลไม่ถูกต้อง' }).max(254),
  password: z.string().min(1, { message: 'กรุณากรอกรหัสผ่าน' }).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
