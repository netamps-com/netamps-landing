import { validateRow, tokenize, findDuplicate, fold } from '../functions/api/products/etl.js';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + n); } };

console.log('\n=== Schema validation ===');
t('valid row', validateRow({ id:'srv-001', category:'servers', model:'Dell R750', spec_template:'2U', aliases:'["r750"]' }).ok);
t('rejects bad id', validateRow({ id:'X!', category:'servers', model:'Test Model' }).errors.includes('id:format'));
t('rejects off-vocab category', validateRow({ id:'srv-1', category:'weapons', model:'Test Model' }).errors.includes('category:not_in_vocabulary'));
t('accepts case-varied category', validateRow({ id:'srv-1', category:'Servers', model:'Test Model' }).ok);
t('rejects missing model', validateRow({ id:'srv-1', category:'servers', model:'' }).errors.includes('model:required'));
t('rejects overlong spec', validateRow({ id:'srv-1', category:'servers', model:'Test Model', spec_template:'x'.repeat(401) }).errors.includes('spec:too_long'));

// Price leakage guard: BUY carries no price, so a price must never reach the index.
t('rejects Rs in spec', validateRow({ id:'srv-1', category:'servers', model:'Test Model', spec_template:'Rs 18000' }).errors.includes('spec:contains_price'));
t('rejects rupee sign', validateRow({ id:'srv-1', category:'servers', model:'Test Model', spec_template:'₹50000' }).errors.includes('spec:contains_price'));
t('rejects "under N"', validateRow({ id:'srv-1', category:'servers', model:'Test Model', spec_template:'under 50000' }).errors.includes('spec:contains_price'));
t('rejects 4-digit price w/ rupees', validateRow({ id:'srv-1', category:'servers', model:'Test Model', spec_template:'45000 rupees' }).errors.includes('spec:contains_price'));
// Must NOT false-positive on legitimate specs
t('accepts 2U rack', validateRow({ id:'srv-1', category:'servers', model:'Test Model', spec_template:'2U rack, 12x LFF' }).ok);
t('accepts NVMe spec', validateRow({ id:'cmp-1', category:'components', model:'Test Model', spec_template:'M.2 NVMe PCIe Gen4 SSD' }).ok);
t('accepts 30x10GbE', validateRow({ id:'net-1', category:'networking', model:'Test Model', spec_template:'30x 10GbE uplink' }).ok);
t('rejects bad aliases json', validateRow({ id:'srv-1', category:'servers', model:'Test Model', aliases:'not-json' }).errors.includes('aliases:unparseable'));

console.log('\n=== Tokenizer protects model numbers ===');
t('keeps r750', tokenize('r750').includes('r750'));
t('splits compound code parts', tokenize('9300-48p').includes('48p'));
t('keeps dl380', tokenize('HPE ProLiant DL380 Gen10').includes('dl380'));
t('drops stopword for', !tokenize('parts for servers').includes('for'));
t('keeps x (2 x Xeon)', tokenize('2 x Xeon').includes('x'));
t('folds uppercase', tokenize('SERVER').includes('server'));

console.log('\n=== Dedupe gate ===');
const seen = new Map([['hpe proliant dl380 gen10', 'srv-003']]);
const dup = findDuplicate({ id:'srv-034', model:'HPE ProLiant DL380 Gen10' }, seen);
t('detects cross-id duplicate', dup !== null && dup.keptId === 'srv-003' && dup.rejectedId === 'srv-034');
t('no false positive on same id', findDuplicate({ id:'srv-003', model:'HPE ProLiant DL380 Gen10' }, seen) === null);
t('no false positive on new model', findDuplicate({ id:'srv-099', model:'Brand New Thing' }, seen) === null);
// The six real collisions from the expansion seed.
for (const [model, kept, rej] of [
  ['Cisco UCS C240 M5','srv-006','srv-051'],
  ['HPE ProLiant DL380 Gen10','srv-003','srv-034'],
  ['NetApp FAS2750','stg-003','stg-035'],
]) {
  const d = findDuplicate({ id: rej, model }, new Map([[fold(model), kept]]));
  t(`catches ${model}`, d !== null && d.keptId === kept);
}

console.log(`\n${fail === 0 ? 'ETL_UNIT_PASS' : 'ETL_UNIT_FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
