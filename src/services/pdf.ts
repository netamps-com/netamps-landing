import PDFDocument from 'pdfkit';

export interface InvoicePdfLine {
  description: string;
  qty: number;
  unitCostMajor: number;
  lineTotalMajor: number;
}

export interface InvoicePdfInput {
  documentNumber: string;
  docType: string;
  status: string;
  customerName: string;
  lines: InvoicePdfLine[];
  subtotalMajor: number;
  taxRatePct: string;
  totalMajor: number;
}

const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

/** Render a print-clean invoice PDF. Returns base64 (for email attach) + raw buffer. */
export function renderInvoicePdf(input: InvoicePdfInput): Promise<{ base64: string; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Netamps ${input.docType} ${input.documentNumber}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => {
      const bytes = Buffer.concat(chunks);
      resolve({ base64: bytes.toString('base64'), bytes });
    });
    doc.on('error', reject);

    doc.fontSize(20).text('Netamps Technologies', { align: 'left' });
    doc.fontSize(11).fillColor('#555').text(`${input.docType} · ${input.documentNumber} · ${input.status}`);
    doc.moveDown();
    doc.fontSize(11).fillColor('#000').text(`Bill to: ${input.customerName}`);
    doc.moveDown(0.5);
    const top = doc.y;
    doc.fontSize(10).text('Description', 48, top, { width: 260 });
    doc.text('Qty', 320, top, { width: 60, align: 'right' });
    doc.text('Unit', 390, top, { width: 80, align: 'right' });
    doc.text('Total', 480, top, { width: 67, align: 'right' });
    doc.moveDown(0.5);
    for (const l of input.lines) {
      const y = doc.y;
      doc.fontSize(10).text(l.description, 48, y, { width: 260 });
      doc.text(String(l.qty), 320, y, { width: 60, align: 'right' });
      doc.text(inr(l.unitCostMajor), 390, y, { width: 80, align: 'right' });
      doc.text(inr(l.lineTotalMajor), 480, y, { width: 67, align: 'right' });
      doc.moveDown(0.4);
    }
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Subtotal: ${inr(input.subtotalMajor)}`, { align: 'right' });
    doc.text(`Tax (${input.taxRatePct}): ${inr(input.totalMajor - input.subtotalMajor)}`, { align: 'right' });
    doc.fontSize(13).text(`Total payable: ${inr(input.totalMajor)}`, { align: 'right' });
    doc.moveDown();
    doc.fontSize(8).fillColor('#777').text('* All prices exclusive of applicable GST rates unless stated.');
    doc.end();
  });
}
