/**
 * Products Routes
 *
 * Product catalog, category, new arrivals, sale items
 *
 * VULNERABILITIES (INTENTIONAL - DO NOT FIX):
 * - /products/:id - SQL Injection via id parameter
 * - /products/:id/reviews - Stored XSS
 * - /products/:id/image - File upload without validation
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool } = require('../db');

const upload = multer({ dest: 'uploads/' });

// ==========================================
// PRODUCT LISTING ROUTES
// ==========================================

// All Products Page with Pagination
router.get('/products', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;

  try {
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM products');
    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    // Get paginated products
    const result = await pool.query(
      'SELECT id, name, price, image_url, category, badge, original_price, description FROM products ORDER BY id LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      image_url: p.image_url,
      category: p.category || 'General',
      badge: p.badge,
      originalPrice: p.original_price ? parseFloat(p.original_price) : null,
      description: p.description
    }));

    res.render('products', {
      products,
      title: 'All Products - LUXORA',
      category: 'All',
      pagination: {
        page,
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Category Page with Pagination
router.get('/category/:name', async (req, res) => {
  const { name } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;

  try {
    // Get total count for category
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM products WHERE category ILIKE $1',
      [`%${name}%`]
    );
    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    const result = await pool.query(
      'SELECT id, name, price, image_url, category, badge, original_price, description FROM products WHERE category ILIKE $1 LIMIT $2 OFFSET $3',
      [`%${name}%`, limit, offset]
    );
    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      image_url: p.image_url,
      category: p.category || 'General',
      badge: p.badge,
      originalPrice: p.original_price ? parseFloat(p.original_price) : null,
      description: p.description
    }));
    res.render('products', {
      products,
      title: `${name} - LUXORA`,
      category: name,
      pagination: {
        page,
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// New Arrivals
router.get('/new-arrivals', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM products WHERE badge = $1',
      ['New']
    );
    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    const result = await pool.query(
      'SELECT id, name, price, image_url, category, badge, original_price, description FROM products WHERE badge = $1 ORDER BY id DESC LIMIT $2 OFFSET $3',
      ['New', limit, offset]
    );
    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      image_url: p.image_url,
      category: p.category || 'General',
      badge: p.badge,
      originalPrice: p.original_price ? parseFloat(p.original_price) : null,
      description: p.description
    }));
    res.render('products', {
      products,
      title: 'New Arrivals - LUXORA',
      category: 'New Arrivals',
      pagination: { page, totalPages, totalProducts, hasNext: page < totalPages, hasPrev: page > 1 }
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Sale Items
router.get('/sale', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM products WHERE badge = $1 OR original_price IS NOT NULL',
      ['Sale']
    );
    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    const result = await pool.query(
      'SELECT id, name, price, image_url, category, badge, original_price, description FROM products WHERE badge = $1 OR original_price IS NOT NULL LIMIT $2 OFFSET $3',
      ['Sale', limit, offset]
    );
    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      image_url: p.image_url,
      category: p.category || 'General',
      badge: p.badge,
      originalPrice: p.original_price ? parseFloat(p.original_price) : null,
      description: p.description
    }));
    res.render('products', {
      products,
      title: 'Sale - LUXORA',
      category: 'Sale',
      pagination: { page, totalPages, totalProducts, hasNext: page < totalPages, hasPrev: page > 1 }
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// PRODUCT DETAIL ROUTES
// ==========================================

// Product Detail Page - VULN: IDOR via product ID
router.get('/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // VULN: No parameterized query (SQL Injection possible via ID)
    const query = `SELECT * FROM products WHERE id = ${id}`;
    const result = await pool.query(query);

    if (result.rows.length > 0) {
      // Convert DECIMAL to number for template rendering (PostgreSQL returns strings)
      const product = result.rows[0];
      if (product.price) product.price = parseFloat(product.price);
      if (product.original_price) product.original_price = parseFloat(product.original_price);

      // Get reviews - VULN: Stored XSS will be rendered
      const reviewsResult = await pool.query('SELECT * FROM comments ORDER BY created_at DESC LIMIT 10');
      res.render('product', { product, reviews: reviewsResult.rows });
    } else {
      res.status(404).send('Product not found');
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Product Reviews - VULN: Stored XSS
router.post('/products/:id/reviews', async (req, res) => {
  const { id } = req.params;
  const { author, content } = req.body;

  try {
    // VULN: No input sanitization - Stored XSS
    await pool.query(
      'INSERT INTO comments (author, content) VALUES ($1, $2)',
      [author, content]
    );
    res.redirect(`/products/${id}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Product image upload - VULN: No file type validation, path traversal
router.post('/products/:id/image', upload.single('image'), (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // VULN: No file type validation - can upload any file type including .php, .jsp
  // VULN: Original filename preserved
  // VULN: File is executable if server misconfigured
  res.json({
    message: 'Image uploaded',
    productId: id,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    path: req.file.path,
    url: `/uploads/${req.file.filename}`
  });
});

module.exports = router;
