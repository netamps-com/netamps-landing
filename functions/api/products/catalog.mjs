/**
 * BUY product catalog — pure matching + LLM-contract logic.
 *
 * THE ONE RULE: the model suggests, the catalog decides. No free text —
 * human or LLM — ever becomes structured order data without resolving to a
 * catalog entry (or an explicit Custom/unverified accept by the visitor).
 *
 * This module is deliberately pure (no Cloudflare APIs, no I/O) so both the
 * Pages Function (suggest.js) and the Node test harness import the exact
 * same code — the match matrix and the LLM-contract rejections are tested
 * against what actually ships.
 *
 * Tier 1: prefix + folded-fuzzy matching (zero cost, offline-tolerant).
 * Tier 2 lives in suggest.js — it may only return candidates re-validated
 * against `catalogIdSet()` here, so a hallucinated id is dropped server-side.
 */

export const CATEGORIES = ['servers', 'network', 'workstations', 'peripherals', 'telecom', 'mixed'];

/**
 * Seed catalog (ITAD taxonomy + common enterprise equipment). Extended at
 * runtime from D1 (`product_catalog`) — staff add rows there; this seed is
 * the floor so the endpoint works even before the table exists.
 * `spec` is the canonical Details & Specs template filled on selection.
 */
export const SEED_CATALOG = [
  // ── Enterprise Servers & Storage ──
  { id: 'dell-poweredge-r740', category: 'servers', brand: 'Dell', model: 'PowerEdge R740', aliases: ['r740', 'poweredge r740', 'dell r740', 'pe r740'], spec: 'Dell PowerEdge R740, 2U rack server — Xeon Scalable (2nd gen), up to 24 DDR4 DIMM, 8x 2.5in/3.5in bays, PERC RAID, iDRAC9. State CPU/RAM/storage config, quantity and condition.' },
  { id: 'dell-poweredge-r740xd', category: 'servers', brand: 'Dell', model: 'PowerEdge R740xd', aliases: ['r740xd', 'poweredge r740xd', 'dell r740xd'], spec: 'Dell PowerEdge R740xd, 2U rack server — dense storage variant, up to 24x 2.5in bays, Xeon Scalable, PERC RAID, iDRAC9. State config, quantity and condition.' },
  { id: 'dell-poweredge-r640', category: 'servers', brand: 'Dell', model: 'PowerEdge R640', aliases: ['r640', 'poweredge r640', 'dell r640'], spec: 'Dell PowerEdge R640, 1U rack server — Xeon Scalable (2nd gen), up to 24 DDR4 DIMM, 8x 2.5in bays, PERC RAID, iDRAC9. State config, quantity and condition.' },
  { id: 'dell-poweredge-r750', category: 'servers', brand: 'Dell', model: 'PowerEdge R750', aliases: ['r750', 'poweredge r750', 'dell r750'], spec: 'Dell PowerEdge R750, 2U rack server — Xeon Scalable (3rd gen), up to 32 DDR4 DIMM, 8x 2.5in/3.5in bays, PERC RAID, iDRAC9 Enterprise. State config, quantity and condition.' },
  { id: 'dell-poweredge-r650', category: 'servers', brand: 'Dell', model: 'PowerEdge R650', aliases: ['r650', 'poweredge r650', 'dell r650'], spec: 'Dell PowerEdge R650, 1U rack server — Xeon Scalable (3rd gen), up to 32 DDR4 DIMM, 8x 2.5in bays, PERC RAID, iDRAC9. State config, quantity and condition.' },
  { id: 'dell-poweredge-r440', category: 'servers', brand: 'Dell', model: 'PowerEdge R440', aliases: ['r440', 'poweredge r440', 'dell r440'], spec: 'Dell PowerEdge R440, 1U rack server — Xeon Scalable (2nd gen), up to 16 DDR4 DIMM, 4x 2.5in bays, PERC RAID, iDRAC9. State config, quantity and condition.' },
  { id: 'dell-poweredge-t640', category: 'servers', brand: 'Dell', model: 'PowerEdge T640', aliases: ['t640', 'poweredge t640', 'dell t640', 'tower server'], spec: 'Dell PowerEdge T640, tower server — Xeon Scalable, up to 16 DDR4 DIMM, hot-plug drive bays, PERC RAID, iDRAC9. State config, quantity and condition.' },
  { id: 'hpe-proliant-dl380-gen10', category: 'servers', brand: 'HPE', model: 'ProLiant DL380 Gen10', aliases: ['dl380', 'dl380 g10', 'dl380 gen10', 'proliant dl380', 'hpe dl380'], spec: 'HPE ProLiant DL380 Gen10, 2U rack server — Xeon Scalable, 24 DDR4 DIMM, SFF/LFF drive bays, Smart Array RAID, iLO5. State config, quantity and condition.' },
  { id: 'hpe-proliant-dl360-gen10', category: 'servers', brand: 'HPE', model: 'ProLiant DL360 Gen10', aliases: ['dl360', 'dl360 g10', 'dl360 gen10', 'proliant dl360'], spec: 'HPE ProLiant DL360 Gen10, 1U rack server — Xeon Scalable, 24 DDR4 DIMM, SFF drive bays, Smart Array RAID, iLO5. State config, quantity and condition.' },
  { id: 'hpe-proliant-dl380-gen11', category: 'servers', brand: 'HPE', model: 'ProLiant DL380 Gen11', aliases: ['dl380 g11', 'dl380 gen11', 'proliant dl380 gen11'], spec: 'HPE ProLiant DL380 Gen11, 2U rack server — Xeon Scalable (4th/5th gen), 32 DDR5 DIMM, SFF/LFF bays, MR/RAID, iLO6. State config, quantity and condition.' },
  { id: 'hpe-proliant-ml110-gen10', category: 'servers', brand: 'HPE', model: 'ProLiant ML110 Gen10', aliases: ['ml110', 'ml110 g10', 'proliant ml110'], spec: 'HPE ProLiant ML110 Gen10, tower server — Xeon Scalable, 16 DDR4 DIMM, LFF bays, Smart Array RAID, iLO5. State config, quantity and condition.' },
  { id: 'lenovo-thinksystem-sr650', category: 'servers', brand: 'Lenovo', model: 'ThinkSystem SR650', aliases: ['sr650', 'thinksystem sr650', 'lenovo sr650'], spec: 'Lenovo ThinkSystem SR650, 2U rack server — Xeon Scalable, 24 DDR4 DIMM, 8x 2.5in/3.5in bays, MegaRAID, XCC. State config, quantity and condition.' },
  { id: 'lenovo-thinksystem-sr630', category: 'servers', brand: 'Lenovo', model: 'ThinkSystem SR630', aliases: ['sr630', 'thinksystem sr630', 'lenovo sr630'], spec: 'Lenovo ThinkSystem SR630, 1U rack server — Xeon Scalable, 24 DDR4 DIMM, 8x 2.5in bays, MegaRAID, XCC. State config, quantity and condition.' },
  { id: 'cisco-ucs-c220-m5', category: 'servers', brand: 'Cisco', model: 'UCS C220 M5', aliases: ['ucs c220', 'cisco c220', 'c220 m5'], spec: 'Cisco UCS C220 M5, 1U rack server — Xeon Scalable, 24 DDR4 DIMM, 8x 2.5in bays, 12G SAS HBA, CIMC. State config, quantity and condition.' },
  { id: 'cisco-ucs-c240-m5', category: 'servers', brand: 'Cisco', model: 'UCS C240 M5', aliases: ['ucs c240', 'cisco c240', 'c240 m5'], spec: 'Cisco UCS C240 M5, 2U rack server — Xeon Scalable, 24 DDR4 DIMM, up to 24x 2.5in/12x 3.5in bays, 12G SAS HBA, CIMC. State config, quantity and condition.' },
  { id: 'supermicro-sys-6029p', category: 'servers', brand: 'Supermicro', model: 'SYS-6029P', aliases: ['supermicro 6029', 'sys-6029p', 'supermicro 2u'], spec: 'Supermicro SYS-6029P, 2U rack server — Xeon Scalable, 24 DDR4 DIMM, 8x 2.5in bays, MegaRAID/IPMI. State config, quantity and condition.' },
  { id: 'dell-powervault-me5024', category: 'servers', brand: 'Dell', model: 'PowerVault ME5024', aliases: ['me5024', 'powervault', 'dell powervault', 'me5'], spec: 'Dell PowerVault ME5024, 2U SAN array — up to 24x 2.5in drives, dual controller ready, FC/iSCSI. State drive count, capacity, controller and condition.' },

  // ── Networking Gear (Switches, Routers) ──
  { id: 'cisco-catalyst-9300', category: 'network', brand: 'Cisco', model: 'Catalyst 9300', aliases: ['c9300', 'cat 9300', 'catalyst 9300', 'cisco 9300'], spec: 'Cisco Catalyst 9300 series PoE/non-PoE access switch — 24/48 port, StackWise-480, C9300 license level. State port count, PoE budget, license and condition.' },
  { id: 'cisco-catalyst-9200', category: 'network', brand: 'Cisco', model: 'Catalyst 9200', aliases: ['c9200', 'cat 9200', 'catalyst 9200', 'cisco 9200'], spec: 'Cisco Catalyst 9200 series access switch — 24/48 port, NetRes-lite, PoE options. State port count, PoE and condition.' },
  { id: 'cisco-catalyst-2960x', category: 'network', brand: 'Cisco', model: 'Catalyst 2960X', aliases: ['2960', '2960x', 'catalyst 2960x', 'cisco 2960'], spec: 'Cisco Catalyst 2960X access switch — 24/48 port Gigabit, PoE/PoE+ models, LAN Lite. State port count, PoE and condition.' },
  { id: 'cisco-nexus-93180', category: 'network', brand: 'Cisco', model: 'Nexus 93180YC-EX', aliases: ['nexus 93180', '93180yc', 'nexus 93180yc ex', 'cisco nexus'], spec: 'Cisco Nexus 93180YC-EX leaf/spine switch — 48x 10/25G + 6x 40/100G, NX-OS. State config, license and condition.' },
  { id: 'cisco-isr-4331', category: 'network', brand: 'Cisco', model: 'ISR 4331', aliases: ['isr 4331', 'cisco isr', 'router 4331'], spec: 'Cisco ISR 4331 integrated services router — 3x GE, 2x NIM slots, 1Gbps throughput, IP Base. State modules, license and condition.' },
  { id: 'juniper-ex4300', category: 'network', brand: 'Juniper', model: 'EX4300', aliases: ['ex4300', 'juniper ex4300', 'ex 4300'], spec: 'Juniper EX4300 access switch — 24/48 port 1G, Virtual Chassis, PoE models. State port count, PoE and condition.' },
  { id: 'juniper-srx345', category: 'network', brand: 'Juniper', model: 'SRX345', aliases: ['srx345', 'juniper srx', 'srx 345'], spec: 'Juniper SRX345 services gateway firewall — 1Gbps base, 8x GE + 4x SFP+, Security DirectCach. State throughput license, HA pair and condition.' },
  { id: 'aruba-2930f', category: 'network', brand: 'Aruba', model: '2930F', aliases: ['2930f', 'aruba 2930', '2930 f'], spec: 'Aruba 2930F access switch — 24/48 port Gigabit, PoE+, 4x SFP+, Stacking, ArubaOS-CX. State port count, PoE and condition.' },
  { id: 'aruba-6300m', category: 'network', brand: 'Aruba', model: '6300M', aliases: ['6300', '6300m', 'aruba 6300'], spec: 'Aruba 6300M aggregation switch — 24/48 port 1G/10G, PoE, 4x SFP+, ArubaOS-CX, VSX. State port count, PoE and condition.' },
  { id: 'fortinet-fortigate-100f', category: 'network', brand: 'Fortinet', model: 'FortiGate 100F', aliases: ['fgt 100f', 'fortigate 100f', 'fortigate 100', '100f'], spec: 'Fortinet FortiGate 100F next-gen firewall — 20 Gbps firewall, 10x GE RJ45 + 4x SFP, SD-WAN, UTM bundle. State subscription license and condition.' },
  { id: 'fortinet-fortigate-60f', category: 'network', brand: 'Fortinet', model: 'FortiGate 60F', aliases: ['fgt 60f', 'fortigate 60f', 'fortigate 60', '60f'], spec: 'Fortinet FortiGate 60F desktop firewall — 10 Gbps firewall, 10x GE, SD-WAN, UTM bundle. State subscription license and condition.' },
  { id: 'ubiquiti-usw-pro-24', category: 'network', brand: 'Ubiquiti', model: 'USW-Pro-24-PoE', aliases: ['usw-pro-24', 'ubiquiti switch', 'unifi switch', 'usw pro 24'], spec: 'Ubiquiti UniFi USW-Pro-24-PoE — 24x Gigabit, 400W PoE, 2x SFP+, L3 managed. State PoE usage and condition.' },

  // ── Laptops & Workstations ──
  { id: 'dell-optiplex-7090', category: 'workstations', brand: 'Dell', model: 'OptiPlex 7090', aliases: ['optiplex 7090', 'optiplex', '7090'], spec: 'Dell OptiPlex 7090 desktop — SFF/Micro/Tower, Intel 10th gen, up to 128GB DDR4. State form factor, CPU/RAM/storage and condition.' },
  { id: 'dell-optiplex-7010', category: 'workstations', brand: 'Dell', model: 'OptiPlex 7010', aliases: ['optiplex 7010', '7010'], spec: 'Dell OptiPlex 7010 desktop — Micro/SFF/Tower, Intel 12th gen, up to 128GB DDR5. State form factor, CPU/RAM/storage and condition.' },
  { id: 'dell-precision-3660', category: 'workstations', brand: 'Dell', model: 'Precision 3660', aliases: ['precision 3660', 'dell precision', '3660'], spec: 'Dell Precision 3660 tower workstation — Intel vPro, pro GPU options, ECC memory. State CPU/GPU/RAM/storage and condition.' },
  { id: 'dell-precision-5820', category: 'workstations', brand: 'Dell', model: 'Precision 5820', aliases: ['precision 5820', '5820'], spec: 'Dell Precision 5820 tower workstation — Xeon W, up to 256GB ECC RDIMM, pro GPU options. State CPU/GPU/RAM/storage and condition.' },
  { id: 'dell-latitude-5420', category: 'workstations', brand: 'Dell', model: 'Latitude 5420', aliases: ['latitude 5420', 'latitude', '5420'], spec: 'Dell Latitude 5420 business laptop — 14in, Intel 11th gen vPro, up to 64GB DDR4. State CPU/RAM/storage, charger included and condition.' },
  { id: 'dell-latitude-7420', category: 'workstations', brand: 'Dell', model: 'Latitude 7420', aliases: ['latitude 7420', '7420'], spec: 'Dell Latitude 7420 business laptop — 14in, Intel 11th gen vPro, up to 32GB DDR4. State CPU/RAM/storage, charger included and condition.' },
  { id: 'hp-elitebook-840-g8', category: 'workstations', brand: 'HP', model: 'EliteBook 840 G8', aliases: ['elitebook 840', '840 g8', 'elitebook g8'], spec: 'HP EliteBook 840 G8 business laptop — 14in, Intel 11th gen vPro, up to 32GB DDR4. State CPU/RAM/storage, charger included and condition.' },
  { id: 'hp-prodesk-400-g7', category: 'workstations', brand: 'HP', model: 'ProDesk 400 G7', aliases: ['prodesk 400', 'prodesk g7', '400 g7'], spec: 'HP ProDesk 400 G7 desktop — SFF/Micro, Intel 10th gen, up to 64GB DDR4. State form factor, CPU/RAM/storage and condition.' },
  { id: 'lenovo-thinkcentre-m720q', category: 'workstations', brand: 'Lenovo', model: 'ThinkCentre M720q', aliases: ['m720q', 'thinkcentre', 'm720'], spec: 'Lenovo ThinkCentre M720q tiny desktop — Intel 8th/9th gen, up to 64GB DDR4. State CPU/RAM/storage and condition.' },
  { id: 'lenovo-thinkpad-t14', category: 'workstations', brand: 'Lenovo', model: 'ThinkPad T14', aliases: ['thinkpad t14', 't14', 'thinkpad'], spec: 'Lenovo ThinkPad T14 business laptop — 14in, Intel/AMD Ryzen Pro, up to 32GB. State CPU/RAM/storage, charger included and condition.' },
  { id: 'apple-macbook-pro-16', category: 'workstations', brand: 'Apple', model: 'MacBook Pro 16"', aliases: ['macbook pro', 'macbook', 'mbp 16'], spec: 'Apple MacBook Pro 16" — Intel or Apple Silicon, up to 64GB unified memory. State year/CPU/RAM/storage, charger included and condition.' },

  // ── Components & Peripherals ──
  { id: 'ddr4-32gb-rdimm', category: 'peripherals', brand: 'Generic', model: 'DDR4 32GB ECC RDIMM', aliases: ['ddr4 32gb', '32gb rdimm', 'ddr4 ecc', '32gb ddr4', 'ecc memory'], spec: 'DDR4 32GB ECC registered DIMM (2133/2400/2666/3200) — server memory. State speed, rank, brand compatibility, quantity and condition (tested/untested).' },
  { id: 'ddr4-64gb-rdimm', category: 'peripherals', brand: 'Generic', model: 'DDR4 64GB ECC RDIMM', aliases: ['ddr4 64gb', '64gb rdimm', '64gb ddr4'], spec: 'DDR4 64GB ECC registered DIMM (2400/2666/3200) — server memory. State speed, rank, quantity and condition (tested/untested).' },
  { id: 'samsung-870-evo-1tb', category: 'peripherals', brand: 'Samsung', model: '870 EVO 1TB SSD', aliases: ['870 evo', 'samsung 870', '870 evo 1tb', 'samsung ssd'], spec: 'Samsung 870 EVO 1TB SATA SSD — 2.5in, SATA III, up to 560/530 MB/s. State quantity, power-on hours (if known) and condition.' },
  { id: 'intel-s4610-960gb', category: 'peripherals', brand: 'Intel', model: 'DC S4610 960GB SSD', aliases: ['s4610', 'intel dc ssd', 's4610 960'], spec: 'Intel DC S4610 960GB SATA SSD — 2.5in, datacenter TLC, up to 560 MB/s. State quantity, DWPD/tier and condition.' },
  { id: 'seagate-exos-16tb', category: 'peripherals', brand: 'Seagate', model: 'Exos 16TB HDD', aliases: ['exos 16tb', 'seagate exos', '16tb hdd'], spec: 'Seagate Exos X16/X18 16TB enterprise HDD — 3.5in, SATA/SAS 7200rpm. State interface, quantity, power-on hours and condition.' },
  { id: 'nvidia-tesla-t4', category: 'peripherals', brand: 'NVIDIA', model: 'Tesla T4', aliases: ['tesla t4', 't4 gpu', 'nvidia t4'], spec: 'NVIDIA Tesla T4 GPU — 16GB GDDR6, PCIe Gen3 x16, 70W, inference/VDI. State quantity, bracket included and condition.' },
  { id: 'nvidia-rtx-a4000', category: 'peripherals', brand: 'NVIDIA', model: 'RTX A4000', aliases: ['rtx a4000', 'a4000', 'nvidia a4000'], spec: 'NVIDIA RTX A4000 workstation GPU — 16GB GDDR6, PCIe Gen4 x16, single-slot. State quantity and condition.' },
  { id: 'mellanox-connectx-6-25g', category: 'peripherals', brand: 'NVIDIA', model: 'ConnectX-6 25GbE NIC', aliases: ['connectx-6', 'cx6', 'mellanox 25g', '25g nic'], spec: 'NVIDIA/Mellanox ConnectX-6 25GbE dual-port NIC — PCIe Gen3 x8, RoCEv2. State port speed, bracket, quantity and condition.' },
  { id: 'dell-u2422h-monitor', category: 'peripherals', brand: 'Dell', model: 'UltraSharp U2422H', aliases: ['u2422h', 'dell monitor', 'ultrasharp 24'], spec: 'Dell UltraSharp U2422H 23.8in IPS monitor — 1080p, USB-C hub, height-adjustable stand. State stand included, pixels/dead pixels and condition.' },

  // ── Telecom Equipment ──
  { id: 'cisco-ip-phone-8841', category: 'telecom', brand: 'Cisco', model: 'IP Phone 8841', aliases: ['8841', 'cisco ip phone', 'cisco phone 8841'], spec: 'Cisco Unified IP Phone 8841 — 5-line color display, Gigabit, PoE 802.3af. State quantity, firmware and condition.' },
  { id: 'poly-vvx-410', category: 'telecom', brand: 'Poly', model: 'VVX 410', aliases: ['vvx 410', 'polycom vvx', 'poly vvx'], spec: 'Poly (Polycom) VVX 410 business media phone — 12-line, PoE, Gigabit. State quantity, stand, PSU and condition.' },
  { id: 'yealink-sip-t54w', category: 'telecom', brand: 'Yealink', model: 'SIP-T54W', aliases: ['t54w', 'yealink t54w', 'sip-t54w'], spec: 'Yealink SIP-T54W business IP phone — 4.3in touch screen, Bluetooth, PoE. State quantity, PSU and condition.' },
  { id: 'grandstream-gxp2170', category: 'telecom', brand: 'Grandstream', model: 'GXP2170', aliases: ['gxp2170', 'grandstream'], spec: 'Grandstream GXP2170 enterprise IP phone — 12 lines, PoE, 4.3in color display. State quantity, PSU and condition.' },

  // ── Mixed Pallet (Various) ──
  { id: 'mixed-office-it-lot', category: 'mixed', brand: 'Various', model: 'Mixed office IT lot', aliases: ['mixed lot', 'office it lot', 'assorted it', 'mixed pallet'], spec: 'Mixed office IT lot — assorted desktops/laptops/peripherals in one lot. Provide a rough item breakdown, counts, approximate ages and condition.' },
  { id: 'mixed-server-lot', category: 'mixed', brand: 'Various', model: 'Mixed server lot', aliases: ['server lot', 'mixed servers', 'server pallet'], spec: 'Mixed server lot — assorted rack/tower servers in one lot. Provide make/model breakdown, counts and condition.' },
  { id: 'mixed-network-lot', category: 'mixed', brand: 'Various', model: 'Mixed network lot', aliases: ['network lot', 'mixed switches', 'switch pallet'], spec: 'Mixed network gear lot — assorted switches/routers/APs in one lot. Provide make/model breakdown, counts and condition.' }
];

// Dedupe seed by id (guards against copy-paste duplicates above).
function dedupeById(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export const SEED_UNIQUE = dedupeById(SEED_CATALOG);

/** Fold: lowercase, strip diacritics/punctuation, collapse whitespace. */
export function foldText(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Compact form (no spaces) — catches "dl380g10" vs "dl380 g10". */
export function compact(s) {
  return foldText(s).replace(/\s+/g, '');
}

/** Bounded Levenshtein (returns max+1 as a cheap early-exit guard). */
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[b.length];
}

/** All searchable strings for an entry: display name, aliases, id. */
function haystacksOf(entry) {
  const display = `${entry.brand || ''} ${entry.model || ''}`.trim();
  return [display, entry.model || '', entry.id || '', ...(entry.aliases || [])]
    .map(foldText)
    .filter(Boolean);
}

/**
 * Tier 1 — deterministic match. Scores an entry against a raw query.
 * Returns 0 (no match) or a positive score; higher = better.
 *
 * Score ladder:
 *   100  exact compact match (query == haystack, spaces ignored)
 *    92  compact prefix (query is a prefix of the haystack)
 *    70+ all query tokens prefix-match some haystack token (+ coverage bonus)
 *    45  majority (>=60%) of tokens match, multi-token queries only
 * Typo tolerance: tokens >= 4 chars allow edit distance 1 in place of prefix.
 */
export function scoreEntry(entry, queryFolded, queryTokens, queryCompact) {
  if (!queryFolded) return 0;
  const haystacks = haystacksOf(entry);
  let best = 0;

  for (const hay of haystacks) {
    const hayCompact = hay.replace(/\s+/g, '');
    if (queryCompact === hayCompact) { best = Math.max(best, 100); continue; }
    if (hayCompact.startsWith(queryCompact)) { best = Math.max(best, 92); }

    const hayTokens = hay.split(' ').filter(Boolean);
    let matched = 0;
    let fuzzyOk = 0;
    for (const qt of queryTokens) {
      let hit = false;
      for (const ht of hayTokens) {
        if (ht.startsWith(qt)) { hit = true; break; }
        if (qt.length >= 4 && editDistance(qt, ht, 1) <= 1) { hit = true; fuzzyOk++; break; }
      }
      if (hit) matched++;
    }
    if (queryTokens.length > 0 && matched === queryTokens.length) {
      best = Math.max(best, 70 + Math.min(10, fuzzyOk * 2) + Math.min(10, queryTokens.length * 2));
    } else if (queryTokens.length >= 2 && matched / queryTokens.length >= 0.6) {
      best = Math.max(best, 45 + Math.round((matched / queryTokens.length) * 10));
    }
  }
  return best;
}

export const MIN_SCORE = 50;

/**
 * Match a raw query against catalog entries.
 * Returns ranked matches (best first), capped at `limit`, score >= MIN_SCORE.
 */
export function matchCatalog(entries, rawQuery, limit = 8) {
  const queryFolded = foldText(rawQuery);
  if (queryFolded.length < 2) return [];
  const queryTokens = queryFolded.split(' ').filter(Boolean);
  const queryCompact = queryFolded.replace(/\s+/g, '');

  const scored = [];
  for (const entry of entries) {
    const s = scoreEntry(entry, queryFolded, queryTokens, queryCompact);
    if (s >= MIN_SCORE) scored.push({ entry, score: s });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    (a.entry.model || '').length - (b.entry.model || '').length ||
    String(a.entry.id).localeCompare(String(b.entry.id))
  );
  return scored.slice(0, limit).map(({ entry, score }) => ({ ...entry, score }));
}

/** O(1) membership set of catalog ids — the LLM re-validation gate. */
export function catalogIdSet(entries) {
  return new Set(entries.map((e) => e.id));
}

/**
 * Tier 2 contract enforcement: parse + validate an LLM response against the
 * catalog. NEVER trusts the model:
 *  - must be JSON (code fences tolerated)
 *  - shape: { candidates: string[], unmatched: boolean }
 *  - every candidate id must exist in the catalog — else it is DROPPED
 *  (poisoned-model harness: a hallucinated id must not reach the client)
 *  - unparseable / all-dropped → { candidates: [], unmatched: true }
 */
export function validateLLMResponse(rawText, entries) {
  const drop = { candidates: [], unmatched: true, dropped: [] };
  if (typeof rawText !== 'string' || rawText.trim() === '') return drop;

  let parsed;
  try {
    let text = rawText.trim();
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) text = fence[1];
    // Tolerate leading prose by slicing the outermost braces.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return drop;
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return drop;
  }

  if (!parsed || typeof parsed !== 'object') return drop;
  const ids = Array.isArray(parsed.candidates) ? parsed.candidates : null;
  if (!ids) return drop;

  const valid = catalogIdSet(entries);
  const seen = new Set();
  const candidates = [];
  const dropped = [];
  for (const id of ids.slice(0, 12)) {
    if (typeof id !== 'string') continue;
    const clean = id.trim().toLowerCase();
    if (seen.has(clean)) continue;
    seen.add(clean);
    if (valid.has(clean)) candidates.push(clean);
    else dropped.push(clean);
  }
  if (candidates.length === 0) return { ...drop, dropped };
  return { candidates, unmatched: false, dropped };
}
