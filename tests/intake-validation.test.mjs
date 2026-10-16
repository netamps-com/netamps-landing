// =============================================================================
// Intake / Import Validation — Unit Tests (client-side pure functions)
// Replicates logic from netamps-landing/app/intake/page.tsx
// Run:  cd netamps-landing && node tests/intake-validation.test.mjs
// =============================================================================

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
};

// ── Replicated pure functions (same logic as page.tsx) ────────────────────────

const normalizeHeader = (h) => h.replace(/^\uFEFF/, '').trim().toLowerCase();

const SCHEMA_FIELDS = [
  { key: 'intent', label: 'Intent (sell/buy)', required: true },
  { key: 'name', label: 'Client Name', required: true },
  { key: 'company', label: 'Company', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'category', label: 'Product Name', required: true },
  { key: 'details', label: 'Model Number', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'strategicTarget', label: 'Strategic Recovery Target', required: false },
  { key: 'lifecycleAge', label: 'Hardware Lifecycle Batch Age', required: false },
];
const REQUIRED_SCHEMA_KEYS = SCHEMA_FIELDS.filter((f) => f.required).map((f) => f.key);
const EMAIL_RE_INGEST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function autoMapColumns(headers) {
  const norm = headers.map(normalizeHeader);
  const mapping = {};
  const fuzzy = {};
  const matchedKeys = [];
  const usedIndices = new Set();

  for (const field of SCHEMA_FIELDS) {
    const keysToTry = [field.key.toLowerCase(), field.label.toLowerCase()];
    let found = -1;
    for (const k of keysToTry) {
      found = norm.findIndex((n, i) => !usedIndices.has(i) && n === k);
      if (found !== -1) break;
    }
    if (found !== -1) {
      mapping[field.key] = headers[found];
      matchedKeys.push(field.key);
      usedIndices.add(found);
    } else {
      const sub = norm.findIndex((n, i) => !usedIndices.has(i) && keysToTry.some((k) => n.includes(k)));
      if (sub !== -1) {
        mapping[field.key] = headers[sub];
        fuzzy[field.key] = true;
        matchedKeys.push(field.key);
        usedIndices.add(sub);
      }
    }
  }
  return { mapping, fuzzy, matchedKeys };
}

function classifySchema(matchedKeys) {
  const missing = REQUIRED_SCHEMA_KEYS.filter((k) => !matchedKeys.includes(k));
  if (missing.length === 0) return { tier: 'all', missing };
  const hasEmail = matchedKeys.includes('email');
  const hasProductSignal = ['category', 'details', 'quantity'].some((k) => matchedKeys.includes(k));
  if (hasEmail && hasProductSignal && matchedKeys.length >= 3) return { tier: 'partial', missing };
  return { tier: 'insufficient', missing };
}

function validateImportRow(row) {
  const reasons = [];
  const email = (row.email || '').trim();
  if (email === '') reasons.push('missing email');
  else if (!EMAIL_RE_INGEST.test(email)) reasons.push(`invalid email "${row.email}"`);
  const qty = (row.quantity || '').trim();
  if (qty === '') reasons.push('missing quantity');
  else if (!/^\d+$/.test(qty)) reasons.push(`quantity "${row.quantity}" is not a positive integer`);
  else if (!Number.isSafeInteger(Number(qty)) || Number(qty) <= 0) reasons.push(`quantity "${row.quantity}" is not a safe positive integer`);
  const intent = (row.intent || '').trim();
  if (intent !== '' && !/^(sell|buy)$/i.test(intent)) reasons.push(`intent "${row.intent}" must be sell or buy`);
  const hasProduct = (row.category || '').trim() || (row.details || '').trim() || (row.quantity || '').trim();
  if (!hasProduct) reasons.push('no product substance');
  return reasons;
}

function findDuplicateHeaders(headers) {
  const norm = headers.map(normalizeHeader);
  const seen = new Set();
  const dupes = [];
  for (const h of norm) {
    if (seen.has(h) && !dupes.includes(h)) dupes.push(h);
    seen.add(h);
  }
  return dupes;
}

function sniffDelimiter(sample) {
  const lines = sample.split('\n').filter((l) => l.trim() !== '').slice(0, 3);
  const stripQuoted = (l) => l.replace(/"[^"]*"/g, '');
  let commas = 0, semicolons = 0;
  for (const l of lines) {
    const s = stripQuoted(l);
    commas += (s.match(/,/g) || []).length;
    semicolons += (s.match(/;/g) || []).length;
  }
  return semicolons > commas ? ';' : ',';
}

function raggedStats(aoa) {
  if (aoa.length <= 1) return { ragged: 0, total: 0 };
  const headerLen = (aoa[0] || []).length;
  let ragged = 0;
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    if (row.length !== headerLen) ragged++;
  }
  return { ragged, total: aoa.length - 1 };
}

const missingLabel = (key) => SCHEMA_FIELDS.find((f) => f.key === key)?.label || key;

// =============================================================================
// TEST SUITE
// =============================================================================

console.log('\n=== 1. Header Normalization ===');
{
  t('strips BOM', normalizeHeader('\uFEFFEmail') === 'email');
  t('trims whitespace', normalizeHeader('  Email  ') === 'email');
  t('lowercases', normalizeHeader('EMAIL') === 'email');
  t('does NOT collapse internal whitespace (impl matches page.tsx)', normalizeHeader('Client  Name') === 'client  name');
  t('handles empty', normalizeHeader('') === '');
}

console.log('\n=== 2. Auto-Map Columns (exact-first, no cross-collision) ===');
{
  const r1 = autoMapColumns(['Intent', 'Client Name', 'Company', 'Email', 'Phone', 'Product Name', 'Model Number', 'Quantity']);
  t('8/8 exact match', r1.matchedKeys.length === 8 && Object.keys(r1.mapping).length === 8);
  t('no fuzzy on exact', Object.values(r1.fuzzy).every((v) => v === false));

  const r2 = autoMapColumns(['Surname', 'Client Name', 'Company', 'Email', 'Phone', 'Product Name', 'Model Number', 'Quantity']);
  t('surname does not match name', !r2.mapping.name || r2.mapping.name !== 'Surname');
  t('name still matched', r2.matchedKeys.includes('name'));

  const r3 = autoMapColumns(['Microphone', 'Client Name', 'Company', 'Email', 'Phone', 'Product Name', 'Model Number', 'Quantity']);
  t('microphone does not match phone', !r3.mapping.phone || r3.mapping.phone !== 'Microphone');
  t('phone still matched', r3.matchedKeys.includes('phone'));

  const r4 = autoMapColumns(['Intent', 'Client Name', 'Company', 'Email', 'Phone', 'Product Name', 'Model Number', 'Quantity', 'Extra Col']);
  t('extra unknown column ignored', r4.matchedKeys.length === 8 && !r4.mapping['extra col']);
}

console.log('\n=== 3. Tier Classification ===');
{
  const all8 = ['intent','name','company','email','phone','category','details','quantity'];
  t('ALL when 8/8', classifySchema(all8).tier === 'all');

  const partial = ['email','category','phone'];
  t('PARTIAL when email+product+3 cols', classifySchema(partial).tier === 'partial');

  const emailOnly = ['email'];
  t('INSUFFICIENT when email-only', classifySchema(emailOnly).tier === 'insufficient');

  const noEmail = ['name','company','phone','category'];
  t('INSUFFICIENT when no email', classifySchema(noEmail).tier === 'insufficient');

  const twoCols = ['email','phone'];
  t('INSUFFICIENT when <3 cols', classifySchema(twoCols).tier === 'insufficient');

  const productOnly = ['category','details','quantity'];
  t('INSUFFICIENT when product-only no email', classifySchema(productOnly).tier === 'insufficient');
}

console.log('\n=== 4. Row-Level Validation ===');
{
  t('valid sell row passes', validateImportRow({ intent:'sell', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'5' }).length === 0);
  t('valid buy row passes', validateImportRow({ intent:'buy', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'5' }).length === 0);
  t('missing email rejected', validateImportRow({ intent:'sell', name:'A', company:'B', email:'', phone:'123', category:'Laptops', details:'X1', quantity:'5' }).length > 0);
  t('invalid email rejected', validateImportRow({ intent:'sell', name:'A', company:'B', email:'not-an-email', phone:'123', category:'Laptops', details:'X1', quantity:'5' }).length > 0);
  t('strict qty rejects 10abc', validateImportRow({ intent:'sell', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'10abc' }).length > 0);
  t('strict qty rejects 0', validateImportRow({ intent:'sell', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'0' }).length > 0);
  t('strict qty rejects -5', validateImportRow({ intent:'sell', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'-5' }).length > 0);
  t('strict qty accepts 1', validateImportRow({ intent:'sell', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'1' }).length === 0);
  t('invalid intent rejected', validateImportRow({ intent:'return', name:'A', company:'B', email:'a@b.com', phone:'123', category:'Laptops', details:'X1', quantity:'5' }).length > 0);
  t('no product substance rejected', validateImportRow({ intent:'sell', name:'A', company:'B', email:'a@b.com', phone:'123', category:'', details:'', quantity:'' }).length > 0);
}

console.log('\n=== 5. Duplicate Header Detection ===');
{
  t('no dupes on unique', findDuplicateHeaders(['a','b','c']).length === 0);
  t('detects exact dupes', findDuplicateHeaders(['email','email','phone']).includes('email'));
  t('detects BOM-dupes', findDuplicateHeaders(['\uFEFFEmail','Email','Phone']).includes('email'));
  t('detects case-dupes', findDuplicateHeaders(['EMAIL','email','Phone']).includes('email'));
}

console.log('\n=== 6. Delimiter Sniffing ===');
{
  t('comma default', sniffDelimiter('a,b,c\n1,2,3') === ',');
  t('semicolon detected', sniffDelimiter('a;b;c\n1;2;3') === ';');
  t('quote-aware: quoted comma not counted', sniffDelimiter('"Acme, Ltd";Phone\n"x";1') === ';');
}

console.log('\n=== 7. Ragged Row Stats ===');
{
  const good = [['a','b','c'], ['1','2','3'], ['4','5','6']];
  t('no ragged on uniform', raggedStats(good).ragged === 0);

  const ragged = [['a','b','c'], ['1','2'], ['4','5','6','7']];
  const s = raggedStats(ragged);
  t('counts ragged rows', s.ragged === 2);
  t('excludes empty trailing rows', raggedStats([['a','b','c'], ['1','2','3'], ['','','']]).ragged === 0);
}

console.log('\n=== 8. Missing Label Mapping ===');
{
  t('email label', missingLabel('email') === 'Email');
  t('name label', missingLabel('name') === 'Client Name');
  t('unknown key passthrough', missingLabel('foo') === 'foo');
}

console.log(`\n${fail === 0 ? 'INTAKE_VALIDATION_PASS' : 'INTAKE_VALIDATION_FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);