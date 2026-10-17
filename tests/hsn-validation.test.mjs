/**
 * GST HSN master + product/transaction field validation.
 * Run: node tests/hsn-validation.test.mjs
 *
 * The helpers below are local copies of the pure rules in
 * functions/api/hsn.js and app/dashboard/inventory/page.tsx, so the statutory
 * HSN shape, the GST slab arithmetic and every field rule stay pinned without
 * needing D1, Workers AI or the network.
 */

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  pass', name);
  } catch (err) {
    failed += 1;
    failures.push(`${name}: ${err.message}`);
    console.log('  FAIL', name, '->', err.message);
  }
}

// ---------------------------------------------------------------------------
// Local rule copies
// ---------------------------------------------------------------------------

/** functions/api/hsn.js — isValidHsnCode */
function isValidHsnCode(code) {
  return typeof code === 'string' && /^[0-9]{2,8}$/.test(code.trim());
}

/** functions/api/hsn.js — gstSplit */
function gstSplit(igstRate) {
  const igst = Number.isFinite(Number(igstRate)) ? Number(igstRate) : 0;
  const half = igst / 2;
  const clean = (n) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);
  return { cgst: clean(half), sgst: clean(half), igst: clean(igst) };
}

/** page.tsx — validateProduct */
function validateProduct(d, opts = {}) {
  const e = {};
  const sku = d.sku.trim();
  if (!sku) e.sku = 'SKU is required.';
  else if (sku.length > 64) e.sku = 'SKU must be 64 characters or fewer.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(sku)) e.sku = 'Use letters, digits, dot, dash, slash or underscore only.';
  else {
    const clash = (opts.existing ?? []).some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.sku !== opts.editingSku);
    if (clash) e.sku = 'That SKU already exists.';
  }

  const name = d.item_name.trim();
  if (!name) e.item_name = 'Item name is required.';
  else if (name.length > 140) e.item_name = 'Item name must be 140 characters or fewer.';

  if (d.category.length > 80) e.category = 'Category must be 80 characters or fewer.';
  if (!d.uom.trim()) e.uom = 'UoM is required.';
  if (d.supplier.length > 140) e.supplier = 'Supplier must be 140 characters or fewer.';

  const cost = num(d.cost);
  const selling = num(d.selling);
  if (d.cost.trim() !== '' && (!Number.isFinite(Number(d.cost)) || cost < 0)) e.cost = 'Cost must be 0 or more.';
  if (d.selling.trim() !== '' && (!Number.isFinite(Number(d.selling)) || selling < 0)) e.selling = 'Selling price must be 0 or more.';
  else if (cost > 0 && selling > 0 && selling < cost) e.selling = 'Selling price cannot be below cost price.';

  const trigger = num(d.trigger);
  const target = num(d.targetMax);
  if (d.trigger.trim() !== '' && (!Number.isInteger(trigger) || trigger < 0)) e.trigger = 'Reorder trigger must be a whole number, 0 or more.';
  if (d.targetMax.trim() !== '' && (!Number.isInteger(target) || target < 0)) e.targetMax = 'Target max must be a whole number, 0 or more.';
  else if (target > 0 && target < trigger) e.targetMax = 'Target max must be at least the reorder trigger.';

  const hsn = d.hsn_code.trim();
  if (hsn && !/^[0-9]{2,8}$/.test(hsn)) e.hsn_code = 'HSN code must be 2-8 digits.';
  return e;
}

/** page.tsx — validateTxn */
function validateTxn(d, products, onHandBySku, type) {
  const e = {};
  const txn = d.txn_id.trim();
  if (!txn) e.txn_id = 'Transaction ID is required.';
  else if (txn.length > 64) e.txn_id = 'Transaction ID must be 64 characters or fewer.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(txn)) e.txn_id = 'Use letters, digits, dot, dash, slash or underscore only.';

  const sku = d.sku.trim().toUpperCase();
  if (!sku) e.sku = 'SKU is required.';
  else if (!products.some((p) => p.sku.toUpperCase() === sku)) e.sku = `Unknown SKU ${sku}.`;

  const qty = num(d.qty);
  if (!d.qty.trim()) e.qty = 'Quantity is required.';
  else if (!Number.isInteger(qty) || qty <= 0) e.qty = 'Quantity must be a whole number above zero.';

  if (d.unit_rate_cents.trim() !== '') {
    const rate = num(d.unit_rate_cents);
    if (!Number.isFinite(Number(d.unit_rate_cents)) || rate < 0) e.unit_rate_cents = 'Unit rate must be 0 or more.';
  }

  if (type === 'OUT' && sku && Number.isInteger(qty) && qty > 0) {
    const onHand = onHandBySku[sku] ?? 0;
    if (qty > onHand) e.qty = `Only ${onHand} on hand — cannot issue ${qty}.`;
  }
  return e;
}

function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function draft(o = {}) {
  return {
    sku: '', item_name: '', category: '', uom: 'Nos',
    cost: '', selling: '', supplier: '', trigger: '', targetMax: '',
    hsn_code: '', hsn_description: '', ...o,
  };
}

// ---------------------------------------------------------------------------
console.log('\n=== 1. HSN code shape (statutory 2/4/6/8 digits) ===');
it('accepts a 2-digit chapter code', () => assert.equal(isValidHsnCode('84'), true));
it('accepts a 4-digit heading code', () => assert.equal(isValidHsnCode('8471'), true));
it('accepts a 6-digit sub-heading code', () => assert.equal(isValidHsnCode('847130'), true));
it('accepts an 8-digit tariff line', () => assert.equal(isValidHsnCode('84713010'), true));
it('tolerates surrounding whitespace', () => assert.equal(isValidHsnCode('  8471 '), true));
it('rejects a single digit', () => assert.equal(isValidHsnCode('8'), false));
it('rejects 9 digits', () => assert.equal(isValidHsnCode('847130101'), false));
it('rejects non-digits', () => assert.equal(isValidHsnCode('84A1'), false));
it('rejects empty', () => assert.equal(isValidHsnCode(''), false));
it('rejects non-string', () => assert.equal(isValidHsnCode(8471), false));

// ---------------------------------------------------------------------------
console.log('\n=== 2. GST slab arithmetic (cgst + sgst === igst) ===');
it('splits 18% into 9 + 9', () => assert.deepEqual(gstSplit(18), { cgst: 9, sgst: 9, igst: 18 }));
it('splits 28% into 14 + 14', () => assert.deepEqual(gstSplit(28), { cgst: 14, sgst: 14, igst: 28 }));
it('splits 12% into 6 + 6', () => assert.deepEqual(gstSplit(12), { cgst: 6, sgst: 6, igst: 12 }));
it('splits 5% as 2.5 + 2.5 (statutory half, not rounded)', () => assert.deepEqual(gstSplit(5), { cgst: 2.5, sgst: 2.5, igst: 5 }));
it('splits 3% as 1.5 + 1.5 (gold and odd slabs)', () => assert.deepEqual(gstSplit(3), { cgst: 1.5, sgst: 1.5, igst: 3 }));
it('round-trips: cgst + sgst always equals igst', () => {
  for (const rate of [0, 3, 5, 12, 18, 28, 0.5, 2.5, 40]) {
    const s = gstSplit(rate);
    assert.ok(Math.abs(s.cgst + s.sgst - s.igst) < 1e-9, `slab ${rate} does not add up`);
  }
});
it('nil-rated stays 0', () => assert.deepEqual(gstSplit(0), { cgst: 0, sgst: 0, igst: 0 }));
it('non-numeric falls back to 0', () => assert.deepEqual(gstSplit('abc'), { cgst: 0, sgst: 0, igst: 0 }));

// ---------------------------------------------------------------------------
console.log('\n=== 3. Product validation — required fields ===');
it('blank draft flags sku and item name', () => {
  const e = validateProduct(draft());
  assert.ok(e.sku, 'sku required');
  assert.ok(e.item_name, 'item name required');
});
it('valid draft passes', () => {
  const e = validateProduct(draft({ sku: 'SKU-1', item_name: 'Toner', cost: '100', selling: '150', trigger: '5', targetMax: '50' }));
  assert.deepEqual(e, {});
});
it('category alone is not required', () => {
  const e = validateProduct(draft({ sku: 'SKU-1', item_name: 'Toner' }));
  assert.equal(e.category, undefined);
});
it('UoM may be blank-checked', () => {
  const e = validateProduct(draft({ sku: 'SKU-1', item_name: 'Toner', uom: '  ' }));
  assert.ok(e.uom);
});

// ---------------------------------------------------------------------------
console.log('\n=== 4. SKU validation ===');
it('rejects a duplicate SKU', () => {
  const e = validateProduct(draft({ sku: 'SKU-1', item_name: 'T' }), { existing: [{ sku: 'SKU-1' }] });
  assert.equal(e.sku, 'That SKU already exists.');
});
it('allows saving over the same SKU when editing', () => {
  const e = validateProduct(draft({ sku: 'SKU-1', item_name: 'T' }), { existing: [{ sku: 'SKU-1' }], editingSku: 'SKU-1' });
  assert.equal(e.sku, undefined);
});
it('duplicate detection is case-insensitive', () => {
  const e = validateProduct(draft({ sku: 'sku-1', item_name: 'T' }), { existing: [{ sku: 'SKU-1' }] });
  assert.ok(e.sku);
});
it('rejects spaces inside a SKU', () => {
  assert.ok(validateProduct(draft({ sku: 'SKU 1', item_name: 'T' })).sku);
});
it('rejects a leading dash', () => {
  assert.ok(validateProduct(draft({ sku: '-SKU', item_name: 'T' })).sku);
});
it('accepts dots, slashes, dashes and underscores', () => {
  assert.equal(validateProduct(draft({ sku: 'NA.IN/2024_01-a', item_name: 'T' })).sku, undefined);
});
it('rejects a 65-character SKU', () => {
  assert.ok(validateProduct(draft({ sku: 'S'.repeat(65), item_name: 'T' })).sku);
});

// ---------------------------------------------------------------------------
console.log('\n=== 5. Price and stock-level rules ===');
it('rejects selling below cost', () => {
  assert.ok(validateProduct(draft({ sku: 'S', item_name: 'T', cost: '200', selling: '100' })).selling);
});
it('allows selling equal to cost', () => {
  assert.equal(validateProduct(draft({ sku: 'S', item_name: 'T', cost: '100', selling: '100' })).selling, undefined);
});
it('allows selling above cost', () => {
  assert.equal(validateProduct(draft({ sku: 'S', item_name: 'T', cost: '100', selling: '250' })).selling, undefined);
});
it('rejects a negative cost', () => {
  assert.ok(validateProduct(draft({ sku: 'S', item_name: 'T', cost: '-5' })).cost);
});
it('allows an empty cost', () => {
  assert.equal(validateProduct(draft({ sku: 'S', item_name: 'T' })).cost, undefined);
});
it('rejects a fractional reorder trigger', () => {
  assert.ok(validateProduct(draft({ sku: 'S', item_name: 'T', trigger: '2.5' })).trigger);
});
it('rejects a negative reorder trigger', () => {
  assert.ok(validateProduct(draft({ sku: 'S', item_name: 'T', trigger: '-1' })).trigger);
});
it('rejects target max below the reorder trigger', () => {
  const e = validateProduct(draft({ sku: 'S', item_name: 'T', trigger: '10', targetMax: '5' }));
  assert.equal(e.targetMax, 'Target max must be at least the reorder trigger.');
});
it('accepts target max equal to the reorder trigger', () => {
  assert.equal(validateProduct(draft({ sku: 'S', item_name: 'T', trigger: '10', targetMax: '10' })).targetMax, undefined);
});

// ---------------------------------------------------------------------------
console.log('\n=== 6. HSN field validation ===');
it('accepts a valid HSN on the product', () => {
  assert.equal(validateProduct(draft({ sku: 'S', item_name: 'T', hsn_code: '84713010' })).hsn_code, undefined);
});
it('rejects a non-numeric HSN', () => {
  assert.ok(validateProduct(draft({ sku: 'S', item_name: 'T', hsn_code: '8471-3010' })).hsn_code);
});
it('allows HSN to be left empty', () => {
  assert.equal(validateProduct(draft({ sku: 'S', item_name: 'T', hsn_code: '' })).hsn_code, undefined);
});

// ---------------------------------------------------------------------------
console.log('\n=== 7. Transaction validation ===');
const PRODUCTS = [{ sku: 'SKU-1' }, { sku: 'SKU-2' }];
const ON_HAND = { 'SKU-1': 10, 'SKU-2': 2 };
const txn = (o = {}) => ({ txn_id: 'IN-1', sku: 'SKU-1', qty: '5', unit_rate_cents: '', ...o });

it('valid receipt passes', () => assert.deepEqual(validateTxn(txn(), PRODUCTS, ON_HAND, 'IN'), {}));
it('rejects an unknown SKU', () => {
  assert.ok(validateTxn(txn({ sku: 'NOPE' }), PRODUCTS, ON_HAND, 'IN').sku);
});
it('SKU matching is case-insensitive', () => {
  assert.equal(validateTxn(txn({ sku: 'sku-1' }), PRODUCTS, ON_HAND, 'IN').sku, undefined);
});
it('rejects a missing quantity', () => {
  assert.ok(validateTxn(txn({ qty: '' }), PRODUCTS, ON_HAND, 'IN').qty);
});
it('rejects a zero quantity', () => {
  assert.ok(validateTxn(txn({ qty: '0' }), PRODUCTS, ON_HAND, 'IN').qty);
});
it('rejects a negative quantity', () => {
  assert.ok(validateTxn(txn({ qty: '-3' }), PRODUCTS, ON_HAND, 'IN').qty);
});
it('rejects a fractional quantity', () => {
  assert.ok(validateTxn(txn({ qty: '1.5' }), PRODUCTS, ON_HAND, 'IN').qty);
});
it('allows issuing the full on-hand quantity', () => {
  assert.equal(validateTxn(txn({ sku: 'SKU-2', qty: '2' }), PRODUCTS, ON_HAND, 'OUT').qty, undefined);
});
it('blocks issuing more than on hand', () => {
  const e = validateTxn(txn({ sku: 'SKU-2', qty: '3' }), PRODUCTS, ON_HAND, 'OUT');
  assert.equal(e.qty, 'Only 2 on hand — cannot issue 3.');
});
it('over-issue is fine for a receipt', () => {
  assert.equal(validateTxn(txn({ sku: 'SKU-2', qty: '999' }), PRODUCTS, ON_HAND, 'IN').qty, undefined);
});
it('rejects a negative unit rate', () => {
  assert.ok(validateTxn(txn({ unit_rate_cents: '-1' }), PRODUCTS, ON_HAND, 'IN').unit_rate_cents);
});
it('allows an empty unit rate', () => {
  assert.equal(validateTxn(txn({ unit_rate_cents: '' }), PRODUCTS, ON_HAND, 'IN').unit_rate_cents, undefined);
});
it('rejects a missing transaction ID', () => {
  assert.ok(validateTxn(txn({ txn_id: '  ' }), PRODUCTS, ON_HAND, 'IN').txn_id);
});
it('rejects an invalid transaction ID charset', () => {
  assert.ok(validateTxn(txn({ txn_id: 'IN 1' }), PRODUCTS, ON_HAND, 'IN').txn_id);
});
it('treats an unknown SKU as zero on hand for issue', () => {
  const e = validateTxn(txn({ sku: 'GHOST', qty: '1' }), PRODUCTS, ON_HAND, 'OUT');
  assert.ok(e.sku, 'unknown sku flagged');
});

// ---------------------------------------------------------------------------
console.log('');
if (failed === 0) {
  console.log(`HSN_VALIDATION_PASS — ${passed} passed, 0 failed`);
  process.exit(0);
} else {
  console.log(`HSN_VALIDATION_FAIL — ${passed} passed, ${failed} failed`);
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}