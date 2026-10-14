-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTE', 'PURCHASE_ORDER', 'PROFORMA_INVOICE', 'INVOICE', 'CASH_MEMO');

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('DRAFT', 'COMMITTED', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "inventory_stock_registry" (
    "sku" VARCHAR NOT NULL,
    "current_on_hand_balance" INTEGER NOT NULL DEFAULT 0,
    "reserved_pending_allocation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_stock_registry_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "documents" (
    "document_id" UUID NOT NULL,
    "document_number" TEXT NOT NULL,
    "doc_type" "DocumentType" NOT NULL,
    "lifecycle_status" "LifecycleStatus" NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax_rate" DECIMAL(65,30) NOT NULL,
    "total_payable" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "document_line_items" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "sku" VARCHAR NOT NULL,
    "selected_quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(65,30) NOT NULL,
    "extended_total" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "document_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_ledger" (
    "audit_id" UUID NOT NULL,
    "actor_id" UUID,
    "ip_address" TEXT,
    "action_type" TEXT NOT NULL,
    "old_state" JSONB,
    "new_state" JSONB,
    "timestamp" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audit_ledger_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_document_number_key" ON "documents"("document_number");

-- AddForeignKey
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE RESTRICT ON UPDATE CASCADE;
