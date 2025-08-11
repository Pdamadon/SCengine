#!/usr/bin/env node

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

// Simple logger
const logger = {
  info: (...args) => console.log(`[MAIN] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[MAIN] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[MAIN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[MAIN] ${new Date().toISOString()}:`, ...args)
};

class ParallelScraper {
  constructor(maxWorkers = 3) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.activeJobs = new Map();
    this.completedJobs = [];
    this.failedJobs = [];
    this.jobQueue = [];
    this.totalJobs = 0;
    this.startTime = null;
  }

  async initialize() {
    logger.info(`Initializing ${this.maxWorkers} parallel workers...`);
    
    // Create worker script first
    await this.createWorkerScript();
    
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(path.join(__dirname, 'scraper_worker.js'));
      worker.workerId = i + 1;
      worker.isBusy = false;
      
      worker.on('message', (result) => {
        this.handleWorkerMessage(worker, result);
      });
      
      worker.on('error', (error) => {
        logger.error(`Worker ${worker.workerId} error:`, error);
        worker.isBusy = false;
        this.processNextJob();
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`Worker ${worker.workerId} exited with code ${code}`);
        }
        worker.isBusy = false;
      });
      
      this.workers.push(worker);
    }
    
    logger.info(`✅ ${this.maxWorkers} workers initialized and ready`);
  }

  async createWorkerScript() {
    const workerScript = `const { parentPort } = require('worker_threads');
const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

// Worker logger
const logger = {
  info: (...args) => console.log('[WORKER-' + process.pid + '] ' + new Date().toISOString() + ':', ...args),
  error: (...args) => console.error('[WORKER-' + process.pid + '] ' + new Date().toISOString() + ':', ...args),
  warn: (...args) => console.warn('[WORKER-' + process.pid + '] ' + new Date().toISOString() + ':', ...args),
  debug: (...args) => console.log('[WORKER-' + process.pid + '] ' + new Date().toISOString() + ':', ...args)
};

let scraper = null;

async function initializeScraper() {
  if (!scraper) {
    scraper = new GlasswingScraper(logger);
  }
  return scraper;
}

parentPort.on('message', async (job) => {
  const { jobId, type, data } = job;
  
  try {
    logger.info('Starting job ' + jobId + ': ' + type);
    
    const scraper = await initializeScraper();
    let result;
    
    if (type === 'scrapeCollection') {
      const { collection, maxProducts, useComplete } = data;
      
      if (useComplete) {
        result = await scraper.scrapeCompleteCollection(collection, maxProducts);
      } else {
        result = await scraper.scrapeFirstProducts(collection, maxProducts);
      }
    } else if (type === 'scrapeProducts') {
      const { productUrls } = data;
      const productAnalysis = [];
      
      for (const url of productUrls) {
        try {
          const productData = await scraper.scrapeProductPage(url);
          productAnalysis.push(productData);
        } catch (error) {
          productAnalysis.push({ url, error: error.message });
        }
      }
      
      result = {
        site: 'glasswingshop.com',
        timestamp: new Date().toISOString(),
        productAnalysis,
        summary: {
          totalProductsProcessed: productUrls.length,
          successfulScrapes: productAnalysis.filter(p => !p.error).length
        }
      };
    }
    
    parentPort.postMessage({
      jobId,
      status: 'completed',
      result,
      duration: Date.now() - job.startTime
    });
    
  } catch (error) {
    logger.error('Job ' + jobId + ' failed:', error);
    parentPort.postMessage({
      jobId,
      status: 'failed',
      error: error.message,
      duration: Date.now() - job.startTime
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (scraper) {
    await scraper.close();
  }
  process.exit(0);
});
`;

    fs.writeFileSync(path.join(__dirname, 'scraper_worker.js'), workerScript);
    logger.info('✅ Worker script created');
  }

  handleWorkerMessage(worker, message) {
    const { jobId, status, result, error, duration } = message;
    const job = this.activeJobs.get(jobId);
    
    if (!job) {
      logger.error(`Received result for unknown job ${jobId}`);
      return;
    }
    
    // Mark worker as available
    worker.isBusy = false;
    this.activeJobs.delete(jobId);
    
    if (status === 'completed') {
      this.completedJobs.push({
        ...job,
        result,
        duration,
        workerId: worker.workerId
      });
      
      logger.info(`✅ Job ${jobId} completed by Worker ${worker.workerId} in ${(duration/1000).toFixed(1)}s`);
      
      // Log progress
      const total = this.totalJobs;
      const completed = this.completedJobs.length;
      const failed = this.failedJobs.length;
      const remaining = this.jobQueue.length;
      
      logger.info(`Progress: ${completed}/${total} completed, ${failed} failed, ${remaining} remaining`);
      
    } else if (status === 'failed') {
      this.failedJobs.push({
        ...job,
        error,
        duration,
        workerId: worker.workerId
      });
      
      logger.error(`❌ Job ${jobId} failed on Worker ${worker.workerId}: ${error}`);
    }
    
    // Process next job
    this.processNextJob();
  }

  processNextJob() {
    if (this.jobQueue.length === 0) {
      this.checkCompletion();
      return;
    }
    
    // Find available worker
    const availableWorker = this.workers.find(w => !w.isBusy);
    if (!availableWorker) {
      return; // All workers busy
    }
    
    // Get next job
    const job = this.jobQueue.shift();
    job.startTime = Date.now();
    
    // Assign to worker
    availableWorker.isBusy = true;
    this.activeJobs.set(job.jobId, job);
    
    logger.info(`🔄 Starting job ${job.jobId} on Worker ${availableWorker.workerId}`);
    availableWorker.postMessage(job);
  }

  checkCompletion() {
    const totalCompleted = this.completedJobs.length + this.failedJobs.length;
    
    if (totalCompleted === this.totalJobs && this.jobQueue.length === 0) {
      this.onAllJobsComplete();
    }
  }

  onAllJobsComplete() {
    const endTime = Date.now();
    const totalTime = (endTime - this.startTime) / 1000;
    
    logger.info('🎉 ALL JOBS COMPLETED!');
    logger.info(`⏱️  Total time: ${totalTime.toFixed(1)}s`);
    logger.info(`✅ Successful: ${this.completedJobs.length}`);
    logger.info(`❌ Failed: ${this.failedJobs.length}`);
    
    // Calculate total products scraped
    const totalProducts = this.completedJobs.reduce((sum, job) => {
      return sum + (job.result?.summary?.successfulScrapes || 0);
    }, 0);
    
    logger.info(`🛍️  Total products scraped: ${totalProducts}`);
    logger.info(`📊 Performance: ${(totalProducts / totalTime).toFixed(2)} products/second`);
    
    // Save results
    this.saveResults();
  }

  saveResults() {
    const results = {
      summary: {
        totalJobs: this.totalJobs,
        completedJobs: this.completedJobs.length,
        failedJobs: this.failedJobs.length,
        totalTime: (Date.now() - this.startTime) / 1000,
        workersUsed: this.maxWorkers
      },
      completedJobs: this.completedJobs,
      failedJobs: this.failedJobs
    };
    
    const filename = `parallel_scraping_results_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    logger.info(`💾 Results saved to ${filename}`);
  }

  // Method to scrape collections in parallel
  async scrapeCollectionsParallel(collections) {
    this.startTime = Date.now();
    this.totalJobs = collections.length;
    
    logger.info(`🚀 Starting parallel scraping of ${collections.length} collections`);
    
    // Create jobs
    collections.forEach((collection, index) => {
      this.jobQueue.push({
        jobId: `collection-${index + 1}`,
        type: 'scrapeCollection',
        data: {
          collection: collection.url,
          maxProducts: collection.maxProducts || null,
          useComplete: collection.useComplete !== false // Default to true
        },
        metadata: collection
      });
    });
    
    // Start processing
    for (let i = 0; i < Math.min(this.maxWorkers, this.jobQueue.length); i++) {
      this.processNextJob();
    }
    
    // Wait for completion
    return new Promise((resolve) => {
      const originalComplete = this.onAllJobsComplete.bind(this);
      this.onAllJobsComplete = () => {
        originalComplete();
        resolve({
          completed: this.completedJobs,
          failed: this.failedJobs,
          summary: {
            totalProducts: this.completedJobs.reduce((sum, job) => 
              sum + (job.result?.summary?.successfulScrapes || 0), 0),
            totalTime: (Date.now() - this.startTime) / 1000
          }
        });
      };
    });
  }

  async shutdown() {
    logger.info('🔄 Shutting down workers...');
    
    await Promise.all(this.workers.map(worker => {
      return new Promise((resolve) => {
        worker.terminate().then(resolve).catch(resolve);
      });
    }));
    
    logger.info('✅ All workers shut down');
  }
}

// Example usage function
async function runParallelScraping() {
  const parallelScraper = new ParallelScraper(3); // 3 parallel workers
  
  try {
    await parallelScraper.initialize();
    
    // Define collections to scrape
    const collections = [
      { name: 'Another Feather', url: '/collections/another-feather', maxProducts: 50 },
      { name: 'All Shoes', url: '/collections/all-shoes', maxProducts: 100 },
      { name: 'Accessories For Her', url: '/collections/accessories-for-her', maxProducts: 50 },
      { name: 'Agmes', url: '/collections/agmes', maxProducts: 50 },
      { name: '7115 by Szeki', url: '/collections/7115-by-szeki-1', maxProducts: 50 },
      { name: 'Clothing Collection', url: '/collections/clothing-collection', maxProducts: 100 }
    ];
    
    logger.info(`🎯 Starting parallel scraping with ${parallelScraper.maxWorkers} workers`);
    logger.info(`📋 Collections: ${collections.map(c => c.name).join(', ')}`);
    
    const results = await parallelScraper.scrapeCollectionsParallel(collections);
    
    console.log('\\n🎉 PARALLEL SCRAPING COMPLETE!');
    console.log('================================');
    console.log(`Total products scraped: ${results.summary.totalProducts}`);
    console.log(`Total time: ${results.summary.totalTime.toFixed(1)}s`);
    console.log(`Performance: ${(results.summary.totalProducts / results.summary.totalTime).toFixed(2)} products/second`);
    console.log(`Speed improvement: ~${parallelScraper.maxWorkers}x faster than sequential`);
    
  } catch (error) {
    logger.error('Parallel scraping failed:', error);
  } finally {
    await parallelScraper.shutdown();
  }
}

if (require.main === module) {
  runParallelScraping().catch(console.error);
}

module.exports = { ParallelScraper };