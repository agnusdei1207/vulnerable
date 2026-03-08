/**
 * Admin Routes
 *
 * A01:2021 - Broken Access Control
 * A02:2021 - Cryptographic Failures
 *
 * VULNERABILITIES (INTENTIONAL - DO NOT FIX):
 * - Cookie-based auth bypass
 * - Hardcoded weak credentials (admin:admin123, root:toor)
 * - Weak encryption (base64, not real encryption)
 * - Timing attack possible
 * - No rate limiting
 * - Client-side cookie can be manipulated
 * - Secret key exposed in response
 */

const express = require('express');
const router = express.Router();

// ==========================================
// A01:2021 - BROKEN ACCESS CONTROL
// ==========================================

// Admin Login Page
router.get('/admin/login', (req, res) => {
  res.render('admin-login', { error: false });
});

// Admin Login Handler - VULN: Weak credentials (admin:admin123, root:toor)
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;

  // VULN: Hardcoded weak admin credentials
  const adminUsers = {
    'admin': 'admin123',
    'root': 'toor',
    'administrator': 'administrator'
  };

  // VULN: Timing attack possible, no rate limiting
  if (adminUsers[username] && adminUsers[username] === password) {
    // VULN: Cookie-based auth, client-controlled
    res.cookie('auth', JSON.stringify({ username, role: 'admin' }), { httpOnly: false });
    res.cookie('isAdmin', 'true');
    return res.redirect('/admin');
  }

  // VULN: Different error for user exists vs wrong password (enumeration)
  res.render('admin-login', { error: true });
});

// Admin Dashboard - VULN: Only checks cookie, easily bypassed
router.get('/admin', (req, res) => {
  // VULN: Client-side cookie can be manipulated
  const auth = req.cookies.auth;
  const isAdmin = req.cookies.isAdmin === 'true';

  if (auth || isAdmin) {
    try {
      const user = auth ? JSON.parse(auth) : { role: isAdmin ? 'admin' : 'user' };
      // VULN: Trusts client-side cookie data for role
      if (user.role === 'admin' || isAdmin) {
        const flag = 'FLAG{ADMIN_AUTH_SUCCESS_COOKIE_BYPASS} - 이 플래그는 관리자 권한 우회(Cookie Bypass) 공격 기법이 성공적으로 통과되었음을 나타냅니다.';
        const recentOrders = [
          { id: 'ORD-001', customer: 'John Smith', product: 'Leather Tote', amount: 299.00, status: 'completed' },
          { id: 'ORD-002', customer: 'Sarah Johnson', product: 'Cashmere Sweater', amount: 249.00, status: 'processing' },
          { id: 'ORD-003', customer: 'Mike Wilson', product: 'Minimalist Watch', amount: 189.00, status: 'pending' },
          { id: 'ORD-004', customer: 'Emily Davis', product: 'Silk Scarf', amount: 89.00, status: 'completed' },
          { id: 'ORD-005', customer: 'David Brown', product: 'Premium Sunglasses', amount: 159.00, status: 'processing' }
        ];

        const activities = [
          { type: 'order', icon: '📦', title: 'New order #ORD-005 received', time: '5 min ago' },
          { type: 'user', icon: '👤', title: 'New customer registered', time: '12 min ago' },
          { type: 'payment', icon: '💳', title: 'Payment confirmed for #ORD-003', time: '28 min ago' },
          { type: 'alert', icon: '⚠️', title: 'Low stock alert: Leather Belt', time: '1 hour ago' }
        ];

        return res.render('admin-panel', { user, recentOrders, activities, flag });
      }
    } catch (e) {
      // VULN: Returns detailed error
    }
  }
  res.redirect('/admin/login');
});

// ==========================================
// A02:2021 - CRYPTOGRAPHIC FAILURES
// ==========================================

router.get('/encrypt', (req, res) => {
  const { data } = req.query;

  // VULN: Using weak base64 "encryption"
  const encrypted = Buffer.from(data || '').toString('base64');

  // VULN: Hardcoded encryption key exposed
  const secretKey = 'my_super_secret_key_12345';

  res.json({
    encrypted,
    secretKey, // VULN: Exposing secret
    algorithm: 'base64', // VULN: Not real encryption
    flag: 'FLAG{CRYPTO_WEAK_ENCRYPTION_BYPASSED} - 이 플래그는 Cryptographic Failures(취약한 암호화) 기법이 성공적으로 통과되었음을 나타냅니다.'
  });
});

module.exports = router;
