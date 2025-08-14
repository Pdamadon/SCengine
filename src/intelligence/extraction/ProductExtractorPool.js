/**
 * ProductExtractorPool - Manages parallel product extraction workers
 * 
 * This class coordinates multiple browser instances to extract product details
 * from URLs collected during the discovery phase. It handles:
 * - Worker pool management
 * - Rate limiting per worker
 * - Batch processing
 * - Error recovery
 * - Progress tracking
 */

const { chromium } = require('playwright');
const { createDomainRateLimiter } = require('../../utils/rateLimiter');

class ProductExtractorPool {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.options = {
      maxWorkers: options.maxWorkers || 10,
      batchSize: options.batchSize || 5,
      retryFailures: options.retryFailures !== false,
      maxRetries: options.maxRetries || 3,
      workerTimeout: options.workerTimeout || 30000,
      headless: options.headless !== false,
      ...options
    };

    this.workers = [];
    this.activeWorkers = 0;
    this.processedCount = 0;
    this.failedUrls = [];
    this.results = [];
    this.rateLimiter = null;
    this.isShutdown = false;
  }

  /**
   * Initialize the worker pool
   */
  async initialize(domain) {
    this.domain = domain;
    
    // Initialize rate limiter for the domain
    this.rateLimiter = createDomainRateLimiter(domain);
    this.rateLimiter.configure({
      baseDelay: 2000,
      minDelay: 1000,
      maxDelay: 5000
    });

    this.logger.info('ProductExtractorPool initialized', {
      domain,
      maxWorkers: this.options.maxWorkers,
      batchSize: this.options.batchSize
    });
  }

  /**
   * Process a batch of product URLs
   */
  async processBatch(urls, extractionLogic, progressCallback) {
    if (!urls || urls.length === 0) {
      return { products: [], failed: [] };
    }

    const startTime = Date.now();
    const totalUrls = urls.length;
    const batches = this.createBatches(urls, this.options.batchSize);

    this.logger.info('Starting batch processing', {
      totalUrls,
      batches: batches.length,
      workersToSpawn: Math.min(batches.length, this.options.maxWorkers)
    });

    // Process batches with worker pool
    const batchPromises = [];
    for (let i = 0; i < batches.length; i++) {
      // Wait if we've reached max workers
      while (this.activeWorkers >= this.options.maxWorkers && !this.isShutdown) {
        await this.sleep(100);
      }

      if (this.isShutdown) break;

      const workerPromise = this.processWorkerBatch(
        batches[i], 
        extractionLogic, 
        i,
        progressCallback
      );
      batchPromises.push(workerPromise);
    }

    // Wait for all workers to complete
    const batchResults = await Promise.allSettled(batchPromises);

    // Aggregate results
    const aggregated = this.aggregateResults(batchResults);

    // Retry failed URLs if enabled
    if (this.options.retryFailures && aggregated.failed.length > 0) {
      const retryResults = await this.retryFailed(
        aggregated.failed, 
        extractionLogic,
        progressCallback
      );
      aggregated.products.push(...retryResults.products);
      aggregated.failed = retryResults.failed;
    }

    const duration = Date.now() - startTime;
    this.logger.info('Batch processing completed', {
      duration,
      processed: aggregated.products.length,
      failed: aggregated.failed.length,
      successRate: `${((aggregated.products.length / totalUrls) * 100).toFixed(1)}%`
    });

    return aggregated;
  }

  /**
   * Process a single batch with a worker
   */
  async processWorkerBatch(batch, extractionLogic, workerId, progressCallback) {
    this.activeWorkers++;
    let browser = null;

    try {
      // Launch browser for this worker
      browser = await chromium.launch({
        headless: this.options.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const context = await browser.newContext({
        userAgent: this.getUserAgent(workerId),
        viewport: { width: 1920, height: 1080 }
      });

      const products = [];
      const failed = [];

      for (const url of batch) {
        try {
          // Apply rate limiting
          await this.rateLimiter.waitForNextSlot();

          // Extract product details
          const page = await context.newPage();
          
          // Set timeout for page operations
          page.setDefaultTimeout(this.options.workerTimeout);

          await page.goto(url, { waitUntil: 'domcontentloaded' });

          // Use provided extraction logic
          const product = await extractionLogic(page, url);
          
          if (product) {
            products.push({
              ...product,
              url,
              extracted_at: new Date().toISOString(),
              worker_id: workerId
            });
          } else {
            failed.push({ url, reason: 'No product data extracted' });
          }

          await page.close();
          
          this.processedCount++;
          
          // Report progress
          if (progressCallback) {
            const progress = (this.processedCount / batch.length) * 100;
            progressCallback(progress, `Worker ${workerId}: Processed ${this.processedCount} products`);
          }

        } catch (error) {
          this.logger.warn(`Worker ${workerId} failed to extract ${url}`, {
            error: error.message
          });
          failed.push({ url, error: error.message });
        }
      }

      return { products, failed };

    } catch (error) {
      this.logger.error(`Worker ${workerId} crashed`, { error: error.message });
      return { 
        products: [], 
        failed: batch.map(url => ({ url, error: 'Worker crashed' }))
      };

    } finally {
      this.activeWorkers--;
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Retry failed URLs with exponential backoff
   */
  async retryFailed(failedItems, extractionLogic, progressCallback) {
    const products = [];
    const stillFailed = [];

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      if (failedItems.length === 0) break;

      this.logger.info(`Retry attempt ${attempt}/${this.options.maxRetries}`, {
        urls: failedItems.length
      });

      // Exponential backoff
      await this.sleep(Math.pow(2, attempt) * 1000);

      const retryBatch = failedItems.map(item => 
        typeof item === 'string' ? item : item.url
      );

      const retryResult = await this.processBatch(
        retryBatch, 
        extractionLogic,
        progressCallback
      );

      products.push(...retryResult.products);
      failedItems = retryResult.failed;
    }

    return { products, failed: failedItems };
  }

  /**
   * Create batches from URL array
   */
  createBatches(urls, batchSize) {
    const batches = [];
    for (let i = 0; i < urls.length; i += batchSize) {
      batches.push(urls.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Aggregate results from all workers
   */
  aggregateResults(batchResults) {
    const products = [];
    const failed = [];

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        products.push(...(result.value.products || []));
        failed.push(...(result.value.failed || []));
      } else if (result.status === 'rejected') {
        this.logger.error('Batch failed completely', {
          reason: result.reason
        });
      }
    }

    return { products, failed };
  }

  /**
   * Get rotating user agent for worker
   */
  getUserAgent(workerId) {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/91.0.4472.124',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/91.0.4472.124'
    ];
    return userAgents[workerId % userAgents.length];
  }

  /**
   * Shutdown all workers gracefully
   */
  async shutdown() {
    this.isShutdown = true;
    
    // Wait for active workers to complete
    while (this.activeWorkers > 0) {
      await this.sleep(100);
    }

    this.logger.info('ProductExtractorPool shut down', {
      totalProcessed: this.processedCount,
      totalFailed: this.failedUrls.length
    });
  }

  /**
   * Helper sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProductExtractorPool;