-- Add branch_id column to products table
-- This allows assigning a product to a specific branch (NULL = available in all branches)
-- Safe to run multiple times — uses IF NOT EXISTS everywhere.

-- Add column only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for filtering products by branch (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_products_branch_id
  ON public.products(branch_id) WHERE deleted_at IS null AND branch_id IS NOT NULL;

COMMENT ON COLUMN public.products.branch_id IS 'Branch this product belongs to. NULL means available in all branches.';
