const fs = require('fs');
const path = require('path');

const CHALLENGE_ROOT = '/tmp/rndsecurity-isolated';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createContext(mode) {
  const slug = mode.replace(/^\//, '').replace(/\//g, '-');
  const challengeDir = path.join(CHALLENGE_ROOT, slug);
  fs.mkdirSync(challengeDir, { recursive: true, mode: 0o700 });
  return {
    mode,
    slug,
    title: mode.replace('/silver', '').replace('/', '').toUpperCase() + ' Challenge',
    artifactPath(name) { return path.join(challengeDir, name); },
    issueFlag(res, evidence) {
      const flag = process.env.FLAG || `FLAG{${slug.toUpperCase().replace(/-/g, '_')}_LOCAL}`;
      fs.writeFileSync(this.artifactPath('flag.txt'), `${flag}\n`, { mode: 0o600 });
      res.json({ success: true, challenge: mode, flag, evidence });
    }
  };
}

function sendPage(res, ctx, bodyHtml, scenarioText) {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(ctx.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
    :root { --bg: #0f172a; --panel: #1e293b; --text: #e2e8f0; --primary: #3b82f6; --primary-hover: #2563eb; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; }
    .container { width: 100%; max-width: 600px; }
    .card { background: var(--panel); border-radius: 12px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #334155; padding-bottom: 15px; color: #f8fafc; font-size: 1.5rem; }
    .scenario { background: rgba(59,130,246,0.1); border-left: 4px solid var(--primary); padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; color: #94a3b8; font-size: 0.95rem; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 600; color: #cbd5e1; font-size: 0.9rem; }
    input, select, textarea { width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 1rem; }
    input:focus { outline: none; border-color: var(--primary); }
    button { background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; transition: 0.2s; font-size: 1rem; }
    button:hover { background: var(--primary-hover); }
    .result { margin-top: 20px; padding: 15px; background: #020617; border: 1px solid #334155; border-radius: 6px; overflow-x: auto; font-family: monospace; color: #10b981; }
    .error { color: #f43f5e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>🎯 ${escapeHtml(ctx.title)}</h1>
      ${scenarioText ? `<div class="scenario"><strong>Scenario:</strong><br>${scenarioText}</div>` : ''}
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`);
}

function createStore() { return { comments: [], uses: 0, attempts: 0 }; }

// 1. SQLi
function registerSqli(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const id = req.query.id;
    const scenario = "Our company blog allows reading posts by their numeric ID. The database contains other hidden tables with flags.";
    const form = `<form method="GET"><div class="form-group"><label>Article ID</label><input type="text" name="id" value="${escapeHtml(id || '1')}"></div><button type="submit">Read Article</button></form>`;
    
    if (!id) return sendPage(res, ctx, form, scenario);
    
    const sqCount = (id.match(/'/g) || []).length;
    if (sqCount % 2 !== 0 && !id.match(/--|#/)) {
      return sendPage(res, ctx, form + `<div class="result error">Database Error: You have an error in your SQL syntax near '${escapeHtml(id)}'</div>`, scenario);
    }
    
    if (id.toLowerCase().includes("union") && id.toLowerCase().includes("select") && id.toLowerCase().includes("flag")) {
      return ctx.issueFlag(res, { vector: 'sqli', id });
    }
    
    if (id === "1" || id.includes("1=1")) return sendPage(res, ctx, form + `<div class="result"><h3>Article 1: Security Notice</h3><p>Welcome to our secure blog platform.</p></div>`, scenario);
    sendPage(res, ctx, form + `<div class="result error">Article not found.</div>`, scenario);
  });
}

// 2. NoSQLi
function registerNosqli(app, ctx) {
  const scenario = "Internal admin portal. The backend uses MongoDB. We strictly validate that a password is provided, but maybe there's a bypass.";
  app.post(ctx.mode, (req, res) => {
    const body = req.body || {};
    if (body.username && typeof body.username === 'object' && body.username.$ne !== undefined) {
      return ctx.issueFlag(res, { vector: 'nosqli', body });
    }
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Username</label><input type="text" name="username"></div><div class="form-group"><label>Password</label><input type="password" name="password"></div><button type="submit">Login</button></form><div class="result error">Invalid Credentials. (Hint: Form submittions are URL-encoded. You might need to send a JSON payload manually via Burp/CURL)</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Username</label><input type="text" name="username"></div><div class="form-group"><label>Password</label><input type="password" name="password"></div><button type="submit">Login</button></form>`, scenario);
  });
}

// 3. CMDi
function registerCmdi(app, ctx) {
  const scenario = "Server Diagnostics Tool. Enter an IP address to verify server connectivity over ICMP.";
  app.get(ctx.mode, (req, res) => {
    const ip = req.query.ip;
    const form = `<form method="GET"><div class="form-group"><label>Target IP</label><input type="text" name="ip" value="${escapeHtml(ip||'')}"></div><button type="submit">Run Ping</button></form>`;
    if (!ip) return sendPage(res, ctx, form, scenario);
    let out = `PING ${ip} (56 data bytes)\n64 bytes from ${ip.split(/[;|&]/)[0].trim()}: icmp_seq=1 ttl=64 time=0.034 ms`;
    
    if (/[;|&]/.test(ip)) {
      const injected = ip.split(/[;|&]/)[1].trim();
      if (injected.startsWith('ls')) out += `\n\n[STDOUT]\nindex.js\npackage.json\nsecret_flag.txt\n`;
      else if (injected.includes('cat ') && injected.includes('secret_flag')) return ctx.issueFlag(res, { vector: 'cmdi', ip });
      else out += `\n\n[STDERR]\nsh: 1: ${injected.split(' ')[0]}: not found\n`;
    }
    sendPage(res, ctx, form + `<div class="result">${escapeHtml(out)}</div>`, scenario);
  });
}

// 4. LDAP
function registerLdap(app, ctx) {
  const scenario = "Corporate Active Directory Search. You can search for staff by their exact username.";
  app.get(ctx.mode, (req, res) => {
    const u = req.query.user;
    const form = `<form method="GET"><div class="form-group"><label>Staff Username</label><input type="text" name="user"></div><button type="submit">Search</button></form>`;
    if (!u) return sendPage(res, ctx, form, scenario);
    if (u === "*") return ctx.issueFlag(res, { vector: 'ldap', u });
    if (u.includes(")(")) return ctx.issueFlag(res, { vector: 'ldap-injection', u });
    sendPage(res, ctx, form + `<div class="result error">No records found for '(uid=${escapeHtml(u)})'</div>`, scenario);
  });
}

// 5. SSTI
function registerSsti(app, ctx) {
  const scenario = "We process dynamic email templates. Provide your name so we can render your personalized greeting.";
  app.get(ctx.mode, (req, res) => {
    const tpl = req.query.name;
    const form = `<form method="GET"><div class="form-group"><label>Your Name</label><input type="text" name="name" value="${escapeHtml(tpl||'')}"></div><button type="submit">Generate Greeting</button></form>`;
    if (!tpl) return sendPage(res, ctx, form, scenario);
    let output = escapeHtml(tpl);
    if (tpl === '${7*7}' || tpl === '{{7*7}}') output = '49';
    if (tpl.includes('process.mainModule') || tpl.includes('child_process')) return ctx.issueFlag(res, { vector: 'ssti', tpl });
    sendPage(res, ctx, form + `<div class="result">Hello, ${output}!</div>`, scenario);
  });
}

// 6. Brute
function registerBrute(app, ctx) {
  const scenario = "Admin terminal interface. The PIN code is exactly 4 digits. Let's hope someone doesn't try all 10,000 combinations.";
  app.post(ctx.mode, (req, res) => {
    const { user, pin } = req.body;
    if (user === 'admin' && pin === '7492') return ctx.issueFlag(res, { vector: 'brute', pin });
    const form = `<form method="POST"><div class="form-group"><label>Username</label><input type="text" name="user" value="admin"></div><div class="form-group"><label>4-Digit PIN</label><input type="text" name="pin" maxlength="4"></div><button type="submit">Authenticate</button></form>`;
    res.status(401);
    sendPage(res, ctx, form + `<div class="result error">Authentication failed for user ${escapeHtml(user)}. Incorrect PIN.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Username</label><input type="text" name="user" value="admin"></div><div class="form-group"><label>4-Digit PIN</label><input type="text" name="pin" maxlength="4"></div><button type="submit">Authenticate</button></form>`, scenario);
  });
}

// 7. JWT
function registerJwt(app, ctx) {
  const scenario = "API Dashboard. Identity is verified via JWT tokens. Try manipulating the JWT payload to become an admin.";
  app.get(ctx.mode, (req, res) => {
    const token = req.query.token;
    const dummy = Buffer.from('{"alg":"HS256"}').toString('base64') + '.' + Buffer.from('{"user":"guest","admin":false}').toString('base64') + '.sig';
    const form = `<form method="GET"><div class="form-group"><label>JWT Token</label><textarea name="token" rows="3">${escapeHtml(token || dummy)}</textarea></div><button type="submit">Check Identity</button></form>`;
    
    if (!token) return sendPage(res, ctx, form, scenario);
    try {
      const parts = token.split('.');
      const payloadStr = Buffer.from(parts[1], 'base64').toString();
      const payload = JSON.parse(payloadStr);
      if (payload.admin === true || payload.admin === "true") return ctx.issueFlag(res, { vector: 'jwt-forge', token });
      sendPage(res, ctx, form + `<div class="result">Identity verified.<br>Role: ${payload.admin ? 'Admin' : 'Guest'}</div>`, scenario);
    } catch(e) { 
      sendPage(res, ctx, form + `<div class="result error">Malformed JWT token!</div>`, scenario); 
    }
  });
}

// 8. MFA
function registerMfa(app, ctx, store) {
  const scenario = "MFA Step 2. A code was sent to the user's phone. To prevent brute force, IPs are blocked after 3 failed attempts.";
  app.post(ctx.mode, (req, res) => {
    store.attempts++;
    const form = `<form method="POST"><div class="form-group"><label>SMS Code (4-digits)</label><input type="text" name="code"></div><button type="submit">Verify</button></form>`;
    
    if (store.attempts > 3 && !req.headers['x-forwarded-for']) {
      return res.status(429).sendPage ? sendPage(res, ctx, form + `<div class="result error">Too Many Attempts. IP Address Logged.</div>`, scenario) : res.status(429).send("Too Many Initial Attempts Blocked.");
    }
    // Rate limit bypass accepted if x-forwarded-for is supplied
    if (req.body.code === '0000') return ctx.issueFlag(res, { vector: 'mfa-bypass' });
    sendPage(res, ctx, form + `<div class="result error">Invalid SMS Code. Attempt ${store.attempts}/3</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    store.attempts = 0; // reset for ease of manual testing
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>SMS Code (4-digits)</label><input type="text" name="code"></div><button type="submit">Verify</button></form>`, scenario);
  });
}

// 9. OAuth
function registerOauth(app, ctx) {
  const scenario = "OAuth 2.0 Authorization Endpoint. Ensure the <code>redirect_uri</code> handles the callback securely.";
  app.get(ctx.mode, (req, res) => {
    const redirect = req.query.redirect_uri;
    const form = `<form method="GET"><div class="form-group"><label>Redirect URI</label><input type="text" name="redirect_uri" value="${escapeHtml(redirect || 'https://trusted.com/callback')}"></div><div class="form-group"><label>State</label><input type="text" name="state" value="123xyz"></div><button type="submit">Authorize Application</button></form>`;
    if (!redirect) return sendPage(res, ctx, form, scenario);
    if (redirect && !redirect.startsWith('https://trusted.com')) {
       return ctx.issueFlag(res, { vector: 'oauth-open-redirect', redirect });
    }
    sendPage(res, ctx, form + `<div class="result">Authorization granted. Redirecting to:<br>${escapeHtml(redirect)}...</div>`, scenario);
  });
}

// 10. Admin
function registerAdmin(app, ctx) {
  const scenario = "Admin restricted portal. Your role is determined by the session cookies provided by the browser.";
  app.get(ctx.mode, (req, res) => {
    const cookie = req.headers.cookie || '';
    if (!cookie.includes('role=admin')) {
      res.cookie('role', 'guest');
      return sendPage(res, ctx, `<div class="result error">Access Denied: 403 Forbidden. Current Role: guest</div>`, scenario);
    }
    ctx.issueFlag(res, { vector: 'admin-cookie-bypass' });
  });
}

// 11. IDOR
function registerIdor(app, ctx) {
  const scenario = "User Profile Page. Users can fetch their own public configuration via their User ID. Normal users have IDs > 100.";
  app.get(ctx.mode, (req, res) => {
    const uid = req.query.uid || '101';
    const form = `<form method="GET"><div class="form-group"><label>Profile User ID</label><input type="text" name="uid" value="${escapeHtml(uid)}"></div><button type="submit">Load Profile</button></form>`;
    if (uid === '1') return ctx.issueFlag(res, { vector: 'idor', uid });
    sendPage(res, ctx, form + `<div class="result">Profile Data loaded for User ${escapeHtml(uid)}.<br><br>{<br>  "role": "standard_user",<br>  "visibility": "public"<br>}</div>`, scenario);
  });
}

// 12. PrivEsc
function registerPrivesc(app, ctx) {
  const scenario = "Sysadmin Helper App. Allows running non-privileged utilities.";
  app.get(ctx.mode, (req, res) => {
    const bin = req.query.bin || 'whoami';
    const form = `<form method="GET"><div class="form-group"><label>Command Utility</label><input type="text" name="bin" value="${escapeHtml(bin)}"></div><button type="submit">Execute</button></form>`;
    
    if (bin === 'sudo -l') {
        return sendPage(res, ctx, form + `<div class="result">User www-data may run the following commands on this host:<br>(root) NOPASSWD: /usr/bin/find</div>`, scenario);
    }
    if (bin.includes('find') && bin.includes('-exec')) return ctx.issueFlag(res, { vector: 'privesc-suid', bin });
    sendPage(res, ctx, form + `<div class="result">$ ${escapeHtml(bin)}<br>www-data</div>`, scenario);
  });
}

// 13. RBAC
function registerRbac(app, ctx) {
  const scenario = "Role Based Access Control Manager. Employees can view their permissions.";
  app.post(ctx.mode, (req, res) => {
    const { role, action } = req.body;
    if (role === 'admin' && action === 'grant') return ctx.issueFlag(res, { vector: 'rbac-logic' });
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Role</label><input type="text" name="role" value="user" readonly></div><div class="form-group"><label>Action</label><input type="text" name="action" value="view" readonly></div><button type="submit">Submit Request</button></form><div class="result error">Access Denied: Standard users cannot grant roles.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Role</label><input type="text" name="role" value="user" readonly></div><div class="form-group"><label>Action</label><input type="text" name="action" value="view" readonly></div><button type="submit">Submit Request</button></form>`, scenario);
  });
}

// 14. XSS
function registerXss(app, ctx) {
  const scenario = "Community search functionality. What you type is immediately reflected back in your results snippet.";
  app.get(ctx.mode, (req, res) => {
    const msg = req.query.q || '';
    const form = `<form method="GET"><div class="form-group"><label>Search Query</label><input type="text" name="q" value="${escapeHtml(msg)}"></div><button type="submit">Search</button></form>`;
    if (msg.includes('<script>') || msg.includes('onerror=')) {
      return ctx.issueFlag(res, { vector: 'xss', msg });
    }
    if (!msg) return sendPage(res, ctx, form, scenario);
    sendPage(res, ctx, form + `<div class="result">Showing 0 results for: <strong>${msg}</strong></div>`, scenario);
  });
}

// 15. CSRF
function registerCsrf(app, ctx) {
  const scenario = "Banking Application Funds Transfer. The endpoint requires a strict CSRF token validation... or does it?";
  app.post(ctx.mode, (req, res) => {
    if (req.body.action === 'transfer' && !req.body.csrf_token) {
       return ctx.issueFlag(res, { vector: 'csrf', body: req.body });
    }
    sendPage(res, ctx, `<form method="POST"><input type="hidden" name="action" value="transfer"><div class="form-group"><label>Destination Account</label><input type="text" name="acc" value="999-99-9999"></div><div class="form-group"><label>CSRF Token</label><input type="text" name="csrf_token" value="invalid_token_123"></div><button type="submit">Transfer Funds</button></form><div class="result error">Error: Invalid CSRF Token!</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><input type="hidden" name="action" value="transfer"><div class="form-group"><label>Destination Account</label><input type="text" name="acc" value="999-99-9999"></div><div class="form-group"><label>CSRF Token</label><input type="text" name="csrf_token" value="sys_token_abc"></div><button type="submit">Transfer Funds</button></form>`, scenario);
  });
}

// 16. Clickjack
function registerClickjack(app, ctx) {
  const scenario = "Sensitive action page. It should not be possible to embed this page in an iframe on attacker.com.";
  app.get(ctx.mode, (req, res) => {
    res.removeHeader('X-Frame-Options');
    if (req.query.framed === 'true') return ctx.issueFlag(res, { vector: 'clickjack' });
    sendPage(res, ctx, `<div class="result" style="text-align:center; padding: 40px; background: #ef4444; color:white; font-weight:bold;">DELETE ACCOUNT</div><p>Simulate framing by adding <code>?framed=true</code></p>`, scenario);
  });
}

// 17. PostMsg
function registerPostmsg(app, ctx) {
  const scenario = "HTML5 postMessage receiver. Our frontend waits for messages from authorized origins only.";
  app.post(ctx.mode, (req, res) => {
    if (req.body.origin === '*' && req.body.data) return ctx.issueFlag(res, { vector: 'postmessage-vuln' });
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Window Receiver Code</label><textarea rows="3" readonly>window.addEventListener("message", receiveMessage, false);</textarea></div><div class="form-group"><label>Simulate Origin</label><input type="text" name="origin" value="https://app.com"></div><div class="form-group"><label>Data</label><input type="text" name="data" value='{"action":"exec"}'></div><button type="submit">Dispatch Message Event</button></form><div class="result error">Origin not allowed.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Window Receiver Code</label><textarea rows="3" readonly>window.addEventListener("message", receiveMessage, false);</textarea></div><div class="form-group"><label>Simulate Origin</label><input type="text" name="origin" value="https://app.com"></div><div class="form-group"><label>Data</label><input type="text" name="data" value='{"action":"exec"}'></div><button type="submit">Dispatch Message Event</button></form>`, scenario);
  });
}

// 18. LFI
function registerLfi(app, ctx) {
  const scenario = "Dynamic PHP-style page inclusion system. Loads localized header templates.";
  app.get(ctx.mode, (req, res) => {
    const file = req.query.file;
    const form = `<form method="GET"><div class="form-group"><label>Template File</label><input type="text" name="file" value="${escapeHtml(file||'home.html')}"></div><button type="submit">Load Page</button></form>`;
    if (!file) return sendPage(res, ctx, form, scenario);
    if (file.includes('../') && file.includes('etc/passwd')) return ctx.issueFlag(res, { vector: 'lfi', file });
    if (file.includes('../')) return sendPage(res, ctx, form + `<div class="result error">Warning: require(/var/www/templates/${escapeHtml(file)}): failed to open stream: Permission denied</div>`, scenario);
    sendPage(res, ctx, form + `<div class="result">Successfully loaded ${escapeHtml(file)}!</div>`, scenario);
  });
}

// 19. Upload
function registerUpload(app, ctx, store, upload) {
  const scenario = "Profile Avatar Upload. We only accept PNG/JPG images.";
  app.post(ctx.mode, upload.single('file'), (req, res) => {
    const name = req.file?.originalname || req.body.filename || '';
    if (name.endsWith('.php') || name.endsWith('.jsp')) return ctx.issueFlag(res, { vector: 'upload', name });
    const form = `<form method="POST" enctype="multipart/form-data"><div class="form-group"><label>Select Image</label><input type="text" value="${escapeHtml(name)}" name="filename"></div><button type="submit">Upload Image</button></form>`;
    sendPage(res, ctx, form + `<div class="result">File <code>${escapeHtml(name)}</code> uploaded successfully. (Wait, was it actually an image?)</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST" enctype="multipart/form-data"><div class="form-group"><label>Simulated Original Filename</label><input type="text" name="filename" value="avatar.png"></div><button type="submit">Upload Image</button></form>`, scenario);
  });
}

// 20. XXE
function registerXxe(app, ctx) {
  const scenario = "Enterprise XML SOAP endpoint for B2B transactions. Processes external XML payloads.";
  app.post(ctx.mode, (req, res) => {
    const xml = req.body.xml || req.body || '';
    const xmlStr = typeof xml === 'string' ? xml : JSON.stringify(xml);
    const form = `<form method="POST"><div class="form-group"><label>XML Payload</label><textarea name="xml" rows="8">${escapeHtml(xmlStr)}</textarea></div><button type="submit">Parse XML</button></form>`;
    if (xmlStr.includes('<!ENTITY') && xmlStr.includes('SYSTEM')) return ctx.issueFlag(res, { vector: 'xxe', xml });
    if (xmlStr) return sendPage(res, ctx, form + `<div class="result">XML parsed successfully. 0 items imported.</div>`, scenario);
    sendPage(res, ctx, form, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>XML Payload</label><textarea name="xml" rows="8"><?xml version="1.0" encoding="ISO-8859-1"?><root><item>test</item></root></textarea></div><button type="submit">Parse XML</button></form>`, scenario);
  });
}

// 21. Deser
function registerDeser(app, ctx) {
  const scenario = "Session state is base64 encoded and passed via URL to scale across horizontally load-balanced servers.";
  app.get(ctx.mode, (req, res) => {
    const state = req.query.state;
    const form = `<form method="GET"><div class="form-group"><label>Base64 Serialized Session</label><input type="text" name="state" value="${escapeHtml(state||'dXNlcj1ndWVzdA==')}"></div><button type="submit">Restore Session</button></form>`;
    if (!state) return sendPage(res, ctx, form, scenario);
    try {
      const decodedStr = Buffer.from(state, 'base64').toString();
      if (decodedStr.includes('O:')) return ctx.issueFlag(res, { vector: 'deserialization' });
      sendPage(res, ctx, form + `<div class="result">Session Restored: ${escapeHtml(decodedStr)}</div>`, scenario);
    } catch(e) { sendPage(res, ctx, form + `<div class="result error">Fatal Deserialization Exception: Bad format</div>`, scenario); }
  });
}

// 22. SSRF
function registerSsrf(app, ctx) {
  const scenario = "Cloud based Webhook Tester. Provide a URL and our backend server will fetch it for you.";
  app.get(ctx.mode, (req, res) => {
    const url = req.query.url;
    const form = `<form method="GET"><div class="form-group"><label>Webhook URL</label><input type="text" name="url" value="${escapeHtml(url||'http://example.com')}"></div><button type="submit">Send Request</button></form>`;
    if (!url) return sendPage(res, ctx, form, scenario);
    if (url.includes('169.254.169.254') || url.includes('localhost')) return ctx.issueFlag(res, { vector: 'ssrf', url });
    sendPage(res, ctx, form + `<div class="result">[200 OK] Fetched ${escapeHtml(url)} successfully. Length: 1202 bytes.</div>`, scenario);
  });
}

// 23. Proto
function registerProto(app, ctx) {
  const scenario = "Config merging utility. It recursively merges JSON body objects into the default user configuration.";
  app.post(ctx.mode, (req, res) => {
    const obj = JSON.stringify(req.body || {});
    const form = `<form method="POST"><div class="form-group"><label>JSON Config Payload</label><textarea name="config" rows="5">${escapeHtml(obj)}</textarea></div><button type="submit">Merge Defaults</button></form>`;
    if (obj.includes('__proto__') && obj.includes('admin')) return ctx.issueFlag(res, { vector: 'prototype_pollution' });
    sendPage(res, ctx, form + `<div class="result">Merge operation complete. Current role: user.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>JSON Config Payload</label><textarea name="config" rows="5">{"theme": "dark", "language": "ko"}</textarea></div><button type="submit">Merge Defaults</button></form>`, scenario);
  });
}

// 24. Race
function registerRace(app, ctx, store) {
  const scenario = "Flash Sale! Claim a single-use $10 discount coupon before they run out. Note: Validation to claim process takes ~100ms.";
  app.post(ctx.mode, (req, res) => {
    store.uses++;
    const form = `<form method="POST"><button type="submit">Claim $10 Coupon</button></form>`;
    if (store.uses >= 3 || req.body.parallel === '2') return ctx.issueFlag(res, { vector: 'race_condition' });
    setTimeout(() => { store.uses = 0; }, 100);
    sendPage(res, ctx, form + `<div class="result">Processing... Coupon claimed 1 time.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><button type="submit">Claim $10 Coupon</button></form>`, scenario);
  });
}

// 25. Smuggle
function registerSmuggle(app, ctx) {
  const scenario = "The front-end WAF uses Content-Length, while the back-end uses Transfer-Encoding chunked mechanism. Typical HTTP Desync scenario.";
  app.post(ctx.mode, (req, res) => {
    const te = req.headers['transfer-encoding'];
    const cl = req.headers['content-length'];
    if (te && cl) return ctx.issueFlag(res, { vector: 'request_smuggling' });
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Raw HTTP Request (Simulation)</label><textarea rows="5">POST / HTTP/1.1\r\nHost: example.com\r\n\r\n</textarea></div><button type="submit">Send Malformed Request</button></form><div class="result error">400 Bad Request: Invalid headers</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Raw HTTP Request (Simulation)</label><textarea rows="5">POST / HTTP/1.1\r\nHost: example.com\r\nContent-Length: 5\r\ntransfer-encoding: chunked\r\n\r\n0\r\n\r\n</textarea></div><button type="submit">Send Malformed Request</button></form>`, scenario));
}

// 26. Logic
function registerLogic(app, ctx) {
  const scenario = "E-Commerce Checkout. The server calculates total via <code>qty * price</code>. Your balance is $100.";
  app.post(ctx.mode, (req, res) => {
    const qty = Number(req.body.qty || 1);
    const total = qty * 500;
    const form = `<form method="POST"><div class="form-group"><label>Premium Flag ($500) Quantity</label><input type="number" name="qty" value="${escapeHtml(qty)}"></div><button type="submit">Checkout</button></form>`;
    if (qty < 0) return ctx.issueFlag(res, { vector: 'logic_negative_qty' });
    sendPage(res, ctx, form + `<div class="result error">Insufficient funds! Total is $${total}, balance is $100.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Premium Flag ($500) Quantity</label><input type="number" name="qty" value="1"></div><button type="submit">Checkout</button></form>`, scenario));
}

// 27. Ratelimit
function registerRatelimit(app, ctx) {
  const scenario = "API throttling is set up to block excessive traffic from single IP addresses based on TCP layer information.";
  app.post(ctx.mode, (req, res) => {
    const form = `<form method="POST"><button type="submit">Trigger Sensitive API</button></form>`;
    if (req.headers['x-forwarded-for']) return ctx.issueFlag(res, { vector: 'ratelimit_bypass' });
    res.status(429);
    sendPage(res, ctx, form + `<div class="result error">HTTP 429 Too Many Requests. Try altering proxy forwarding headers.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><button type="submit">Trigger Sensitive API</button></form>`, scenario));
}

// 28. Payment
function registerPayment(app, ctx, store) {
  const scenario = "Payment API validates correct price parsing. Sometimes handling 0 or string values incorrectly leads to bypasses.";
  app.post(ctx.mode, (req, res) => {
    const priceStr = req.body.price;
    const form = `<form method="POST"><div class="form-group"><label>Price Override Parameter</label><input type="text" name="price" value="${escapeHtml(priceStr)}"></div><button type="submit">Execute Payment</button></form>`;
    if (priceStr === "0" || req.body.coupon === 'VIP90') return ctx.issueFlag(res, { vector: 'payment_tampering' });
    sendPage(res, ctx, form + `<div class="result error">Transaction Declined: Missing Payment Gateway Approval.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Price Override Parameter</label><input type="text" name="price" value="500"></div><button type="submit">Execute Payment</button></form>`, scenario));
}

// 29. Crypto
function registerCrypto(app, ctx) {
  const scenario = "Custom authentication token generator relies on pseudo-random entropy.";
  app.get(ctx.mode, (req, res) => {
    const seed = req.query.seed;
    const form = `<form method="GET"><div class="form-group"><label>PRNG Generator Seed</label><input type="text" name="seed" value="${escapeHtml(seed||'')}"></div><button type="submit">Decrypt Token</button></form>`;
    if (seed === 'weak-random') return ctx.issueFlag(res, { vector: 'crypto_weak_algorithm' });
    sendPage(res, ctx, form + `<div class="result">Token generated with robust 256-bit encryption.</div>`, scenario);
  });
}

// 30. InfoDisc
function registerInfoDisc(app, ctx) {
  const scenario = "Production servers must not leak stack traces or verbose debug parameters when errors occur.";
  app.get(ctx.mode, (req, res) => {
    const d = req.query.debug;
    const form = `<form method="GET"><div class="form-group"><label>Debug Mode</label><input type="text" name="debug" value="${escapeHtml(d||'false')}"></div><button type="submit">Load App</button></form>`;
    if (d === '1' || d === 'true') return ctx.issueFlag(res, { vector: 'information-disclosure' });
    sendPage(res, ctx, form + `<div class="result">App loaded normally.</div>`, scenario);
  });
}

// 31. Secret
function registerSecret(app, ctx) {
  const scenario = "There are leftover configuration files from the deployment process hidden in standard server directories.";
  app.get(ctx.mode, (req, res) => {
    const p = req.query.path;
    const form = `<form method="GET"><div class="form-group"><label>File Path</label><input type="text" name="path" value="${escapeHtml(p||'index.html')}"></div><button type="submit">View File</button></form>`;
    if (p === '.git/config' || req.path.includes('.git')) return ctx.issueFlag(res, { vector: 'secret-exposure' });
    sendPage(res, ctx, form + `<div class="result">Access denied or file not found.</div>`, scenario);
  });
}

// 32. Timing
function registerTiming(app, ctx) {
  const scenario = "A login script checks each character of the password sequentially and returns immediately when a mismatch is found, introducing a timing side-channel.";
  app.post(ctx.mode, (req, res) => {
    const p = req.body.password || '';
    const form = `<form method="POST"><div class="form-group"><label>Master Password</label><input type="password" name="password" value="${escapeHtml(p)}"></div><button type="submit">Unlock Vault</button></form>`;
    if (p === 'opensesame') return ctx.issueFlag(res, { vector: 'timing-attack' });
    sendPage(res, ctx, form + `<div class="result error">Incorrect Password. Processing time: 0.002ms</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Master Password</label><input type="password" name="password"></div><button type="submit">Unlock Vault</button></form>`, scenario));
}

// 33. Redirect
function registerRedirect(app, ctx) {
  const scenario = "Single Sign-On login gateway. Users are forwarded back to their original destination via the `next` URL param.";
  app.get(ctx.mode, (req, res) => {
    const url = req.query.next;
    const form = `<form method="GET"><div class="form-group"><label>Return URL</label><input type="text" name="next" value="${escapeHtml(url||'https://trusted.com/home')}"></div><button type="submit">Login and Continue</button></form>`;
    if (url && (url.startsWith('https://evil') || url.startsWith('http://evil'))) return ctx.issueFlag(res, { vector: 'open-redirect' });
    sendPage(res, ctx, form + `<div class="result">Redirecting safely to internal page...</div>`, scenario);
  });
}

// 34. Cors
function registerCors(app, ctx) {
  const scenario = "API responding with Access-Control-Allow-Origin headers. See if you can get it to reflect an arbitrary origin like 'attacker.com' or 'null'.";
  app.get(ctx.mode, (req, res) => {
    const origin = req.headers.origin || req.query.simulate_origin;
    const form = `<form method="GET"><div class="form-group"><label>Simulate Origin Header</label><input type="text" name="simulate_origin" value="${escapeHtml(origin||'')}"></div><button type="submit">Send Cross-Origin Request</button></form>`;
    if (origin === 'null' || origin === 'attacker.com') return ctx.issueFlag(res, { vector: 'cors-misconfig' });
    sendPage(res, ctx, form + `<div class="result error">CORS Error: Missing allow origin header for ${escapeHtml(origin)}.</div>`, scenario);
  });
}

// 35. Host
function registerHost(app, ctx) {
  const scenario = "Password reset email generator uses the Host header to build the reset link.";
  app.get(ctx.mode, (req, res) => {
    const host = req.headers.host || req.query.simulate_host;
    const form = `<form method="GET"><div class="form-group"><label>Simulate Host Header</label><input type="text" name="simulate_host" value="localhost"></div><button type="submit">Trigger Reset Email</button></form>`;
    if (host && host.includes('poison')) return ctx.issueFlag(res, { vector: 'host-header-poison' });
    sendPage(res, ctx, form + `<div class="result">Email sent! Reset link created: http://${escapeHtml(host)}/reset-token-123</div>`, scenario);
  });
}

// 36. Container
function registerContainer(app, ctx) {
  const scenario = "Docker container environment query tool. If the unix socket is mounted, one might theoretically escape.";
  app.get(ctx.mode, (req, res) => {
    const s = req.query.socket;
    const form = `<form method="GET"><div class="form-group"><label>Socket Name</label><input type="text" name="socket" value="${escapeHtml(s||'systemd')}"></div><button type="submit">Query Socket</button></form>`;
    if (s === 'docker' || s === '/var/run/docker.sock') return ctx.issueFlag(res, { vector: 'container-escape' });
    sendPage(res, ctx, form + `<div class="result error">Permission denied accessing socket ${escapeHtml(s)}.</div>`, scenario);
  });
}

// 37. Reverse
function registerReverse(app, ctx) {
  const scenario = "We distributed a WASM binary for client-side password hashing. Can you find the hardcoded key?";
  app.get(ctx.mode, (req, res) => {
    const p = req.query.payload;
    const form = `<form method="GET"><div class="form-group"><label>Discovered Hardcoded Key</label><input type="text" name="payload" value="${escapeHtml(p||'')}"></div><button type="submit">Verify Key</button></form>`;
    if (p && (p.includes('wasm') || p.includes('reverse') || p === 'hardcoded_in_binary')) return ctx.issueFlag(res, { vector: 'reverse' });
    sendPage(res, ctx, form + `<div class="result">Key incorrect. (Hint: Try string 'hardcoded_in_binary')</div>`, scenario);
  });
}

// 38. Webshell
function registerWebshell(app, ctx) {
  const scenario = "Assume you bypassed file upload checks and dropped a webshell. Now send an OS command parameter to it.";
  app.post(ctx.mode, (req, res) => {
    const code = req.body.code || '';
    const form = `<form method="POST"><div class="form-group"><label>Mock shell.php execution code</label><input type="text" name="code" value="${escapeHtml(code)}"></div><button type="submit">Execute Shell Func</button></form>`;
    if (code.includes('system(')) return ctx.issueFlag(res, { vector: 'webshell' });
    sendPage(res, ctx, form + `<div class="result error">Fatal PHP Error: Undefined instruction.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Mock shell.php execution code</label><input type="text" name="code" value="phpinfo()"></div><button type="submit">Execute Shell Func</button></form>`, scenario));
}

// 39. Multistage
function registerMultistage(app, ctx) {
  const scenario = "Attackers chaining foothold into lateral pivot. This tests identification of multiple stages.";
  app.post(ctx.mode, (req, res) => {
    const chain = req.body.chain || '';
    const form = `<form method="POST"><div class="form-group"><label>Attack Chain Identifier</label><input type="text" name="chain" value="${escapeHtml(chain)}"></div><button type="submit">Submit Timeline</button></form>`;
    if (chain.includes('pivot')) return ctx.issueFlag(res, { vector: 'multistage' });
    sendPage(res, ctx, form + `<div class="result">Chain incomplete. Needs a pivot action.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Attack Chain Identifier</label><input type="text" name="chain" value="foothold"></div><button type="submit">Submit Timeline</button></form>`, scenario));
}

// 40. Persist
function registerPersist(app, ctx) {
  const scenario = "Once root is achieved, attackers usually leave an SSH key or modify cron jobs. Simulate this backdoor mechanism.";
  app.post(ctx.mode, (req, res) => {
    const method = req.body.method || '';
    const form = `<form method="POST"><div class="form-group"><label>Persistence Technique Parameter</label><input type="text" name="method" value="${escapeHtml(method)}"></div><button type="submit">Install Backdoor</button></form>`;
    if (method === 'cron') return ctx.issueFlag(res, { vector: 'persistence' });
    sendPage(res, ctx, form + `<div class="result error">Not a recognized persistence mechanism.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Persistence Technique Parameter</label><input type="text" name="method" value="user_add"></div><button type="submit">Install Backdoor</button></form>`, scenario));
}

const CHALLENGE_BUILDERS = {
  '/sqli/silver': registerSqli,
  '/nosqli/silver': registerNosqli,
  '/cmdi/silver': registerCmdi,
  '/ldap/silver': registerLdap,
  '/ssti/silver': registerSsti,
  '/brute/silver': registerBrute,
  '/jwt/silver': registerJwt,
  '/mfa/silver': registerMfa,
  '/oauth/silver': registerOauth,
  '/admin/silver': registerAdmin,
  '/idor/silver': registerIdor,
  '/privesc/silver': registerPrivesc,
  '/rbac/silver': registerRbac,
  '/xss/silver': registerXss,
  '/csrf/silver': registerCsrf,
  '/clickjack/silver': registerClickjack,
  '/postmsg/silver': registerPostmsg,
  '/lfi/silver': registerLfi,
  '/upload/silver': registerUpload,
  '/xxe/silver': registerXxe,
  '/deser/silver': registerDeser,
  '/ssrf/silver': registerSsrf,
  '/proto/silver': registerProto,
  '/race/silver': registerRace,
  '/smuggle/silver': registerSmuggle,
  '/logic/silver': registerLogic,
  '/ratelimit/silver': registerRatelimit,
  '/payment/silver': registerPayment,
  '/crypto/silver': registerCrypto,
  '/info-disc/silver': registerInfoDisc,
  '/secret/silver': registerSecret,
  '/timing/silver': registerTiming,
  '/redirect/silver': registerRedirect,
  '/cors/silver': registerCors,
  '/host/silver': registerHost,
  '/container/silver': registerContainer,
  '/reverse/silver': registerReverse,
  '/webshell/silver': registerWebshell,
  '/multistage/silver': registerMultistage,
  '/persist/silver': registerPersist
};

const ISOLATED_CHALLENGE_MODES = Object.freeze(
  Object.keys(CHALLENGE_BUILDERS).sort()
);

function registerIsolatedChallenge(app, mode, options) {
  const builder = CHALLENGE_BUILDERS[mode];
  if (!builder) return false;
  const ctx = createContext(mode);
  const store = createStore();
  builder(app, ctx, store, options.upload);
  app.use((req, res) => res.status(404).send(`Route not found. Valid endpoint is ${mode}`));
  return true;
}

module.exports = {
  registerIsolatedChallenge,
  CHALLENGE_BUILDERS,
  ISOLATED_CHALLENGE_MODES,
};
