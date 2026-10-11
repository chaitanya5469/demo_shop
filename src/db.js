/**
 * db.js — In-memory fake DB with a configurable connection pool.
 *
 * The pool has a configurable `max` (default: 1, seeded bug) and
 * `acquireTimeoutMs`. When all connections are in use, acquire() waits
 * until one is released or the timeout fires.
 *
 * SEEDED BUG: max is set to 1, so concurrent checkouts cause pool exhaustion.
 */

const logger = require('./logger');

// ─── Pool configuration ────────────────────────────────────────────────────
const POOL_CONFIG = {
  max: 10,
  acquireTimeoutMs: 1000,
  queryLatencyMs: 150,  // simulated query latency (10 requests at max:1 = 1500ms > 1000ms timeout)
};

// ─── Connection pool implementation ───────────────────────────────────────
let availableConnections = POOL_CONFIG.max;
let waitQueue = [];

function releaseConnection()
{
  if (waitQueue.length > 0) {
    const resolve = waitQueue.shift();
    resolve(); // give connection to the next waiter
  } else {
    availableConnections++;
  }
}

function acquireConnection() {
  return new Promise((resolve, reject) => {
    if (availableConnections > 0) {
      availableConnections--;
      resolve();
      return;
    }

    // No connection available — queue the waiter with a timeout
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Remove from queue
        const idx = waitQueue.indexOf(onRelease);
        if (idx !== -1) waitQueue.splice(idx, 1);
        reject(new Error(`TimeoutError: pool acquire timeout after ${POOL_CONFIG.acquireTimeoutMs}ms`));
      }
    }, POOL_CONFIG.acquireTimeoutMs);

    const onRelease = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve();
      }
    };

    waitQueue.push(onRelease);
  });
}

// ─── In-memory orders store ────────────────────────────────────────────────
let orders = [];
let orderIdCounter = 1;

async function createOrder(item, qty) {
  await acquireConnection();
  try {
    // Simulate query latency
    await new Promise(res => setTimeout(res, POOL_CONFIG.queryLatencyMs));
    const order = { 
      id: orderIdCounter++,
      item,
      qty,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    orders.push(order);
    logger.info('Order created', { orderId: order.id, item, qty });
    return order;
  } finally {
    releaseConnection();
  }
}

function getPoolConfig() {
  return {
    max: POOL_CONFIG.max,
    acquireTimeoutMs: POOL_CONFIG.acquireTimeoutMs,
    available: availableConnections,
    queueLength: waitQueue.length,
  };
}

function getOrders() {
  return [...orders];
}

// Allow external code to reset (used in tests)
function resetPool(newMax) {
  if (newMax !== undefined) {
    POOL_CONFIG.max = newMax;
  }
  availableConnections = POOL_CONFIG.max;
  waitQueue = [];
  orders = [];
  orderIdCounter = 1;
}

module.exports = { createOrder, getPoolConfig, getOrders, resetPool, POOL_CONFIG };
