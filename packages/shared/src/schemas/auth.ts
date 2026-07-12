import { z } from 'zod';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  PASSWORD_MIN_LENGTH,
  PIN_LENGTH,
} from '../constants';
import { nonEmptyString } from './common';

export const loginSchema = z.object({
  username: nonEmptyString.min(3, 'اسم المستخدم 3 أحرف على الأقل'),
  password: nonEmptyString.min(
    PASSWORD_MIN_LENGTH,
    `كلمة المرور ${PASSWORD_MIN_LENGTH} أحرف على الأقل`,
  ),
  branchId: z.string().uuid().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const pinLoginSchema = z.object({
  pin: z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `PIN يجب أن يكون ${PIN_LENGTH} أرقام`),
});

export type PinLoginInput = z.infer<typeof pinLoginSchema>;

export const refreshSchema = z.object({
  refreshToken: nonEmptyString,
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: nonEmptyString,
    newPassword: nonEmptyString.min(PASSWORD_MIN_LENGTH),
    confirmPassword: nonEmptyString,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Session response from /auth/login. */
export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive().default(ACCESS_TOKEN_TTL_SECONDS),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    fullName: z.string(),
    roleId: z.string().uuid(),
    roleKey: z.enum(['super_admin', 'admin', 'manager', 'cashier', 'technician', 'accountant']),
    branchId: z.string().uuid().nullable(),
    permissions: z.array(z.string()),
    preferences: z.object({
      theme: z.enum(['light', 'dark', 'system']),
      language: z.enum(['ar', 'en']),
      sidebarCollapsed: z.boolean(),
    }),
  }),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
