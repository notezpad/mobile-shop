-- Add branch_id column to products table
-- This allows assigning a product to a specific branch (NULL = available in all branches)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- Index for filtering products by branch
CREATE INDEX IF NOT EXISTS idx_products_branch_id
  ON public.products(branch_id) WHERE deleted_at IS NULL AND branch_id IS NOT NULL;

COMMENT ON COLUMN public.products.branch_id IS 'Branch this product belongs to. NULL means available in all branches.';
