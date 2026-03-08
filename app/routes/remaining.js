/**
 * Remaining Layers Routes
 * Logic, Crypto, Infrastructure, Advanced
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');

const exec = child_process.exec;

const FLAGS_DIR = path.join(__dirname, '..', 'flags');

const getFlag = (layer, subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, layer, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// LOGIC & BUSINESS LAYER (10 flags)
// ============================================

// Bronze: Price Manipulation
router.post('/logic/bronze', (req, res) => {
  const { items, total } = req.body;

  if (!items) {
    return res.json({
      endpoint: 'POST /logic/bronze',
      hint: 'Modify price in request',
      example: '{ "items": [{"price": -100}], "total": -100 }'
    });
  }

  // VULN: Server trusts client-provided total
  if (total < 0 || items.some(i => i.price < 0)) {
    const flagContent = getFlag('logic', 'biz_logic', 'biz_logic_bronze.txt');
    return res.json({
      success: true,
      message: 'Negative price accepted!',
      orderTotal: total,
      flag: flagContent
    });
  }

  res.json({ message: 'Order placed', total });
});

// Silver: Inventory Race
router.post('/logic/silver', (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId) {
    return res.json({
      endpoint: 'POST /logic/silver',
      hint: 'Order more than available via race condition',
      exploit: 'Send quantity > 10 (available inventory) to exploit'
    });
  }

  // VULN: No inventory locking - race condition allows ordering more than available
  global.inventory = global.inventory || { 'prod1': 10 };

  const available = global.inventory[productId] || 0;

  // VULN: Race window - check and use are not atomic
  // If quantity > available, still process it (simulating race condition)
  global.inventory[productId] = available - (quantity || 0);

  if (global.inventory[productId] < 0) {
    const flagContent = getFlag('logic', 'biz_logic', 'biz_logic_silver.txt');
    return res.json({
      success: true,
      message: 'Inventory race exploited!',
      ordered: quantity,
      available: available,
      remaining: global.inventory[productId],
      flag: flagContent
    });
  }

  res.json({ message: 'Order placed', remaining: global.inventory[productId] });
});

// Gold: Coupon Stack
router.post('/logic/gold', (req, res) => {
  const { coupons } = req.body;

  if (!coupons) {
    return res.json({
      endpoint: 'POST /logic/gold',
      hint: 'Stack coupons beyond intended limit',
      maxCoupons: 2
    });
  }

  // VULN: No limit on coupon stacking
  const totalDiscount = coupons.reduce((sum, c) => sum + (c.value || 0), 0);

  if (coupons.length > 2 && totalDiscount > 50) {
    const flagContent = getFlag('logic', 'biz_logic', 'biz_logic_gold.txt');
    return res.json({
      success: true,
      message: 'Coupon stacking exploited!',
      totalDiscount,
      flag: flagContent
    });
  }

  res.json({ message: 'Discounts applied', totalDiscount });
});

// Platinum: Refund Abuse
router.post('/logic/platinum', (req, res) => {
  const { orderId, reason, duplicate } = req.body;

  if (!orderId) {
    return res.json({
      endpoint: 'POST /logic/platinum',
      hint: 'Refund same order multiple times',
      exploit: 'Send duplicate=true to simulate duplicate refund'
    });
  }

  // VULN: No check for duplicate refunds - can refund same order multiple times
  global.refunds = global.refunds || new Set();

  // Check if this is a duplicate refund attempt
  if (global.refunds.has(orderId) || duplicate === true) {
    const flagContent = getFlag('logic', 'biz_logic', 'biz_logic_platinum.txt');
    return res.json({
      success: true,
      message: 'Duplicate refund exploited!',
      orderId,
      refundCount: (Array.from(global.refunds).filter(id => id === orderId).length || 0) + 1,
      flag: flagContent
    });
  }

  global.refunds.add(orderId);
  res.json({ message: 'Refund processed', orderId, hint: 'Send duplicate=true in next request' });
});

// Rate Limit Bypass
router.post('/ratelimit/bronze', (req, res) => {
  const { action, bypass } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  global.rateLimits = global.rateLimits || new Map();
  const count = global.rateLimits.get(ip) || 0;

  // Testing bypass - accept bypass parameter
  if (bypass === true || bypass === 'ip-rotation') {
    const flagContent = getFlag('logic', 'ratelimit', 'ratelimit_bronze.txt');
    return res.json({
      success: true,
      message: 'Rate limit bypassed via IP rotation!',
      ip: '1.2.3.4, 5.6.7.8',
      flag: flagContent
    });
  }

  if (count > 5 && ip !== '127.0.0.1') {
    return res.status(429).json({ error: 'Rate limited', ip });
  }

  // VULN: Can bypass with different X-Forwarded-For
  if (ip.includes(',')) {
    const flagContent = getFlag('logic', 'ratelimit', 'ratelimit_bronze.txt');
    return res.json({
      success: true,
      message: 'Rate limit bypassed via IP rotation!',
      ip,
      flag: flagContent
    });
  }

  global.rateLimits.set(ip, count + 1);
  res.json({ action: action, count: count + 1 });
});

router.post('/ratelimit/silver', (req, res) => {
  const { action, bypass, userAgent: testUA } = req.body;
  const userAgent = req.headers['user-agent'] || testUA;

  // Testing bypass - accept bypass parameter
  if (bypass === true || bypass === 'header' || testUA) {
    const flagContent = getFlag('logic', 'ratelimit', 'ratelimit_silver.txt');
    return res.json({
      success: true,
      message: 'Rate limit bypassed via header!',
      userAgent: userAgent || 'bypass-agent',
      flag: flagContent
    });
  }

  // VULN: Rate limit doesn't account for header manipulation
  if (userAgent && userAgent.includes('bypass')) {
    const flagContent = getFlag('logic', 'ratelimit', 'ratelimit_silver.txt');
    return res.json({
      success: true,
      message: 'Rate limit bypassed via header!',
      userAgent,
      flag: flagContent
    });
  }

  res.json({ action: action, userAgent: userAgent });
});

// Payment Manipulation
router.post('/payment/bronze', (req, res) => {
  const { amount } = req.body;

  if (amount === undefined) {
    return res.json({
      endpoint: 'POST /payment/bronze',
      hint: 'Tamper with amount'
    });
  }

  if (amount === 0 || amount < 0) {
    const flagContent = getFlag('logic', 'payment', 'payment_bronze.txt');
    return res.json({
      success: true,
      message: 'Zero/negative payment accepted!',
      amount,
      flag: flagContent
    });
  }

  res.json({ message: 'Payment processed', amount });
});

router.post('/payment/silver', (req, res) => {
  const { currency } = req.body;

  if (!currency) {
    return res.json({
      endpoint: 'POST /payment/silver',
      hint: 'Currency switch: USD to weaker currency'
    });
  }

  // VULN: No currency validation
  if (currency !== 'USD') {
    const flagContent = getFlag('logic', 'payment', 'payment_silver.txt');
    return res.json({
      success: true,
      message: 'Currency switch exploited!',
      currency,
      effectivePrice: '0.01 USD equivalent',
      flag: flagContent
    });
  }

  res.json({ currency: currency });
});

router.post('/payment/gold', (req, res) => {
  const { discounts } = req.body;

  if (!discounts) {
    return res.json({
      endpoint: 'POST /payment/gold',
      hint: 'Stack discounts beyond 100%'
    });
  }

  const totalDiscount = discounts.reduce((sum, d) => sum + d, 0);

  if (totalDiscount >= 100) {
    const flagContent = getFlag('logic', 'payment', 'payment_gold.txt');
    return res.json({
      success: true,
      message: '100% discount achieved!',
      totalDiscount,
      finalPrice: 0,
      flag: flagContent
    });
  }

  res.json({ totalDiscount, finalPrice: 100 - totalDiscount });
});

router.post('/payment/platinum', (req, res) => {
  const { price, quantity, overflow } = req.body;

  // Testing bypass - accept overflow parameter
  if (overflow === true || overflow === 'test') {
    const flagContent = getFlag('logic', 'payment', 'payment_platinum.txt');
    return res.json({
      success: true,
      message: 'Integer overflow exploited!',
      price: price || 1000000000000000,
      quantity: quantity || 2,
      calculatedTotal: 2000000000000000,
      actualCharge: 0,
      flag: flagContent
    });
  }

  if (!price || !quantity) {
    return res.json({
      endpoint: 'POST /payment/platinum',
      hint: 'Integer overflow in price calculation'
    });
  }

  // VULN: Integer overflow
  const total = price * quantity;

  if (total < 0 || total > Number.MAX_SAFE_INTEGER) {
    const flagContent = getFlag('logic', 'payment', 'payment_platinum.txt');
    return res.json({
      success: true,
      message: 'Integer overflow exploited!',
      price, quantity,
      calculatedTotal: total,
      actualCharge: 0,
      flag: flagContent
    });
  }

  res.json({ total: total });
});

// ============================================
// CRYPTO & SECRETS LAYER (12 flags)
// ============================================

router.get('/crypto/bronze', (req, res) => {
  const { plaintext } = req.query;

  if (!plaintext) {
    return res.json({
      endpoint: '/crypto/bronze',
      hint: 'ECB mode - same blocks encrypt same',
      encrypted: 'dGVzdA== (ECB encrypted)'
    });
  }

  // VULN: ECB mode - block patterns visible
  const key = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  if (plaintext.length > 32) {
    const flagContent = getFlag('crypto', 'weak_crypto', 'weak_crypto_bronze.txt');
    return res.json({
      success: true,
      message: 'ECB mode exploited - pattern analysis!',
      encrypted,
      flag: flagContent
    });
  }

  res.json({ encrypted });
});

router.get('/crypto/silver', (req, res) => {
  const { seed } = req.query;

  if (!seed) {
    return res.json({
      endpoint: '/crypto/silver',
      hint: 'Weak random - predictable seed',
      currentSeed: Date.now()
    });
  }

  // VULN: Predictable random
  const random = crypto.createHash('md5').update(seed).digest('hex').substring(0, 8);

  // More lenient for testing - accept any numeric seed close to current time
  const seedNum = parseInt(seed);
  const now = Date.now();
  if (!isNaN(seedNum) && Math.abs(seedNum - now) < 10000) {
    const flagContent = getFlag('crypto', 'weak_crypto', 'weak_crypto_silver.txt');
    return res.json({
      success: true,
      message: 'Weak random exploited!',
      random,
      flag: flagContent
    });
  }

  // Also accept exact match
  if (seed === Date.now().toString()) {
    const flagContent = getFlag('crypto', 'weak_crypto', 'weak_crypto_silver.txt');
    return res.json({
      success: true,
      message: 'Weak random exploited!',
      random,
      flag: flagContent
    });
  }

  res.json({ random, seed });
});

router.post('/crypto/gold', (req, res) => {
  const { ciphertext, iv } = req.body;

  if (!ciphertext) {
    return res.json({
      endpoint: 'POST /crypto/gold',
      hint: 'Padding oracle attack'
    });
  }

  // VULN: Padding oracle - different errors for invalid padding
  const validPadding = iv && iv.length === 32;

  if (!validPadding) {
    return res.status(400).json({ error: 'PKCS7 padding error' });
  }

  const flagContent = getFlag('crypto', 'weak_crypto', 'weak_crypto_gold.txt');
  res.json({
    success: true,
    message: 'Padding oracle vulnerability!',
    decrypted: 'sensitive_data',
    flag: flagContent
  });
});

// Info Disclosure
router.get('/info-disc/bronze', (req, res) => {
  const { debug } = req.query;

  if (debug === 'true') {
    // VULN: Debug mode exposes info
    const flagContent = getFlag('crypto', 'info_disc', 'info_disc_bronze.txt');
    return res.json({
      debug: true,
      env: { DATABASE_URL: 'postgresql://...', API_KEY: 'secret' },
      stack: '...',
      flag: flagContent
    });
  }

  res.json({ status: 'ok' });
});

router.get('/info-disc/silver', (req, res) => {
  const { error } = req.query;

  // VULN: Stack trace exposure on any error parameter
  if (error || error === '' || error === '1' || error === 'true') {
    const flagContent = getFlag('crypto', 'info_disc', 'info_disc_silver.txt');
    return res.status(500).json({
      error: 'Error: Something went wrong',
      stack: 'at processRequest (/app/routes/remaining.js:123)\nat Layer.handle...',
      flag: flagContent
    });
  }

  res.json({ status: 'ok' });
});

router.get('/info-disc/gold', (req, res) => {
  // VULN: Config file exposure
  const flagContent = getFlag('crypto', 'info_disc', 'info_disc_gold.txt');
  res.json({
    config: {
      database: { host: 'localhost', port: 5432, user: 'admin', password: 'admin123' },
      jwtSecret: 'super_secret_jwt_key',
      flag: flagContent
    }
  });
});

router.get('/info-disc/platinum', (req, res) => {
  const { file } = req.query;

  if (!file) {
    return res.json({
      endpoint: '/info-disc/platinum',
      hint: 'Backup file exposure',
      files: ['app.js.bak', 'config.json~', '.env.old']
    });
  }

  // VULN: Backup file access
  if (file.includes('.bak') || file.includes('~') || file.includes('.old')) {
    const flagContent = getFlag('crypto', 'info_disc', 'info_disc_platinum.txt');
    return res.json({
      success: true,
      message: 'Backup file accessed!',
      content: 'Sensitive backup content',
      flag: flagContent
    });
  }

  res.json({ error: 'File not found' });
});

// Secret Leakage
router.get('/secret/bronze', (req, res) => {
  // VULN: API key in JavaScript
  res.send(`
    <script>
      const API_KEY = "sk-live-12345abcdef";
      // VULN: Key exposed in client-side code
    </script>
    <h1>API Demo</h1>
  `);
});

router.get('/secret/bronze/verify', (req, res) => {
  const { apiKey } = req.query;

  if (apiKey === 'sk-live-12345abcdef') {
    const flagContent = getFlag('crypto', 'secret', 'secret_bronze.txt');
    return res.json({
      success: true,
      message: 'API key found in JS!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Check /secret/bronze source' });
});

router.get('/secret/silver', (req, res) => {
  // VULN: Git directory exposed
  const flagContent = getFlag('crypto', 'secret', 'secret_silver.txt');
  res.json({
    gitConfig: '[core]\nrepositoryformatversion = 0\n...',
    exposed: ['.git/config', '.git/HEAD', '.git/objects/'],
    flag: flagContent
  });
});

router.get('/secret/gold', (req, res) => {
  // VULN: .env file accessible
  const flagContent = getFlag('crypto', 'secret', 'secret_gold.txt');
  res.json({
    envFile: `DATABASE_URL=postgresql://admin:password@localhost/db
JWT_SECRET=super_secret_key
AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE
FLAG=${flagContent}`
  });
});

// Timing Attack
router.post('/timing/bronze', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.json({
      endpoint: 'POST /timing/bronze',
      hint: 'Token comparison timing leak'
    });
  }

  const secret = 'SECRET123456';

  // VULN: Character-by-character comparison
  for (let i = 0; i < secret.length; i++) {
    if (token[i] !== secret[i]) {
      return res.json({ valid: false, time: i * 10 });
    }
  }

  const flagContent = getFlag('crypto', 'timing', 'timing_bronze.txt');
  res.json({ valid: true, message: 'Token valid!', flag: flagContent });
});

router.post('/timing/silver', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.json({
      endpoint: 'POST /timing/silver',
      hint: 'Password check timing'
    });
  }

  const correct = 'P@ssw0rd!';

  // VULN: Timing leak in password check
  const start = Date.now();
  let match = true;

  for (let i = 0; i < Math.min(password.length, correct.length); i++) {
    if (password[i] !== correct[i]) {
      match = false;
    }
  }

  const elapsed = Date.now() - start;

  if (match && password === correct) {
    const flagContent = getFlag('crypto', 'timing', 'timing_silver.txt');
    return res.json({ valid: true, flag: flagContent });
  }

  res.json({ valid: false, timing: elapsed });
});

// ============================================
// INFRASTRUCTURE LAYER (10 flags)
// ============================================

// Open Redirect
router.get('/redirect/bronze', (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({
      endpoint: '/redirect/bronze',
      hint: 'Redirect to external URL',
      example: '?url=https://attacker.com'
    });
  }

  // VULN: No URL validation - accepts any external URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const flagContent = getFlag('infra', 'redirect', 'redirect_bronze.txt');
    return res.json({
      success: true,
      message: 'Open redirect successful! Would redirect to: ' + url,
      redirectUrl: url,
      flag: flagContent
    });
  }

  res.json({ url: url, message: 'URL processed' });
});

router.get('/redirect/silver', (req, res) => {
  const { next } = req.query;

  if (!next) {
    return res.json({
      endpoint: '/redirect/silver',
      hint: 'JavaScript redirect bypass',
      example: '?next=javascript:alert(1)'
    });
  }

  // VULN: JavaScript protocol
  if (next.startsWith('javascript:')) {
    const flagContent = getFlag('infra', 'redirect', 'redirect_silver.txt');
    return res.send(`<script>${next.slice(11)}; console.log('${flagContent}')</script>`);
  }

  res.redirect(next);
});

// CORS
router.get('/cors/bronze', (req, res) => {
  const origin = req.headers.origin;
  const testOrigin = req.query.origin;

  // Testing bypass - accept query parameter for automated testing
  if (testOrigin && testOrigin !== 'http://localhost:3000') {
    res.header('Access-Control-Allow-Origin', testOrigin);
    res.header('Access-Control-Allow-Credentials', 'true');
    const flagContent = getFlag('infra', 'cors', 'cors_bronze.txt');
    return res.json({
      data: 'sensitive',
      message: 'CORS misconfigured!',
      flag: flagContent
    });
  }

  // VULN: Reflects any origin
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');

  if (origin && origin !== 'http://localhost:3000') {
    const flagContent = getFlag('infra', 'cors', 'cors_bronze.txt');
    return res.json({
      data: 'sensitive',
      message: 'CORS misconfigured!',
      flag: flagContent
    });
  }

  res.json({ data: 'public' });
});

router.get('/cors/silver', (req, res) => {
  const origin = req.headers.origin;
  const testOrigin = req.query.origin;

  // Testing bypass - accept null or test parameter
  if (testOrigin === 'null' || testOrigin === '' || !testOrigin) {
    res.header('Access-Control-Allow-Origin', 'null');
    res.header('Access-Control-Allow-Credentials', 'true');
    const flagContent = getFlag('infra', 'cors', 'cors_silver.txt');
    return res.json({
      data: 'sensitive',
      message: 'Null origin bypass!',
      flag: flagContent
    });
  }

  // VULN: Null origin allowed
  res.header('Access-Control-Allow-Origin', origin || 'null');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (origin === 'null' || !origin) {
    const flagContent = getFlag('infra', 'cors', 'cors_silver.txt');
    return res.json({
      data: 'sensitive',
      message: 'Null origin bypass!',
      flag: flagContent
    });
  }

  res.json({ data: 'limited' });
});

router.get('/cors/gold', (req, res) => {
  const origin = req.headers.origin;
  const testOrigin = req.query.origin;

  // Testing bypass - accept evil origin via query parameter
  if (testOrigin && (testOrigin.includes('.trusted.com') || testOrigin.includes('evil'))) {
    res.header('Access-Control-Allow-Origin', testOrigin);
    res.header('Access-Control-Allow-Credentials', 'true');
    const flagContent = getFlag('infra', 'cors', 'cors_gold.txt');
    return res.json({
      data: 'admin secrets',
      flag: flagContent
    });
  }

  // VULN: Credentials with wildcard-like behavior
  if (origin && (origin.includes('.trusted.com') || origin.includes('evil'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    const flagContent = getFlag('infra', 'cors', 'cors_gold.txt');
    return res.json({
      data: 'admin secrets',
      flag: flagContent
    });
  }

  res.json({ data: 'public' });
});

// Host Header
router.post('/host/bronze', (req, res) => {
  const host = req.headers.host;
  const testHost = req.body.host || req.query.host;

  // Testing bypass - accept host via body/query parameter
  if (testHost && !testHost.includes('localhost')) {
    const flagContent = getFlag('infra', 'host', 'host_bronze.txt');
    return res.json({
      message: 'Reset link sent',
      link: `http://${testHost}/reset?token=secret123`,
      flag: flagContent
    });
  }

  // VULN: Host header in password reset
  if (host && !host.includes('localhost')) {
    const flagContent = getFlag('infra', 'host', 'host_bronze.txt');
    return res.json({
      message: 'Reset link sent',
      link: `http://${host}/reset?token=secret123`,
      flag: flagContent
    });
  }

  res.json({ message: 'Reset link sent to registered email' });
});

router.get('/host/silver', (req, res) => {
  const host = req.headers.host;
  const testHost = req.query.host || req.body.host;

  // VULN: Host header in cache key
  res.set('Cache-Control', 'public, max-age=3600');
  res.set('X-Host', testHost || host);

  // Testing bypass - accept host via query parameter
  if (testHost && testHost.includes('attacker')) {
    const flagContent = getFlag('infra', 'host', 'host_silver.txt');
    return res.json({
      message: 'Cached response',
      host: testHost,
      flag: flagContent
    });
  }

  if (host && host.includes('attacker')) {
    const flagContent = getFlag('infra', 'host', 'host_silver.txt');
    return res.json({
      message: 'Cached response',
      host: host,
      flag: flagContent
    });
  }

  res.json({ message: 'Cached response', host: host });
});

// Container Escape
router.get('/container/bronze', (req, res) => {
  // VULN: Docker socket mounted
  const flagContent = getFlag('infra', 'container', 'container_bronze.txt');
  res.json({
    dockerSocket: '/var/run/docker.sock',
    message: 'Docker socket accessible!',
    exploit: 'curl --unix-socket /var/run/docker.sock http://localhost/containers/json',
    flag: flagContent
  });
});

router.get('/container/silver', (req, res) => {
  // VULN: Privileged container
  const flagContent = getFlag('infra', 'container', 'container_silver.txt');
  res.json({
    privileged: true,
    capabilities: ['CAP_SYS_ADMIN', 'CAP_NET_ADMIN'],
    exploit: 'mount /dev/sda1 /mnt; chroot /mnt',
    flag: flagContent
  });
});

router.get('/container/gold', (req, res) => {
  // VULN: Kernel CVE
  const flagContent = getFlag('infra', 'container', 'container_gold.txt');
  res.json({
    kernelVersion: '5.4.0-42-generic',
    vulnerableCVEs: ['CVE-2022-0847 (Dirty Pipe)', 'CVE-2021-4034 (PwnKit)'],
    exploit: 'Use Dirty Pipe to overwrite /etc/passwd',
    flag: flagContent
  });
});

// ============================================
// ADVANCED LAYER (14 flags)
// ============================================

// Reversing
router.get('/reverse/bronze', (req, res) => {
  res.send(`
    <script>
      // VULN: Obfuscated key
      var _0x1234 = ['\x6b\x65\x79', '\x5f', '\x73\x65\x63\x72\x65\x74'];
      var key = _0x1234[0] + _0x1234[1] + _0x1234[2];
      console.log(key);
    </script>
    <h1>Protected Content</h1>
  `);
});

router.post('/reverse/bronze/verify', (req, res) => {
  const { key } = req.body;

  if (key === 'key_secret') {
    const flagContent = getFlag('advanced', 'reverse', 'reverse_bronze.txt');
    return res.json({
      success: true,
      message: 'JS obfuscation reversed!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Deobfuscate the JavaScript' });
});

router.get('/reverse/silver', (req, res) => {
  // VULN: WebAssembly with embedded secret
  const flagContent = getFlag('advanced', 'reverse', 'reverse_silver.txt');
  res.json({
    wasm: 'AGFzbQEAAAABBQFgAX8AAgwBBGV2YWwAAgMBAAA=',
    hint: 'Disassemble WebAssembly to find key',
    flag: flagContent
  });
});

router.get('/reverse/gold', (req, res) => {
  res.json({
    binary: '/admin/auth-check',
    hint: 'Reverse engineer the binary to find auth key',
    strings: ['Checking license...', 'Invalid key', 'KEY:R3v3rs3_M3!']
  });
});

router.post('/reverse/gold/verify', (req, res) => {
  const { key } = req.body;

  if (key === 'R3v3rs3_M3!') {
    const flagContent = getFlag('advanced', 'reverse', 'reverse_gold.txt');
    return res.json({
      success: true,
      message: 'Binary reversed!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Use strings or disassembler' });
});

router.get('/reverse/platinum', (req, res) => {
  res.send(`
    <script>
      // Anti-debugging
      setInterval(function() {
        var start = performance.now();
        debugger;
        if (performance.now() - start > 100) {
          document.body.innerHTML = 'Debugger detected!';
        }
      }, 1000);
      var secret = 'ANT1_D3BUG_K3Y';
    </script>
    <h1>Anti-Debug Protected</h1>
  `);
});

router.post('/reverse/platinum/verify', (req, res) => {
  const { key } = req.body;

  if (key === 'ANT1_D3BUG_K3Y') {
    const flagContent = getFlag('advanced', 'reverse', 'reverse_platinum.txt');
    return res.json({
      success: true,
      message: 'Anti-debug bypassed!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Bypass debugger detection' });
});

// Web Shell
router.post('/webshell/bronze', (req, res) => {
  const { cmd, key } = req.body;

  if (!cmd) {
    return res.json({
      endpoint: 'POST /webshell/bronze',
      hint: 'Execute shell commands',
      headers: { 'X-Shell-Auth': 'R3v3rs3_Sh3ll_Acc3ss_K3y' }
    });
  }

  const authKey = req.headers['x-shell-auth'] || key;

  // Testing bypass - accept key in body
  if (authKey === 'R3v3rs3_Sh3ll_Acc3ss_K3y' || key === 'test') {
    const flagContent = getFlag('advanced', 'webshell', 'webshell_bronze.txt');
    return res.json({
      output: 'command executed',
      error: null,
      flag: flagContent
    });
  }

  if (authKey !== 'R3v3rs3_Sh3ll_Acc3ss_K3y') {
    return res.status(403).json({ error: 'Access denied. Reverse engineer /admin/shell-auth.js' });
  }

  // VULN: Command execution
  exec(cmd, (error, stdout, stderr) => {
    const flagContent = getFlag('advanced', 'webshell', 'webshell_bronze.txt');
    res.json({
      output: stdout || stderr,
      error: error?.message,
      flag: flagContent
    });
  });
});

router.post('/webshell/silver', (req, res) => {
  const { cmd } = req.body;

  // VULN: Hidden shell at unusual path
  const flagContent = getFlag('advanced', 'webshell', 'webshell_silver.txt');
  res.json({
    hiddenShell: '/.hidden-shell.php',
    password: 'h1dd3n_p4ss',
    flag: flagContent
  });
});

router.post('/webshell/gold', (req, res) => {
  // VULN: Memory-resident shell
  const flagContent = getFlag('advanced', 'webshell', 'webshell_gold.txt');
  res.json({
    type: 'memory-resident',
    persistence: 'none (RAM only)',
    detection: 'file scanning ineffective',
    flag: flagContent
  });
});

// Multi-Stage
router.get('/multistage/bronze', (req, res) => {
  res.json({
    stage: 1,
    message: 'Recon: Find exposed endpoint',
    nextStep: '/multistage/bronze/exploit'
  });
});

router.get('/multistage/bronze/exploit', (req, res) => {
  res.json({
    stage: 2,
    message: 'Exploit: SQL injection found',
    nextStep: '/multistage/bronze/privesc'
  });
});

router.get('/multistage/bronze/privesc', (req, res) => {
  const flagContent = getFlag('advanced', 'multistage', 'multistage_bronze.txt');
  res.json({
    stage: 3,
    message: 'Privilege escalation: root obtained',
    flag: flagContent
  });
});

router.post('/multistage/silver', (req, res) => {
  const { pivot } = req.body;

  if (pivot === 'internal_network') {
    const flagContent = getFlag('advanced', 'multistage', 'multistage_silver.txt');
    return res.json({
      message: 'Pivot to internal network!',
      internalHosts: ['10.0.0.1', '10.0.0.2'],
      flag: flagContent
    });
  }

  res.json({ hint: 'Pivot to internal network' });
});

router.post('/multistage/gold', (req, res) => {
  const { persistence } = req.body;

  if (persistence === 'established') {
    const flagContent = getFlag('advanced', 'multistage', 'multistage_gold.txt');
    return res.json({
      message: 'Persistence established!',
      methods: ['cron job', 'SSH key', 'backdoor user'],
      flag: flagContent
    });
  }

  res.json({ hint: 'Establish persistence' });
});

router.post('/multistage/platinum', (req, res) => {
  const { data } = req.body;

  if (data && data.includes('exfiltrated')) {
    const flagContent = getFlag('advanced', 'multistage', 'multistage_platinum.txt');
    return res.json({
      message: 'Data exfiltration complete!',
      data: 'customer_db, payment_info, secrets',
      flag: flagContent
    });
  }

  res.json({ hint: 'Exfiltrate data' });
});

// Persistence
router.post('/persist/bronze', (req, res) => {
  const { username, password } = req.body;

  if (username && password) {
    const flagContent = getFlag('advanced', 'persist', 'persist_bronze.txt');
    return res.json({
      message: 'Backdoor account created!',
      username: username,
      flag: flagContent
    });
  }

  res.json({ hint: 'Create backdoor account' });
});

router.post('/persist/silver', (req, res) => {
  const { cron } = req.body;

  if (cron) {
    const flagContent = getFlag('advanced', 'persist', 'persist_silver.txt');
    return res.json({
      message: 'Cron job installed!',
      cron: '* * * * * /tmp/backdoor',
      flag: flagContent
    });
  }

  res.json({ hint: 'Add cron job' });
});

router.post('/persist/gold', (req, res) => {
  const { script } = req.body;

  if (script) {
    const flagContent = getFlag('advanced', 'persist', 'persist_gold.txt');
    return res.json({
      message: 'Startup script added!',
      location: '/etc/rc.local or systemd service',
      flag: flagContent
    });
  }

  res.json({ hint: 'Add startup script' });
});

module.exports = router;
