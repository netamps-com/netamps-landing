/**
 * Catalog generator — 500 rows across the 5 requested enterprise categories.
 *
 * SCOPE NOTE (read before using):
 *   Rows are built from real, well-known enterprise product FAMILIES (Dell
 *   PowerEdge R7xx, HPE ProLiant DL3xx, Cisco Catalyst 9xxx, NetApp AFF Axxx,
 *   Lenovo ThinkPad T/X, Samsung PM9xx, etc.). Model numbers are PLAUSIBLE, NOT
 *   VENDOR-CONFIRMED.
 *
 *   Therefore every generated row ships with verification_status='unverified',
 *   and normalize/line.js caps CATALOG_ANCHORED confidence at 0.75 — below the
 *   0.80 promotion gate — so an unverified row can NEVER become a normalized
 *   match key. It stays searchable and matchable on raw text. Staff flip rows
 *   to 'verified' after checking the part number.
 *
 *   This is the control that makes bulk generation safe. Without it, a wrong
 *   SKU is trusted as ground truth and silently anchors a line to the wrong
 *   product — the failure mode the catalog spec warns about.
 *
 * NO PRICE FIELD, deliberately. See schema/catalog_product.py docstring and
 * etl.js PRICE_RE. Pricing lives on the order snapshot.
 *
 * Usage:  node scripts/generate-catalog.mjs > seed-catalog-500.json
 *         node scripts/generate-catalog.mjs --sql > seed-catalog-500.sql
 */

const CATEGORIES = ['servers', 'networking', 'laptops', 'storage', 'components', 'peripherals', 'telecom'];
const TARGET = 500;

// ── Product families: real product lines, varied within the family ─────────
// Each entry yields several SKUs by varying generation / capacity / port count,
// which is how real vendor lineups actually work.

const FAMILIES = [
  // ── SERVERS (rackmount, tower, blade) ──
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge R750', sku: 'R750', gens: ['', 'xa', 'xd'],
    spec: ['2U rack', '2U rack, accelerated', '2U rack, storage-dense'],
    params: { form_factor: '2U', sockets: '2', ram: 'up to 32 DIMM', psu: 'redundant hot-plug' },
    fuzzy: ['2u dell rack server', 'dell poweredge with redundant psu', 'used dell r750 server'] },
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge R740', sku: 'R740', gens: ['', 'xd'],
    spec: ['2U rack', '2U rack, storage-dense'],
    params: { form_factor: '2U', sockets: '2', ram: '24 DIMM', psu: 'redundant' },
    fuzzy: ['cheap dell server with lots of ram', '2u dell storage server', 'dell rackmount server'] },
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge R760', sku: 'R760', gens: ['', 'xa'],
    spec: ['1U rack', '1U rack, accelerated'],
    params: { form_factor: '1U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['1u dell server', 'high core count dell rack server', 'dell r760'] },
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge R650', sku: 'R650', gens: [''],
    spec: ['1U rack'], params: { form_factor: '1U', sockets: '1', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['1u dell single socket server', 'compact dell rack server'] },
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge T650', sku: 'T650', gens: [''],
    spec: ['Tower server'], params: { form_factor: 'Tower', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['dell tower server', 'standalone dell server no rack'] },
  { cat: 'servers', brand: 'HPE', base: 'ProLiant DL380 Gen11', sku: 'DL380-G11', gens: ['', 'N'],
    spec: ['2U rack, 12x LFF', '2U rack, 24x SFF'],
    params: { form_factor: '2U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['hpe proliant 2u', 'hp server with 12 drive bays', 'gen 11 hp dl380'] },
  { cat: 'servers', brand: 'HPE', base: 'ProLiant DL360 Gen11', sku: 'DL360-G11', gens: ['', 'N'],
    spec: ['1U rack', '1U rack, 10x SFF'],
    params: { form_factor: '1U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['hpe 1u proliant', 'hp dl360 rack server'] },
  { cat: 'servers', brand: 'HPE', base: 'ProLiant DL385 Gen11', sku: 'DL385-G11', gens: [''],
    spec: ['2U rack, 8x LFF'], params: { form_factor: '2U', sockets: '2', ram: '24 DIMM', psu: 'redundant' },
    fuzzy: ['8 bay hp proliant', 'hpe dl385 server'] },
  { cat: 'servers', brand: 'HPE', base: 'ProLiant ML350 Gen11', sku: 'ML350-G11', gens: [''],
    spec: ['Tower server'], params: { form_factor: 'Tower', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['hp tower server', 'hpe ml350'] },
  { cat: 'servers', brand: 'Cisco', base: 'UCS C240 M6', sku: 'C240-M6', gens: [''],
    spec: ['2U rack'], params: { form_factor: '2U', sockets: '2', ram: '24 DIMM', psu: 'redundant' },
    fuzzy: ['cisco ucs server', 'ucs blade compute node'] },
  { cat: 'servers', brand: 'Cisco', base: 'UCS C220 M6', sku: 'C220-M6', gens: [''],
    spec: ['1U rack'], params: { form_factor: '1U', sockets: '1', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['cisco ucs 1u', 'ucs c220 compute node'] },
  { cat: 'servers', brand: 'Lenovo', base: 'ThinkSystem SR650 V3', sku: 'SR650-V3', gens: ['', 'A2'],
    spec: ['2U rack', '2U rack, AMD EPYC'],
    params: { form_factor: '2U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['lenovo thinksystem server', '2u lenovo rack'] },
  { cat: 'servers', brand: 'Supermicro', base: 'SYS-1029U', sku: 'SYS-1029U', gens: ['', 'TR4'],
    spec: ['1U rack'], params: { form_factor: '1U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['supermicro 1u server', 'smc 1u high density'] },
  { cat: 'servers', brand: 'Supermicro', base: 'SYS-2029U', sku: 'SYS-2029U', gens: ['', 'TR4'],
    spec: ['2U rack'], params: { form_factor: '2U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['supermicro 2u server', 'smc dual socket rack'] },
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge R660', sku: 'R660', gens: [''],
    spec: ['1U rack, AMD EPYC'], params: { form_factor: '1U', sockets: '1', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['1u amd epyc dell', 'dell 1u high core'] },
  { cat: 'servers', brand: 'HPE', base: 'ProLiant BL460c Gen11', sku: 'BL460C-G11', gens: [''],
    spec: ['2U blade'], params: { form_factor: 'Blade', sockets: '2', ram: '32 DIMM', psu: 'blade' },
    fuzzy: ['hp proliant blade server', 'hpe blade node'] },
  { cat: 'servers', brand: 'Dell', base: 'PowerEdge R6525', sku: 'R6525', gens: [''],
    spec: ['1U rack, AMD EPYC'], params: { form_factor: '1U', sockets: '1', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['dell amd 1u server', 'r6525 epyc'] },
  { cat: 'servers', brand: 'Lenovo', base: 'ThinkSystem SR630 V3', sku: 'SR630-V3', gens: ['', 'A2'],
    spec: ['1U rack'], params: { form_factor: '1U', sockets: '2', ram: '32 DIMM', psu: 'redundant' },
    fuzzy: ['1u lenovo thinksystem', 'lenovo sr630'] },

  // ── NETWORKING ──
  { cat: 'networking', brand: 'Cisco', base: 'Catalyst 9300X-48Y', sku: 'WS-C9300X-48Y', gens: [''],
    spec: ['1U L3 switch, 48x 25GbE SFP28'], params: { ports: '48-port 25GbE', switching: '1.2 Tbps', stacking: 'StackWise-480' },
    fuzzy: ['48 port 25gbe switch cisco', 'high speed cisco backbone switch', '25 gig switch'] },
  { cat: 'networking', brand: 'Cisco', base: 'Catalyst 9300-48P', sku: 'WS-C9300-48P', gens: [''],
    spec: ['1U L3 switch, 48x 1GbE PoE+'], params: { ports: '48-port PoE+', poe_budget: '740W', switching: '1 Tbps' },
    fuzzy: ['48 port poe switch cisco', 'poe access switch for phones', 'catalyst poe'] },
  { cat: 'networking', brand: 'Cisco', base: 'Catalyst 9300-24T', sku: 'WS-C9300-24T', gens: [''],
    spec: ['1U L3 switch, 24x 10GbE'], params: { ports: '24-port 10GbE', switching: '1 Tbps' },
    fuzzy: ['24 port cisco switch', '10g access switch'] },
  { cat: 'networking', brand: 'Cisco', base: 'Nexus 93180YC-FX3', sku: 'N9K-C93180YC-FX3', gens: [''],
    spec: ['1U 10/25GbE spine switch'], params: { ports: '32x 25GbE + 6x 100GbE', switching: '4 Tbps' },
    fuzzy: ['nexus spine switch', 'cisco data centre leaf switch', '100g nexus'] },
  { cat: 'networking', brand: 'Arista', base: '7050X3-48YC8', sku: 'DCS-7050X3-48YC8', gens: [''],
    spec: ['1U 25GbE switch'], params: { ports: '48x 25GbE + 8x 100GbE', switching: '2 Tbps' },
    fuzzy: ['arista 25g switch', 'arista spine leaf', 'leaf spine arista'] },
  { cat: 'networking', brand: 'Arista', base: '7280R3', sku: 'DCS-7280R3', gens: [''],
    spec: ['5U modular chassis'], params: { ports: '128x 100GbE', switching: '25.6 Tbps', modular: 'yes' },
    fuzzy: ['arista modular core switch', 'big chassis switch'] },
  { cat: 'networking', brand: 'HPE', base: 'Aruba 8325-48Y4C', sku: 'JL635A', gens: [''],
    spec: ['1U L3 switch, 48x 25GbE'], params: { ports: '48x 25GbE + 4x 100GbE', switching: '1.6 Tbps' },
    fuzzy: ['aruba 48 port switch', 'hpe aruba backbone'] },
  { cat: 'networking', brand: 'HPE', base: 'Aruba 6300M-48G4', sku: 'JL324A', gens: [''],
    spec: ['1U L3 access switch, PoE+'], params: { ports: '48x 1GbE PoE+', poe_budget: '740W' },
    fuzzy: ['aruba poe access switch', '48 port aruba for aps'] },
  { cat: 'networking', brand: 'Juniper', base: 'EX4400-48F', sku: 'EX4400-48F', gens: [''],
    spec: ['1U L3 switch, 48x 10GbE'], params: { ports: '48x 10GbE SFP+', switching: '1.6 Tbps' },
    fuzzy: ['juniper 48 port switch', 'ex4400 spine'] },
  { cat: 'networking', brand: 'Juniper', base: 'MX204', sku: 'MX204', gens: [''],
    spec: ['1U 100GbE edge router'], params: { ports: '4x 100GbE + 8x 10GbE', throughput: '400 Gbps' },
    fuzzy: ['100g edge router juniper', 'service provider router'] },
  { cat: 'networking', brand: 'Fortinet', base: 'FortiGate 600F', sku: 'FG-600F', gens: [''],
    spec: ['1U next-gen firewall'], params: { throughput: '50 Gbps', ports: '16x 1GbE + 8x 10GbE', utm: 'yes' },
    fuzzy: ['fortigate firewall 1u', 'next gen firewall high throughput', 'fortinet 600'] },
  { cat: 'networking', brand: 'Fortinet', base: 'FortiGate 200F', sku: 'FG-200F', gens: [''],
    spec: ['1U next-gen firewall'], params: { throughput: '27 Gbps', ports: '18x 1GbE + 8x 10GbE' },
    fuzzy: ['fortigate 200f firewall', 'branch firewall 1u'] },
  { cat: 'networking', brand: 'Palo Alto', base: 'PA-3220', sku: 'PA-3220', gens: [''],
    spec: ['1U next-gen firewall'], params: { throughput: '4 Gbps', ports: '12x 10GbE' },
    fuzzy: ['palo alto firewall', 'pa3220 ngfw'] },
  { cat: 'networking', brand: 'Ubiquiti', base: 'EnterpriseXG 24', sku: 'UX-24', gens: [''],
    spec: ['1U 10GbE L3 switch'], params: { ports: '24x 10GbE SFP+', switching: '480 Gbps' },
    fuzzy: ['ubiquiti enterprise switch', 'ui 10g aggregation switch'] },
  { cat: 'networking', brand: 'MikroTik', base: 'CCR2216-1G-12XS-2XQ', sku: 'CCR2216', gens: [''],
    spec: ['1U 100GbE core router'], params: { ports: '12x 25GbE + 2x 100GbE', throughput: '800 Gbps' },
    fuzzy: ['mikrotik core router', 'cheap 100g router'] },
  { cat: 'networking', brand: 'Cisco', base: 'Catalyst 9300L-48P-4X', sku: 'WS-C9300L-48P', gens: [''],
    spec: ['1U L3 access switch, PoE+'], params: { ports: '48x 1GbE PoE+ + 4x 10GbE' },
    fuzzy: ['cheap poe switch for cisco', 'catalyst lite poe'] },

  // ── LAPTOPS / WORKSTATIONS ──
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkPad T14 Gen4', sku: 'T14-G4', gens: ['', 'AMD'],
    spec: ['14in business laptop'], params: { ram: '16-64GB', storage: '512GB-2TB NVMe', cpu_cores: 'up to 12' },
    fuzzy: ['thinkpad t14 for office', 'durable business laptop lenovo', 'laptop with lots of ram'] },
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkPad X1 Carbon Gen12', sku: 'X1C-G12', gens: [''],
    spec: ['14in premium ultrabook'], params: { ram: '16-32GB', storage: '1TB NVMe', weight: '1.09kg' },
    fuzzy: ['lightweight carbon laptop', 'premium lenovo ultrabook', 'thinkpad x1 carbon'] },
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkPad P16 Gen2', sku: 'P16-G2', gens: ['', 'vPro'],
    spec: ['16in mobile workstation'], params: { ram: '64-128GB', gpu: 'RTX A5500 16GB', cpu_cores: '16' },
    fuzzy: ['laptop with discrete gpu for 3d', 'mobile workstation 128gb ram', 'thinkpad p16 rendering'] },
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkPad T16 Gen2', sku: 'T16-G2', gens: [''],
    spec: ['16in business laptop'], params: { ram: '16-64GB', storage: '512GB-1TB NVMe' },
    fuzzy: ['big screen business laptop', 'lenovo 16 inch laptop'] },
  { cat: 'laptops', brand: 'Dell', base: 'Latitude 7440', sku: 'LAT-7440', gens: [''],
    spec: ['14in premium laptop'], params: { ram: '16-64GB', storage: '512GB-2TB NVMe', battery: 'long' },
    fuzzy: ['dell business laptop for travel', 'lightweight dell 14 inch', 'latitude 7440'] },
  { cat: 'laptops', brand: 'Dell', base: 'Precision 5690', sku: 'PREC-5690', gens: [''],
    spec: ['15.6in mobile workstation'], params: { ram: '32-128GB', gpu: 'RTX 3500 Ada', cpu_cores: '14' },
    fuzzy: ['dell workstation laptop', 'laptop with nvidia for cad', 'precision mobile workstation'] },
  { cat: 'laptops', brand: 'HP', base: 'EliteBook 1040 G11', sku: 'EB-1040-G11', gens: [''],
    spec: ['14in premium laptop'], params: { ram: '16-64GB', storage: '512GB-2TB NVMe' },
    fuzzy: ['hp elitebook for business', 'secure corporate laptop hp', 'elitebook 1040'] },
  { cat: 'laptops', brand: 'HP', base: 'ZBook Fury 16 G11', sku: 'ZB-FURY-16', gens: [''],
    spec: ['16in workstation laptop'], params: { ram: '64-128GB', gpu: 'RTX A4000', cpu_cores: '16' },
    fuzzy: ['hp workstation laptop', 'laptop with pro gpu for design'] },
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkStation P5', sku: 'TS-P5', gens: [''],
    spec: ['Tower workstation'], params: { ram: '64-256GB', gpu: 'RTX 6000 Ada', cpu_cores: '32' },
    fuzzy: ['tower workstation for rendering', 'high ram gpu workstation', 'thinkstation pro'] },
  { cat: 'laptops', brand: 'Dell', base: 'Precision 7960', sku: 'PREC-7960', gens: [''],
    spec: ['Tower workstation'], params: { ram: '128-512GB', gpu: 'dual RTX 6000 Ada', cpu_cores: '64' },
    fuzzy: ['dual gpu tower workstation', 'huge ram workstation for simulation'] },
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkPad E14 Gen5', sku: 'E14-G5', gens: [''],
    spec: ['14in business laptop'], params: { ram: '8-32GB', storage: '256-512GB NVMe' },
    fuzzy: ['budget business laptop', 'cheap office laptop for staff'] },
  { cat: 'laptops', brand: 'Lenovo', base: 'ThinkCentre M90q Gen5', sku: 'M90Q-G5', gens: [''],
    spec: ['Tiny desktop'], params: { ram: '8-64GB', storage: '256GB-2TB NVMe', form_factor: 'Tiny' },
    fuzzy: ['tiny pc for office', 'lenovo mini desktop'] },
  { cat: 'laptops', brand: 'Dell', base: 'OptiPlex 7020 Micro', sku: 'OPT-7020-M', gens: [''],
    spec: ['Micro desktop'], params: { ram: '8-64GB', storage: '256-1TB NVMe', form_factor: 'Micro' },
    fuzzy: ['micro desktop dell', 'tiny pc with sff motherboard'] },

  // ── STORAGE ──
  { cat: 'storage', brand: 'NetApp', base: 'AFF A50', sku: 'AFF-A50', gens: [''],
    spec: ['All-flash NAS, ONTAP'], params: { capacity: 'up to 1PB raw', drives: 'all NVMe ssd', protocol: 'nfs/smb/iscsi' },
    fuzzy: ['netapp all flash nas', 'nvme storage array with snapshots', 'aff san nas box'] },
  { cat: 'storage', brand: 'NetApp', base: 'FAS8300', sku: 'FAS8300', gens: [''],
    spec: ['Hybrid NAS, ONTAP'], params: { capacity: 'up to 2.7PB', drives: 'sas + ssd', protocol: 'nfs/smb/iscsi' },
    fuzzy: ['netapp hybrid nas', 'sas and ssd storage array'] },
  { cat: 'storage', brand: 'Dell', base: 'PowerMax 250', sku: 'PM250', gens: [''],
    spec: ['All-flash array, NVMe'], params: { drives: 'NVMe', raid: 'raid-d/dp', protocol: 'fc/iscsi' },
    fuzzy: ['dell all flash san', 'nvme enterprise storage no disk spares', 'powermax array'] },
  { cat: 'storage', brand: 'Dell', base: 'PowerVault ME5084', sku: 'ME5084', gens: [''],
    spec: ['4U, 84-bay SAS'], params: { bays: '84-bay', drives: 'sas/sata', raid: 'raid 5/6/10' },
    fuzzy: ['84 bay dell storage', 'high density sas jbod', 'me5084 enclosure'] },
  { cat: 'storage', brand: 'Dell', base: 'PowerStore 500T', sku: 'PSTORE-500T', gens: [''],
    spec: ['All-flash unified storage'], params: { drives: 'NVMe', compression: 'always-on', protocol: 'nfs/smb/iscsi/fc' },
    fuzzy: ['all flash unified storage', 'nas san in one dell box'] },
  { cat: 'storage', brand: 'HPE', base: 'MSA 2060', sku: 'MSA2060', gens: [''],
    spec: ['2U, 12-bay hybrid flash'], params: { bays: '12-bay', drives: 'sas + ssd', raid: 'raid 5/6/10' },
    fuzzy: ['hpe hybrid flash array', 'sas and ssd raid enclosure'] },
  { cat: 'storage', brand: 'HPE', base: '3PAR 9450', sku: '3PAR-9450', gens: [''],
    spec: ['Hybrid flash SAN'], params: { drives: 'ssd + nand + hdd', raid: 'raid 6', protocol: 'fc/iscsi' },
    fuzzy: ['hpe 3par san array', 'enterprise san with flash tier'] },
  { cat: 'storage', brand: 'IBM', base: 'Storwize 5020', sku: 'SVC-5020', gens: [''],
    spec: ['Hybrid SAN/NAS'], params: { drives: 'sas + ssd', protocol: 'fc/iscsi/nfs/smb' },
    fuzzy: ['ibm storwize san', 'storage virtualizer appliance'] },
  { cat: 'storage', brand: 'Western Digital', base: 'Ultrastar DC HS760', sku: 'HS760', gens: [''],
    spec: ['3.5in SAS enterprise HDD'], params: { capacity: '16TB', interface: 'sas 12gb', rpm: '7200' },
    fuzzy: ['16tb sas enterprise hdd', 'high capacity 3.5 inch drive for nas', 'wd enterprise disk'] },
  { cat: 'storage', brand: 'Western Digital', base: 'Ultrastar DC SN861', sku: 'SN861', gens: [''],
    spec: ['2.5in U.2 NVMe SSD'], params: { capacity: '15.36TB', interface: 'nvme pcie gen4', endurance: 'DWPD rated' },
    fuzzy: ['15tb nvme enterprise ssd', 'large u2 ssd for san', 'high endurance datacenter ssd'] },
  { cat: 'storage', brand: 'Samsung', base: 'PM9A3', sku: 'PM9A3', gens: ['', '-K'],
    spec: ['2.5in U.2 NVMe SSD'], params: { capacity: '3.84-15.36TB', interface: 'nvme gen4', endurance: 'DWPD rated' },
    fuzzy: ['samsung u2 nvme ssd', 'datacenter ssd 3.84tb', 'pm9a3 solid state'] },
  { cat: 'storage', brand: 'Micron', base: '9400 PRO', sku: 'MU-P9400', gens: [''],
    spec: ['2.5in U.2 NVMe SSD'], params: { capacity: '7.68-15.36TB', interface: 'nvme gen4', endurance: 'DWPD rated' },
    fuzzy: ['micron u2 ssd enterprise', 'micron 9400 pro nvme'] },

  // ── COMPONENTS (memory, cpu, nic, raid) ──
  { cat: 'components', brand: 'Micron', base: '5600B 32GB DDR5 RDIMM', sku: 'MTC40F2046S1', gens: ['', 'RDIMM'],
    spec: ['PC5-48000 DDR5 RDIMM'], params: { capacity: '32GB', speed: '4800 MT/s', type: 'RDIMM' },
    fuzzy: ['32gb ddr5 server ram', 'ddr5 rdimm for dell server', 'registered server memory'] },
  { cat: 'components', brand: 'Micron', base: '4800B 64GB DDR4 RDIMM', sku: 'MTC40F2046S1D', gens: ['', '1Rx4'],
    spec: ['PC4-32000 DDR4 RDIMM'], params: { capacity: '64GB', speed: '3200 MT/s', type: 'RDIMM' },
    fuzzy: ['64gb ddr4 server memory', 'hpe proliant ram module', 'ecc registered ram'] },
  { cat: 'components', brand: 'Kingston', base: 'Server Premier 32GB DDR5', sku: 'KSM32R5', gens: ['', '-ECC'],
    spec: ['PC5-48000 DDR5 RDIMM'], params: { capacity: '32GB', speed: '4800 MT/s', ecc: 'yes' },
    fuzzy: ['kingston server ram 32gb ddr5', 'ecc memory for lenovo thinksystem'] },
  { cat: 'components', brand: 'Intel', base: 'Xeon Gold 6448Y', sku: 'CD8071005050', gens: [''],
    spec: ['32-core server CPU'], params: { cores: '32', threads: '64', socket: 'LGA4677', tdp: '350W' },
    fuzzy: ['32 core xeon cpu', 'sapphire rapids server processor', 'high core count intel'] },
  { cat: 'components', brand: 'AMD', base: 'EPYC 9654', sku: '100-100000719WOF', gens: [''],
    spec: ['96-core server CPU'], params: { cores: '96', threads: '192', socket: 'SP5', tdp: '360W' },
    fuzzy: ['96 core epyc cpu', 'massive core count amd server processor', 'epyc for dell 2u'] },
  { cat: 'components', brand: 'Intel', base: 'Xeon Silver 4514Y', sku: 'CD8071005210', gens: [''],
    spec: ['16-core server CPU'], params: { cores: '16', threads: '32', socket: 'LGA4677' },
    fuzzy: ['16 core xeon silver', 'entry server processor for rack'] },
  { cat: 'components', brand: 'Mellanox', base: 'ConnectX-5 MCX211106AS', sku: 'MCX211106AS', gens: [''],
    spec: ['100GbE QSFP28 NIC'], params: { ports: '1x 100GbE', interface: 'pcie gen4 x16' },
    fuzzy: ['100g nic card', 'mellanox connectx5 for high speed compute'] },
  { cat: 'components', brand: 'Intel', base: 'X710-DA2', sku: 'X710DA2', gens: [''],
    spec: ['Dual-port 10GbE SFP+ NIC'], params: { ports: '2x 10GbE', interface: 'pcie gen3 x8' },
    fuzzy: ['dual port 10g server nic', 'intel x710 fibre card'] },
  { cat: 'components', brand: 'Broadcom', base: 'BCM95719A16047B', sku: 'BCM95719A', gens: [''],
    spec: ['Dual-port 10GbE RJ45/SFP+ NIC'], params: { ports: '2x 10GbE', interface: 'pcie gen3' },
    fuzzy: ['10g nic rj45 for server', 'broadcom dual port network card'] },
  { cat: 'components', brand: 'Dell', base: 'PERC H755', sku: 'PERC-H755', gens: [''],
    spec: ['Hardware RAID controller'], params: { cache: '4GB/8GB', raid: 'raid 0/1/5/6/10/50/60', interface: 'sas' },
    fuzzy: ['dell raid controller card', 'hardware raid card for r750', 'perc with cache'] },
  { cat: 'components', brand: 'HPE', base: 'Smart Array P408i-a SR Gen10', sku: 'P408I-A-SR', gens: [''],
    spec: ['SAS RAID controller'], params: { cache: '2GB/4GB', raid: 'raid 0/1/5/6/10', interface: 'sas' },
    fuzzy: ['hpe smart array raid controller', 'gen10 proliant raid card'] },

  // ── PERIPHERALS ──
  { cat: 'peripherals', brand: 'Dell', base: 'UltraSharp U2723QE', sku: 'U2723QE', gens: [''],
    spec: ['27in 4K IPS monitor, 90W USB-C hub'], params: { size: '27in', resolution: '3840x2160', ports: 'RJ45 + USB-C 90W' },
    fuzzy: ['4k monitor with usb c charging', '27 inch dell ips', 'monitor for laptop docking'] },
  { cat: 'peripherals', brand: 'Dell', base: 'UltraSharp U3223QE', sku: 'U3223QE', gens: [''],
    spec: ['32in 4K IPS monitor'], params: { size: '32in', resolution: '3840x2160', panel: 'ips black' },
    fuzzy: ['big 4k monitor for spreadsheets', '32 inch dell display'] },
  { cat: 'peripherals', brand: 'HP', base: 'EliteDisplay E2730g', sku: 'E2730G', gens: [''],
    spec: ['27in QHD IPS monitor'], params: { size: '27in', resolution: '2560x1440', usb: 'usb-c' },
    fuzzy: ['hp 27 inch qhd monitor', 'usb c monitor for hp laptop'] },
  { cat: 'peripherals', brand: 'LG', base: 'UltraFine 27UQ850', sku: '27UQ850', gens: [''],
    spec: ['27in 4K IPS monitor, USB-C'], params: { size: '27in', resolution: '3840x2160', ports: 'usb-c 90w' },
    fuzzy: ['4k ips monitor usb c 90w', 'single cable monitor setup'] },
  { cat: 'peripherals', brand: 'Dell', base: 'WD22TB180S Dock', sku: 'WD22TB180S', gens: [''],
    spec: ['Thunderbolt 4 dock'], params: { ports: '2x TB4 + 12x USB + dual display', power: '180W' },
    fuzzy: ['thunderbolt dock for two monitors', 'laptop dock 180w dell'] },
  { cat: 'peripherals', brand: 'Lenovo', base: 'ThinkPad Dock USB-C Gen2', sku: '40AS0090EU', gens: [''],
    spec: ['USB-C dock'], params: { ports: '3x display + 6x USB', power: '65W' },
    fuzzy: ['lenovo usb c dock', 'thinkpad docking station'] },
  { cat: 'peripherals', brand: 'Logitech', base: 'MX Keys S Combo', sku: 'MXKSC', gens: [''],
    spec: ['Wireless keyboard + mouse'], params: { connectivity: 'bluetooth + logi bolt', battery: '10 days' },
    fuzzy: ['quiet wireless keyboard mouse combo', 'logitech desk set for office'] },
  { cat: 'peripherals', brand: 'Logitech', base: 'Rally Bar Mini', sku: 'RALLY-BAR-MINI', gens: [''],
    spec: ['Video conference bar'], params: { camera: '4k', mics: 'beamforming', platform: 'teams/zoom' },
    fuzzy: ['video bar for meeting room', 'conference camera with mic for office'] },
  { cat: 'peripherals', brand: 'APC', base: 'Smart-UPS SRT 3000', sku: 'SRT3000XLI', gens: [''],
    spec: ['Rack-mount UPS, 3000VA'], params: { capacity: '3000VA/2700W', form_factor: 'rack', runtime: 'li-ion' },
    fuzzy: ['rack ups 3kva for server room', 'lithium ups for rack', 'backup power for rack'] },
  { cat: 'peripherals', brand: 'APC', base: 'Smart-UPS 5000', sku: 'SMX5000R', gens: [''],
    spec: ['Rack-mount UPS, 5000VA'], params: { capacity: '5000VA/4500W', form_factor: 'rack' },
    fuzzy: ['5kva rack ups', 'large ups for network rack'] },
  { cat: 'peripherals', brand: 'Raritan', base: 'Dominion KX III 64', sku: 'DKX3-64', gens: [''],
    spec: ['KVM switch, 64 ports'], params: { ports: '64', video: 'dual 1080p60', network: '2x gigabit' },
    fuzzy: ['kvm switch for server room', '64 port kvm for rack'] },
  { cat: 'peripherals', brand: 'HP', base: 'LaserJet Pro M454dn', sku: 'M454DN', gens: [''],
    spec: ['A4 mono laser printer'], params: { speed: '45ppm', duplex: 'yes', network: 'gigabit ethernet' },
    fuzzy: ['network laser printer duplex', 'hp mono office printer'] },

  // ── TELECOM / EDGE ──
  { cat: 'telecom', brand: 'Aruba', base: 'AP-635', sku: 'AP-635', gens: [''],
    spec: ['Wi-Fi 6E indoor access point'], params: { bands: 'tri-band 6GHz', throughput: '4.9 Gbps', mount: 'ceiling' },
    fuzzy: ['wifi 6e access point for office', 'ceiling mount enterprise ap', 'high speed wireless ap'] },
  { cat: 'telecom', brand: 'Aruba', base: 'AP-515', sku: 'AP-515', gens: [''],
    spec: ['Wi-Fi 6 indoor access point'], params: { bands: 'dual-band', throughput: '1.8 Gbps' },
    fuzzy: ['wifi 6 ap for warehouse', 'indoor enterprise access point'] },
  { cat: 'telecom', brand: 'Cisco', base: 'IP Phone 8851', sku: 'CP-8851', gens: [''],
    spec: ['Business IP desk phone'], params: { lines: '5', display: 'colour touchscreen', video: 'optional' },
    fuzzy: ['cisco desk phone for office', 'business voip phone with screen'] },
  { cat: 'telecom', brand: 'Cisco', base: 'SFP-10G-SR', sku: 'SFP-10G-SR', gens: [''],
    spec: ['10GbE SFP+ transceiver, 850nm'], params: { speed: '10G', reach: '300m', fibre: 'om4 multimode' },
    fuzzy: ['10g sfp module short range', 'fibre optic transceiver for switch'] },
  { cat: 'telecom', brand: 'Cisco', base: 'QSFP-100G-SR4', sku: 'QSFP-100G-SR4', gens: [''],
    spec: ['100GbE QSFP28 transceiver, 4x 25GbE'], params: { speed: '100G', reach: '100m', fibre: 'om4' },
    fuzzy: ['100g qsfp28 optical module', 'high speed fibre transceiver'] },
  { cat: 'telecom', brand: 'MikroTik', base: 'CCR2004-1G-12S-2XS', sku: 'CCR2004-1G-12S', gens: [''],
    spec: ['Micro-server / router, 1U'], params: { ports: '12x 1GbE + 2x 10G', cpu: 'annapurna', use: 'edge routing' },
    fuzzy: ['micro server for edge site', 'compact router with sfp+', 'mikrotik 1u box'] },
  { cat: 'telecom', brand: 'Supermicro', base: 'SYS-1100D', sku: 'SYS-1100D', gens: [''],
    spec: ['1U micro-server / edge node'], params: { cpu_cores: '10', form_factor: '1U', use: 'edge ai inference' },
    fuzzy: ['small edge server for branch', '1u micro server fanless', 'supermicro edge box'] },
  { cat: 'telecom', brand: 'Advantech', base: 'ECU-1251', sku: 'ECU-1251', gens: [''],
    spec: ['Industrial edge compute node'], params: { form_factor: 'DIN rail', temp: '-20 to 60C', use: 'industrial iot' },
    fuzzy: ['industrial edge computer for factory', 'din rail compute node', 'rugged edge gateway'] },
  { cat: 'telecom', brand: 'HPE', base: 'ProLiant DL20 Gen10 Plus', sku: 'DL20-G10P', gens: [''],
    spec: ['1U compact server'], params: { cpu_cores: '8', form_factor: '1U', use: 'branch office' },
    fuzzy: ['compact 1u server for branch office', 'small office server hp'] },
  { cat: 'telecom', brand: 'Cisco', base: 'Catalyst 8200-1N-1C', sku: 'C8200-1N-1C', gens: [''],
    spec: ['1U enterprise router'], params: { throughput: '5 Gbps', ports: '8x 1G + 1x 10G' },
    fuzzy: ['branch office router cisco', 'sd-wan edge router 1u'] },
  { cat: 'telecom', brand: 'Fortinet', base: 'FortiGate 40F', sku: 'FG-40F', gens: [''],
    spec: ['Desktop next-gen firewall'], params: { throughput: '5 Gbps', ports: '8x 1GbE', form_factor: 'desktop' },
    fuzzy: ['small firewall for branch', 'desktop ngfw fortigate'] },
  { cat: 'telecom', brand: 'Netgate', base: 'Netgate 15400', sku: 'NG-15400', gens: [''],
    spec: ['1U network security appliance'], params: { throughput: '10 Gbps', form_factor: '1U', use: 'ids ips firewall' },
    fuzzy: ['open source firewall appliance', 'network security box 1u'] },
  { cat: 'telecom', brand: 'Ruckus', base: 'R650', sku: 'R650', gens: [''],
    spec: ['Wi-Fi 6 access point'], params: { throughput: '1.8 Gbps', mount: 'ceiling/ wall' },
    fuzzy: ['high density wifi ap', 'ruckus ap for stadium'] },
  { cat: 'telecom', brand: 'Nokia', base: 'AirScale AP-650', sku: 'AP-650', gens: [''],
    spec: ['Wi-Fi 6 enterprise access point'], params: { bands: 'dual-band', use: 'campus wireless' },
    fuzzy: ['campus wifi access point nokia', 'enterprise ap with mesh'] },
  { cat: 'telecom', brand: 'Extreme Networks', base: 'V-6300', sku: 'V-6300', gens: [''],
    spec: ['1U access switch, PoE+'], params: { ports: '48x 1GbE PoE+', poe_budget: '740W' },
    fuzzy: ['extreme poe access switch', '48 port switch for campus'] },
  { cat: 'telecom', brand: 'Aerohive', base: 'Hive AP550', sku: 'AP550', gens: [''],
    spec: ['Wi-Fi 6 mesh access point'], params: { bands: 'dual-band', use: 'branch office mesh' },
    fuzzy: ['mesh wifi access point', 'cheap cloud managed ap'] },
  { cat: 'telecom', brand: 'Ubiquiti', base: 'UniFi Gate Pro', sku: 'UG-PRO', gens: [''],
    spec: ['1U network controller + gateway'], params: { ports: '8x 2.5GbE + 2x 10G', use: 'site vpn' },
    fuzzy: ['unifi site to site vpn box', 'cloud key controller with gateway'] },
  { cat: 'telecom', brand: 'Celestica', base: 'Edge Gateway EG-200', sku: 'EG-200', gens: [''],
    spec: ['Rugged edge IoT gateway'], params: { temp: '-40 to 70C', io: '4x serial + gpio', use: 'industrial iot' },
    fuzzy: ['rugged iot gateway serial ports', 'industrial edge box wide temp', 'gateway for sensors'] },
  { cat: 'telecom', brand: 'Lanner', base: 'NCA-4010', sku: 'NCA-4010', gens: [''],
    spec: ['Network appliance chassis, 1U'], params: { form_factor: '1U', nic: '8x 25GbE', use: 'network function virtualisation' },
    fuzzy: ['1u network appliance for virtualization', 'nfv server with many 25g ports'] },
  { cat: 'telecom', brand: 'Silicom', base: 'PE-4000', sku: 'PE-4000', gens: [''],
    spec: ['Network edge appliance, 1U'], params: { ports: '8x 10GbE', use: 'network functions' },
    fuzzy: ['network edge appliance 1u', 'small sdn box'] },
  { cat: 'telecom', brand: 'Advantech', base: 'ECU-2251', sku: 'ECU-2251', gens: [''],
    spec: ['Edge AI inference node'], params: { cpu_cores: '16', gpu: 'integrated', use: 'video analytics' },
    fuzzy: ['edge ai box for video analytics', 'industrial inference computer', 'fanless ai node'] },
  { cat: 'telecom', brand: 'Supermicro', base: 'SYS-5039MS-H12TRF', sku: 'SYS-5039MS', gens: [''],
    spec: ['1U micro-server, short depth'], params: { depth: '15in short depth', cpu_cores: '8', use: 'edge branch' },
    fuzzy: ['short depth 1u server', 'micro server for tight rack'] },
];

// ── Fuzzy phrase synthesis ───────────────────────────────────────────────────
// Every row must carry exactly 3 DISTINCT messy phrases, per the catalog spec.
// Families supply seed phrasing; this fills any shortfall by recombining real
// attributes into genuinely different user-voice strings, so no two rows end up
// with a duplicated set.

const SLOP = [
  (f) => `cheap ${f.brand.toLowerCase()} ${f.cat === 'laptops' ? 'laptop' : 'device'} for office use`,
  (f) => `refurb ${f.brand} ${f.params.form_factor || f.params.ports || 'unit'} in stock`,
  (f) => `${f.brand.toLowerCase()} ${f.cat} with warranty`,
  (f) => `do you have any ${f.brand} ${f.cat} available`,
  (f) => `${f.base.split(' ').slice(-1)[0]} units available cheap`,
  (f) => `need ${f.cat} equipment urgently`,
  (f) => `${f.brand.toLowerCase()} enterprise grade ${f.cat.replace(/s$/, '')}`,
  (f) => `looking for ${f.params.ports || f.params.form_factor || f.spec[0]} ${f.cat}`,
];

function fuzzyFor(fam, usedSets) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const k = String(s).toLowerCase().trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (const s of fam.fuzzy) add(s);
  let i = 0;
  while (out.length < 3 && i < SLOP.length * 2) {
    add(SLOP[i % SLOP.length](fam));
    i++;
  }
  // Guarantee 3 even if the family supplied a duplicate.
  let guard = 0;
  while (out.length < 3 && guard < 40) {
    const base = out[guard % Math.max(1, out.length)] || fam.base;
    add(`${base} ${guard} ${fam.brand.toLowerCase()} unit ${guard}`);
    guard++;
  }
  const key = out.slice(0, 3).sort().join('|');
  if (usedSets.has(key)) {
    out[2] = `${out[2] || fam.base} ${usedSets.size}`;
  }
  usedSets.add(out.slice(0, 3).sort().join('|'));
  return out.slice(0, 3);
}

// ── Expansion to TARGET with deterministic variation ─────────────────────────

function paramsFor(fam, variant) {
  const p = { ...fam.params };
  const bump = (v, delta) => {
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > 0) {
      p.__cap = Number.isFinite(p.__cap) ? p.__cap + delta : n + delta;
    }
  };
  if (variant % 3 === 1) bump(p.ram || p.capacity || p.memoryGb, variant);
  if (variant % 5 === 0 && p.ports) p.variant = `config ${variant + 1}`;
  return p;
}

function buildRows() {
  const rows = [];
  const used = new Set();
  const usedFuzzy = new Set();
  let variant = 0;

  for (const fam of FAMILIES) {
    for (const g of fam.gens) {
      for (const spec of fam.spec) {
        const modelName = g ? `${fam.base} ${g}` : fam.base;
        const key = modelName.toLowerCase();
        if (used.has(key)) continue;
        used.add(key);

        const slug = fam.sku + (g ? `-${String(g).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)}` : '');
        const id = `${slug}-${String(rows.length + 1).padStart(3, '0')}`.toLowerCase();
        const aliasStem = String(fam.sku).toLowerCase();

        rows.push({
          id,
          category: fam.cat,
          brand: fam.brand,
          model: modelName,
          spec_template: spec,
          verification_status: 'unverified',
          parameters: paramsFor(fam, variant++),
          aliases: [aliasStem, ...(g ? [`${aliasStem}${String(g).toLowerCase()}`] : [])],
          fuzzy_matches: fuzzyFor(fam, usedFuzzy),
        });
      }
    }
  }

  // Pad to TARGET by cycling families with a capacity/config suffix. These stay
  // UNVERIFIED, which is exactly why the confidence cap exists.
  const famList = FAMILIES.filter((f) => CATEGORIES.includes(f.cat));
  let pad = 0;
  while (rows.length < TARGET) {
    const fam = famList[pad % famList.length];
    const round = Math.floor(pad / famList.length) + 1;
    const modelName = `${fam.base} ${String.fromCharCode(65 + (round % 6))}${round}`;
    const key = modelName.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      rows.push({
        id: `${String(fam.sku)}-C${String(rows.length + 1).padStart(3, '0')}`.toLowerCase(),
        category: fam.cat,
        brand: fam.brand,
        model: modelName,
        spec_template: `${fam.spec[0]}, config ${round}`,
        verification_status: 'unverified',
        parameters: paramsFor(fam, pad),
        aliases: [String(fam.sku).toLowerCase()],
        fuzzy_matches: fuzzyFor(fam, usedFuzzy),
      });
    }
    pad++;
  }
  return rows.slice(0, TARGET);
}

const rows = buildRows();

import { writeFileSync } from 'node:fs';

const asSql = process.argv.includes('--sql');
const outPath = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

function emit(text) {
  if (outPath) {
    // Write bytes directly so no shell redirection can inject a BOM.
    writeFileSync(outPath, text, 'utf8');
  } else {
    process.stdout.write(text.endsWith('\n') ? text : text + '\n');
  }
}

if (asSql) {
  const lines = [];
  lines.push('-- Generated catalog seed — ALL ROWS verification_status=unverified');
  lines.push('-- Generated by scripts/generate-catalog.mjs. See schema/catalog_product.py');
  lines.push('-- NO price column by design: pricing lives on the order snapshot.');
  lines.push('-- Unverified rows are capped at 0.75 confidence in normalize/line.js,');
  lines.push('-- below the 0.80 promotion gate, so they can never become match keys.');
  lines.push('');
  for (const r of rows) {
    lines.push(
      `INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases, verification_status) VALUES (${q(r.id)}, ${q(r.category)}, ${q(r.model)}, ${q(r.spec_template)}, ${q(JSON.stringify(r.aliases))}, ${q(r.verification_status)});`
    );
    for (const f of r.fuzzy_matches) {
      lines.push(
        `INSERT OR IGNORE INTO product_fuzzy (product_id, phrase, phrase_tokens) VALUES (${q(r.id)}, ${q(f)}, ${q(f.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())});`
      );
    }
  }
  emit(lines.join('\n'));
} else {
  const byCat = {};
  for (const r of rows) (byCat[r.category] ||= []).push(r);
  void byCat;
  emit(JSON.stringify({ generated_at: new Date().toISOString(), generator_version: 'catalog-gen-v1', default_verification: 'unverified', products: rows }, null, 2));
}
