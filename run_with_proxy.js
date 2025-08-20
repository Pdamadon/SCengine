#!/usr/bin/env node

/**
 * Simple wrapper that ensures your scraper ALWAYS uses proxy
 * No firewall rules needed - just run your tests through this
 * 
 * Usage: node run_with_proxy.js test_product_catalog.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

// Check proxy is configured
if (!process.env.BRIGHTDATA_USERNAME) {
  console.error('❌ ERROR: BrightData proxy not configured in .env');
  console.error('Please set BRIGHTDATA_USERNAME, BRIGHTDATA_PASSWORD, and BRIGHTDATA_ZONE');
  process.exit(1);
}

// Get test file from args
const testFile = process.argv[2];
if (!testFile) {
  console.error('Usage: node run_with_proxy.js <test-file.js>');
  process.exit(1);
}

console.log('🔒 Running with forced proxy configuration');
console.log('=' .repeat(60));
console.log(`Proxy: brd.superproxy.io:33335`);
console.log(`Zone: ${process.env.BRIGHTDATA_ZONE}`);
console.log(`Test: ${testFile}`);
console.log('=' .repeat(60));
console.log('');

// Set environment to force proxy
const env = {
  ...process.env,
  FORCE_PROXY: 'true',
  DISABLE_DIRECT_CONNECTION: 'true',
  NODE_ENV: 'development'
};

// Run the test
const child = spawn('node', [testFile], {
  stdio: 'inherit',
  env
});

child.on('exit', (code) => {
  process.exit(code);
});