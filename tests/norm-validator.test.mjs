import { validateDescriptor, isPromotable, normalizeLine } from '../functions/api/normalize/line.js';

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
};

console.log('\n=== 1. Faithful extraction (grounded) ===');
{
  const src = 'Dell PowerEdge R750, 2x Xeon Gold 6130, 128GB RAM, 2U rack';
  const { d, rejected } = validateDescriptor({
    category: 'servers', manufacturer: 'Dell', model: 'PowerEdge R750',
    formFactor: '2U', cpu: ['2x Xeon Gold 6130'], memoryGb: 128,
    storage: [], ports: null, confidence: 0.92
  }, { source: src });
  t('no rejection', rejected === null);
  t('category kept', d.category === 'servers');
  t('manufacturer kept', d.manufacturer === 'Dell');
  t('model kept', d.model === 'PowerEdge R750');
  t('cpu kept', d.cpu.length === 1 && d.cpu[0].includes('Xeon Gold 6130'));
  t('memoryGb kept', d.memoryGb === 128);
  t('grounded=true', d.grounded === true);
  t('promotable at 0.92', isPromotable(d) === true);
}

console.log('\n=== 2. HALLUCINATED model rejected wholesale ===');
{
  const src = 'Dell PowerEdge R750, 2x Xeon Gold 6130, 128GB RAM';
  const { d, rejected } = validateDescriptor({
    category: 'servers', manufacturer: 'Cisco', model: 'Catalyst 9500',
    cpu: ['2x Xeon Gold 6130'], memoryGb: 128, confidence: 0.99
  }, { source: src });
  t('rejected as FABRICATED_IDENTITY', rejected === 'FABRICATED_IDENTITY');
  t('invented model NOT kept', d.model === null);
  t('invented manufacturer NOT kept', d.manufacturer === null);
  t('NOT promotable', isPromotable(d) === false);
}

console.log('\n=== 3. Ungrounded spec field dropped, line still promotable ===');
{
  const src = 'Dell PowerEdge R750, 128GB RAM';
  const { d, rejected } = validateDescriptor({
    category: 'servers', manufacturer: 'Dell', model: 'PowerEdge R750',
    cpu: ['2x Xeon Gold 6130'],      // NOT in the source
    memoryGb: 128, confidence: 0.9
  }, { source: src });
  t('no wholesale rejection', rejected === null);
  t('hallucinated cpu dropped', d.cpu.length === 0);
  t('stated memoryGb kept', d.memoryGb === 128);
  t('still grounded', d.grounded === true);
}

console.log('\n=== 4. Fabricated memory number dropped ===');
{
  const src = 'Dell PowerEdge R750, 128GB RAM';
  const { d } = validateDescriptor({
    category: 'servers', manufacturer: 'Dell', model: 'PowerEdge R750',
    memoryGb: 512, confidence: 0.9        // source says 128
  }, { source: src });
  t('512 dropped (source says 128)', d.memoryGb === null);
}

console.log('\n=== 5. Off-vocabulary category coerced ===');
{
  const src = 'weird thing';
  const { d } = validateDescriptor({
    category: 'totally-made-up', manufacturer: null, model: null, confidence: 0.9
  }, { source: src });
  t('invalid category dropped', d.category === null);
  t('not grounded without identity', d.grounded === false);
}

console.log('\n=== 6. Confidence is COMPUTED, not self-reported ===');
{
  // Model CLAIMS 0.5 but states a fully grounded identity: our computed
  // score should reflect the verified evidence, not the model's modesty.
  const src = 'Dell PowerEdge R750, 128GB RAM';
  const strong = validateDescriptor({
    category: 'servers', manufacturer: 'Dell', model: 'PowerEdge R750',
    memoryGb: 128, confidence: 0.5
  }, { source: src });
  t('strong grounded line promotable', isPromotable(strong.d) === true);
  t('score ignores low self-report', strong.d.confidence >= 0.8);

  // Model CLAIMS 0.99 but the line only names a broad category.
  // Self-report must NOT carry it past the gate.
  const weak = validateDescriptor({
    category: 'servers', manufacturer: null, model: null,
    confidence: 0.99
  }, { source: 'looking for server stuff' });
  t('weak line NOT promotable', isPromotable(weak.d) === false);
  t('score ignores high self-report', weak.d.confidence < 0.8);
}

console.log('\n=== 7. Malformed model output is safe ===');
{
  for (const [name, bad] of [['null', null], ['array', [1,2]], ['string', 'hello'], ['number', 42]]) {
    const { d, rejected } = validateDescriptor(bad, { source: 'anything' });
    t(`${name} rejected`, rejected === 'NOT_AN_OBJECT' && isPromotable(d) === false);
  }
}

console.log('\n=== 8. D3: catalog hit means NO model call + verification cap ===');
{
  const calls = [];
  const mk = (verificationStatus) => ({
    DB: { prepare(sql) {
      const self = { _sql: sql, _binds: [],
        bind(...a) { self._binds = a; return self; },
        async run() { return { success: true }; },
        async first() {
          // readVerificationStatus(): the trust decision is deliberately read
          // UNCACHED, one row by primary key — never from the search snapshot.
          if (/SELECT verification_status FROM products WHERE id/.test(self._sql)) {
            return { verification_status: verificationStatus };
          }
          return null;
        },
        async all() {
          if (/CREATE TABLE|CREATE INDEX/.test(self._sql)) return { results: [] };
          // ensureFtsIndex probes "SELECT COUNT(*) ... FROM products_fts". The
          // FTS tier is only used by the typeahead path; the normalizer's
          // catalog lookup goes through searchCatalog's prefix/fuzzy tiers.
          // Return no FTS rows so that path is exercised (as in prod, the
          // normalizer resolves via prefix/alias, not the FTS index).
          if (/FROM products_fts/.test(self._sql)) return { results: [] };
          return { results: [{ id: 'srv-002', category: 'servers', model: 'Dell PowerEdge R750',
                               spec_template: '2U rack, 3rd Gen Xeon Scalable', aliases: '["r750"]',
                               verification_status: verificationStatus }] };
        } };
      return self;
    } },
    AI: { async run(m) { calls.push(m); throw new Error('MODEL MUST NOT BE CALLED'); } }
  });

  // VERIFIED row: trusted, promotable, no model call.
  const v = await normalizeLine(mk('verified'), { category: 'servers', details: 'Dell PowerEdge R750' });
  t('verified: catalog anchored', v.flags.includes('CATALOG_ANCHORED'));
  t('verified: catalogId set', v.descriptor.catalogId === 'srv-002');
  t('verified: promotable', isPromotable(v.descriptor) === true);
  t('verified: no UNVERIFIED flag', !v.flags.includes('CATALOG_UNVERIFIED'));

  // UNVERIFIED row (or absent status => treated unverified): still anchored and
  // displayed, but CAPPED below the promotion gate.
  const u = await normalizeLine(mk('unverified'), { category: 'servers', details: 'Dell PowerEdge R750' });
  t('unverified: still anchored', u.flags.includes('CATALOG_ANCHORED'));
  t('unverified: flagged', u.flags.includes('CATALOG_UNVERIFIED'));
  t('unverified: NOT promotable (cap holds)', isPromotable(u.descriptor) === false);
  t('unverified: confidence <= 0.75', u.descriptor.confidence <= 0.75);

  t('model NEVER invoked on either path', calls.length === 0);
}

console.log('\n=== 9. Missing AI binding degrades safely ===');
{
  const env = {
    DB: { prepare(sql) {
      const self = { _sql: sql, _binds: [],
        bind(...a) { self._binds = a; return self; },
        async run() { return { success: true }; },
        async all() { return { results: [] }; } };
      return self;
    } }
  };
  const { descriptor, flags } = await normalizeLine(env, { category: 'x', details: 'unknown widget' });
  t('flagged NO_AI_BINDING', flags.includes('NO_AI_BINDING'));
  t('not promotable', isPromotable(descriptor) === false);
}

console.log(`\n${fail === 0 ? 'VALIDATOR_PASS' : 'VALIDATOR_FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
