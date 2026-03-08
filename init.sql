-- Initialize vulnerable database

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    ssn VARCHAR(20),
    credit_card VARCHAR(500),
    role VARCHAR(20) DEFAULT 'user',
    reset_token VARCHAR(100),
    security_question VARCHAR(500),
    api_key VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    author VARCHAR(100),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200),
    price DECIMAL(10,2),
    image_url VARCHAR(500),
    category VARCHAR(100),
    description TEXT,
    stock INTEGER DEFAULT 100,
    badge VARCHAR(50),
    original_price DECIMAL(10,2),
    data JSONB
);

CREATE TABLE IF NOT EXISTS secrets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    value TEXT
);

-- Insert sample data with realistic information for CTF
INSERT INTO users (username, password, email, ssn, credit_card, role, security_question, api_key) VALUES
('admin', 'admin123', 'admin@luxora.com', '123-45-6789', '4111-1111-1111-1111', 'admin', 'What is your pet name?', 'sk-admin-secret-key-12345'),
('john', 'password123', 'john@example.com', '234-56-7890', '4222-2222-2222-2222', 'user', 'What is your mothers maiden name?', 'sk-user-key-67890'),
('jane', 'jane2024', 'jane@example.com', '345-67-8901', '4333-3333-3333-3333', 'user', 'What city were you born in?', 'sk-user-key-11111'),
('guest', 'guest', 'guest@example.com', '456-78-9012', '4444-4444-4444-4444', 'guest', 'What is your favorite color?', 'sk-guest-key-22222'),
('root', 'toor', 'root@localhost', '567-89-0123', '4555-5555-5555-5555', 'admin', 'What is 2+2?', 'sk-root-key-33333'),
-- Additional admin accounts for privilege escalation
('superadmin', 'Sup3rS3cr3t!', 'superadmin@luxora-internal.com', '678-90-1234', '4666-6666-6666-6666', 'superadmin', 'Company founded year?', 'sk-superadmin-key-44444'),
('dbadmin', 'D8bas3P@ss!', 'dbadmin@luxora-internal.com', '789-01-2345', '4777-7777-7777-7777', 'admin', 'Database port?', 'sk-dbadmin-key-55555'),
('backup_admin', 'backup2024', 'backup@luxora.com', '890-12-3456', '4888-8888-8888-8888', 'admin', 'Backup server name?', 'sk-backup-key-66666'),
-- CTF targets with sensitive data
('ctf_flag_holder', 'Fl4gH0ld3r#', 'flags@luxora-ctf.internal', '901-23-4567', '4999-9999-9999-9999', 'user', 'CTF challenge?', 'sk-ctf-key-88888'),
('developer', 'D3vT3st!ng', 'dev@luxora.com', '012-34-5678', '4000-0000-0000-0000', 'developer', 'IDE name?', 'sk-dev-key-77777');

INSERT INTO comments (author, content) VALUES
('Admin', 'Welcome to our vulnerable app!'),
('Hacker', '<script>alert("XSS")</script>'),
('User', 'This is a normal comment'),
('Tester', '<img src=x onerror=alert("Stored XSS")>'),
('Developer', '<svg onload=alert("SVG XSS")>');

INSERT INTO products (name, price, image_url, category, description, stock, badge, original_price, data) VALUES
-- Bags
('Classic Leather Tote', 299.99, 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800', 'Bags', 'Handcrafted Italian leather tote with gold hardware', 50, 'Sale', 399.99, '{"featured": true}'),
('Travel Duffel Bag', 349.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a45?w=800', 'Bags', 'Canvas and leather travel bag with brass hardware', 25, 'Limited', NULL, '{}'),
('Crossbody Bag', 199.00, 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800', 'Bags', 'Compact leather crossbody with adjustable strap', 40, 'New', NULL, '{}'),
('Backpack Pro', 279.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', 'Bags', 'Water-resistant canvas backpack with laptop compartment', 35, NULL, NULL, '{}'),
('Evening Clutch', 149.00, 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800', 'Bags', 'Elegant satin clutch with detachable chain', 60, 'Best Seller', NULL, '{}'),
('Leather Weekender', 429.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a45?w=800', 'Bags', 'Premium leather weekend bag for short trips', 20, 'New', NULL, '{}'),
('Mini Backpack', 189.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', 'Bags', 'Compact mini backpack in soft leather', 45, NULL, NULL, '{}'),
('Tote Bag Classic', 259.00, 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800', 'Bags', 'Classic canvas tote with leather handles', 80, 'Sale', 319.00, '{}'),
-- Clothing
('Cashmere Sweater', 249.00, 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800', 'Clothing', '100% Mongolian cashmere sweater, ethically sourced', 75, NULL, NULL, '{"featured": true}'),
('Wool Blend Coat', 449.00, 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800', 'Clothing', 'Italian wool blend coat with satin lining', 30, 'New', NULL, '{}'),
('Merino Wool Cardigan', 189.00, 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800', 'Clothing', 'New Zealand merino wool cardigan, button front', 45, NULL, NULL, '{}'),
('Cotton Oxford Shirt', 89.00, 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', 'Clothing', 'Egyptian cotton oxford shirt with mother of pearl buttons', 120, NULL, NULL, '{}'),
('Linen Summer Dress', 179.00, 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800', 'Clothing', 'French linen summer dress, relaxed fit', 55, 'Sale', 229.00, '{}'),
('Silk Blouse', 159.00, 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=800', 'Clothing', '100% silk blouse with elegant drape', 65, 'New', NULL, '{}'),
('Tailored Blazer', 329.00, 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800', 'Clothing', 'Italian wool tailored blazer, slim fit', 40, NULL, NULL, '{}'),
('Slim Fit Chinos', 119.00, 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800', 'Clothing', 'Stretch cotton chinos, modern slim fit', 100, 'Best Seller', NULL, '{}'),
('Cashmere Turtleneck', 219.00, 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800', 'Clothing', '100% cashmere turtleneck with ribbed trim', 50, NULL, NULL, '{}'),
('Pleated Midi Skirt', 139.00, 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800', 'Clothing', 'Satin finish pleated skirt with elastic waist', 45, 'New', NULL, '{}'),
('Denim Jacket', 189.00, 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800', 'Clothing', 'Premium Japanese selvedge denim jacket', 35, NULL, NULL, '{}'),
('Wool Trousers', 149.00, 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800', 'Clothing', 'Italian wool trousers with tailored fit', 60, NULL, NULL, '{}'),
('Silk Camisole', 89.00, 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=800', 'Clothing', 'Pure silk camisole with lace trim', 70, 'New', NULL, '{}'),
('Cashmere Wrap', 199.00, 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800', 'Clothing', 'Versatile cashmere wrap for any occasion', 40, 'Best Seller', NULL, '{}'),
-- Accessories
('Minimalist Watch', 189.00, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800', 'Accessories', 'Swiss movement watch with sapphire crystal', 100, 'New', NULL, '{"featured": true}'),
('Silk Scarf Collection', 89.00, 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800', 'Accessories', 'Hand-rolled edges, 100% mulberry silk', 200, 'Sale', 129.00, '{}'),
('Premium Sunglasses', 159.00, 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800', 'Accessories', 'UV400 protection sunglasses with titanium frame', 60, 'Best Seller', NULL, '{}'),
('Leather Belt', 79.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', 'Accessories', 'Full grain leather belt with solid brass buckle', 150, NULL, NULL, '{}'),
('Italian Leather Wallet', 129.00, 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800', 'Accessories', 'RFID blocking wallet in vegetable tanned leather', 80, NULL, NULL, '{}'),
('Handcrafted Bracelet', 69.00, 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800', 'Accessories', 'Sterling silver artisan bracelet', 90, NULL, NULL, '{}'),
('Cashmere Beanie', 79.00, 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?w=800', 'Accessories', '100% cashmere beanie with ribbed knit', 100, NULL, NULL, '{}'),
('Silk Pocket Square Set', 49.00, 'https://images.unsplash.com/photo-1598560917505-59a3ad559071?w=800', 'Accessories', 'Set of 3 silk pocket squares with hand-rolled edges', 150, 'Best Seller', NULL, '{}'),
('Leather Gloves', 99.00, 'https://images.unsplash.com/photo-1531163804464-0a1a81e4ed03?w=800', 'Accessories', 'Cashmere lined lambskin leather gloves', 70, 'New', NULL, '{}'),
('Designer Cufflinks', 79.00, 'https://images.unsplash.com/photo-1596944924616-7b38e7cfac36?w=800', 'Accessories', 'Sterling silver designer cufflinks', 80, NULL, NULL, '{}'),
('Statement Necklace', 129.00, 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800', 'Accessories', 'Gold-plated handcrafted statement necklace', 40, 'Limited', NULL, '{}'),
('Silk Tie Collection', 89.00, 'https://images.unsplash.com/photo-1589756823695-278bc923f962?w=800', 'Accessories', '100% silk tie with classic patterns', 60, NULL, NULL, '{}'),
('Luxury Perfume', 159.00, 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=800', 'Accessories', 'Eau de parfum, 100ml bottle', 50, 'New', NULL, '{}'),
('Pearl Earrings', 189.00, 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800', 'Accessories', 'Freshwater pearl earrings in sterling silver', 30, 'Best Seller', NULL, '{}'),
('Gold Chain Bracelet', 249.00, 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800', 'Accessories', '18k gold vermeil chain bracelet', 25, 'Limited', NULL, '{}'),
('Analog Watch Gold', 299.00, 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800', 'Accessories', 'Gold-plated analog watch with leather strap', 45, 'New', NULL, '{}'),
-- Shoes
('Leather Loafers', 199.00, 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=800', 'Shoes', 'Italian leather loafers with rubber sole', 50, NULL, NULL, '{}'),
('Suede Boots', 279.00, 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800', 'Shoes', 'Premium suede ankle boots', 35, 'New', NULL, '{}'),
('Canvas Sneakers', 89.00, 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800', 'Shoes', 'Classic canvas sneakers in white', 80, 'Best Seller', NULL, '{}'),
('Leather Heels', 229.00, 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800', 'Shoes', 'Elegant leather heels for evening wear', 40, NULL, NULL, '{}'),
('Ballet Flats', 139.00, 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800', 'Shoes', 'Comfortable leather ballet flats', 60, 'Sale', 179.00, '{}'),
-- Jewelry
('Diamond Stud Earrings', 499.00, 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800', 'Jewelry', '0.5ct diamond stud earrings in 14k gold', 15, 'Limited', NULL, '{}'),
('Gold Bangle Set', 189.00, 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800', 'Jewelry', 'Set of 3 gold vermeil bangles', 25, NULL, NULL, '{}'),
('Silver Pendant', 79.00, 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800', 'Jewelry', 'Sterling silver pendant on chain', 45, 'New', NULL, '{}'),
('Rose Gold Ring', 159.00, 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800', 'Jewelry', 'Rose gold vermeil statement ring', 30, 'Best Seller', NULL, '{}');

INSERT INTO secrets (name, value) VALUES
('DATABASE_PASSWORD', 'super_secret_db_pass'),
('API_KEY', 'sk-live-abcdef123456'),
('JWT_SECRET', 'my_jwt_secret_key'),
('AWS_SECRET', 'aws_secret_access_key_123'),
('ENCRYPTION_KEY', 'aes256_encryption_key_xyz'),
('SQLI_FLAG', 'FLAG{SQLI_SUCCESS_DATABASE_DUMPED} - 이 플래그는 SQL Injection 공격 기법이 성공적으로 통과되었음을 나타냅니다.');

-- Hidden user for IDOR
INSERT INTO users (id, username, password, email, ssn, credit_card, role, security_question, api_key) VALUES
(999, 'hidden_user', 'cantlogin', 'FLAG{IDOR_SUCCESS_ACCESS_CONTROL_BYPASS}', 'IDOR 플래그', '이 플래그는 Insecure Direct Object Reference (IDOR) 공격 기법이 성공적으로 통과되었음을 나타냅니다.', 'user', 'What is the flag?', 'sk-idor-flag');

-- Create views for easier exploitation
CREATE OR REPLACE VIEW user_credentials AS
SELECT id, username, password, email, role FROM users;
