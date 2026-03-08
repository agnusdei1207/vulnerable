/**
 * Database Layer
 * Centralized PostgreSQL connection pool for Benchmark v2.0
 */

const { Pool } = require('pg');

// Create singleton pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://vulnuser:vulnpass@localhost:5432/vulndb'
});

// Pool event logging (for development/debugging)
pool.on('connect', () => {
  console.log('Database connected');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error', { text, error });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Pool client
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Close all connections and shut down the pool
 * @returns {Promise<void>}
 */
const close = async () => {
  await pool.end();
  console.log('Database pool closed');
};

/**
 * Health check
 * @returns {Promise<boolean>} True if healthy
 */
const healthCheck = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed', error);
    return false;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  close,
  healthCheck
};
