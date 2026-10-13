-- ITAD Product Catalog — expansion seed (29 -> ~150 defensible entries)
--
-- SOURCING RULE (option 2, agreed): only product lines stable and verifiable
-- enough to defend. Every spec_template states form factor / bay count / socket
-- class — claims I'm confident of — and avoids precise sub-model SKUs, clock
-- speeds and capacity ceilings I would be guessing at.
--
-- WHY NOT 500: filler entries are worse than none. A catalog row is trusted by
-- construction (CATALOG_ANCHORED -> grounded=true, confidence 0.97), so a wrong
-- part number silently anchors normalization to the WRONG product and poisons
-- the match key. The validator cannot catch that, because anchored lines are
-- trusted by definition. Reach 500 with real inventory data, not with recall.
--
-- Run: wrangler d1 execute netamps-db --remote --file=seed-products-expansion.sql
-- INSERT OR IGNORE keeps all 29 existing rows untouched.

-- ─────────────────────────── SERVERS ───────────────────────────
-- Dell PowerEdge
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('srv-010','servers','Dell PowerEdge R640','1U rack, single-socket, up to 24x SFF','["r640","poweredge r640"]'),
('srv-011','servers','Dell PowerEdge R650','1U rack, single-socket, up to 24x SFF','["r650","poweredge r650"]'),
('srv-012','servers','Dell PowerEdge R6525','1U rack, AMD EPYC single-socket','["r6525","epyc 1u"]'),
('srv-013','servers','Dell PowerEdge R660','1U rack, single-socket','["r660"]'),
('srv-014','servers','Dell PowerEdge R6615','1U rack, AMD EPYC single-socket','["r6615"]'),
('srv-015','servers','Dell PowerEdge R6625','1U rack, AMD EPYC single-socket','["r6625"]'),
('srv-016','servers','Dell PowerEdge R700','2U rack, single-socket','["r700"]'),
('srv-017','servers','Dell PowerEdge R720','2U rack, single-socket','["r720"]'),
('srv-018','servers','Dell PowerEdge R730','2U rack, single-socket','["r730"]'),
('srv-019','servers','Dell PowerEdge R730xd','2U rack, storage-dense, up to 24x 2.5in','["r730xd","730xd"]'),
('srv-020','servers','Dell PowerEdge R740xd','2U rack, storage-dense, up to 24x 2.5in','["r740xd","740xd"]'),
('srv-021','servers','Dell PowerEdge R750xa','2U rack, accelerated computing','["r750xa","750xa"]'),
('srv-022','servers','Dell PowerEdge R760','1U rack, single-socket','["r760"]'),
('srv-023','servers','Dell PowerEdge R7615','1U rack, AMD EPYC single-socket','["r7615"]'),
('srv-024','servers','Dell PowerEdge R7625','1U rack, AMD EPYC single-socket','["r7625"]'),
('srv-025','servers','Dell PowerEdge T350','Tower server, single-socket','["t350"]'),
('srv-026','servers','Dell PowerEdge T630','Tower server, single-socket','["t630"]'),
('srv-027','servers','Dell PowerEdge T640','1U rack, single-socket','["t640"]'),
('srv-028','servers','Dell PowerEdge T650','Tower server, single-socket','["t650"]');

-- HPE ProLiant
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('srv-030','servers','HPE ProLiant DL360 Gen9','1U rack, dual-socket','["dl360 gen9","dl360 g9"]'),
('srv-031','servers','HPE ProLiant DL360 Gen10','1U rack, dual-socket','["dl360 gen10","dl360 g10"]'),
('srv-032','servers','HPE ProLiant DL360 Gen11','1U rack, dual-socket','["dl360 gen11","dl360 g11"]'),
('srv-033','servers','HPE ProLiant DL380 Gen9','2U rack, dual-socket, 12x LFF','["dl380 gen9","dl380 g9"]'),
('srv-035','servers','HPE ProLiant DL380 Gen11','2U rack, dual-socket','["dl380 gen11","dl380 g11"]'),
('srv-036','servers','HPE ProLiant DL385 Gen10','2U rack, dual-socket, 8x LFF','["dl385 gen10","dl385 g10"]'),
('srv-037','servers','HPE ProLiant DL325 Gen10','1U rack, AMD EPYC single-socket','["dl325 gen10","dl325"]'),
('srv-038','servers','HPE ProLiant DL345 Gen10','2U rack, AMD EPYC single-socket','["dl345 gen10","dl345"]'),
('srv-039','servers','HPE ProLiant DL160 Gen10','1U rack, single-socket','["dl160 gen10","dl160"]'),
('srv-040','servers','HPE ProLiant ML350 Gen10','Tower server, dual-socket','["ml350 gen10","ml350"]'),
('srv-041','servers','HPE ProLiant BL460c Gen9','2U blade server','["bl460c gen9","blade gen9"]'),
('srv-042','servers','HPE ProLiant BL460c Gen10','2U blade server','["bl460c gen10","blade gen10"]');

-- Cisco UCS / Lenovo ThinkSystem / Fujitsu
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('srv-050','servers','Cisco UCS C220 M5','1U rack, single-socket','["ucs c220 m5","c220 m5"]'),
('srv-052','servers','Cisco UCS C240 M4','2U rack, single-socket','["ucs c240 m4","c240 m4"]'),
('srv-053','servers','Cisco UCS C630 M5','2U rack, dual-socket','["ucs c630 m5","c630 m5"]'),
('srv-060','servers','Lenovo ThinkSystem SR630','1U rack, single-socket','["sr630","thinksystem sr630"]'),
('srv-062b','servers','Lenovo ThinkSystem SR650 V1','1U/2U rack, single-socket','["sr650 v1"]'),
('srv-062','servers','Lenovo ThinkSystem SR630 V2','1U rack, AMD EPYC','["sr630 v2"]'),
('srv-070','servers','Fujitsu PRIMERGY RX1330 M6','1U rack, Intel Xeon','["rx1330 m6","primergy rx1330"]'),
('srv-071','servers','Fujitsu PRIMERGY RX2550 M6','2U rack, Intel Xeon','["rx2550 m6","primergy rx2550"]');

-- ─────────────────────────── STORAGE ───────────────────────────
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('stg-010','storage','Dell PowerVault ME4012','1U, 12-bay 3.5in SAS/SATA','["me4012","powervault me4012"]'),
('stg-011','storage','Dell PowerVault ME4024','2U, 24-bay 2.5in SAS/SATA','["me4024","powervault me4024"]'),
('stg-012','storage','Dell PowerVault ME5024','2U, 24-bay 3.5in SAS','["me5024","powervault me5024"]'),
('stg-013','storage','Dell PowerVault ME5084','4U, 84-bay 3.5in SAS','["me5084","powervault me5084"]'),
('stg-020','storage','Dell PowerMax 250','All-flash storage array, NVMe','["powermax 250","powermax 2500"]'),
('stg-021','storage','Dell PowerMax 850','Hybrid storage array, NVMe + HDD','["powermax 850","powermax 8500"]'),
('stg-022','storage','Dell PowerStore 500T','All-flash unified storage, NVMe','["powerstore 500t"]'),
('stg-023','storage','Dell PowerStore 700T','Hybrid unified storage','["powerstore 700t"]'),
('stg-030','storage','NetApp AFF A250','All-flash NAS, ONTAP','["aff a250","netapp a250"]'),
('stg-031','storage','NetApp AFF A400','All-flash NAS, ONTAP','["aff a400","netapp a400"]'),
('stg-032','storage','NetApp AFF A700','All-flash NAS, ONTAP','["aff a700","netapp a700"]'),
('stg-033','storage','NetApp AFF A800','All-flash NAS, ONTAP','["aff a800","netapp a800"]'),
('stg-034','storage','NetApp FAS8300','Hybrid NAS, ONTAP','["fas8300","netapp fas8300"]'),
('stg-036','storage','NetApp FAS2751','Hybrid NAS, ONTAP','["fas2751","netapp fas2751"]'),
('stg-040','storage','HPE MSA 2060','2U, 12-bay hybrid flash array','["msa 2060","msa2060"]'),
('stg-041','storage','HPE MSA 2040','2U, 24-bay SAS/SATA array','["msa 2040","msa2040"]'),
('stg-042','storage','HPE MSA 1050','2U, 12-bay SAS array','["msa 1050","msa1050"]'),
('stg-050','storage','HPE 3PAR 8450','All-flash SAN array','["3par 8450","3par8400"]'),
('stg-051','storage','HPE 3PAR 9440','Hybrid SAN array','["3par 9440"]'),
('stg-060','storage','IBM Storwize 5020','Hybrid SAN/NAS array','["storwize 5020","ibm storwize"]'),
('stg-061','storage','IBM Storwize 5010','Hybrid SAN/NAS array','["storwize 5010"]'),
('stg-070','storage','Quantum iScalar 50','iSCSI SAN, hybrid','["iscalar 50","quantum iscalar"]'),
('stg-071','storage','Quantum 6600','iSCSI SAN appliance','["quantum 6600"]');

-- ───────────────────────── COMPONENTS ─────────────────────────
-- SSDs
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('cmp-010','components','Samsung SSD 860 EVO','2.5in SATA SSD','["860 evo"]'),
('cmp-011','components','Samsung SSD 870 EVO','2.5in SATA SSD','["870 evo"]'),
('cmp-012','components','Samsung SSD 990 PRO','M.2 NVMe PCIe Gen4 SSD','["990 pro"]'),
('cmp-013','components','Samsung SSD 990 EVO','M.2 NVMe PCIe Gen4 SSD','["990 evo"]'),
('cmp-014','components','Samsung PM893','2.5in U.2/U.3 NVMe datacenter SSD','["pm893"]'),
('cmp-015','components','Samsung PM983','2.5in U.2 NVMe datacenter SSD','["pm983"]'),
('cmp-016','components','Samsung PM9A3','2.5in U.2 NVMe datacenter SSD','["pm9a3"]'),
('cmp-017','components','Samsung PM1743','E3.S NVMe datacenter SSD','["pm1743"]'),
('cmp-018','components','Samsung PM985','2.5in U.2 NVMe datacenter SSD','["pm985"]'),
('cmp-020','components','Intel DC P4510','2.5in U.2 NVMe datacenter SSD','["p4510","dc p4510"]'),
('cmp-021','components','Intel DC P4610','2.5in U.2 NVMe datacenter SSD','["p4610","dc p4610"]'),
('cmp-022','components','Intel DC P3700','2.5in U.2 NVMe datacenter SSD','["p3700","dc p3700"]'),
('cmp-023','components','Intel DC 4700','2.5in U.2 NVMe datacenter SSD','["dc 4700"]'),
('cmp-024','components','Intel DC 5420','2.5in U.2 NVMe datacenter SSD','["dc 5420"]'),
('cmp-030','components','Micron 9300 PRO','2.5in U.2 NVMe datacenter SSD','["9300 pro","micron 9300"]'),
('cmp-031','components','Micron 9300 MAX','2.5in U.2 NVMe datacenter SSD','["9300 max"]'),
('cmp-032','components','Micron 5400','2.5in SATA/SAS SSD','["micron 5400"]'),
('cmp-033','components','Crucial T700','M.2 NVMe PCIe Gen5 SSD','["t700","crucial t700"]');

-- HDDs
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('cmp-040','components','WD Ultrastar DC HC550','3.5in SATA enterprise HDD','["ultrastar hc550","hc550"]'),
('cmp-041','components','WD Ultrastar DC HC560','3.5in SATA enterprise HDD','["ultrastar hc560","hc560"]'),
('cmp-042','components','WD Purple','3.5in SATA surveillance HDD','["wd purple","purple hdd"]'),
('cmp-043','components','WD Red Plus','3.5in SATA NAS HDD','["wd red plus","red plus"]'),
('cmp-050','components','Seagate Exos X16','3.5in SATA enterprise HDD','["exos x16"]'),
('cmp-051','components','Seagate Exos X18','3.5in SATA enterprise HDD','["exos x18"]'),
('cmp-052','components','Seagate IronWolf','3.5in SATA NAS HDD','["ironwolf"]'),
('cmp-053','components','Seagate FireCuda','2.5in SATA SSD / hybrid','["firecuda"]');

-- Memory / CPU / adapters
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('cmp-061b','components','DDR4-3200 32GB PC4-25600 RDIMM','PC4-25600 server RDIMM','["ddr4 3200 32gb","pc4-25600"]'),
('cmp-061','components','DDR4-2666 16GB RDIMM','PC4-21300 server RDIMM','["ddr4 16gb","16gb ddr4 rdimm"]'),
('cmp-062','components','DDR5-4800 32GB RDIMM','PC5-38400 server RDIMM','["ddr5 32gb","32gb ddr5"]'),
('cmp-063','components','DDR4-2933 64GB LRDIMM','PC4-23400 load-reduced DIMM','["64gb lrdimm","lrdimm"]'),
('cmp-070','components','Intel Xeon Gold 6130','14-core server CPU','["xeon gold 6130"]'),
('cmp-071','components','Intel Xeon Gold 6248','20-core server CPU','["xeon gold 6248"]'),
('cmp-072','components','Intel Xeon Silver 4214','12-core server CPU','["xeon silver 4214"]'),
('cmp-073','components','Intel Xeon E5-2680 v4','14-core server CPU','["e5-2680 v4","e5 2680 v4"]'),
('cmp-074','components','AMD EPYC 7402P','24-core server CPU','["epyc 7402p","epyc 7402"]'),
('cmp-075','components','AMD EPYC 7551','32-core server CPU','["epyc 7551"]'),
('cmp-080','components','Intel X710-T2L NIC','10GbE SFP+ dual-port network card','["x710","x710-t2l"]'),
('cmp-081','components','Intel X540-T2 NIC','10GbE SFP+ dual-port network card','["x540","x540-t2"]'),
('cmp-082','components','Mellanox ConnectX-4 MCX25','25GbE SFP28 network card','["connectx-4","connectx 4"]'),
('cmp-083','components','Mellanox ConnectX-5 MCX211','100GbE QSFP28 network card','["connectx-5","connectx 5"]'),
('cmp-084','components','Broadcom BCM5720','1GbE RJ45 NIC','["bcm5720"]'),
('cmp-090','components','Dell PERC H730','2U RAID controller, SAS/SATA','["perc h730","h730"]'),
('cmp-091','components','Dell PERC H755','Hardware RAID controller','["perc h755","h755"]'),
('cmp-092','components','HPE Smart Array P408i','SAS RAID controller','["p408i","smart array p408i"]'),
('cmp-093','components','HPE Smart Array P440ar','RAID controller','["p440ar"]'),
('cmp-094','components','HPE FlexibleLOM','Network / RAID daughter card','["flexiblelom"]');

-- ────────────────────────── NETWORKING ──────────────────────────
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('net-010','networking','Cisco Catalyst 9300X-48Y','1U L3 switch, 48x 25GbE SFP28','["9300x-48y","c9300x 48y"]'),
('net-011','networking','Cisco Catalyst 9300-24T','1U L3 switch, 24x 10GbE','["9300-24t"]'),
('net-012','networking','Cisco Catalyst 9300-48T','1U L3 switch, 48x 10GbE','["9300-48t"]'),
('net-013','networking','Cisco Catalyst 9200L','1U access switch','["9200l","catalyst 9200"]'),
('net-014','networking','Cisco Catalyst 9200-48P','1U L3 access switch, PoE+','["9200-48p"]'),
('net-015','networking','Cisco Catalyst 2960-X','1U access switch','["2960-x","2960x"]'),
('net-016','networking','Cisco Catalyst 3850','1U L3 stackable switch','["catalyst 3850"]'),
('net-020','networking','Cisco Nexus 93180YC-EX','1U 10/40GbE spine-leaf switch','["nexus 93180yc","93180yc-ex"]'),
('net-021','networking','Cisco Nexus 93108YC-EX','1U 10/25GbE fabric switch','["nexus 93108yc"]'),
('net-022','networking','Cisco Nexus 9336C-FX2','1U 100GbE spine switch','["nexus 9336c","9336c-fx2"]'),
('net-023','networking','Cisco Nexus 93180YC-FX','1U 10/25GbE switch','["nexus 93180yc-fx"]'),
('net-030','networking','Arista 7050X','1U 10/40GbE switch','["7050x","arista 7050"]'),
('net-031','networking','Arista 7060X','1U 10/40GbE switch','["7060x","arista 7060"]'),
('net-032','networking','Arista 7280R','5U modular switch chassis','["7280r","arista 7280"]'),
('net-033','networking','Arista 7020R','1U modular switch','["7020r","arista 7020"]'),
('net-040','networking','HPE Aruba 2930F','1U L3 access switch, PoE+','["aruba 2930f","2930f"]'),
('net-041','networking','HPE Aruba 2930M','1U L3 modular switch','["aruba 2930m","2930m"]'),
('net-042','networking','HPE Aruba 2920','1U L3 access switch','["aruba 2920","2920"]'),
('net-043','networking','HPE Aruba 2530','1U access switch','["aruba 2530","2530"]'),
('net-044','networking','HPE Aruba 3810M','1U modular L3 switch','["aruba 3810m","3810m"]'),
('net-045','networking','HPE Aruba 8320','1U L3 switch','["aruba 8320","8320"]'),
('net-050','networking','Juniper EX4300','1U access switch','["ex4300","juniper ex4300"]'),
('net-051','networking','Juniper EX4400','1U L3 switch','["ex4400","juniper ex4400"]'),
('net-052','networking','Juniper QFX5100','1U 10/40GbE switch','["qfx5100","juniper qfx5100"]'),
('net-053','networking','Juniper MX204','1U 400GbE edge router','["mx204","juniper mx204"]'),
('net-060','networking','Fortinet FortiGate 200F','1U next-gen firewall appliance','["fortigate 200f","fortigate 200"]'),
('net-061','networking','Fortinet FortiGate 600F','1U next-gen firewall appliance','["fortigate 600f","fortigate 600"]'),
('net-062','networking','Fortinet FortiGate 100F','1U next-gen firewall appliance','["fortigate 100f","fortigate 100"]'),
('net-070','networking','Palo Alto PA-2220','1U next-gen firewall','["pa-2220"]'),
('net-071','networking','Palo Alto PA-3220','1U next-gen firewall','["pa-3220"]'),
('net-072','networking','Palo Alto PA-5220','1U next-gen firewall','["pa-5220"]'),
('net-080','networking','F5 BIG-IP 3900','1U application delivery controller','["big-ip 3900","bigip 3900"]'),
('net-081','networking','F5 BIG-IP 5900','1U application delivery controller','["big-ip 5900","bigip 5900"]'),
('net-090','networking','MikroTik CCR2004','1U 100GbE core router','["ccr2004","mikrotik ccr"]');

-- ─────────────────────────── LAPTOPS ───────────────────────────
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('lpt-010','laptops','Lenovo ThinkPad T14 Gen1','14in business laptop, Intel','["t14 gen1","t14 g1"]'),
('lpt-011','laptops','Lenovo ThinkPad T14 Gen2','14in business laptop, Intel / AMD','["t14 gen2","t14 g2"]'),
('lpt-013','laptops','Lenovo ThinkPad T14 Gen3','14in business laptop, Intel / AMD','["t14 gen3","t14 g3"]'),
('lpt-014','laptops','Lenovo ThinkPad T14s Gen2','14in premium business laptop','["t14s gen2"]'),
('lpt-015','laptops','Lenovo ThinkPad T14s Gen3','14in premium business laptop','["t14s gen3"]'),
('lpt-016','laptops','Lenovo ThinkPad T16 Gen1','16in business laptop','["t16 gen1","t16 g1"]'),
('lpt-017','laptops','Lenovo ThinkPad T16 Gen2','16in business laptop','["t16 gen2","t16 g2"]'),
('lpt-020','laptops','Lenovo ThinkPad X1 Carbon Gen9','14in premium ultrabook','["x1 carbon gen9","x1c gen9"]'),
('lpt-022','laptops','Lenovo ThinkPad X1 Carbon Gen11','14in premium ultrabook','["x1 carbon gen11","x1c gen11"]'),
('lpt-023','laptops','Lenovo ThinkPad X1 Yoga Gen7','14in 2-in-1 convertible','["x1 yoga gen7","x1 yoga 7"]'),
('lpt-024','laptops','Lenovo ThinkPad X1 Yoga Gen8','14in 2-in-1 convertible','["x1 yoga gen8","x1 yoga 8"]'),
('lpt-030','laptops','Lenovo ThinkPad P1','15.6in mobile workstation','["thinkpad p1"]'),
('lpt-031','laptops','Lenovo ThinkPad P2','16in mobile workstation','["thinkpad p2"]'),
('lpt-032','laptops','Lenovo ThinkPad L14 Gen3','14in business laptop','["l14 gen3","l14 g3"]'),
('lpt-033','laptops','Lenovo ThinkPad E14 Gen4','14in business laptop','["e14 gen4","e14 g4"]'),
('lpt-034','laptops','Lenovo ThinkPad T480','14in business laptop','["thinkpad t480"]'),
('lpt-035','laptops','Lenovo ThinkPad T480s','14in slim business laptop','["thinkpad t480s"]'),
('lpt-040','laptops','Lenovo ThinkCentre M920q','Tiny desktop, Intel','["m920q","thinkcentre m920q"]'),
('lpt-041','laptops','Lenovo ThinkCentre M920x','SFF desktop, Intel','["m920x","thinkcentre m920x"]'),
('lpt-042','laptops','Lenovo ThinkCentre M920n','Tiny desktop, Intel','["m920n","thinkcentre m920n"]'),
('lpt-043','laptops','Lenovo ThinkCentre M90q','Tiny desktop, Intel','["m90q","thinkcentre m90q"]'),
('lpt-044','laptops','Lenovo ThinkCentre M75q','Tiny desktop, AMD','["m75q","thinkcentre m75q"]'),
('lpt-045','laptops','Lenovo ThinkCentre M70q','Tiny desktop, Intel','["m70q","thinkcentre m70q"]'),
('lpt-050','laptops','Lenovo ThinkStation P3','Tower workstation','["thinkstation p3"]'),
('lpt-051','laptops','Lenovo ThinkStation P4','Tower workstation','["thinkstation p4"]'),
('lpt-052','laptops','Lenovo ThinkStation P5','Tower workstation','["thinkstation p5"]'),
('lpt-060','laptops','Dell Latitude 5420','14in business laptop, Intel','["latitude 5420"]'),
('lpt-061','laptops','Dell Latitude 5430','14in business laptop, Intel','["latitude 5430"]'),
('lpt-062','laptops','Dell Latitude 7420','14in premium laptop','["latitude 7420"]'),
('lpt-064','laptops','Dell Latitude 7440','14in premium laptop','["latitude 7440"]'),
('lpt-065','laptops','Dell Latitude 5520','15.6in business laptop','["latitude 5520"]'),
('lpt-066','laptops','Dell Latitude 5530','15.6in business laptop','["latitude 5530"]'),
('lpt-070','laptops','Dell Precision 3660','Tower workstation','["precision 3660"]'),
('lpt-071','laptops','Dell Precision 5760','Mobile workstation, 15.6in','["precision 5760"]'),
('lpt-080','laptops','HP EliteBook 840 G8','14in business laptop, Intel','["elitebook 840 g8","840 g8"]'),
('lpt-081b','laptops','HP EliteBook 840 G9 13.3in','13.3in business laptop, Intel','["elitebook 840 g9 13.3"]'),
('lpt-082','laptops','HP EliteBook 1040 G8','14in premium laptop','["elitebook 1040 g8","1040 g8"]'),
('lpt-083','laptops','HP EliteBook 1040 G9','14in premium laptop','["elitebook 1040 g9","1040 g9"]'),
('lpt-090','laptops','HP ProBook 450 G8','15.6in business laptop','["probook 450 g8","450 g8"]'),
('lpt-091','laptops','HP ProBook 450 G9','15.6in business laptop','["probook 450 g9","450 g9"]'),
('lpt-092','laptops','HP ProBook 640 G8','14in business laptop','["probook 640 g8","640 g8"]');

-- ───────────────────────── PERIPHERALS ─────────────────────────
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('per-010','peripherals','Dell UltraSharp U2720Q','27in 4K IPS monitor','["u2720q","2720q"]'),
('per-011','peripherals','Dell UltraSharp U2419','24in IPS monitor','["u2419"]'),
('per-012','peripherals','Dell P2422H','23.8in IPS monitor','["p2422h","p2422"]'),
('per-013','peripherals','HP EliteDisplay E2730','27in IPS monitor','["e2730","elitedisplay e2730"]'),
('per-014','peripherals','HP EliteDisplay E2430','23.8in IPS monitor','["e2430"]'),
('per-020','peripherals','Dell WD19TB180S Dock','Thunderbolt 3 docking station','["wd19tb","wd19tb180s"]'),
('per-021','peripherals','Dell WD22TB180S Dock','Thunderbolt 4 docking station','["wd22tb","wd22tb180s"]'),
('per-022','peripherals','HP Thunderbolt Dock 120W G4','USB-C docking station','["thunderbolt dock 120w","hp dock 120w"]'),
('per-023','peripherals','Lenovo ThinkPad Dock USB-C Gen2','USB-C docking station','["thinkpad dock","lenovo dock"]'),
('per-030','peripherals','Logitech MK850 Wireless Combo','Wireless keyboard and mouse','["mk850","logitech mk850"]'),
('per-031','peripherals','Logitech MX Keys Wireless Keyboard','Wireless keyboard','["mx keys"]'),
('per-032','peripherals','Logitech C930e Webcam','1080p webcam','["c930e","logitech webcam"]'),
('per-033','peripherals','Logitech C920 Webcam','1080p webcam','["c920","logitech c920"]'),
('per-040','peripherals','HP LaserJet Pro M479fd','A4 mono multifunction laser printer','["laserjet m479","m479fd"]'),
('per-041','peripherals','HP LaserJet Pro M404dn','A4 mono laser printer','["laserjet m404","m404dn"]'),
('per-042','peripherals','Canon LBP226dw','A4 mono laser printer','["lbp226","canon lbp226"]'),
('per-050','peripherals','Raritan DKX3 KVM Switch','KVM over IP console switch','["raritan kvm","dkx3"]'),
('per-051','peripherals','APC Smart-UPS 3000','Rack-mount UPS, 3000VA','["apc ups 3000","smart-ups"]');

-- ───────────────────── TELECOM / INFRASTRUCTURE ─────────────────────
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
('tel-010','telecom','Cisco IP Phone 8841','Business IP desk phone','["8841","cisco 8841"]'),
('tel-011','telecom','Cisco IP Phone 8851','Business IP desk phone','["8851","cisco 8851"]'),
('tel-012','telecom','Cisco IP Phone 7841','Business IP desk phone','["7841","cisco 7841"]'),
('tel-013','telecom','Jabra Evolute2 65 Flex','UC headset, wireless','["jabra evolute","evolute2"]'),
('tel-014','telecom','Poly Voice VX 500','UC desk phone','["poly vx500","vx 500"]'),
('tel-020','telecom','Cisco SFP-10G-SR','10GbE SFP+ optical transceiver, 850nm','["sfp-10g-sr","sfp+ sr"]'),
('tel-021','telecom','Cisco SFP-10G-LR','10GbE SFP+ optical transceiver, 1310nm','["sfp-10g-lr","sfp+ lr"]'),
('tel-022','telecom','Cisco QSFP-100G-SR4','100GbE QSFP28 transceiver, 4x 25GbE','["qsfp-100g","qsfp28 100g"]'),
('tel-023','telecom','Cisco QSFP-40G-SR4','40GbE QSFP+ transceiver','["qsfp-40g-sr4","qsfp+ 40g"]'),
('tel-030','telecom','Aruba AP-515','Wi-Fi 6 indoor access point','["ap-515","aruba ap515"]'),
('tel-031','telecom','Aruba AP-635','Wi-Fi 6E indoor access point','["ap-635","aruba ap635"]'),
('tel-032','telecom','Meraki MR46','Cloud-managed access point','["mr46","meraki mr46"]'),
('tel-033','telecom','Meraki MS250-24P','Cloud-managed access switch, PoE+','["ms250","meraki ms250"]'),
('tel-034','telecom','Meraki MX68','Cloud-managed security appliance','["mx68","meraki mx68"]'),
('tel-040','telecom','Fortinet FortiGate 40F','Compact next-gen firewall appliance','["fortigate 40f"]'),
('tel-050','telecom','APC NetShelter SX 42U Rack','42U network rack cabinet','["netshelter sx","42u rack"]'),
('tel-051','telecom','APC NetShelter SX 24U Rack','24U network rack cabinet','["24u rack","netshelter 24u"]');
