import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth';
import { trackingIdOf } from '../middleware/requestId';
import { toMinor, toMajor } from '../lib/money';
import { dispatchApprovalEmail } from '../queue/emailQueue';
import { renderInvoicePdf } from '../services/pdf';

const router = Router();
const DOC_RE = /^[A-Z0-9-]{4,32}$/;

interface FinalizeLine {
  sku?: string;
  description: string;
  selected_quantity: number;
  unit_cost: number | string;
}

/** Server-side line validation: extended_total MUST equal qty × unit_cost. */
function validateLines(lines: FinalizeLine[]): { qty: number; costMinor: number; totalMinor: number }[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 500) {
    throw Object.assign(new Error('Between 1 and 500 line items are required.'), { status: 400 });
  }
  return lines.map((l) => {
    if (typeof l.description !== 'string' || !l.description.trim()) {
      throw Object.assign(new Error('Each line needs a description.'), { status: 400 });
    }
    const qty = l.selected_quantity;
    const costMinor = toMinor(l.unit_cost);
    if (!Number.isInteger(qty) || qty <= 0) throw Object.assign(new Error('Quantities must be positive integers.'), { status: 400 });
    if (costMinor < 0) throw Object.assign(new Error('Unit costs cannot be negative.'), { status: 400 });
    return { qty, costMinor, totalMinor: qty * costMinor };
  });
}

/**
 * POST /api/v1/documents/finalize — atomic procure-to-pay transition.
 * Body: { document_number, doc_type, tax_rate, owner_email?, customer_name,
 *         source_po_id?, lines: [{sku?, description, selected_quantity, unit_cost}] }
 * - SERIALIZABLE transaction + SELECT … FOR UPDATE on touched SKUs.
 * - PO: reserve stock (never below zero available). INVOICE/CASH_MEMO: decrement
 *   on_hand, release linked PO reserves. QUOTE/PROFORMA: totals only, no stock move.
 * - Every mutation writes the immutable audit ledger with before/after snapshots.
 * - COMMITTED documents enqueue the approval email (PDF attached, idempotent).
 */
router.post('/finalize', requireAuth, async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const b = req.body ?? {};
    const documentNumber = typeof b.document_number === 'string' ? b.document_number.trim().toUpperCase() : '';
    const docType = b.doc_type as string;
    const taxRate = b.tax_rate ?? 0;
    const ownerEmail = typeof b.owner_email === 'string' ? b.owner_email.trim().toLowerCase() : auth.email;
    const customerName = typeof b.customer_name === 'string' ? b.customer_name : ownerEmail;
    const sourcePoId = typeof b.source_po_id === 'string' ? b.source_po_id : null;

    if (!DOC_RE.test(documentNumber)) {
      res.status(400).json({ status: 400, error: 'document_number must be 4–32 chars [A-Z0-9-].', tracking_id: trackingIdOf(req) });
      return;
    }
    if (!['QUOTE', 'PURCHASE_ORDER', 'PROFORMA_INVOICE', 'INVOICE', 'CASH_MEMO'].includes(docType)) {
      res.status(400).json({ status: 400, error: 'Unknown doc_type.', tracking_id: trackingIdOf(req) });
      return;
    }
    if (auth.role === 'USER' && ownerEmail !== auth.email) {
      res.status(403).json({ status: 403, error: 'Cannot finalize for another owner.', tracking_id: trackingIdOf(req) });
      return;
    }

    const checked = validateLines(b.lines as FinalizeLine[]);
    // Integer minor-unit math only (no float drift): subtotal → tax → total.
    const subtotalMinor = checked.reduce((a, c) => a + c.totalMinor, 0);
    const rate = Number(taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      res.status(400).json({ status: 400, error: 'tax_rate must be within [0,1].', tracking_id: trackingIdOf(req) });
      return;
    }
    const taxMinor = Math.round(subtotalMinor * rate);
    const totalMinor = subtotalMinor + taxMinor;

    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.document.findUnique({ where: { document_number: documentNumber } });
        if (existing && existing.lifecycle_status !== 'DRAFT') {
          throw Object.assign(new Error('Only DRAFT documents can be finalized.'), { status: 409 });
        }

        // Lock every touched SKU row up front (deadlock-safe ordering).
        const skus = [...new Set(checked.map((_, i) => (b.lines as FinalizeLine[])[i].sku).filter((s): s is string => !!s))].sort();
        const locked = new Map<string, { on_hand: number; reserved: number }>();
        for (const sku of skus) {
          const rows = (await tx.$queryRaw<
            Array<{ current_on_hand_balance: number; reserved_pending_allocation: number }>
          >`SELECT current_on_hand_balance, reserved_pending_allocation FROM inventory_stock_registry WHERE sku = ${sku} FOR UPDATE`);
          if (rows.length === 0) throw Object.assign(new Error(`Unknown SKU: ${sku}`), { status: 400 });
          locked.set(sku, { on_hand: rows[0].current_on_hand_balance, reserved: rows[0].reserved_pending_allocation });
        }

        const status = docType === 'QUOTE' || docType === 'PROFORMA_INVOICE' ? 'COMMITTED' : 'SETTLED';

        if (docType === 'PURCHASE_ORDER') {
          for (let i = 0; i < checked.length; i++) {
            const sku = (b.lines as FinalizeLine[])[i].sku;
            if (!sku) continue;
            const s = locked.get(sku)!;
            if (s.on_hand - s.reserved < checked[i].qty) {
              throw Object.assign(new Error(`Insufficient available stock for ${sku}.`), { status: 409 });
            }
            await tx.$executeRaw`UPDATE inventory_stock_registry SET reserved_pending_allocation = reserved_pending_allocation + ${checked[i].qty} WHERE sku = ${sku}`;
          }
        }

        if (docType === 'INVOICE' || docType === 'CASH_MEMO') {
          for (let i = 0; i < checked.length; i++) {
            const sku = (b.lines as FinalizeLine[])[i].sku;
            if (!sku) continue;
            const s = locked.get(sku)!;
            if (s.on_hand < checked[i].qty) {
              throw Object.assign(new Error(`Insufficient on-hand stock for ${sku}.`), { status: 409 });
            }
            await tx.$executeRaw`UPDATE inventory_stock_registry SET current_on_hand_balance = current_on_hand_balance - ${checked[i].qty} WHERE sku = ${sku}`;
          }
          if (sourcePoId) {
            // Gracefully clear reserves linked to the source PO context.
            const po = await tx.document.findUnique({ where: { document_id: sourcePoId }, include: { lines: true } });
            if (po) {
              for (const pl of po.lines) {
                const match = (b.lines as FinalizeLine[]).find((l) => l.sku && pl.sku && l.sku === pl.sku);
                if (match && pl.sku) {
                  await tx.$executeRaw`UPDATE inventory_stock_registry SET reserved_pending_allocation = GREATEST(0, reserved_pending_allocation - ${match.selected_quantity}) WHERE sku = ${pl.sku}`;
                }
              }
            }
          }
        }

        const oldState = existing
          ? { document_number: existing.document_number, lifecycle_status: existing.lifecycle_status, total_payable: String(existing.total_payable) }
          : null;

        const doc = existing
          ? await tx.document.update({
              where: { document_id: existing.document_id },
              data: {
                doc_type: docType as never,
                lifecycle_status: status as never,
                subtotal: toMajor(subtotalMinor),
                tax_rate: rate,
                total_payable: toMajor(totalMinor),
                sourcePoId,
              },
            })
          : await tx.document.create({
              data: {
                document_number: documentNumber,
                doc_type: docType as never,
                lifecycle_status: status as never,
                subtotal: toMajor(subtotalMinor),
                tax_rate: rate,
                total_payable: toMajor(totalMinor),
                ownerId: ownerEmail,
                sourcePoId,
                lines: {
                  create: checked.map((c, i) => ({
                    sku: (b.lines as FinalizeLine[])[i].sku ?? null,
                    description: (b.lines as FinalizeLine[])[i].description,
                    selected_quantity: c.qty,
                    unit_cost: toMajor(c.costMinor),
                    extended_total: toMajor(c.totalMinor),
                  })),
                },
              },
              include: { lines: true },
            });

        await tx.auditLedger.create({
          data: {
            actor_id: auth.sub ?? null,
            ip_address: (req.ip ?? 'unknown').replace(/\.\d+$/, '.0'),
            action_type: 'STATUS_FINALIZATION',
            old_state: (oldState ?? null) as never,
            new_state: {
              document_number: documentNumber,
              doc_type: docType,
              lifecycle_status: status,
              total_payable: toMajor(totalMinor),
            } as never,
          },
        });

        return { doc, status };
      },
      { isolationLevel: 'Serializable', timeout: 15000 }
    );

    // Approval email (out-of-transaction; idempotent via document id).
    const full = await prisma.document.findUnique({
      where: { document_id: result.doc.document_id },
      include: { lines: true },
    });
    if (full && (result.status === 'SETTLED' || result.status === 'COMMITTED')) {
      const pdf = await renderInvoicePdf({
        documentNumber: full.document_number,
        docType: full.doc_type,
        status: full.lifecycle_status,
        customerName,
        lines: full.lines.map((l) => ({
          description: l.description,
          qty: l.selected_quantity,
          unitCostMajor: Number(l.unit_cost),
          lineTotalMajor: Number(l.extended_total),
        })),
        subtotalMajor: Number(full.subtotal),
        taxRatePct: `${(Number(full.tax_rate) * 100).toFixed(2)}%`,
        totalMajor: Number(full.total_payable),
      });
      const inr = (n: number): string =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
      await dispatchApprovalEmail({
        to: ownerEmail,
        subject: `${full.doc_type} ${full.document_number} ${result.status === 'SETTLED' ? 'finalized' : 'issued'} — ${inr(Number(full.total_payable))}`,
        html: `<h3>Netamps ${full.doc_type} ${full.document_number}</h3><p>Status: <strong>${full.lifecycle_status}</strong></p><p>Total payable: <strong>${inr(Number(full.total_payable))}</strong></p><p>* All prices exclusive of applicable GST rates unless stated.</p>`,
        pdfBase64: pdf.base64,
        pdfFilename: `${full.document_number}.pdf`,
        idempotencyKey: `finalize-${full.document_id}-${full.updatedAt.getTime()}`,
      }).catch(() => undefined); // email never fails the finalization response
    }

    res.status(201).json({
      status: 201,
      data: { document_id: result.doc.document_id, lifecycle_status: result.status, total_payable: Number(result.doc.total_payable) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const where = auth.role === 'ADMIN' ? {} : { ownerId: auth.email };
    const docs = await prisma.document.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { lines: true } });
    res.json({ status: 200, data: docs });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const doc = await prisma.document.findUnique({ where: { document_id: req.params.id }, include: { lines: true } });
    if (!doc) {
      res.status(404).json({ status: 404, error: 'Document not found.', tracking_id: trackingIdOf(req) });
      return;
    }
    if (auth.role !== 'ADMIN' && doc.ownerId !== auth.email) {
      res.status(403).json({ status: 403, error: 'Forbidden.', tracking_id: trackingIdOf(req) });
      return;
    }
    res.json({ status: 200, data: doc });
  } catch (err) {
    next(err);
  }
});

export default router;
