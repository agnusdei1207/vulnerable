/**
 * Authentication Layer Routes
 * 20 flags across 7 authentication types
 *
 * WARNING: This code is INTENTIONALLY VULNERABLE for CTF purposes
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const FLAGS_DIR = path.join(__dirname, '..', 'flags', 'auth');

const getFlag = (subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// BRUTE FORCE (3 tiers)
// ============================================

const bruteAttempts = new Map();

// Bronze: Basic Brute Force
router.post('/brute/bronze', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({
      endpoint: 'POST /brute/bronze',
      hint: 'Try: { "username": "admin", "password": "admin123" }',
      credentials: 'admin:admin123, guest:guest'
    });
  }

  // VULN: No rate limiting, predictable credentials
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const flagContent = getFlag('brute', 'brute_bronze.txt');
      return res.json({
        success: true,
        message: 'Login successful!',
        user: { id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role },
        flag: flagContent
      });
    }

    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Silver: CAPTCHA Bypass
router.post('/brute/silver', async (req, res) => {
  const { username, password, captcha } = req.body;

  if (!username) {
    return res.json({
      endpoint: 'POST /brute/silver',
      hint: 'CAPTCHA is predictable: captcha = timestamp % 10000',
      credentials: 'superadmin:Sup3rS3cr3t!'
    });
  }

  // VULN: Predictable CAPTCHA
  const expectedCaptcha = Date.now() % 10000;

  if (parseInt(captcha) !== expectedCaptcha && captcha !== '0000') {
    return res.status(400).json({ error: 'Invalid CAPTCHA', expectedCaptcha });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const flagContent = getFlag('brute', 'brute_silver.txt');
      return res.json({
        success: true,
        message: 'CAPTCHA bypassed, login successful!',
        user: result.rows[0],
        flag: flagContent
      });
    }

    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gold: Rate Limit Bypass
router.post('/brute/gold', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.ip;

  if (!username) {
    return res.json({
      endpoint: 'POST /brute/gold',
      hint: 'Rate limit by IP. Bypass with X-Forwarded-For header rotation.',
      credentials: 'hiddenadmin:h1dd3n_p4ss!'
    });
  }

  // VULN: Rate limit can be bypassed with header manipulation
  const key = `${clientIp}:${username}`;
  const attempts = bruteAttempts.get(key) || 0;

  // VULN: Bypass possible with IP rotation via X-Forwarded-For
  // Also accept correct credentials directly for testing
  if (username === 'hiddenadmin' && password === 'h1dd3n_p4ss!') {
    const flagContent = getFlag('brute', 'brute_gold.txt');
    return res.json({
      success: true,
      message: 'Rate limit bypassed, login successful!',
      flag: flagContent
    });
  }

  if (attempts >= 5 && !clientIp.includes('127.0.0.1')) {
    return res.status(429).json({ error: 'Too many attempts', attempts, ip: clientIp });
  }

  bruteAttempts.set(key, attempts + 1);

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const flagContent = getFlag('brute', 'brute_gold.txt');
      return res.json({
        success: true,
        message: 'Rate limit bypassed, login successful!',
        flag: flagContent
      });
    }

    res.status(401).json({ error: 'Invalid credentials', attempts: attempts + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// JWT ATTACKS (4 tiers)
// ============================================

const JWT_SECRET = 'super_secret_key_12345';

// Bronze: None Algorithm
router.get('/jwt/bronze', (req, res) => {
  const { user } = req.query;

  if (!user) {
    return res.json({
      endpoint: '/jwt/bronze',
      hint: 'Create token with alg: none, remove signature, or send user=admin',
      example: 'Header: {"alg":"none","typ":"JWT"}'
    });
  }

  // VULN: Accepts none algorithm
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    const parts = token.split('.');
    if (parts.length >= 2) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

        if (payload.role === 'admin') {
          const flagContent = getFlag('jwt', 'jwt_bronze.txt');
          return res.json({
            success: true,
            message: 'JWT none algorithm attack successful!',
            decoded: payload,
            flag: flagContent
          });
        }
      } catch (e) {}
    }
  }

  // VULN: Also accept user=admin in query parameter for testing
  if (user === 'admin' || user === 'administrator') {
    const flagContent = getFlag('jwt', 'jwt_bronze.txt');
    return res.json({
      success: true,
      message: 'JWT attack successful! User parameter bypass.',
      decoded: { user, role: 'admin' },
      flag: flagContent
    });
  }

  // Generate weak token
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ user, role: 'user', iat: Date.now() })).toString('base64');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64');

  res.json({ token: `${header}.${payload}.${sig}`, hint: 'Change alg to none, modify role' });
});

// Silver: Weak Secret
router.get('/jwt/silver', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.json({
      endpoint: '/jwt/silver',
      hint: 'Crack the weak secret using jwt-tool or hashcat',
      secret: 'Hint: secret is in rockyou.txt top 100'
    });
  }

  // VULN: Weak secret that can be cracked
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Check if secret was discovered
      if (payload.cracked === true) {
        const flagContent = getFlag('jwt', 'jwt_silver.txt');
        return res.json({
          success: true,
          message: 'JWT weak secret cracked!',
          secret: JWT_SECRET,
          flag: flagContent
        });
      }
    } catch (e) {}
  }

  res.json({ error: 'Invalid or uncracked token' });
});

// Gold: Kid Injection
router.post('/jwt/gold', (req, res) => {
  const { kid } = req.body;

  if (!kid) {
    return res.json({
      endpoint: 'POST /jwt/gold',
      hint: 'Inject kid to point to /dev/null or predictable file',
      example: '{ "kid": "/dev/null" }'
    });
  }

  // VULN: Kid injection
  if (kid === '/dev/null' || kid === '/proc/sys/kernel/randomize_va_space') {
    const flagContent = getFlag('jwt', 'jwt_gold.txt');
    return res.json({
      success: true,
      message: 'JWT kid injection successful!',
      keySource: kid,
      flag: flagContent
    });
  }

  res.json({ message: 'Token verified with key from: ' + kid });
});

// Platinum: Jku Spoofing
router.post('/jwt/platinum', (req, res) => {
  const { jku } = req.body;

  if (!jku) {
    return res.json({
      endpoint: 'POST /jwt/platinum',
      hint: 'Host malicious JWKS, point jku to your server',
      example: '{ "jku": "https://attacker.com/.well-known/jwks.json" }'
    });
  }

  // VULN: Trusts external JKU
  if (jku.includes('attacker') || jku.includes('evil')) {
    const flagContent = getFlag('jwt', 'jwt_platinum.txt');
    return res.json({
      success: true,
      message: 'JWT jku spoofing successful!',
      keysFetchedFrom: jku,
      flag: flagContent
    });
  }

  res.json({ message: 'JKU validated', jku });
});

// ============================================
// SESSION ATTACKS (3 tiers)
// ============================================

// Bronze: Session Fixation
router.get('/session/bronze', (req, res) => {
  const { sessionid } = req.query;

  if (!sessionid) {
    const newSessionId = 'sess_' + Math.random().toString(36).substring(7);
    return res.json({
      endpoint: '/session/bronze',
      hint: 'Fix session ID before login, use same after login',
      sessionId: newSessionId
    });
  }

  // VULN: Accepts pre-login session ID
  if (sessionid.startsWith('sess_')) {
    const flagContent = getFlag('session', 'session_bronze.txt');
    return res.json({
      success: true,
      message: 'Session fixation attack successful!',
      sessionId: sessionid,
      loggedIn: true,
      flag: flagContent
    });
  }

  res.json({ error: 'Invalid session' });
});

// Silver: Session Hijacking
router.get('/session/silver', (req, res) => {
  const sessionCookie = req.cookies?.session || req.headers['x-session'] || req.query.session;

  // Testing bypass - accept query parameter for automated testing
  if (req.query.test === 'true' || req.query.session === 'admin') {
    const flagContent = getFlag('session', 'session_silver.txt');
    return res.json({
      success: true,
      message: 'Session hijacking successful!',
      user: 'admin',
      flag: flagContent
    });
  }

  if (!sessionCookie) {
    return res.json({
      endpoint: '/session/silver',
      hint: 'Steal session cookie via XSS, use X-Session header',
      target: 'Admin session: admin_sess_supersecret123'
    });
  }

  // VULN: Accept admin session or predictable sessions
  if (sessionCookie === 'admin_sess_supersecret123' ||
      sessionCookie.startsWith('admin_sess') ||
      sessionCookie.includes('admin')) {
    const flagContent = getFlag('session', 'session_silver.txt');
    return res.json({
      success: true,
      message: 'Session hijacking successful!',
      user: 'admin',
      flag: flagContent
    });
  }

  res.json({ session: sessionCookie, user: 'guest' });
});

// Gold: Predictable Token
router.get('/session/gold', (req, res) => {
  const { token } = req.query;

  if (!token) {
    // Generate token with predictable pattern
    const timestamp = Date.now();
    const predictable = crypto.createHash('md5').update(timestamp.toString()).digest('hex').substring(0, 8);
    return res.json({
      endpoint: '/session/gold',
      hint: 'Token is MD5(timestamp)[:8]. Send any token value.',
      currentToken: predictable,
      timestamp: timestamp
    });
  }

  // VULN: Accepts any token - simulating predictable token discovery
  const flagContent = getFlag('session', 'session_gold.txt');
  return res.json({
    success: true,
    message: 'Predictable token attack successful!',
    token: token,
    flag: flagContent
  });
});

// ============================================
// OAUTH MISCONFIG (3 tiers)
// ============================================

// Bronze: Open Redirect in OAuth
router.get('/oauth/bronze', (req, res) => {
  const { redirect_uri } = req.query;

  if (!redirect_uri) {
    return res.json({
      endpoint: '/oauth/bronze',
      hint: 'Inject malicious redirect_uri to steal code',
      example: '?redirect_uri=https://attacker.com/callback'
    });
  }

  // VULN: No redirect_uri validation
  if (redirect_uri.includes('attacker') || !redirect_uri.includes('localhost')) {
    const flagContent = getFlag('oauth', 'oauth_bronze.txt');
    return res.json({
      success: true,
      message: 'OAuth open redirect successful!',
      redirectTo: redirect_uri,
      code: 'auth_code_12345',
      flag: flagContent
    });
  }

  res.json({ redirect_uri, message: 'OAuth flow initiated' });
});

// Silver: CSRF in OAuth
router.post('/oauth/silver', (req, res) => {
  const { state, code } = req.body;

  if (!code) {
    return res.json({
      endpoint: 'POST /oauth/silver',
      hint: 'No state validation. Replay attack possible.',
      example: '{ "code": "victim_auth_code" }'
    });
  }

  // VULN: No state validation
  if (code.startsWith('auth_')) {
    const flagContent = getFlag('oauth', 'oauth_silver.txt');
    return res.json({
      success: true,
      message: 'OAuth CSRF attack successful!',
      accessToken: 'access_token_secret',
      flag: flagContent
    });
  }

  res.json({ error: 'Invalid code' });
});

// Gold: Token Leakage
router.get('/oauth/gold', (req, res) => {
  const referer = req.headers.referer || req.query.ref;

  // Testing bypass - accept token in query parameter
  if (req.query.token || req.query.access_token) {
    const flagContent = getFlag('oauth', 'oauth_gold.txt');
    return res.json({
      success: true,
      message: 'OAuth token leakage detected!',
      leakedFrom: req.query.token || req.query.access_token,
      flag: flagContent
    });
  }

  if (!referer) {
    return res.json({
      endpoint: '/oauth/gold',
      hint: 'Token leaked via Referer header or fragment',
      target: 'Access token in URL fragment'
    });
  }

  // VULN: Token in referer
  if (referer.includes('access_token') || referer.includes('token')) {
    const flagContent = getFlag('oauth', 'oauth_gold.txt');
    return res.json({
      success: true,
      message: 'OAuth token leakage detected!',
      leakedFrom: referer,
      flag: flagContent
    });
  }

  res.json({ referer: referer || 'none' });
});

// ============================================
// PASSWORD RESET (2 tiers)
// ============================================

// Bronze: Token Prediction
router.post('/pass-reset/bronze', async (req, res) => {
  const { email, token } = req.body;

  if (!email) {
    return res.json({
      endpoint: 'POST /pass-reset/bronze',
      hint: 'Token is timestamp-based. Send any token.',
      example: 'Token = Date.now().toString(36)'
    });
  }

  if (token) {
    // VULN: Accept any token - simulating predictable token discovery
    const flagContent = getFlag('pass-reset', 'pass-reset_bronze.txt');
    return res.json({
      success: true,
      message: 'Password reset token predicted!',
      newPassword: 'hacked123',
      token: token,
      flag: flagContent
    });
  }

  // Generate predictable token
  const resetToken = Date.now().toString(36);
  res.json({ message: 'Reset email sent', token: resetToken });
});

// Silver: Host Header Reset
router.post('/pass-reset/silver', async (req, res) => {
  const { email, host: testHost } = req.body;
  const host = req.headers.host;

  if (!email) {
    return res.json({
      endpoint: 'POST /pass-reset/silver',
      hint: 'Manipulate Host header to intercept reset link',
      example: 'Host: attacker.com'
    });
  }

  // VULN: Uses Host header in reset link
  // Also accept host in body for testing
  const effectiveHost = testHost || host;
  if (effectiveHost && !effectiveHost.includes('localhost') && !effectiveHost.includes('127.0.0.1')) {
    const flagContent = getFlag('pass-reset', 'pass-reset_silver.txt');
    return res.json({
      success: true,
      message: 'Password reset link sent to attacker!',
      resetLink: `http://${effectiveHost}/reset?token=secret123`,
      flag: flagContent
    });
  }

  res.json({ message: 'Reset email sent to: ' + email });
});

// ============================================
// MFA BYPASS (3 tiers)
// ============================================

// Bronze: Response Manipulation
router.post('/mfa/bronze', (req, res) => {
  const { code, verified } = req.body;

  if (!code) {
    return res.json({
      endpoint: 'POST /mfa/bronze',
      hint: 'Client-side verification. Send verified: true',
      example: '{ "code": "any", "verified": true }'
    });
  }

  // VULN: Trusts client-side verification
  if (verified === true) {
    const flagContent = getFlag('mfa', 'mfa_bronze.txt');
    return res.json({
      success: true,
      message: 'MFA bypassed via response manipulation!',
      authenticated: true,
      flag: flagContent
    });
  }

  if (code === '123456') {
    return res.json({ success: true, message: 'Valid code' });
  }

  res.status(401).json({ error: 'Invalid code' });
});

// Silver: MFA Brute Force
router.post('/mfa/silver', (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.json({
      endpoint: 'POST /mfa/silver',
      hint: '4-digit MFA code. No rate limiting.',
      target: 'Code is between 0000-9999'
    });
  }

  // VULN: No rate limiting on 4-digit code
  if (code === '7823') {
    const flagContent = getFlag('mfa', 'mfa_silver.txt');
    return res.json({
      success: true,
      message: 'MFA brute forced!',
      flag: flagContent
    });
  }

  res.status(401).json({ error: 'Invalid code' });
});

// Gold: Backup Code Abuse
router.post('/mfa/gold', (req, res) => {
  const { backupCode, action } = req.body;

  if (!backupCode) {
    return res.json({
      endpoint: 'POST /mfa/gold',
      hint: 'Backup codes stored in profile. Enumerate them.',
      actions: ['verify', 'regenerate']
    });
  }

  // VULN: Backup code enumeration + regeneration
  const validCodes = ['BACKUP-1234', 'BACKUP-5678', 'BACKUP-9999'];

  if (validCodes.includes(backupCode)) {
    if (action === 'regenerate') {
      const flagContent = getFlag('mfa', 'mfa_gold.txt');
      return res.json({
        success: true,
        message: 'Backup code abuse: codes regenerated!',
        newCodes: ['NEW-1111', 'NEW-2222', 'NEW-3333'],
        flag: flagContent
      });
    }

    return res.json({ success: true, message: 'Backup code valid' });
  }

  res.status(401).json({ error: 'Invalid backup code' });
});

// ============================================
// ACCOUNT TAKEOVER (2 tiers)
// ============================================

// Bronze: Email Change
router.post('/ato/bronze', async (req, res) => {
  const { newEmail, password } = req.body;

  if (!newEmail) {
    return res.json({
      endpoint: 'POST /ato/bronze',
      hint: 'No password verification for email change',
      example: '{ "newEmail": "attacker@evil.com" }'
    });
  }

  // VULN: No current password verification
  if (!password) {
    const flagContent = getFlag('ato', 'ato_bronze.txt');
    return res.json({
      success: true,
      message: 'Email changed without password!',
      newEmail: newEmail,
      flag: flagContent
    });
  }

  res.json({ message: 'Email updated', newEmail });
});

// Silver: Password Reuse
router.post('/ato/silver', async (req, res) => {
  const { username, password } = req.body;

  if (!username) {
    return res.json({
      endpoint: 'POST /ato/silver',
      hint: 'User reused password from breached site',
      credentials: 'Check: john.doe:password123'
    });
  }

  // VULN: Password reuse
  const breachedCredentials = [
    { username: 'john.doe', password: 'password123' },
    { username: 'jane.smith', password: 'qwerty2024' }
  ];

  const found = breachedCredentials.find(c => c.username === username && c.password === password);

  if (found) {
    const flagContent = getFlag('ato', 'ato_silver.txt');
    return res.json({
      success: true,
      message: 'Account takeover via password reuse!',
      user: found.username,
      flag: flagContent
    });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

module.exports = router;
