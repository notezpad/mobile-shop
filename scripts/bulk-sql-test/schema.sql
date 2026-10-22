DROP TABLE IF EXISTS "AuditLog","StockMovement","ProductUnit","ProductVariant","Product","Category","Tenant" CASCADE;
CREATE TABLE "Tenant" ("id" text PRIMARY KEY, "closedSeasons" text NOT NULL DEFAULT '[]');
CREATE TABLE "Category" ("id" serial PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"), "name" text NOT NULL, UNIQUE ("tenantId","name"));
CREATE TABLE "Product" (
  "id" serial PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"), "branchId" integer,
  "name" text NOT NULL, "category" text, "barcode" text,
  "price" double precision NOT NULL DEFAULT 0, "cost" double precision NOT NULL DEFAULT 0,
  "quantity" double precision NOT NULL DEFAULT 0, "minQuantity" double precision NOT NULL DEFAULT 1,
  "soldByWeight" boolean NOT NULL DEFAULT false, "unitLabel" text, "retailMarginPercent" double precision,
  "season" text NOT NULL DEFAULT 'ALL_YEAR', "displayQty" double precision NOT NULL DEFAULT 0,
  "imagePath" text, "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "collection" text);
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE UNIQUE INDEX "Product_barcode_scope" ON "Product"("tenantId", COALESCE("branchId",0), "barcode") WHERE "barcode" IS NOT NULL;
CREATE TABLE "ProductVariant" ("id" serial PRIMARY KEY, "productId" integer NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "size" text, "color" text, "barcode" text, "quantity" integer NOT NULL DEFAULT 0, "displayQty" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ProductUnit" ("id" serial PRIMARY KEY, "productId" integer NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "name" text NOT NULL, "price" double precision, "barcode" text UNIQUE, "factor" integer NOT NULL, "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("productId","name"));
CREATE TABLE "StockMovement" ("id" serial PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"), "branchId" integer,
  "productId" integer REFERENCES "Product"("id"), "variantId" integer, "reasonCode" text, "needsReview" boolean NOT NULL DEFAULT false,
  "reviewedAt" timestamp(3), "reviewedBy" text, "type" text NOT NULL, "quantity" double precision NOT NULL, "refType" text, "refId" integer,
  "note" text, "userId" text, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");
CREATE TABLE "AuditLog" ("id" serial PRIMARY KEY, "actorId" text, "actorEmail" text, "action" text NOT NULL, "targetType" text, "targetId" text,
  "details" text, "ipHash" text, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
