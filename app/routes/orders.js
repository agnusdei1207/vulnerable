/**
 * Orders & Cart Routes
 *
 * Shopping cart, wishlist, order tracking
 *
 * VULNERABILITIES (INTENTIONAL - DO NOT FIX):
 * - POST /wishlist - Stored XSS via note
 * - GET /track-order - IDOR + SQL Injection
 * - POST /cart/promo - Business logic bypass
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ==========================================
// CART
// ==========================================

// Cart Page
router.get('/cart', (req, res) => {
  // Demo cart items
  const cartItems = [
    { id: 1, name: 'Classic Leather Tote', category: 'Bags', price: 299.00, quantity: 1, size: 'M' },
    { id: 3, name: 'Cashmere Sweater', category: 'Clothing', price: 249.00, quantity: 2, size: 'L' }
  ];

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal > 100 ? 0 : 9.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  res.render('cart', { cartItems, subtotal, shipping, tax, total });
});

// Promo code - VULN: Logic bypass possible
router.post('/cart/promo', (req, res) => {
  const { code } = req.body;

  // VULN: Promo codes are predictable and can be brute-forced
  const validCodes = ['SAVE10', 'WELCOME20', 'VIP30', 'BLACKFRIDAY50', 'admin'];

  // Flaw in business logic: the admin code grants immediate access to the flag
  if (code === 'admin') {
    return res.json({
      success: true,
      message: 'Admin promo applied!',
      flag: 'FLAG{LOGIC_SUCCESS_BUSINESS_BYPASS} - 이 플래그는 Insecure Design (Business Logic Bypass) 기법이 성공적으로 통과되었음을 나타냅니다.'
    });
  }

  if (validCodes.includes(code)) {
    res.cookie('promoApplied', code);
    res.redirect('/cart');
  } else {
    res.redirect('/cart?error=invalid');
  }
});

// ==========================================
// WISHLIST
// ==========================================

// Wishlist - VULN: Stored XSS in wishlist notes
router.post('/wishlist', async (req, res) => {
  const { productId, note } = req.body;
  const session = req.cookies.session;

  if (!session) {
    return res.status(401).json({ error: 'Please login' });
  }

  try {
    const user = JSON.parse(session);
    // VULN: Note stored without sanitization - Stored XSS
    await pool.query(
      'INSERT INTO comments (author, content) VALUES ($1, $2)',
      [user.username, `Wishlist note for product ${productId}: ${note}`]
    );
    res.json({ success: true, message: 'Added to wishlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ORDER TRACKING
// ==========================================

// Order tracking - VULN: IDOR + SQL Injection
router.get('/track-order', async (req, res) => {
  const { order_id } = req.query;

  if (!order_id) {
    return res.render('track-order', { title: 'Track Order - LUXORA', order: null, error: null });
  }

  try {
    // VULN: SQL Injection in order lookup
    // VULN: IDOR - no auth check, anyone can view any order
    const query = `SELECT * FROM orders WHERE order_id = '${order_id}'`;
    const result = await pool.query(query);

    if (result.rows.length > 0) {
      res.render('track-order', { title: 'Track Order - LUXORA', order: result.rows[0], error: null });
    } else {
      // Demo order for display
      const demoOrder = {
        order_id: order_id,
        status: 'Shipped',
        estimated_delivery: '2024-02-15',
        tracking_number: 'LUX-TRACK-' + Math.random().toString(36).substr(2, 9).toUpperCase()
      };
      res.render('track-order', { title: 'Track Order - LUXORA', order: demoOrder, error: null });
    }
  } catch (err) {
    // VULN: Exposes SQL error with query
    res.render('track-order', {
      title: 'Track Order - LUXORA',
      order: null,
      error: err.message + ' | Query: SELECT * FROM orders WHERE order_id = \'' + order_id + '\''
    });
  }
});

// ==========================================
// CONTACT FORM
// ==========================================

// Contact Page (POST handler - has DB dependency)
router.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;

  // VULN: User input logged without sanitization
  console.log('Contact form:', { name, email, message });

  try {
    await pool.query(
      'INSERT INTO comments (author, content) VALUES ($1, $2)',
      [name, `Contact from ${email}: ${message}`]
    );
    res.redirect('/contact?sent=true');
  } catch (err) {
    res.redirect('/contact?sent=false');
  }
});

module.exports = router;
