/**
 * Route Aggregator
 * Mounts all route modules for Benchmark v2.0
 */

const express = require('express');
const router = express.Router();

// Import route modules
const infoRoutes = require('./info');
const adminRoutes = require('./admin');
const pageRoutes = require('./pages');
const productsRoutes = require('./products');
const ordersRoutes = require('./orders');
const usersRoutes = require('./users');
const injectionRoutes = require('./injection');
const authRoutes = require('./auth');
const accessRoutes = require('./access');
const clientRoutes = require('./client');
const fileRoutes = require('./file');
const serverRoutes = require('./server');
const remainingRoutes = require('./remaining');

// Mount routes
router.use('/', infoRoutes);
router.use('/', adminRoutes);
router.use('/', pageRoutes);
router.use('/', productsRoutes);
router.use('/', ordersRoutes);
router.use('/', usersRoutes);

// Benchmark v2.0 tiered routes
router.use('/', injectionRoutes);
router.use('/', authRoutes);
router.use('/', accessRoutes);
router.use('/', clientRoutes);
router.use('/', fileRoutes);
router.use('/', serverRoutes);
router.use('/', remainingRoutes);

module.exports = router;
