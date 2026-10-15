import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth';
import { trackingIdOf } from '../middleware/requestId';

const router = Router();

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** GET /api/v1/print/:id — print-optimized invoice HTML (@media print strips chrome). */
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
    const inr = (n: number): string =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
    const rows = doc.lines
      .map(
        (l) => `<tr><td>${esc(l.sku ?? '—')}</td><td>${esc(l.description)}</td><td class="n">${l.selected_quantity}</td><td class="n">${inr(Number(l.unit_cost))}</td><td class="n">${inr(Number(l.extended_total))}</td></tr>`
      )
      .join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.document_number)}</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;color:#111;margin:32px}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #999;padding:8px;text-align:left}
  .n{text-align:right}.totals{margin-top:12px;text-align:right}
  .no-print,.actions{display:flex;gap:8px;margin-bottom:16px}
  @media print{.no-print,.actions{display:none}body{margin:0}a[href]:after{content:""}}
</style></head><body>
<div class="actions no-print"><button onclick="window.print()">Print / Save PDF</button></div>
<h1>Netamps ${esc(doc.doc_type)} — ${esc(doc.document_number)}</h1>
<p>Status: ${esc(doc.lifecycle_status)} · Owner: ${esc(doc.ownerId ?? '')}</p>
<table><thead><tr><th>SKU</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals"><p>Subtotal: ${inr(Number(doc.subtotal))}</p><p>Total payable: <strong>${inr(Number(doc.total_payable))}</strong></p><p><small>* Prices exclusive of applicable GST rates unless stated.</small></p></div>
</body></html>`);
  } catch (err) {
    next(err);
  }
});

export default router;
