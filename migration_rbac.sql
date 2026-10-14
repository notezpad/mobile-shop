-- Migration: Add permissions and canViewProfits to User
-- Run this with: npx prisma db execute --file migration_rbac.sql
-- OR just run: npx prisma migrate dev --name add_user_rbac

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "permissions"    TEXT,
  ADD COLUMN IF NOT EXISTS "canViewProfits" BOOLEAN NOT NULL DEFAULT false;
