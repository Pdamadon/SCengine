/**
 * SimpleSelectorCache - Minimal selector memory
 * 
 * NOT a complex system - just remembers what worked
 * Stays simple, stays fast, stays maintainable
 */

class SimpleSelectorCache {
  constructor() {
    this.cache = new Map();
  }

  // Remember what worked for a domain
  remember(domain, selector) {
    this.cache.set(domain, selector);
  }

  // Try to use what worked before
  getSelector(domain) {
    return this.cache.get(domain) || null;
  }

  // That's it! No complex learning, no ML, no overthinking
}

module.exports = SimpleSelectorCache;