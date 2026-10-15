import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../prisma';
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth';
import { trackingIdOf } from '../middleware/requestId';
import { renderInvoicePdf } from '../services/pdf';

const router = Router();

async function loadDocument(id: string, ownerEmail: string | null) {
  const doc = await prisma.document.findUnique({ where: { document_id: id }, include: { lines: true } });
  if (!doc) return null;
  if (ownerEmail && doc.ownerId !== ownerEmail) return 'forbidden' as const;
  return doc;
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/v1/export/:id.(csv|xlsx|json|pdf) — isolated in-process build, streamed out. */
router.get('/:id.:format(csv|xlsx|json|pdf)', requireAuth, async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const scope = auth.role === 'ADMIN' ? null : auth.email;
    const doc = await loadDocument(req.params.id, scope);
    if (!doc) {
      res.status(404).json({ status: 404, error: 'Document not found.', tracking_id: trackingIdOf(req) });
      return;
    }
    if (doc === 'forbidden') {
      res.status(403).json({ status: 403, error: 'Forbidden.', tracking_id: trackingIdOf(req) });
      return;
    }

    const base = `${doc.document_number}`;
    if (req.params.format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
      res.send(JSON.stringify(doc, null, 2));
      return;
    }
    if (req.params.format === 'csv') {
      const head = 'sku,description,quantity,unit_cost,extended_total';
      const lines = doc.lines.map((l) =>
        [l.sku ?? '', l.description, l.selected_quantity, String(l.unit_cost), String(l.extended_total)].map(csvCell).join(',')
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      res.send(['\uFEFF' + head, ...lines].join('\n'));
      return;
    }
    if (req.params.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Netamps CRM';
      const ws = wb.addWorksheet('Lines');
      ws.columns = [
        { header: 'SKU', key: 'sku', width: 22 },
        { header: 'Description', key: 'description', width: 48 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Unit Cost', key: 'unit', width: 16 },
        { header: 'Total', key: 'total', width: 16 },
      ];
      for (const l of doc.lines) {
        ws.addRow({ sku: l.sku ?? '', description: l.description, qty: l.selected_quantity, unit: Number(l.unit_cost), total: Number(l.extended_total) });
      }
      ws.addRow({});
      ws.addRow({ description: 'TOTAL PAYABLE', total: Number(doc.total_payable) });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
      return;
    }
    // pdf
    const pdf = await renderInvoicePdf({
      documentNumber: doc.document_number,
      docType: doc.doc_type,
      status: doc.lifecycle_status,
      customerName: doc.ownerId ?? '',
      lines: doc.lines.map((l) => ({
        description: l.description,
        qty: l.selected_quantity,
        unitCostMajor: Number(l.unit_cost),
        lineTotalMajor: Number(l.extended_total),
      })),
      subtotalMajor: Number(doc.subtotal),
      taxRatePct: `${(Number(doc.tax_rate) * 100).toFixed(2)}%`,
      totalMajor: Number(doc.total_payable),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    res.send(Buffer.from(pdf.base64, 'base64'));
  } catch (err) {
    next(err);
  }
});

export default router;
