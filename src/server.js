/**
 * server.js — Express API for demo_shop.
 *
 * Routes:
 *   GET  /             → serves frontend (public/index.html)
 *   POST /api/checkout → creates one order
 *   GET  /api/health   → returns service status + pool config
 *   POST /api/simulate-spike → fires 10 concurrent checkouts, returns per-request results
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const path = require('path');
const logger = require('./logger');
const { createOrder, getPoolConfig, getOrders } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Health endpoint ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const pool = getPoolConfig();
  res.json({
    status: 'ok',
    service: 'checkout-service',
    pool,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Single checkout ───────────────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { item = 'widget', qty = 1 } = req.body;
  try {
    const order = await createOrder(item, qty);
    res.json({ success: true, order });
  } catch (err) {
    logger.error(`Checkout failed: ${err.message}`, { route: '/api/checkout', stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Simulate traffic spike ────────────────────────────────────────────────
app.post('/api/simulate-spike', async (req, res) => {
  logger.info('Simulating traffic spike: 10 concurrent checkouts');

  const promises = Array.from({ length: 10 }, (_, i) =>
    createOrder(`spike-item-${i + 1}`, 1)
      .then(order => ({ index: i + 1, success: true, order }))
      .catch(err => {
        logger.error(`Spike checkout ${i + 1} failed: ${err.message}`, {
          route: '/api/simulate-spike',
          requestIndex: i + 1,
          stack: err.stack,
        });
        return { index: i + 1, success: false, error: err.message };
      })
  );

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  logger.info(`Spike complete: ${successCount} succeeded, ${failCount} failed`);

  res.json({
    results,
    summary: { total: 10, success: successCount, failed: failCount },
    pool: getPoolConfig(),
  });
});

// ─── Serve frontend for all other GET routes ───────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start server ──────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`demo_shop checkout-service listening on http://localhost:${PORT}`);
    logger.info(`Pool config: ${JSON.stringify(getPoolConfig())}`);
  });
}

module.exports = app; // Export for testing
