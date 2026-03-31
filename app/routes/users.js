/**
 * Users & Authentication Routes
 *
 * User registration, login, profile management
 *
 * VULNERABILITIES (INTENTIONAL - DO NOT FIX):
 * - GET /login, POST /login - SQL Injection, no rate limiting
 * - GET /register, POST /register - Plaintext passwords, no validation
 * - GET /account - IDOR via session cookie
 * - GET /profile/:id - IDOR (can view any user's profile)
 * - POST /account/password - CSRF, weak policy, no current password check
 * - GET /security-questions - Weak security questions
 * - POST /verify-code - Rate limiting bypass
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ==========================================
// USER AUTHENTICATION (VULNERABLE)
// ==========================================

// User login page
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login - LUXORA', error: null });
});

// User login handler - VULN: SQL Injection, no rate limiting
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // VULN: SQL Injection in login
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    const result = await pool.query(query);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      // VULN: Session data stored in client-side cookie (insecure)
      res.cookie('session', JSON.stringify({
        id: user.id,
        username: user.username,
        role: user.role
      }), { httpOnly: false });

      res.redirect('/account');
    } else {
      res.render('login', { title: 'Login - LUXORA', error: 'Invalid credentials' });
    }
  } catch (err) {
    // VULN: Detailed error message exposure
    res.render('login', { title: 'Login - LUXORA', error: err.message });
  }
});

// User registration page
router.get('/register', (req, res) => {
  res.render('register', { title: 'Register - LUXORA', error: null });
});

// User registration handler - VULN: Plaintext passwords, no validation
router.post('/register', async (req, res) => {
  const { username, password, email, firstName, lastName } = req.body;

  try {
    // VULN: Password stored in plaintext
    const result = await pool.query(
      'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, password, email, 'user']
    );

    // VULN: Auto-login after registration (no email verification)
    res.cookie('session', JSON.stringify({
      id: result.rows[0].id,
      username,
      role: 'user'
    }), { httpOnly: false });

    res.redirect('/account');
  } catch (err) {
    res.render('register', { title: 'Register - LUXORA', error: err.message });
  }
});

// User account page - VULN: IDOR via session cookie
router.get('/account', async (req, res) => {
  const session = req.cookies.session;

  if (!session) {
    return res.redirect('/login');
  }

  try {
    const user = JSON.parse(session);
    // VULN: Trusts client-side cookie data without verification
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);

    if (result.rows.length > 0) {
      // Get user orders
      const orders = [
        { id: 'ORD-2024-001', date: '2024-01-15', total: 598.00, status: 'Delivered' },
        { id: 'ORD-2024-002', date: '2024-01-20', total: 249.00, status: 'Shipped' }
      ];
      res.render('account', { title: 'My Account - LUXORA', user: result.rows[0], orders });
    } else {
      res.redirect('/login');
    }
  } catch (err) {
    res.redirect('/login');
  }
});

// Profile page - VULN: IDOR (can view any user's profile)
router.get('/profile/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // VULN: No authorization check - anyone can view any profile
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

    if (result.rows.length > 0) {
      res.render('profile', { title: 'Profile - LUXORA', user: result.rows[0] });
    } else {
      res.status(404).send('User not found');
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Change password - VULN: CSRF, weak policy, no current password check
router.post('/account/password', async (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  const session = req.cookies.session;

  if (!session) {
    return res.redirect('/login');
  }

  // VULN: No CSRF token validation
  // VULN: No current password verification
  // VULN: No password complexity requirements
  if (newPassword !== confirmPassword) {
    return res.redirect('/account?error=password_mismatch');
  }

  try {
    const user = JSON.parse(session);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, user.id]);
    res.redirect('/account?success=password_changed');
  } catch (err) {
    res.redirect('/account?error=update_failed');
  }
});

// Logout
router.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/');
});

// ==========================================
// PASSWORD RESET
// ==========================================

// Weak security questions
router.get('/security-questions', async (req, res) => {
  const { email } = req.query;

  try {
    const result = await pool.query('SELECT security_question FROM users WHERE email = $1', [email]);
    res.json({
      email,
      question: result.rows[0]?.security_question || 'No question found'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rate limiting bypass
router.post('/verify-code', (req, res) => {
  const { code } = req.body;

  // VULN: No rate limiting on verification
  const correctCode = '123456';

  if (code === correctCode) {
    res.json({ success: true, message: 'Code verified!' });
  } else {
    res.json({ success: false, message: 'Invalid code' });
  }
});

module.exports = router;
