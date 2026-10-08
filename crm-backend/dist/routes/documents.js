"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Helper to anonymize IP for GDPR compliance
const maskIp = (ip) => ip.replace(/\.\d{1,3}$/, '.0');
router.post('/api/v1/documents/:id/finalize', async (req, res, next) => {
    const documentId = req.params.id;
    // Use 'req as any' for user object to bypass type checking until typings are fully implemented
    const actorId = req.user?.id;
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    const trackingId = crypto_1.default.randomUUID();
    try {
        // ---------------------------------------------------------
        // ATOMIC DATABASE TRANSACTION (REPEATABLE READ / SERIALIZABLE)
        // ---------------------------------------------------------
        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch document and line items (with row-level lock)
            const document = await tx.$queryRaw `
        SELECT * FROM documents 
        WHERE document_id = ${documentId}::uuid
        FOR UPDATE
      `;
            if (!document.length)
                throw new Error("DOCUMENT_NOT_FOUND");
            const doc = document[0];
            if (doc.lifecycle_status === 'SETTLED' || doc.lifecycle_status === 'CANCELLED') {
                throw new Error("INVALID_STATE_TRANSITION");
            }
            const lineItems = await tx.document_line_items.findMany({
                where: { document_id: documentId }
            });
            // 2. State Machine Workflow Logic
            const newStatus = req.body.target_status; // e.g. 'PURCHASE_ORDER', 'INVOICE'
            for (const item of lineItems) {
                // Fetch inventory with Row-Level Lock
                const inventory = await tx.$queryRaw `
          SELECT * FROM inventory_stock_registry 
          WHERE sku = ${item.sku} 
          FOR UPDATE
        `;
                if (!inventory.length)
                    throw new Error(`SKU_NOT_FOUND:${item.sku}`);
                const stock = inventory[0];
                if (newStatus === 'PURCHASE_ORDER') {
                    // Verify physical stock
                    const available = stock.current_on_hand_balance - stock.reserved_pending_allocation;
                    if (available < item.selected_quantity)
                        throw new Error(`INSUFFICIENT_STOCK:${item.sku}`);
                    // Increment reserve
                    await tx.inventory_stock_registry.update({
                        where: { sku: item.sku },
                        data: { reserved_pending_allocation: { increment: item.selected_quantity } }
                    });
                }
                else if (newStatus === 'INVOICE' || newStatus === 'CASH_MEMO') {
                    // Instantly decrement physical balance
                    const decrement = item.selected_quantity;
                    // If moving from PO to INVOICE, clear the reserve block
                    const reserveAdjustment = doc.doc_type === 'PURCHASE_ORDER' ? { decrement } : undefined;
                    await tx.inventory_stock_registry.update({
                        where: { sku: item.sku },
                        data: {
                            current_on_hand_balance: { decrement },
                            ...(reserveAdjustment && { reserved_pending_allocation: reserveAdjustment })
                        }
                    });
                }
            }
            // 3. Commit Document Status Update
            const updatedDoc = await tx.documents.update({
                where: { document_id: documentId },
                data: {
                    lifecycle_status: newStatus,
                    doc_type: newStatus
                }
            });
            // 4. Immutable Audit Log Ledger Write (SOC 2 / NIST)
            await tx.audit_ledger.create({
                data: {
                    audit_id: crypto_1.default.randomUUID(),
                    actor_id: actorId,
                    ip_address: maskIp(rawIp),
                    action_type: 'STATUS_FINALIZATION',
                    old_state: doc,
                    new_state: updatedDoc,
                    timestamp: new Date()
                }
            });
            return updatedDoc;
        }, {
            isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000
        });
        res.status(200).json({
            status: 200,
            message: "Document successfully finalized and ledger updated.",
            tracking_id: trackingId,
            data: { document_id: result.document_id, status: result.lifecycle_status }
        });
    }
    catch (error) {
        // SOC 2 Exception Boundary: Sanitize error output
        const isClientError = error.message.includes('NOT_FOUND') || error.message.includes('STOCK') || error.message.includes('STATE');
        const secureMessage = isClientError ? error.message : "Transaction failed during state finalization.";
        // Internal Log (stripped of PII)
        console.error(`[${trackingId}] Finalization Error: ${error.message}`);
        res.status(isClientError ? 400 : 500).json({
            status: isClientError ? 400 : 500,
            error: secureMessage,
            tracking_id: trackingId
        });
    }
});
exports.default = router;
