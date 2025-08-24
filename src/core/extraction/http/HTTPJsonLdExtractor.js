/**
 * HTTPJsonLdExtractor - Fast HTTP-based JSON-LD product extraction
 * 
 * Fetches product pages via HTTP and parses JSON-LD structured data directly
 * from HTML without browser automation. Falls back to browser on any failure.
 * 
 * Key Features:
 * - Single HTTP request per URL (no retries)
 * - Immediate fallback on any error
 * - Per-host rate limiting and success tracking
 * - Configurable timeouts, headers, content limits
 * - Supports multiple JSON-LD blocks and @graph arrays
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const HttpRequestBuilder = require('../../../common/network/HttpRequestBuilder');

class HTTPJsonLdExtractor {
  constructor(logger, options = {}) {
    this.logger = logger;
    
    // Configurable options with environment variable overrides
    this.config = {
      enabled: process.env.EXTRACTION_HTTP_ENABLED !== 'false', // Default: true
      timeoutMs: parseInt(process.env.EXTRACTION_HTTP_TIMEOUT_MS) || options.timeoutMs || 5000,
      maxResponseBytes: parseInt(process.env.EXTRACTION_HTTP_MAX_RESPONSE_BYTES) || options.maxResponseBytes || 3 * 1024 * 1024, // 3MB
      perHostMinTimeMs: parseInt(process.env.EXTRACTION_HTTP_PER_HOST_MIN_TIME_MS) || options.perHostMinTimeMs || 300,
      maxConcurrentPerHost: parseInt(process.env.EXTRACTION_HTTP_PER_HOST_MAX_CONCURRENT) || options.maxConcurrentPerHost || 2,
      allowedContentTypes: (process.env.EXTRACTION_HTTP_ALLOWED_CONTENT_TYPES || 'text/html').split(',').map(t => t.trim())
    };

    // Initialize HTTP request builder with realistic headers
    this.httpBuilder = new HttpRequestBuilder(logger, {
      timeout: this.config.timeoutMs,
      maxRetries: 1, // Single retry with different profile
      userAgent: process.env.EXTRACTION_HTTP_USER_AGENT || options.userAgent,
      acceptLanguage: process.env.EXTRACTION_HTTP_ACCEPT_LANGUAGE || options.acceptLanguage,
      includeReferer: true,
      respectRobots: true
    });
    
    // Per-host rate limiting and success tracking
    this.hostStats = new Map(); // host -> { attempts, successes, failures, lastRequestTime, activeRequests }
    
    this.logger.info('HTTPJsonLdExtractor initialized', {
      enabled: this.config.enabled,
      timeoutMs: this.config.timeoutMs,
      perHostMinTimeMs: this.config.perHostMinTimeMs
    });
  }

  /**
   * Extract product data via HTTP JSON-LD parsing
   * @param {string} url Product URL to extract
   * @returns {Object} { ok: boolean, product?: Object, reason?: string, errorMessage?: string }
   */
  async extract(url) {
    if (!this.config.enabled) {
      return { ok: false, reason: 'http_disabled', errorMessage: 'HTTP extraction disabled by config' };
    }

    const startTime = Date.now();
    let host;
    let rateLimitResult;
    
    try {
      const urlObj = new URL(url);
      host = urlObj.hostname;
      
      // Enforce per-host rate limiting
      rateLimitResult = await this.enforceRateLimit(host);
      if (!rateLimitResult.ok) {
        return rateLimitResult;
      }
      
      // Track attempt
      this.recordAttempt(host, 'attempt');
      
      this.logger.debug('Starting HTTP extraction', { url, host });
      
      // Build realistic browser-like request configuration
      const requestConfig = this.httpBuilder.buildRequestConfig(url, {
        maxContentLength: this.config.maxResponseBytes,
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 400 // Accept 200-399
      });
      
      // Log the request with realistic headers
      this.httpBuilder.logRequest(url, 0, requestConfig.headers);
      
      // Single HTTP request with realistic headers
      const response = await axios.get(url, requestConfig);
      
      // Validate content type
      const contentType = response.headers['content-type'] || '';
      const isValidContentType = this.config.allowedContentTypes.some(type => 
        contentType.toLowerCase().includes(type.toLowerCase())
      );
      
      if (!isValidContentType) {
        const result = { ok: false, reason: 'invalid_content_type', errorMessage: `Content-Type: ${contentType}` };
        this.recordAttempt(host, 'failure', result.reason);
        return result;
      }
      
      // Parse HTML and extract JSON-LD
      const $ = cheerio.load(response.data);
      const jsonLdBlocks = $('script[type="application/ld+json"]');
      
      if (jsonLdBlocks.length === 0) {
        const result = { ok: false, reason: 'no_jsonld', errorMessage: 'No JSON-LD script tags found' };
        this.recordAttempt(host, 'failure', result.reason);
        return result;
      }
      
      // Process all JSON-LD blocks
      let productData = null;
      const allJsonLd = [];
      
      jsonLdBlocks.each((i, element) => {
        try {
          const jsonText = $(element).html();
          if (!jsonText || jsonText.trim() === '') return;
          
          const parsed = JSON.parse(jsonText);
          allJsonLd.push(parsed);
          
          // Find Product schema objects
          const products = this.findProductSchemas(parsed);
          if (products.length > 0 && !productData) {
            productData = products[0]; // Use first valid product
          }
        } catch (parseError) {
          this.logger.debug('Failed to parse JSON-LD block', { 
            url, 
            blockIndex: i, 
            error: parseError.message 
          });
        }
      });
      
      if (!productData) {
        const result = { ok: false, reason: 'no_product_schema', errorMessage: 'No Product schema found in JSON-LD' };
        this.recordAttempt(host, 'failure', result.reason);
        return result;
      }
      
      // Normalize product data
      const normalizedProduct = this.normalizeProductData(productData, url);
      
      const extractionTime = Date.now() - startTime;
      this.recordAttempt(host, 'success');
      
      this.logger.info('HTTP extraction successful', {
        url,
        host,
        extractionTime,
        hasPrice: !!normalizedProduct.price,
        hasTitle: !!normalizedProduct.title,
        jsonLdBlocks: jsonLdBlocks.length
      });
      
      return {
        ok: true,
        product: normalizedProduct,
        metadata: {
          extractionMethod: 'http_jsonld',
          extractionTime,
          jsonLdBlocks: jsonLdBlocks.length,
          responseSize: response.data.length
        }
      };
      
    } catch (error) {
      const extractionTime = Date.now() - startTime;
      let reason = 'network_error';
      
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        reason = 'timeout';
      } else if (error.response) {
        reason = `http_${error.response.status}`;
      }
      
      if (host) {
        this.recordAttempt(host, 'failure', reason);
      }
      
      this.logger.debug('HTTP extraction failed', {
        url,
        host,
        reason,
        error: error.message,
        extractionTime
      });
      
      return {
        ok: false,
        reason,
        errorMessage: error.message
      };
    } finally {
      // Always cleanup the active request counter
      if (rateLimitResult && rateLimitResult.cleanup) {
        rateLimitResult.cleanup();
      }
    }
  }

  /**
   * Enforce per-host rate limiting
   */
  async enforceRateLimit(host) {
    const stats = this.getHostStats(host);
    const now = Date.now();
    
    // Wait for available slot if at concurrent limit (queue instead of reject)
    while (stats.activeRequests >= this.config.maxConcurrentPerHost) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms and check again
    }
    
    // Check minimum time between requests
    const timeSinceLastRequest = now - stats.lastRequestTime;
    if (timeSinceLastRequest < this.config.perHostMinTimeMs) {
      const waitTime = this.config.perHostMinTimeMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Update request tracking
    stats.activeRequests++;
    stats.lastRequestTime = Date.now();
    
    // Return cleanup function to be called when request actually completes
    return { 
      ok: true,
      cleanup: () => {
        stats.activeRequests = Math.max(0, stats.activeRequests - 1);
      }
    };
  }

  /**
   * Find Product schema objects in parsed JSON-LD
   */
  findProductSchemas(jsonLd) {
    const products = [];
    
    const processItem = (item) => {
      if (!item || typeof item !== 'object') return;
      
      // Check if this item is a Product
      const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
      if (types.some(type => typeof type === 'string' && type.toLowerCase().includes('product'))) {
        products.push(item);
        return;
      }
      
      // Check @graph array
      if (item['@graph'] && Array.isArray(item['@graph'])) {
        item['@graph'].forEach(processItem);
      }
      
      // Check if item is an array
      if (Array.isArray(item)) {
        item.forEach(processItem);
      }
    };
    
    // Handle top-level arrays
    if (Array.isArray(jsonLd)) {
      jsonLd.forEach(processItem);
    } else {
      processItem(jsonLd);
    }
    
    return products;
  }

  /**
   * Normalize Product schema data to standard format
   */
  normalizeProductData(productSchema, sourceUrl) {
    const product = {
      source_url: sourceUrl,
      extractionMethod: 'http_jsonld',
      extractedAt: new Date().toISOString()
    };
    
    // Basic product info
    product.title = productSchema.name || null;
    product.description = productSchema.description || null;
    product.sku = productSchema.sku || null;
    product.brand = productSchema.brand?.name || productSchema.brand || null;
    
    // Handle offers/pricing
    const offers = productSchema.offers;
    if (offers) {
      const offerArray = Array.isArray(offers) ? offers : [offers];
      const validOffer = offerArray.find(offer => offer.price || offer.priceSpecification?.price);
      
      if (validOffer) {
        const priceValue = validOffer.price || validOffer.priceSpecification?.price;
        if (priceValue) {
          // Convert price to cents (assuming USD)
          const numericPrice = parseFloat(String(priceValue).replace(/[^\d.]/g, ''));
          product.price = isNaN(numericPrice) ? null : Math.round(numericPrice * 100);
        }
        
        product.currency = validOffer.priceCurrency || 'USD';
        product.availability = validOffer.availability || null;
      }
    }
    
    // Handle images
    const images = productSchema.image;
    if (images) {
      const imageArray = Array.isArray(images) ? images : [images];
      product.images = imageArray.map(img => 
        typeof img === 'string' ? img : img.url || img.contentUrl || img
      ).filter(Boolean);
    }
    
    // Categories
    if (productSchema.category) {
      product.categories = Array.isArray(productSchema.category) ? 
        productSchema.category : [productSchema.category];
    }
    
    return product;
  }

  /**
   * Get or create host statistics
   */
  getHostStats(host) {
    if (!this.hostStats.has(host)) {
      this.hostStats.set(host, {
        attempts: 0,
        successes: 0,
        failures: 0,
        lastRequestTime: 0,
        activeRequests: 0,
        lastReason: null
      });
    }
    return this.hostStats.get(host);
  }

  /**
   * Record extraction attempt outcome
   */
  recordAttempt(host, outcome, reason = null) {
    const stats = this.getHostStats(host);
    
    stats.attempts++;
    if (outcome === 'success') {
      stats.successes++;
    } else if (outcome === 'failure') {
      stats.failures++;
      stats.lastReason = reason;
    }
    
    // Log periodic statistics
    if (stats.attempts % 10 === 0) {
      const successRate = Math.round((stats.successes / stats.attempts) * 100);
      this.logger.info('HTTP extraction statistics', {
        host,
        attempts: stats.attempts,
        successes: stats.successes,
        failures: stats.failures,
        successRate: `${successRate}%`,
        lastReason: stats.lastReason
      });
    }
  }

  /**
   * Get success statistics for a host
   */
  getHostSuccessRate(host) {
    const stats = this.hostStats.get(host);
    if (!stats || stats.attempts === 0) return 0;
    return stats.successes / stats.attempts;
  }

  /**
   * Get all host statistics
   */
  getAllStats() {
    const result = {};
    for (const [host, stats] of this.hostStats) {
      result[host] = {
        ...stats,
        successRate: stats.attempts > 0 ? Math.round((stats.successes / stats.attempts) * 100) : 0
      };
    }
    return result;
  }
}

module.exports = HTTPJsonLdExtractor;