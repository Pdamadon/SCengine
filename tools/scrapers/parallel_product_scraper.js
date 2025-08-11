#!/usr/bin/env node

const { ParallelScraper } = require('./parallel_scraper');
const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

// Simple logger
const logger = {
  info: (...args) => console.log(`[COORDINATOR] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[COORDINATOR] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[COORDINATOR] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[COORDINATOR] ${new Date().toISOString()}:`, ...args)
};

class ParallelProductScraper {
  constructor(maxWorkers = 5) {
    this.maxWorkers = maxWorkers;
    this.parallelScraper = new ParallelScraper(maxWorkers);
    this.discoveryScaper = new GlasswingScraper(logger);
  }

  async initialize() {
    await this.parallelScraper.initialize();
    logger.info('✅ Parallel product scraper initialized');
  }

  // Strategy 1: Collection-based parallel scraping
  async scrapeCollectionsInParallel(collections) {
    logger.info(`🚀 Strategy 1: Scraping ${collections.length} collections in parallel`);
    return await this.parallelScraper.scrapeCollectionsParallel(collections);
  }

  // Strategy 2: Product URL discovery + parallel product scraping
  async scrapeProductsInParallel(collectionUrl, maxProducts = null, productsPerWorker = 10) {
    logger.info(`🔍 Strategy 2: Discovering products from ${collectionUrl}`);
    
    const startTime = Date.now();
    
    // Step 1: Discover all product URLs
    const discoveryResult = await this.discoveryScaper.scrapeCompleteCollection(collectionUrl, null); // Get ALL URLs
    
    const allProductUrls = discoveryResult.productAnalysis.map(p => p.url).filter(url => url && !url.includes('error'));
    
    // Apply maxProducts limit if specified
    const productUrls = maxProducts ? allProductUrls.slice(0, maxProducts) : allProductUrls;
    
    logger.info(`📋 Discovered ${allProductUrls.length} total products, processing ${productUrls.length}`);
    
    // Step 2: Chunk products for parallel processing
    const chunks = this.chunkArray(productUrls, productsPerWorker);
    logger.info(`📦 Split into ${chunks.length} chunks of ~${productsPerWorker} products each`);
    
    // Step 3: Create parallel jobs
    this.parallelScraper.startTime = Date.now();
    this.parallelScraper.totalJobs = chunks.length;
    this.parallelScraper.jobQueue = [];
    this.parallelScraper.completedJobs = [];
    this.parallelScraper.failedJobs = [];
    
    chunks.forEach((chunk, index) => {
      this.parallelScraper.jobQueue.push({
        jobId: `products-${index + 1}`,
        type: 'scrapeProducts',
        data: {
          productUrls: chunk
        },
        metadata: {
          chunkIndex: index,
          productCount: chunk.length
        }
      });
    });
    
    // Step 4: Execute parallel scraping
    logger.info(`⚡ Starting parallel product scraping with ${this.maxWorkers} workers`);
    
    for (let i = 0; i < Math.min(this.maxWorkers, chunks.length); i++) {
      this.parallelScraper.processNextJob();
    }
    
    // Step 5: Wait for completion and aggregate results
    return new Promise((resolve) => {
      const originalComplete = this.parallelScraper.onAllJobsComplete.bind(this.parallelScraper);
      this.parallelScraper.onAllJobsComplete = () => {
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        
        // Aggregate all product results
        const allProducts = [];
        let totalSuccessful = 0;
        
        this.parallelScraper.completedJobs.forEach(job => {
          if (job.result && job.result.productAnalysis) {
            allProducts.push(...job.result.productAnalysis);
            totalSuccessful += job.result.summary.successfulScrapes;
          }
        });
        
        const aggregatedResult = {
          site: 'glasswingshop.com',
          timestamp: new Date().toISOString(),
          collection: collectionUrl,
          discovery: {
            totalProductsFound: allProductUrls.length,
            productsProcessed: productUrls.length,
            discoveryTime: (this.parallelScraper.startTime - startTime) / 1000
          },
          parallel: {
            workers: this.maxWorkers,
            chunks: chunks.length,
            productsPerWorker: productsPerWorker
          },
          productAnalysis: allProducts,
          summary: {
            totalProductsFound: allProductUrls.length,
            detailedProductPages: allProducts.length,
            successfulScrapes: totalSuccessful,
            successRate: ((totalSuccessful / allProducts.length) * 100).toFixed(1),
            totalTime: totalTime,
            productsPerSecond: (totalSuccessful / totalTime).toFixed(2)
          }
        };
        
        logger.info('🎉 PARALLEL PRODUCT SCRAPING COMPLETE!');
        logger.info(`📊 Total: ${totalSuccessful}/${allProducts.length} products in ${totalTime.toFixed(1)}s`);
        logger.info(`⚡ Performance: ${aggregatedResult.summary.productsPerSecond} products/second`);
        
        originalComplete();
        resolve(aggregatedResult);
      };
    });
  }

  // Strategy 3: Hybrid approach - collections discovery + product parallel processing
  async scrapeEntireSiteInParallel() {
    logger.info('🌐 Strategy 3: Complete site scraping with hybrid parallel approach');
    
    const startTime = Date.now();
    
    // Step 1: Discover all collections
    const mainCollection = '/collections/all-products-no-sale';
    logger.info('🔍 Phase 1: Discovering all products from main collection');
    
    const discoveryResult = await this.discoveryScaper.scrapeCompleteCollection(mainCollection, null);
    const allProductUrls = discoveryResult.productAnalysis.map(p => p.url).filter(url => url && !url.includes('error'));
    
    logger.info(`📋 Discovered ${allProductUrls.length} total products from main collection`);
    
    // Step 2: Process products in parallel batches
    const batchSize = 50; // Products per worker batch
    const totalBatches = Math.ceil(allProductUrls.length / batchSize);
    
    logger.info(`⚡ Phase 2: Processing ${allProductUrls.length} products in ${totalBatches} parallel batches`);
    
    const chunks = this.chunkArray(allProductUrls, batchSize);
    
    // Reset parallel scraper
    this.parallelScraper.startTime = Date.now();
    this.parallelScraper.totalJobs = chunks.length;
    this.parallelScraper.jobQueue = [];
    this.parallelScraper.completedJobs = [];
    this.parallelScraper.failedJobs = [];
    
    chunks.forEach((chunk, index) => {
      this.parallelScraper.jobQueue.push({
        jobId: `site-batch-${index + 1}`,
        type: 'scrapeProducts',
        data: {
          productUrls: chunk
        },
        metadata: {
          batchIndex: index + 1,
          totalBatches: totalBatches,
          productCount: chunk.length
        }
      });
    });
    
    // Execute parallel processing
    for (let i = 0; i < Math.min(this.maxWorkers, chunks.length); i++) {
      this.parallelScraper.processNextJob();
    }
    
    return new Promise((resolve) => {
      const originalComplete = this.parallelScraper.onAllJobsComplete.bind(this.parallelScraper);
      this.parallelScraper.onAllJobsComplete = () => {
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        
        // Aggregate results
        const allProducts = [];
        let totalSuccessful = 0;
        
        this.parallelScraper.completedJobs.forEach(job => {
          if (job.result && job.result.productAnalysis) {
            allProducts.push(...job.result.productAnalysis);
            totalSuccessful += job.result.summary.successfulScrapes;
          }
        });
        
        const result = {
          site: 'glasswingshop.com',
          timestamp: new Date().toISOString(),
          scrapeType: 'complete-site-parallel',
          discovery: discoveryResult.paginationData,
          parallel: {
            workers: this.maxWorkers,
            batches: chunks.length,
            productsPerBatch: batchSize
          },
          productAnalysis: allProducts,
          summary: {
            totalProductsFound: allProductUrls.length,
            detailedProductPages: allProducts.length,
            successfulScrapes: totalSuccessful,
            successRate: ((totalSuccessful / allProducts.length) * 100).toFixed(1),
            totalTime: totalTime,
            productsPerSecond: (totalSuccessful / totalTime).toFixed(2)
          }
        };
        
        logger.info('🎉 COMPLETE SITE SCRAPING FINISHED!');
        logger.info(`🌐 Total: ${totalSuccessful}/${allProducts.length} products`);
        logger.info(`⏱️  Time: ${totalTime.toFixed(1)}s (${(totalTime/3600).toFixed(1)} hours)`);
        logger.info(`⚡ Performance: ${result.summary.productsPerSecond} products/second`);
        logger.info(`🚀 Speed improvement: ~${this.maxWorkers}x faster than sequential`);
        
        originalComplete();
        resolve(result);
      };
    });
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async shutdown() {
    await this.parallelScraper.shutdown();
    await this.discoveryScaper.close();
    logger.info('✅ Parallel product scraper shut down');
  }
}

// Example usage
async function runParallelProductScraping() {
  const scraper = new ParallelProductScraper(5); // 5 parallel workers
  
  try {
    await scraper.initialize();
    
    console.log('🎯 PARALLEL SCRAPING OPTIONS:');
    console.log('=============================');
    console.log('1. Collection-based parallel (multiple collections simultaneously)');
    console.log('2. Product-based parallel (single collection, products in parallel)'); 
    console.log('3. Complete site parallel (entire site optimized)');
    console.log('');
    
    // Option 1: Multiple collections in parallel
    console.log('🚀 RUNNING OPTION 1: Collection-based parallel scraping');
    const collections = [
      { name: 'Another Feather', url: '/collections/another-feather', maxProducts: 30 },
      { name: 'All Shoes', url: '/collections/all-shoes', maxProducts: 50 },
      { name: 'Accessories', url: '/collections/accessories-for-her', maxProducts: 40 }
    ];
    
    const collectionResults = await scraper.scrapeCollectionsInParallel(collections);
    
    console.log('\\n📊 Collection-based results:');
    console.log(`Products: ${collectionResults.summary.totalProducts}`);
    console.log(`Time: ${collectionResults.summary.totalTime.toFixed(1)}s`);
    console.log(`Speed: ${(collectionResults.summary.totalProducts / collectionResults.summary.totalTime).toFixed(2)} products/sec`);
    
    // Uncomment to run other options:
    
    // Option 2: Single collection with product-level parallelization
    // console.log('\\n🚀 RUNNING OPTION 2: Product-based parallel scraping');
    // const productResults = await scraper.scrapeProductsInParallel('/collections/all-shoes', 100, 10);
    
    // Option 3: Complete site (WARNING: This will take a while and scrape 5000+ products)
    // console.log('\\n🚀 RUNNING OPTION 3: Complete site parallel scraping');
    // const siteResults = await scraper.scrapeEntireSiteInParallel();
    
  } catch (error) {
    logger.error('Parallel scraping failed:', error);
  } finally {
    await scraper.shutdown();
  }
}

if (require.main === module) {
  runParallelProductScraping().catch(console.error);
}

module.exports = { ParallelProductScraper };