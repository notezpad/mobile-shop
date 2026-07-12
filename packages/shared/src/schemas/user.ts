import { z } from 'zod';
import { nonEmptyString, phoneSchema, uuidSchema } from './common';
import { PASSWORD_MIN_LENGTH, PIN_LENGTH } from '../constants';

export const userStatusSchema = z.enum(['active', 'suspended', 'invited']);

export const createUserSchema = z.object({
  username: nonEmptyString.min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, 'أحرف إنجليزية وأرقام فقط'),
  password: nonEmptyString.min(PASSWORD_MIN_LENGTH),
  fullName: nonEmptyString.min(3).max(100),
  email: z.string().email().optional().nullable(),
  phone: phoneSchema,
  roleId: uuidSchema,
  branchId: uuidSchema.nullable().optional(),
  pin: z
    .string()
    .regex(new RegExp(`^\\d{${PIN_LENGTH}}$`))
    .optional()
    .nullable(),
  status: userStatusSchema.default('active'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .partial()
  .omit({ password: true, pin: true });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: nonEmptyString.min(PASSWORD_MIN_LENGTH),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const setPinSchema = z.object({
  pin: z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`)),
});

export type SetPinInput = z.infer<typeof setPinSchema>;

export const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  roleId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  status: userStatusSchema.optional(),
  sortBy: z.enum(['username', 'fullName', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type UserQuery = z.infer<typeof userQuerySchema>;
