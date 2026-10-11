// Canonical Netamps intake XLSX template generator — the SINGLE source of the
// blank template workbook. Consumed by two surfaces:
//   - app/returns/SecureMediaUploader.tsx (pre-submit visitor download)
//   - app/intake/page.tsx (staff recovery: step-1 link, INSUFFICIENT error
//     panel, auto-download on rejection)
// A second copy of this logic previously lived in each consumer and had
// already drifted (README wording). Never duplicate again — extend here.
//
// Contract (load-bearing, do not relax):
//   - Sheet 1 "Requests": 10 canonical headers (8 required first, 2 optional
//     last) + ONE valid SELL example in row 2. Row 2 is the flagged EXAMPLE
//     (README says to delete/overwrite it) and is kept valid so re-uploading
//     the template passes validation — the round-trip proof.
//   - Sheet 2 "README": instructions. No styling claims: SheetJS Community
//     supports values, widths, and frozen panes only.
//   - Filename: netamps-intake-template-YYYY-MM-DD.xlsx
// Dynamic import keeps xlsx out of the initial bundle on both surfaces.

export interface IntakeTemplateExample {
  headers: string[];
  example: string[];
}

export const INTAKE_TEMPLATE_HEADERS: string[] = [
  'Intent (sell/buy)',
  'Client Name',
  'Company',
  'Email',
  'Phone',
  'Product Name',
  'Model Number',
  'Quantity',
  'Strategic Recovery Target',
  'Hardware Lifecycle Batch Age',
];

export const INTAKE_TEMPLATE_EXAMPLE: string[] = [
  'sell',
  'Priya Sharma',
  'Acme Technologies Pvt. Ltd.',
  'procurement@example.com',
  '+91 98765 43210',
  'Laptops',
  'Latitude 7420',
  '25',
  'resale',
  'Current Generation (1-3 Years)',
];

export async function downloadIntakeTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([INTAKE_TEMPLATE_HEADERS, INTAKE_TEMPLATE_EXAMPLE]);
  ws['!cols'] = INTAKE_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));
  // Freeze header row (SheetJS freeze-pane form)
  ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeft: 'A2', activePane: 'bottomRight', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, 'Requests');

  const readme = XLSX.utils.aoa_to_sheet([
    ['Netamps Intake Template — Instructions'],
    ['1. Row 2 is an EXAMPLE row — delete it before importing, or overwrite it with your first record.'],
    ['2. Keep the header row exact (letter case does not matter). Required: Intent, Client Name, Company, Email, Phone, Product Name, Model Number, Quantity.'],
    ['3. Intent must be "sell" or "buy". Quantity must be a positive whole number.'],
    ['4. Limits: 300 MB file, 10,000 rows. Larger datasets: split across files.'],
    ['5. Re-upload the finished file here to validate and preview before committing.'],
  ]);
  readme['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, readme, 'README');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `netamps-intake-template-${stamp}.xlsx`);
}
