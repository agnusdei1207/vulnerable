/**
 * Access Control Layer Routes
 * 16 flags across 4 access control types
 *
 * WARNING: This code is INTENTIONALLY VULNERABLE for CTF purposes
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const path = require('path');
const fs = require('fs');

const FLAGS_DIR = path.join(__dirname, '..', 'flags', 'access');

const getFlag = (subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// IDOR (4 tiers)
// ============================================

// Bronze: Direct ID
router.get('/idor/bronze/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.json({
      endpoint: '/idor/bronze/:id',
      hint: 'Change ID to access other users data',
      example: '/idor/bronze/1, /idor/bronze/2, /idor/bronze/3'
    });
  }

  // VULN: No authorization check
  try {
    const result = await pool.query('SELECT id, username, email, ssn FROM users WHERE id = $1', [id]);

    if (result.rows.length > 0) {
      const flagContent = getFlag('idor', 'idor_bronze.txt');
      return res.json({
        user: result.rows[0],
        message: 'IDOR: Accessed user data without authorization!',
        flag: flagContent
      });
    }

    res.status(404).json({ error: 'User not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Silver: GUID Enumeration
router.get('/idor/silver/:guid', async (req, res) => {
  const { guid } = req.params;

  if (!guid) {
    return res.json({
      endpoint: '/idor/silver/:guid',
      hint: 'GUIDs are predictable or leaked elsewhere',
      leakedGuids: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901']
    });
  }

  // VULN: GUIDs leaked via other endpoints
  const validGuids = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901'];

  if (validGuids.includes(guid)) {
    const flagContent = getFlag('idor', 'idor_silver.txt');
    return res.json({
      user: { guid, username: 'sensitive_user', email: 'sensitive@example.com' },
      message: 'IDOR via GUID enumeration!',
      flag: flagContent
    });
  }

  res.status(404).json({ error: 'Resource not found' });
});

// Gold: Bulk Export
router.post('/idor/gold/export', async (req, res) => {
  const { userIds, format } = req.body;

  if (!userIds) {
    return res.json({
      endpoint: 'POST /idor/gold/export',
      hint: 'Export accepts array of user IDs, no authorization',
      example: '{ "userIds": [1, 2, 3, 4, 5], "format": "json" }'
    });
  }

  // VULN: Bulk export without per-record auth
  if (Array.isArray(userIds) && userIds.length > 1) {
    const flagContent = getFlag('idor', 'idor_gold.txt');
    return res.json({
      exported: userIds.map(id => ({ id, username: `user${id}`, email: `user${id}@example.com` })),
      message: 'Bulk IDOR export successful!',
      flag: flagContent
    });
  }

  res.json({ message: 'Export single user only' });
});

// Platinum: Chained IDOR
router.get('/idor/platinum/order/:orderId', async (req, res) => {
  const { orderId } = req.params;

  if (!orderId) {
    return res.json({
      endpoint: '/idor/platinum/order/:orderId',
      hint: 'Chain: Order -> User -> Payment Info',
      startHere: '/idor/platinum/order/ORD-001'
    });
  }

  // VULN: Chained IDOR - order exposes user, user exposes payment
  if (orderId.startsWith('ORD-')) {
    const flagContent = getFlag('idor', 'idor_platinum.txt');
    return res.json({
      order: {
        id: orderId,
        userId: 2,
        user: { id: 2, username: 'victim', email: 'victim@example.com' },
        payment: { cardNumber: '4111-XXXX-XXXX-1111', cvv: 'XXX' }
      },
      message: 'Chained IDOR: Order -> User -> Payment!',
      flag: flagContent
    });
  }

  res.status(404).json({ error: 'Order not found' });
});

// ============================================
// PRIVILEGE ESCALATION (5 tiers)
// ============================================

// Bronze: Sudo Abuse
router.get('/privesc/bronze', (req, res) => {
  const { cmd } = req.query;

  if (!cmd) {
    return res.json({
      endpoint: '/privesc/bronze',
      hint: 'Sudo allows find without password',
      command: 'sudo find . -exec /bin/sh \\;'
    });
  }

  // VULN: Simulated sudo abuse
  if (cmd.includes('find') && cmd.includes('exec')) {
    const flagContent = getFlag('privesc', 'privesc_bronze.txt');
    return res.json({
      success: true,
      message: 'Privilege escalation via sudo find!',
      result: 'root shell obtained',
      flag: flagContent
    });
  }

  res.json({ message: 'Command executed', user: 'ctfuser' });
});

// Silver: SUID Binary
router.get('/privesc/silver', (req, res) => {
  const { binary } = req.query;

  if (!binary) {
    return res.json({
      endpoint: '/privesc/silver',
      hint: 'Find SUID binaries, check GTFOBins',
      suidBinaries: ['/usr/bin/find', '/usr/bin/vim', '/usr/bin/python3']
    });
  }

  // VULN: SUID binary exploitation
  const suidBinaries = ['find', 'vim', 'python3', 'bash', 'less'];

  if (suidBinaries.some(b => binary.includes(b))) {
    const flagContent = getFlag('privesc', 'privesc_silver.txt');
    return res.json({
      success: true,
      message: `SUID ${binary} exploited!`,
      result: 'root privileges obtained',
      flag: flagContent
    });
  }

  res.json({ message: 'Binary not SUID or not exploitable' });
});

// Gold: Kernel Exploit
router.get('/privesc/gold', (req, res) => {
  const { cve } = req.query;

  if (!cve) {
    return res.json({
      endpoint: '/privesc/gold',
      hint: 'Kernel vulnerability present',
      kernelVersion: '5.4.0-42-generic',
      vulnerableCVEs: ['CVE-2021-4034', 'CVE-2022-0847']
    });
  }

  // VULN: Kernel exploit
  const vulnerableCVEs = ['CVE-2021-4034', 'CVE-2022-0847', 'CVE-2021-3156'];

  if (vulnerableCVEs.includes(cve)) {
    const flagContent = getFlag('privesc', 'privesc_gold.txt');
    return res.json({
      success: true,
      message: `Kernel exploit ${cve} successful!`,
      result: 'root shell via kernel vulnerability',
      flag: flagContent
    });
  }

  res.json({ message: 'CVE not applicable' });
});

// Platinum: Container Escape
router.get('/privesc/platinum', (req, res) => {
  const { method } = req.query;

  if (!method) {
    return res.json({
      endpoint: '/privesc/platinum',
      hint: 'Container escape methods',
      methods: ['docker-socket', 'privileged-mode', 'cgroup-release']
    });
  }

  // VULN: Container escape
  const validMethods = ['docker-socket', 'privileged-mode', 'cgroup-release'];

  if (validMethods.includes(method)) {
    const flagContent = getFlag('privesc', 'privesc_platinum.txt');
    return res.json({
      success: true,
      message: `Container escape via ${method}!`,
      result: 'escaped to host system',
      flag: flagContent
    });
  }

  res.json({ message: 'Escape method not available' });
});

// Diamond: Cloud Metadata
router.get('/privesc/diamond', (req, res) => {
  const { metadataUrl } = req.query;

  if (!metadataUrl) {
    return res.json({
      endpoint: '/privesc/diamond',
      hint: 'SSRF to cloud metadata, assume IAM role',
      metadataUrls: [
        'http://169.254.169.254/latest/meta-data/',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://169.254.169.254/metadata/instance'
      ]
    });
  }

  // VULN: Cloud metadata access via SSRF
  if (metadataUrl.includes('169.254.169.254') || metadataUrl.includes('metadata')) {
    const flagContent = getFlag('privesc', 'privesc_diamond.txt');
    return res.json({
      success: true,
      message: 'Cloud metadata accessed!',
      iamRole: 'arn:aws:iam::123456789012:role/AdminRole',
      temporaryCredentials: {
        AccessKeyId: 'ASIA...',
        SecretAccessKey: 'wJalrX...',
        SessionToken: 'FwoGZX...'
      },
      flag: flagContent
    });
  }

  res.json({ message: 'Invalid metadata URL' });
});

// ============================================
// ADMIN BYPASS (3 tiers)
// ============================================

// Bronze: Cookie Manipulation
router.get('/admin/bronze', (req, res) => {
  const role = req.cookies?.role || req.headers['x-role'] || req.query.role;

  // Testing bypass - accept role in query parameter
  if (req.query.role === 'admin' || req.query.test === 'admin') {
    const flagContent = getFlag('admin', 'admin_bronze.txt');
    return res.json({
      success: true,
      message: 'Admin access via cookie manipulation!',
      adminPanel: '/admin/dashboard',
      flag: flagContent
    });
  }

  if (!role) {
    return res.json({
      endpoint: '/admin/bronze',
      hint: 'Change role cookie or X-Role header to admin',
      currentRole: 'user'
    });
  }

  // VULN: Cookie-based auth
  if (role === 'admin') {
    const flagContent = getFlag('admin', 'admin_bronze.txt');
    return res.json({
      success: true,
      message: 'Admin access via cookie manipulation!',
      adminPanel: '/admin/dashboard',
      flag: flagContent
    });
  }

  res.status(403).json({ error: 'Access denied', role });
});

// Silver: Force Browsing
router.get('/admin/silver/dashboard', (req, res) => {
  // VULN: No auth check, just hidden URL
  const flagContent = getFlag('admin', 'admin_silver.txt');
  res.json({
    success: true,
    message: 'Admin dashboard accessed via force browsing!',
    adminActions: ['delete-users', 'view-logs', 'modify-config'],
    flag: flagContent
  });
});

// Gold: Role Bypass
router.put('/admin/gold/users/:id', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role) {
    return res.json({
      endpoint: 'PUT /admin/gold/users/:id',
      hint: 'Modify role in request body',
      example: '{ "role": "admin" }'
    });
  }

  // VULN: Role can be changed via API
  if (role === 'admin') {
    const flagContent = getFlag('admin', 'admin_gold.txt');
    return res.json({
      success: true,
      message: 'Role escalated to admin!',
      user: { id, role: 'admin' },
      flag: flagContent
    });
  }

  res.json({ message: 'User updated', id, role });
});

// ============================================
// RBAC BYPASS (4 tiers)
// ============================================

// Bronze: Parameter Tampering
router.get('/rbac/bronze', (req, res) => {
  const { userId, resource } = req.query;

  if (!userId) {
    return res.json({
      endpoint: '/rbac/bronze',
      hint: 'Tamper with userId parameter',
      currentUser: 'user_123',
      targetUser: 'admin_001'
    });
  }

  // VULN: No check if userId matches authenticated user
  if (userId === 'admin_001') {
    const flagContent = getFlag('rbac', 'rbac_bronze.txt');
    return res.json({
      success: true,
      message: 'RBAC bypassed via parameter tampering!',
      resources: ['admin-config', 'user-list', 'audit-logs'],
      flag: flagContent
    });
  }

  res.json({ userId, access: 'limited' });
});

// Silver: Token Abuse
router.post('/rbac/silver', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.json({
      endpoint: 'POST /rbac/silver',
      hint: 'Reuse or forge access token',
      tokenFormat: 'base64(userId:role:timestamp)'
    });
  }

  // VULN: Weak token, can be forged
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    if (decoded.includes('admin')) {
      const flagContent = getFlag('rbac', 'rbac_silver.txt');
      return res.json({
        success: true,
        message: 'RBAC bypassed via token abuse!',
        decodedToken: decoded,
        flag: flagContent
      });
    }
  } catch (e) {}

  res.status(403).json({ error: 'Invalid token' });
});

// Gold: Policy Bypass
router.get('/rbac/gold/resource/:name', (req, res) => {
  const { name } = req.params;

  if (!name) {
    return res.json({
      endpoint: '/rbac/gold/resource/:name',
      hint: 'Find resource not covered by policy',
      protectedResources: ['users', 'orders'],
      unprotectedResources: ['debug', 'internal']
    });
  }

  // VULN: Missing policy for some resources
  const unprotected = ['debug', 'internal', 'config-backup', 'test'];

  if (unprotected.includes(name)) {
    const flagContent = getFlag('rbac', 'rbac_gold.txt');
    return res.json({
      success: true,
      message: `RBAC policy bypassed for ${name}!`,
      resource: { name, data: 'sensitive information' },
      flag: flagContent
    });
  }

  res.status(403).json({ error: 'Resource protected' });
});

// Platinum: Cross-Tenant
router.get('/rbac/platinum/tenant/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const currentTenant = req.headers['x-tenant-id'] || 'tenant_001';

  if (!tenantId) {
    return res.json({
      endpoint: '/rbac/platinum/tenant/:tenantId',
      hint: 'Access other tenant data',
      currentTenant: 'tenant_001',
      otherTenants: ['tenant_002', 'tenant_003']
    });
  }

  // VULN: No tenant isolation
  if (tenantId !== currentTenant) {
    const flagContent = getFlag('rbac', 'rbac_platinum.txt');
    return res.json({
      success: true,
      message: 'Cross-tenant access successful!',
      accessedTenant: tenantId,
      data: 'other tenant sensitive data',
      flag: flagContent
    });
  }

  res.json({ tenant: tenantId, data: 'own tenant data' });
});

module.exports = router;
