#!/usr/bin/env node

/**
 * Migration script to update WorldModel.js from RedisCacheFactory to RedisCacheManager
 * 
 * This script demonstrates the key changes needed:
 * 1. Import change: RedisCacheFactory -> RedisCacheManager
 * 2. Initialization: cache.connect() -> cache.initialize()
 * 3. Key-based operations -> Namespace-based operations
 */

const fs = require('fs');
const path = require('path');

// Map old Redis operations to new namespace-based operations
const migrationMap = {
  // Site Navigation
  'site_nav:': {
    namespace: 'navigation',
    identifier: 'site_nav',
    ttl: 7 * 24 * 60 * 60 // 7 days
  },
  
  // Selectors
  'selector:': {
    namespace: 'selectors', 
    identifier: null, // Use elementType as identifier
    ttl: 3 * 24 * 60 * 60 // 3 days
  },
  
  // URL Patterns
  'url_patterns:': {
    namespace: 'discovery',
    identifier: 'url_patterns',
    ttl: 7 * 24 * 60 * 60 // 7 days
  },
  
  // Products
  'product:': {
    namespace: 'discovery',
    identifier: null, // Use product URL hash as identifier
    ttl: 60 * 60 // 1 hour
  },
  
  // Learning patterns
  'learning:': {
    namespace: 'learning',
    identifier: null, // No additional identifier needed
    ttl: 30 * 24 * 60 * 60 // 30 days
  },
  
  // Selector success tracking
  'selector_success:': {
    namespace: 'selectors',
    identifier: null, // Use combination as identifier
    ttl: 14 * 24 * 60 * 60 // 14 days
  }
};

console.log('WorldModel.js Migration Guide to RedisCacheManager');
console.log('=============================================\n');

console.log('Step 1: Change imports');
console.log('FROM: const RedisCacheFactory = require(\'../cache/RedisCacheFactory\');');
console.log('TO:   const RedisCacheManager = require(\'../cache/RedisCacheManager\');\n');

console.log('Step 2: Change initialization');
console.log('FROM: this.cache = RedisCacheFactory.getInstance(logger, \'WorldModel\');');
console.log('TO:   this.cache = RedisCacheManager.getInstance(logger);\n');

console.log('FROM: await this.cache.connect();');
console.log('TO:   await this.cache.initialize();\n');

console.log('Step 3: Update cache operations\n');

console.log('Example migrations:');
console.log('-------------------\n');

// Store operations
console.log('STORE OPERATIONS:');
console.log('FROM: await this.cache.redis.setex(key, ttl, JSON.stringify(data))');
console.log('TO:   await this.cache.set(namespace, domain, data, identifier)\n');

console.log('Example - Site Navigation:');
console.log('FROM: const key = `site_nav:${domain}`;');
console.log('      await this.cache.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(intelligence));');
console.log('TO:   await this.cache.set(\'navigation\', domain, intelligence, \'site_nav\');\n');

console.log('Example - Selectors:');
console.log('FROM: const key = `selector:${domain}:${elementType}`;');
console.log('      await this.cache.redis.setex(key, 3 * 24 * 60 * 60, JSON.stringify(selectorIntelligence));');
console.log('TO:   await this.cache.set(\'selectors\', domain, selectorIntelligence, elementType);\n');

// Get operations
console.log('GET OPERATIONS:');
console.log('FROM: cached = await this.cache.redis.get(key);');
console.log('      const data = JSON.parse(cached);');
console.log('TO:   const data = await this.cache.get(namespace, domain, identifier);\n');

console.log('Example - Site Navigation:');
console.log('FROM: const key = `site_nav:${domain}`;');
console.log('      cached = await this.cache.redis.get(key);');
console.log('      const intelligence = JSON.parse(cached);');
console.log('TO:   const intelligence = await this.cache.get(\'navigation\', domain, \'site_nav\');\n');

// Pattern matching operations
console.log('PATTERN OPERATIONS:');
console.log('FROM: const keys = await this.cache.redis.keys(\'learning:*\');');
console.log('TO:   // Use clearNamespace or iterate with specific domains\n');

console.log('Step 4: Remove fallback checks');
console.log('FROM: if (this.cache.connected && this.cache.redis) { ... } else if (this.cache.memoryCache) { ... }');
console.log('TO:   // RedisCacheManager handles fallback internally');
console.log('      await this.cache.set(...); // Just call directly\n');

console.log('Step 5: Key differences to remember:');
console.log('- RedisCacheManager handles JSON serialization automatically');
console.log('- TTL is managed per namespace (can override with customTTL parameter)');
console.log('- Memory fallback is handled internally');
console.log('- Batch operations available via setBatch()');
console.log('- Statistics available via getStats()');

console.log('\n=============================================');
console.log('Run this migration carefully and test each change!');