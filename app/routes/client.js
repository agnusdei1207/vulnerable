/**
 * Client-Side Layer Routes
 * 12 flags across 4 client-side types
 *
 * WARNING: This code is INTENTIONALLY VULNERABLE for CTF purposes
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const FLAGS_DIR = path.join(__dirname, '..', 'flags', 'client');

const getFlag = (subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// XSS (5 tiers)
// ============================================

// Bronze: Reflected XSS
router.get('/xss/bronze', (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.json({
      endpoint: '/xss/bronze',
      hint: 'Try: ?q=<script>alert(1)</script>'
    });
  }

  // VULN: Direct reflection
  if (q.includes('<script>') || q.includes('onerror=')) {
    const flagContent = getFlag('xss', 'xss_bronze.txt');
    return res.send(`
      <h1>Search Results</h1>
      <p>You searched for: ${q}</p>
      <p style="color:green"><strong>${flagContent}</strong></p>
    `);
  }

  res.send(`<h1>Search Results</h1><p>You searched for: ${q}</p>`);
});

// Silver: Stored XSS
router.post('/xss/silver', (req, res) => {
  const { comment } = req.body;

  if (!comment) {
    return res.json({
      endpoint: 'POST /xss/silver',
      hint: 'Store XSS payload, view on GET /xss/silver'
    });
  }

  // VULN: Stored without sanitization
  global.storedComments = global.storedComments || [];
  global.storedComments.push(comment);

  if (comment.includes('<script>') || comment.includes('<img onerror=')) {
    const flagContent = getFlag('xss', 'xss_silver.txt');
    return res.json({
      success: true,
      message: 'Stored XSS payload saved!',
      stored: comment,
      flag: flagContent
    });
  }

  res.json({ success: true, message: 'Comment stored' });
});

router.get('/xss/silver', (req, res) => {
  const comments = global.storedComments || [];
  res.send(`
    <h1>Comments</h1>
    ${comments.map(c => `<div>${c}</div>`).join('')}
  `);
});

// Gold: DOM XSS
router.get('/xss/gold', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>DOM XSS</title></head>
    <body>
      <h1>Welcome</h1>
      <div id="output"></div>
      <script>
        // VULN: Direct innerHTML from hash
        document.getElementById('output').innerHTML = decodeURIComponent(location.hash.slice(1));
      </script>
      <p>Try: #<img src=x onerror=alert(1)></p>
    </body>
    </html>
  `);
});

router.get('/xss/gold/check', (req, res) => {
  const { payload } = req.query;

  if (payload && payload.includes('onerror')) {
    const flagContent = getFlag('xss', 'xss_gold.txt');
    return res.json({
      success: true,
      message: 'DOM XSS achieved!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Access /xss/gold#payload and check' });
});

// Platinum: Mutation XSS
router.get('/xss/platinum', (req, res) => {
  const { html } = req.query;

  if (!html) {
    return res.json({
      endpoint: '/xss/platinum',
      hint: 'Mutation XSS via HTML parsing quirks',
      example: '?html=<noscript><p title="</noscript><img src=x onerror=alert(1)>">'
    });
  }

  // VULN: HTML mutation via parser differences
  if (html.includes('<noscript>') && html.includes('<img')) {
    const flagContent = getFlag('xss', 'xss_platinum.txt');
    return res.send(`
      <div>${html}</div>
      <p>Mutation XSS triggered!</p>
      <pre>${flagContent}</pre>
    `);
  }

  res.send(`<div>${html}</div>`);
});

// Diamond: CSP Bypass
router.get('/xss/diamond', (req, res) => {
  const { callback } = req.query;

  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://trusted.cdn.com");

  if (!callback) {
    return res.send(`
      <h1>Secure Page</h1>
      <p>CSP enabled. Find a bypass.</p>
      <p>Hint: JSONP endpoint at /xss/diamond/jsonp?callback=</p>
      <script src="/xss/diamond/jsonp?callback=init"></script>
    `);
  }

  // VULN: JSONP callback allows XSS
  if (callback.includes('alert') || callback.includes('fetch')) {
    const flagContent = getFlag('xss', 'xss_diamond.txt');
    return res.send(`${callback}({ data: "${flagContent}" })`);
  }

  res.send(`${callback}({ status: "ok" })`);
});

router.get('/xss/diamond/jsonp', (req, res) => {
  const { callback } = req.query;
  res.type('application/javascript').send(`${callback || 'callback'}({ status: "ok" })`);
});

// ============================================
// CSRF (3 tiers)
// ============================================

router.post('/csrf/bronze', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({
      endpoint: 'POST /csrf/bronze',
      hint: 'No CSRF token validation',
      example: '{ "email": "victim@attacker.com" }'
    });
  }

  const flagContent = getFlag('csrf', 'csrf_bronze.txt');
  return res.json({
    success: true,
    message: 'Email changed via CSRF!',
    newEmail: email,
    flag: flagContent
  });
});

router.post('/csrf/silver', express.json(), (req, res) => {
  const { action } = req.body;

  if (!action) {
    return res.json({
      endpoint: 'POST /csrf/silver',
      hint: 'JSON endpoint, check Content-Type handling'
    });
  }

  if (action === 'delete-account') {
    const flagContent = getFlag('csrf', 'csrf_silver.txt');
    return res.json({
      success: true,
      message: 'Account deleted via JSON CSRF!',
      flag: flagContent
    });
  }

  res.json({ action: action });
});

router.post('/csrf/gold', (req, res) => {
  const { redirect, action } = req.body;

  if (!action) {
    return res.json({
      endpoint: 'POST /csrf/gold',
      hint: 'SameSite=Lax, bypass via redirect'
    });
  }

  if (action === 'transfer' && redirect) {
    const flagContent = getFlag('csrf', 'csrf_gold.txt');
    return res.json({
      success: true,
      message: 'CSRF via SameSite bypass!',
      redirect: redirect,
      flag: flagContent
    });
  }

  res.json({ message: 'Action processed' });
});

// ============================================
// CLICKJACKING (2 tiers)
// ============================================

router.get('/clickjack/bronze', (req, res) => {
  res.send(`
    <html>
    <head><title>Clickjack Test</title></head>
    <body>
      <h1>Admin Action</h1>
      <button onclick="alert('Admin action performed!')">Delete All Users</button>
    </body>
    </html>
  `);
});

router.post('/clickjack/bronze/verify', (req, res) => {
  const flagContent = getFlag('clickjack', 'clickjack_bronze.txt');
  res.json({
    success: true,
    message: 'Clickjacking attack verified!',
    flag: flagContent
  });
});

router.get('/clickjack/silver', (req, res) => {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM https://trusted.com');
  res.send(`
    <html>
    <head><title>Protected Page</title></head>
    <body>
      <h1>Protected Admin</h1>
      <button onclick="alert('Admin action!')">Transfer Funds</button>
    </body>
    </html>
  `);
});

router.post('/clickjack/silver/verify', (req, res) => {
  const { bypass } = req.body;

  if (bypass === 'iframe-attribute' || bypass === 'svg-foreignObject') {
    const flagContent = getFlag('clickjack', 'clickjack_silver.txt');
    return res.json({
      success: true,
      message: 'X-Frame-Options bypassed!',
      method: bypass,
      flag: flagContent
    });
  }

  res.json({ hint: 'Try iframe attribute or SVG techniques' });
});

// ============================================
// POSTMESSAGE ABUSE (2 tiers)
// ============================================

router.get('/postmsg/bronze', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>PostMessage Demo</title></head>
    <body>
      <h1>Secure Frame</h1>
      <div id="data">Loading...</div>
      <script>
        window.addEventListener('message', function(e) {
          document.getElementById('data').innerHTML = e.data;
        });
      </script>
    </body>
    </html>
  `);
});

router.post('/postmsg/bronze/verify', (req, res) => {
  const { payload } = req.body;

  if (payload && payload.includes('<img')) {
    const flagContent = getFlag('postmsg', 'postmsg_bronze.txt');
    return res.json({
      success: true,
      message: 'PostMessage XSS achieved!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Send malicious message to frame' });
});

router.get('/postmsg/silver', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>PostMessage Exfil</title></head>
    <body>
      <h1>User Data</h1>
      <script>
        window.addEventListener('message', function(e) {
          if (e.data === 'getUserData') {
            e.source.postMessage({
              token: 'secret_admin_token_12345',
              email: 'admin@example.com'
            }, '*');
          }
        });
      </script>
    </body>
    </html>
  `);
});

router.post('/postmsg/silver/verify', (req, res) => {
  const { capturedToken } = req.body;

  if (capturedToken === 'secret_admin_token_12345') {
    const flagContent = getFlag('postmsg', 'postmsg_silver.txt');
    return res.json({
      success: true,
      message: 'Data exfiltrated via PostMessage!',
      flag: flagContent
    });
  }

  res.json({ hint: 'Embed frame and request user data' });
});

module.exports = router;
