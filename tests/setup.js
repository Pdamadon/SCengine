/**
 * Global test setup and configuration
 * This file runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests

// Global test timeouts and configuration
global.TEST_TIMEOUT = {
  UNIT: 10000,        // 10 seconds for unit tests
  INTEGRATION: 30000, // 30 seconds for integration tests
  SYSTEM: 60000,      // 60 seconds for system tests
  SCRAPING: 120000,   // 2 minutes for scraping tests
};

// Mock console methods to reduce test output noise
const originalConsole = { ...console };

global.enableConsole = () => {
  Object.assign(console, originalConsole);
};

global.disableConsole = () => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
  // Keep console.warn and console.error for important messages
};

// Database cleanup utilities
global.cleanupDatabase = async () => {
  // Will be implemented when we add database test helpers
  // For now, this is a placeholder for future database cleanup
  return Promise.resolve();
};

// Test data generators
global.generateTestProduct = (overrides = {}) => ({
  product_id: `test_product_${Date.now()}`,
  title: 'Test Product',
  price: 2999, // $29.99 in cents
  availability: 'in_stock',
  categories: [
    {
      category_id: 'test_category',
      category_type: 'product_type',
      category_name: 'Test Category',
      is_primary: true,
      confidence_score: 0.9,
    },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

global.generateTestCategory = (overrides = {}) => ({
  canonical_id: `test_category_${Date.now()}`,
  name: 'Test Category',
  hierarchy_level: 2,
  category_type: 'product_type',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// Network and HTTP utilities for testing
global.createMockResponse = (data, statusCode = 200) => ({
  status: statusCode,
  statusText: statusCode === 200 ? 'OK' : 'Error',
  headers: { 'content-type': 'application/json' },
  data,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

// Error handling for async tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Global error boundaries for tests
global.expectNoErrors = (fn) => {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      console.error('Unexpected error in test:', error);
      throw error;
    }
  };
};

// Performance testing utilities
global.measurePerformance = async (fn, label = 'Operation') => {
  const startTime = process.hrtime.bigint();
  const result = await fn();
  const endTime = process.hrtime.bigint();
  const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
  
  console.log(`${label} took ${duration.toFixed(2)}ms`);
  return { result, duration };
};

// Test compliance with SCRAPING_REQUIREMENTS.md
global.validateScrapingCompliance = {
  checkResponseTime: (duration, maxMs = 200) => {
    expect(duration).toBeLessThan(maxMs);
  },
  
  checkRateLimit: (requestCount, timeWindowMs, maxRequests = 10) => {
    const requestsPerSecond = (requestCount / timeWindowMs) * 1000;
    expect(requestsPerSecond).toBeLessThanOrEqual(maxRequests);
  },
  
  checkDataIntegrity: (data) => {
    expect(data).toBeDefined();
    expect(data).toHaveProperty('created_at');
    expect(data).toHaveProperty('updated_at');
    expect(new Date(data.created_at)).toBeInstanceOf(Date);
    expect(new Date(data.updated_at)).toBeInstanceOf(Date);
  },
  
  checkSecurityCompliance: (data) => {
    // Ensure no sensitive data leakage
    const dataString = JSON.stringify(data);
    expect(dataString).not.toMatch(/password|secret|key|token/i);
  },
};

// Cleanup after each test
afterEach(async () => {
  // Reset mocks
  jest.clearAllMocks();
  
  // Reset console
  Object.assign(console, originalConsole);
  
  // Clean up any test data (placeholder for future implementation)
  await global.cleanupDatabase();
});

// Global setup logging
console.log('Test setup complete - Environment:', process.env.NODE_ENV);