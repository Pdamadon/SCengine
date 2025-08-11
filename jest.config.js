module.exports = {
  // Test Environment
  testEnvironment: 'node',
  
  // Coverage Configuration (per SCRAPING_REQUIREMENTS.md: 80% minimum)
  collectCoverage: false, // Enable with --coverage flag
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/index.js', // Main entry point
    '!**/node_modules/**',
    '!coverage/**',
  ],
  
  // Test Configuration
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js',
    '<rootDir>/src/**/*.test.js',
    '<rootDir>/src/**/*.spec.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/data/',
    '/results/',
  ],
  
  // Setup and Teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Test Timeout (per SCRAPING_REQUIREMENTS.md: scraping tests may need longer timeouts)
  testTimeout: 30000, // 30 seconds for scraping tests
  
  // Module Resolution
  moduleDirectories: ['node_modules', 'src'],
  
  // Performance and Reliability
  maxWorkers: '50%', // Use half of available CPU cores
  bail: false, // Don't stop on first failure
  verbose: true,
  
  // Mock Configuration
  clearMocks: true,
  restoreMocks: true,
  
  // Error Handling
  errorOnDeprecated: true,
  
  // Test Categories
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      // testTimeout: 10000, // Use global timeout instead
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      // testTimeout: 30000, // Use global timeout instead
    },
    {
      displayName: 'system',
      testMatch: ['<rootDir>/tests/system/**/*.test.js'],
      // testTimeout: 60000, // Use global timeout instead
      slowTestThreshold: 10000,
    },
  ],
  
  // Reporting
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './coverage/html-report',
        filename: 'report.html',
        expand: true,
        hideIcon: false,
      },
    ],
  ],
};