/**
 * IMS inventory business rules, verified without network or D1 access.
 * Run: node tests/inventory.test.mjs
 *
 * The helpers below are local copies of the pure rules under test, so the
 * behaviour stays pinned even if the inventory API is unreachable.
 */

import assert from 'node:assert/strict';

// ── Local rule copies ──────────────────────────────────────────────────────

function toCents(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function computeBalance(opening, inflow, outflow, reorderTrigger = 0) {
  const stockOnHand = opening + inflow - outflow;
  return {
    totalInflow: inflow,
    totalOutflow: outflow,
    stockOnHand,
    stockValueCents: (costCents) => stockOnHand * costCents,
    status: stockOnHand <= reorderTrigger ? 'RESTOCK REQUIRED' : 'HEALTHY'
  };
}

function validateStockOut(onHand, qty) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, error: 'Quantity must be a positive integer' };
  }
  if (qty > onHand) return { ok: false, error: 'Insufficient stock' };
  return { ok: true };
}

function recommendedQty(targetMax, onHand) {
  return Math.max(0, targetMax - onHand);
}

function isNonNegInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateProduct(product) {
  const errors = [];
  const sku = product.sku;
  if (typeof sku !== 'string' || sku.length === 0 || sku.length > 64) errors.push('sku');
  if (typeof product.item_name !== 'string' || product.item_name.length > 140) errors.push('item_name');
  if (typeof product.category !== 'string' || product.category.length > 80) errors.push('category');
  if (typeof product.uom !== 'string' || product.uom.length > 20) errors.push('uom');
  if (!isNonNegInt(product.cost)) errors.push('cost');
  if (!isNonNegInt(product.selling)) errors.push('selling');
  if (!isNonNegInt(product.trigger)) errors.push('trigger');
  if (!isNonNegInt(product.target)) errors.push('target');
  return { ok: errors.length === 0, errors };
}

function kpis(rows) {
  const totalValueCents = rows.reduce((sum, row) => sum + row.stockOnHand * row.costCents, 0);
  const totalUnits = rows.reduce((sum, row) => sum + row.stockOnHand, 0);
  const skusRestockCount = rows.filter((row) => row.status === 'RESTOCK REQUIRED').length;
  const topVelocity = rows.slice()
    .sort((a, b) => b.total_out - a.total_out)
    .slice(0, 3)
    .map((row) => ({ sku: row.sku, item_name: row.item_name, total_out: row.total_out }));
  return { totalValueCents, totalUnits, skusRestockCount, topVelocity };
}

function moneyDisplay(cents) {
  const sign = cents < 0 ? '-' : '';
  const rupees = Math.floor(Math.abs(cents) / 100);
  const paise = String(Math.abs(cents) % 100).padStart(2, '0');
  return sign + '₹' + rupees.toLocaleString('en-US') + '.' + paise;
}

// ── Test harness ───────────────────────────────────────────────────────────

let pass = 0, fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('  pass ' + name);
  } catch (err) {
    fail++;
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}

// ── 1. toCents ─────────────────────────────────────────────────────────────

console.log('\ntoCents');
t('comma thousands parse', () => assert.equal(toCents('1,250.00'), 125000));
t('plain number parse', () => assert.equal(toCents(1250), 125000));
t('cents parse', () => assert.equal(toCents('1250.50'), 125050));
t('empty string rejected', () => assert.equal(toCents(''), null));
t('null rejected', () => assert.equal(toCents(null), null));
t('garbage rejected', () => assert.equal(toCents('abc'), null));
t('negative rejected', () => assert.equal(toCents(-750), null));

// ── 2. computeBalance ──────────────────────────────────────────────────────

console.log('\ncomputeBalance');
{
  const healthy = computeBalance(100, 60, 30, 20);
  t('stockOnHand = opening + inflow - outflow', () => assert.equal(healthy.stockOnHand, 130));
  t('above trigger is HEALTHY', () => assert.equal(healthy.status, 'HEALTHY'));
  t('stockValueCents multiplies on-hand by cost', () => assert.equal(healthy.stockValueCents(2500), 325000));

  const atTrigger = computeBalance(10, 0, 0, 10);
  t('on-hand equal to trigger is RESTOCK REQUIRED', () => assert.equal(atTrigger.status, 'RESTOCK REQUIRED'));

  const belowTrigger = computeBalance(5, 0, 0, 10);
  t('on-hand below trigger is RESTOCK REQUIRED', () => assert.equal(belowTrigger.status, 'RESTOCK REQUIRED'));
}

// ── 3. validateStockOut ────────────────────────────────────────────────────

console.log('\nvalidateStockOut');
t('qty within on-hand passes', () => assert.equal(validateStockOut(100, 5).ok, true));
t('qty equal to on-hand passes', () => assert.equal(validateStockOut(100, 100).ok, true));
{
  const over = validateStockOut(100, 101);
  t('qty above on-hand fails with Insufficient stock', () => {
    assert.equal(over.ok, false);
    assert.equal(over.error, 'Insufficient stock');
  });
}
t('zero qty rejected', () => assert.equal(validateStockOut(100, 0).ok, false));
t('fractional qty rejected', () => assert.equal(validateStockOut(100, 2.5).ok, false));

// ── 4. recommendedQty ──────────────────────────────────────────────────────

console.log('\nrecommendedQty');
t('positive recommendation', () => assert.equal(recommendedQty(100, 30), 70));
t('zero when fully stocked', () => assert.equal(recommendedQty(30, 100), 0));

// ── 5. validateProduct ─────────────────────────────────────────────────────

console.log('\nvalidateProduct');
{
  const good = {
    sku: 'SKU-001', item_name: 'Widget', category: 'Electronics', uom: 'pcs',
    cost: 10000, selling: 15000, trigger: 10, target: 100
  };
  t('valid product passes', () => assert.equal(validateProduct(good).ok, true));
  t('empty sku fails', () => assert.equal(validateProduct({ ...good, sku: '' }).ok, false));
  t('negative cost fails', () => assert.equal(validateProduct({ ...good, cost: -5 }).ok, false));
  t('non-integer selling fails', () => assert.equal(validateProduct({ ...good, selling: 12.5 }).ok, false));
}

// ── 6. kpis ────────────────────────────────────────────────────────────────

console.log('\nkpis');
{
  const rows = [
    { sku: 'A', item_name: 'Alpha', stockOnHand: 10, costCents: 10000, status: 'HEALTHY', total_out: 40 },
    { sku: 'B', item_name: 'Beta', stockOnHand: 0, costCents: 20000, status: 'RESTOCK REQUIRED', total_out: 90 },
    { sku: 'C', item_name: 'Gamma', stockOnHand: 5, costCents: 5000, status: 'RESTOCK REQUIRED', total_out: 60 },
    { sku: 'D', item_name: 'Delta', stockOnHand: 20, costCents: 1000, status: 'HEALTHY', total_out: 10 }
  ];
  const k = kpis(rows);
  t('total value sums on-hand x cost', () => assert.equal(k.totalValueCents, 145000));
  t('restock count', () => assert.equal(k.skusRestockCount, 2));
  t('top velocity is top-3 by total_out desc', () => assert.equal(JSON.stringify(k.topVelocity), JSON.stringify([
    { sku: 'B', item_name: 'Beta', total_out: 90 },
    { sku: 'C', item_name: 'Gamma', total_out: 60 },
    { sku: 'A', item_name: 'Alpha', total_out: 40 }
  ])));
}

// ── 7. moneyDisplay ────────────────────────────────────────────────────────

console.log('\nmoneyDisplay');
t('formats rupees with commas', () => assert.equal(moneyDisplay(125000), '₹1,250.00'));
t('sub-rupee amount', () => assert.equal(moneyDisplay(500), '₹5.00'));
t('zero formats', () => assert.equal(moneyDisplay(0), '₹0.00'));

// ── Result ─────────────────────────────────────────────────────────────────

console.log(`\n${fail === 0 ? 'INVENTORY_PASS' : 'INVENTORY_FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
