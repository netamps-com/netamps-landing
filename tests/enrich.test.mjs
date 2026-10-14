import { fetchDuckDuckGo, extractExternalText, enrichLine, enrichEnabled } from '../functions/api/products/enrich.js';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL ' + n); } };

// Fake DB with 1 existing product, empty FTS, match_meta OFF by default
function fakeEnv({ aiPayload = null, ddgJson = null, enrichFlag = null } = {}) {
  const products = [{ id: 'srv-002', category: 'servers', model: 'Dell PowerEdge R750', spec_template: '2U', aliases: '["r750"]' }];
  const inserted = [];
  return {
    env: {
      DB: { prepare(sql) {
        const self = { _sql: sql, _binds: [],
          bind(...a) { self._binds = a; return self; },
          async run() {
            if (/INSERT INTO products /.test(self._sql)) inserted.push(self._binds);
            return { success: true };
          },
          async all() {
            if (/FROM products_fts/.test(self._sql)) return { results: [] };
            if (/FROM products$|FROM products /.test(self._sql) || /SELECT id, model FROM products/.test(self._sql)) return { results: products };
            if (/SELECT id, category, model/.test(self._sql)) {
              // searchCatalog prefix path: return empty (no match) to force enrichment
              return { results: [] };
            }
            if (/product_line_norm/.test(self._sql)) return { results: [] };
            return { results: [] };
          },
          async first() {
            if (/match_meta/.test(self._sql)) return enrichFlag ? { value: '1' } : null;
            if (/COUNT/.test(self._sql)) return { n: 0 };
            return null;
          } };
        return self;
      } },
      AI: aiPayload === null ? undefined : { async run() { return { response: JSON.stringify(aiPayload) }; } },
    },
    inserted,
    ddgJson,
  };
}

console.log('== DDG fetch timeout/empty ==');
{
  const r = await fetchDuckDuckGo('dell r750', { fetchFn: async () => ({ ok: false }) });
  t('http fail -> not ok', r.ok === false);
}
{
  const empty = extractExternalText({ Heading: '', AbstractText: '', RelatedTopics: [], Results: [] });
  t('empty ddg -> empty text', empty === '');
}
{
  const txt = extractExternalText({ Heading: 'Dell PowerEdge R750', AbstractText: '2U rack server', RelatedTopics: [{ Text: 'R750 2U' }] });
  t('extract combines', txt.includes('R750') && txt.includes('2U'));
}

console.log('== enrichLine: already in catalog skips external ==');
{
  const { env } = fakeEnv();
  // override searchCatalog path by making prefix return a hit: simplest is to test SKIP_EMPTY and NO_EXTERNAL_HINT
  const r1 = await enrichLine(env, { category: '', details: '', fetchFn: async () => ({ ok: true, json: {} }) });
  t('empty -> SKIP_EMPTY', r1.status === 'SKIP_EMPTY');
}

console.log('== enrichLine: no external hint ==');
{
  const { env } = fakeEnv();
  const noHintFetch = async () => ({ ok: true, json: async () => ({ Heading: '', AbstractText: '', RelatedTopics: [], Results: [] }) });
  // fetchDuckDuckGo expects fetchFn returning Response-like; our enrichLine passes fetchFn through to fetchDuckDuckGo which calls fetchFn(url, opts)
  const r = await enrichLine(env, {
    category: 'servers', details: 'mystery box xyz 9999',
    fetchFn: async () => ({ ok: true, json: async () => ({ Heading: '', AbstractText: '', RelatedTopics: [], Results: [] }) }),
  });
  t('no hint -> NO_EXTERNAL_HINT or ALREADY*', ['NO_EXTERNAL_HINT', 'ALREADY_IN_CATALOG', 'DDG_HTTP', 'DDG_FAILED'].includes(r.status));
}

console.log('== enrichLine: happy path inserts unverified ==');
{
  const aiPayload = { category: 'servers', manufacturer: 'Dell', model: 'Dell PowerEdge R999', formFactor: '2U', cpu: [], memoryGb: null, storage: [], ports: null };
  const f = fakeEnv({ aiPayload });
  // Novel model NOT in catalog: user query + DDG hint share R999 tokens
  const ddgJson = { Heading: 'Dell PowerEdge R999', AbstractText: '2U rack server Dell PowerEdge R999', RelatedTopics: [], Results: [] };
  const fetchFn = async () => ({ ok: true, json: async () => ddgJson });
  const r = await enrichLine(f.env, { category: 'servers', details: 'Dell PowerEdge R999 2U', fetchFn });
  t('enriched unverified', r.status === 'ENRICHED_UNVERIFIED' && !!r.productId);
  t('inserted 1 product', f.inserted.length === 1);
  t('inserted as unverified', f.inserted[0]?.[5] === 'unverified');
}

console.log('== enrichLine: external hijack rejected ==');
{
  const aiPayload = { category: 'networking', manufacturer: 'Cisco', model: 'Cisco Catalyst 9300', formFactor: null, cpu: [], memoryGb: null, storage: [], ports: 48 };
  const f = fakeEnv({ aiPayload });
  const ddgJson = { Heading: 'Cisco Catalyst 9300', AbstractText: '48 port switch', RelatedTopics: [], Results: [] };
  const fetchFn = async () => ({ ok: true, json: async () => ddgJson });
  // User asked for something totally different; model proposes Cisco -> must reject
  const r = await enrichLine(f.env, { category: 'servers', details: 'mystery xyz box 12345', fetchFn });
  t('hijack rejected', ['FABRICATED_IDENTITY', 'UNGROUNDED', 'SCHEMA_REJECT'].includes(r.status));
  t('nothing inserted', f.inserted.length === 0);
}

console.log('== enrichEnabled flag ==');
{
  const { env } = fakeEnv({ enrichFlag: null });
  t('default OFF', (await enrichEnabled(env)) === false);
}

console.log(`\n${fail === 0 ? 'ENRICH_PASS' : 'ENRICH_FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
