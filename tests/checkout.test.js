/**
 * checkout.test.js — Fires 10 concurrent checkouts and expects zero acquire timeouts.
 * This test FAILS at baseline (pool max: 1) for the right reason.
 */

const { createOrder, resetPool, POOL_CONFIG } = require('../src/db');

// Suppress logger output during tests
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Concurrent checkout — pool exhaustion test', () => {
  beforeEach(() => {
    // Reset pool to baseline (seeded bug: max 1)
    resetPool(POOL_CONFIG.max);
  });

  afterEach(() => {
    resetPool(POOL_CONFIG.max);
  });

  test('10 concurrent checkouts should all succeed with no pool acquire timeouts', async () => {
    const requests = Array.from({ length: 10 }, (_, i) =>
      createOrder(`item-${i + 1}`, 1)
        .then(order => ({ success: true, order }))
        .catch(err => ({ success: false, error: err.message }))
    );

    const results = await Promise.all(requests);
    const failures = results.filter(r => !r.success);
    const timeoutErrors = failures.filter(r =>
      r.error && r.error.includes('pool acquire timeout')
    );

    // This assertion FAILS at baseline because pool max:1 causes timeouts
    expect(timeoutErrors).toHaveLength(0);
    expect(failures).toHaveLength(0);
  }, 15000); // 15 second timeout for all requests
});
