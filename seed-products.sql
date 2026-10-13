-- ITAD Product Catalog Seed — canonical models from ITAD taxonomy + common SELL history
-- Run: wrangler d1 execute netamps-db --remote --file=seed-products.sql (or via dashboard)

-- Core ITAD Categories
INSERT OR IGNORE INTO products (id, category, model, spec_template, aliases) VALUES
-- Servers
('srv-001', 'servers', 'Dell PowerEdge R740', '2U rack, 2x Xeon Scalable, up to 3TB DDR4', '["r740","dell r740","poweredge r740"]'),
('srv-002', 'servers', 'Dell PowerEdge R750', '2U rack, 3rd Gen Xeon Scalable, up to 6TB DDR4', '["r750","dell r750","poweredge r750"]'),
('srv-003', 'servers', 'HPE ProLiant DL380 Gen10', '2U rack, 2x Xeon Scalable, up to 3TB DDR4', '["dl380 gen10","hpe dl380","proliant dl380"]'),
('srv-004', 'servers', 'HPE ProLiant DL380 Gen10 Plus', '2U rack, 3rd Gen Xeon Scalable, up to 6TB DDR4', '["dl380 gen10+","hpe dl380 gen10 plus"]'),
('srv-005', 'servers', 'Lenovo ThinkSystem SR650', '2U rack, 2x Xeon Scalable, up to 3TB DDR4', '["sr650","lenovo sr650","thinksystem sr650"]'),
('srv-006', 'servers', 'Cisco UCS C240 M5', '2U rack, 2x Xeon Scalable, up to 3TB DDR4', '["ucs c240 m5","cisco c240"]'),
('srv-007', 'servers', 'Supermicro SYS-1029P-WTR', '1U rack, 2x Xeon Scalable, up to 1.5TB DDR4', '["supermicro 1029p","sys-1029p-wtr"]'),

-- Storage
('stg-001', 'storage', 'Dell PowerVault ME484', '2U 24-bay, 12Gb SAS, up to 345TB raw', '["me484","powervault me484","dell me484"]'),
('stg-002', 'storage', 'HPE MSA 2052', '2U 12Gb SAS, up to 240TB raw', '["msa 2052","hpe msa 2052"]'),
('stg-003', 'storage', 'NetApp FAS2750', '2U hybrid flash, up to 360TB raw', '["fas2750","netapp fas2750"]'),
('stg-004', 'storage', 'Pure Storage FlashArray//X20', 'All-flash, up to 500TB effective', '["fa-x20","pure x20","flasharray x20"]'),

-- Networking
('net-001', 'networking', 'Cisco Catalyst 9300-48P', '48-port PoE+, StackWise-480, 740W', '["c9300-48p","catalyst 9300","cisco 9300"]'),
('net-002', 'networking', 'Cisco Catalyst 9400', 'Modular 7-slot, up to 9.6 Tbps', '["c9400","catalyst 9400"]'),
('net-003', 'networking', 'Aruba 6300M 48G PoE', '48-port 1G PoE+, VSX, 740W', '["6300m 48g","aruba 6300"]'),
('net-004', 'networking', 'Juniper EX4400-48P', '48-port PoE+, 1.44 Tbps, 1440W', '["ex4400-48p","juniper ex4400"]'),

-- Laptops/Workstations
('lpt-001', 'laptops', 'Dell Latitude 7430', '14", i7-1265U, 16GB, 512GB SSD', '["lat 7430","latitude 7430","dell 7430"]'),
('lpt-002', 'laptops', 'Dell Precision 7770', '17.3", i9-12950HX, 64GB, RTX A5500', '["prec 7770","precision 7770","dell 7770"]'),
('lpt-003', 'laptops', 'HP EliteBook 840 G9', '14", i7-1255U, 16GB, 512GB SSD', '["840 g9","elitebook 840","hp 840 g9"]'),
('lpt-004', 'laptops', 'Lenovo ThinkPad X1 Carbon Gen 10', '14", i7-1260P, 16GB, 1TB SSD', '["x1 carbon gen10","thinkpad x1c10"]'),
('lpt-005', 'laptops', 'MacBook Pro 16 M2 Max', '16.2", M2 Max 38c GPU, 96GB, 2TB', '["mbp16 m2 max","macbook pro 16 m2"]'),

-- Components
('cmp-001', 'components', 'Intel Xeon Gold 6348', '28C/56T, 2.6GHz, 42MB, 235W', '["xeon 6348","xeon gold 6348","intel 6348"]'),
('cmp-002', 'components', 'AMD EPYC 7763', '64C/128T, 2.45GHz, 256MB, 280W', '["epyc 7763","amd 7763","epyc 7763"]'),
('cmp-003', 'components', 'NVIDIA A100 80GB', 'PCIe 4.0, 80GB HBM2e, 19.5 TFLOPS', '["a100 80gb","nvidia a100"]'),
('cmp-004', 'components', 'Samsung PM9A3 3.84TB', 'PCIe 4.0 NVMe, 6900 MB/s read', '["pm9a3 3.84tb","samsung pm9a3"]'),
('cmp-005', 'components', 'DDR4-3200 32GB RDIMM', 'ECC Registered, 1.2V, CL22', '["ddr4 32gb rdimm","32gb ecc rdimm"]'),

-- Peripherals
('prp-001', 'peripherals', 'Dell UltraSharp U2723QE', '27" 4K USB-C Hub, IPS, 100% sRGB', '["u2723qe","dell 27 4k usb-c"]'),
('prp-002', 'peripherals', 'LG UltraFine 32UN880', '32" 4K Ergo Stand, 95% DCI-P3', '["32un880","lg 32 4k ergo"]'),

-- Telecom
('tel-001', 'telecom', 'Cisco ISR 4331', '3x GE, 2x NIM, 1x SM, 500Mbps', '["isr 4331","cisco 4331","cisco isr"]'),
('tel-002', 'telecom', 'Cisco Catalyst 8200', '2x 10G, 4x 1G, 8GB DRAM', '["c8200","catalyst 8200"]');

-- Helpful view for admin UI
CREATE VIEW IF NOT EXISTS v_products_by_category AS
SELECT category, COUNT(*) AS model_count, GROUP_CONCAT(model) AS models
FROM products
GROUP BY category
ORDER BY category;