import { z } from 'zod';
import { nonEmptyString, phoneSchema, uuidSchema } from './common';
import { PASSWORD_MIN_LENGTH, PIN_LENGTH } from '../constants';

export const roleKeySchema = z.enum([
  'super_admin',
  'admin',
  'manager',
  'cashier',
  'technician',
  'accountant',
]);

export const createRoleSchema = z.object({
  key: nonEmptyString.min(2).max(50),
  name: nonEmptyString.min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  is_system: z.boolean().default(false),
  permissionIds: z.array(uuidSchema).default([]),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const assignPermissionsSchema = z.object({
  permissionIds: z.array(uuidSchema),
});

export type AssignPermissionsInput = z.infer<typeof assignPermissionsSchema>;
