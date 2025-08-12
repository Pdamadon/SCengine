#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { MongoClient } from 'mongodb';
import { Logger } from '../types/common.types';

interface DiscoveryResult {
  totalFound: number;
  productUrls: string[];
  paginationData: {
    pagesScraped: number;
  };
}

interface BatchData {
  batch: string[];
  index: number;
}

interface BatchResult {
  batchIndex: number;
  results: any[];
  summary: {
    totalProcessed: number;
    successful: number;
    failed: number;
  };
}

interface FailedBatch {
  batchIndex: number;
  error: string;
  stdout?: string;
  stderr?: string;
}

interface ActiveProcess {
  child: ChildProcess;
  batchIndex: number;
  startTime: number;
}

interface BatchSummaryItem {
  batchIndex: number;
  processed: number;
  successful: number;
  failed: number;
  successRate: string;
}

interface AggregatedResult {
  scrapeInfo: {
    site: string;
    timestamp: string;
    scrapeType: string;
    totalTime: number;
    concurrentProcesses: number;
  };
  discovery: {
    totalProductsFound: number;
    productsAttempted: number;
  };
  results: {
    totalBatches: number;
    successfulBatches: number;
    failedBatches: number;
    totalProductsScraped: number;
    successRate: string;
  };
  performance: {
    productsPerSecond: string;
    timeInHours: string;
    speedupVsSequential: string;
  };
  batchSummary: BatchSummaryItem[];
  products: any[];
  failedBatches: FailedBatch[];
}

// Enhanced logger with timestamps
const logger: Logger = {
  info: (...args: any[]) => {
    const msg = `[MAIN] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.log(msg);
    fs.appendFileSync('full_site_scraping.log', msg + '\n');
  },
  error: (...args: any[]) => {
    const msg = `[ERROR] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.error(msg);
    fs.appendFileSync('full_site_scraping.log', msg + '\n');
  },
  warn: (...args: any[]) => {
    const msg = `[WARN] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.warn(msg);
    fs.appendFileSync('full_site_scraping.log', msg + '\n');
  },
  debug: (...args: any[]) => {
    const msg = `[DEBUG] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.log(msg);
    fs.appendFileSync('full_site_scraping.log', msg + '\n');
  },
};

// Additional progress logging function
const logProgress = (current: number, total: number, extra: string = ''): void => {
  const percent = ((current / total) * 100).toFixed(1);
  const msg = `[PROGRESS] ${current}/${total} (${percent}%) ${extra}`;
  console.log(msg);
  fs.appendFileSync('full_site_scraping.log', msg + '\n');
};

class FullSiteParallelScraper {
  private maxConcurrent: number;
  private activeProcesses: Map<string, ActiveProcess>;
  private completedBatches: BatchResult[];
  private failedBatches: FailedBatch[];
  private totalProductsScraped: number;
  private startTime: number | null;
  private lastProgressUpdate: number;

  constructor(maxConcurrent: number = 6) {
    this.maxConcurrent = maxConcurrent;
    this.activeProcesses = new Map();
    this.completedBatches = [];
    this.failedBatches = [];
    this.totalProductsScraped = 0;
    this.startTime = null;
    this.lastProgressUpdate = 0;
  }

  async scrapeEntireSite(): Promise<AggregatedResult | null> {
    this.startTime = Date.now();

    // Clear previous log
    fs.writeFileSync('full_site_scraping.log', '');

    logger.info('🚀 STARTING COMPLETE GLASSWING SITE SCRAPING');
    logger.info('===========================================');
    logger.info('🎯 Target: All products from glasswingshop.com');
    logger.info(`⚡ Concurrent processes: ${this.maxConcurrent}`);
    logger.info('📝 Logging to: full_site_scraping.log');

    // Step 1: Discover all product URLs from main collection
    logger.info('📡 Phase 1: Discovering all product URLs...');
    const discoveryScript = `
const GlasswingScraper = require('../../src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => console.log('[DISCOVERY]', ...args),
  error: (...args) => console.error('[DISCOVERY]', ...args),
  warn: (...args) => console.warn('[DISCOVERY]', ...args),
  debug: (...args) => {}
};

async function discoverAllProducts() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('Discovering all products from main collection...');
    const result = await scraper.scrapeCompleteCollection('/collections/all-products-no-sale', null);
    
    const productUrls = [];
    result.productAnalysis.forEach(product => {
      if (product.url && !product.error) {
        productUrls.push(product.url);
      }
    });
    
    console.log('DISCOVERY_RESULT_START');
    console.log(JSON.stringify({
      totalFound: productUrls.length,
      productUrls: productUrls,
      paginationData: result.paginationData
    }));
    console.log('DISCOVERY_RESULT_END');
    
    await scraper.close();
    process.exit(0);
  } catch (error) {
    console.error('DISCOVERY_ERROR:', error.message);
    await scraper.close();
    process.exit(1);
  }
}

discoverAllProducts();
`;

    const discoveryScriptPath = path.join(__dirname, 'temp_discovery.js');
    fs.writeFileSync(discoveryScriptPath, discoveryScript);

    const discoveryResult = await this.runDiscovery(discoveryScriptPath);

    if (!discoveryResult) {
      logger.error('❌ Product discovery failed - aborting');
      return null;
    }

    const { totalFound, productUrls, paginationData } = discoveryResult;

    logger.info(`✅ Discovery complete: ${totalFound} products found`);
    logger.info(`📊 Pages processed: ${paginationData.pagesScraped}`);
    logger.info(`🎯 Starting parallel scraping of all ${productUrls.length} products`);

    // Step 2: Split products into batches for parallel processing
    const batchSize = 40; // Products per batch - optimized for performance
    const batches = this.chunkArray(productUrls, batchSize);
    const totalBatches = batches.length;

    logger.info(`📦 Split into ${totalBatches} batches of ~${batchSize} products each`);
    logger.info(`⏱️ Estimated time: ${((totalBatches * batchSize) / (this.maxConcurrent * 0.8) / 60).toFixed(1)} minutes`);

    // Step 3: Process all batches in parallel
    await this.processBatchesInParallel(batches);

    // Step 4: Aggregate and save results
    const endTime = Date.now();
    const totalTime = (endTime - this.startTime) / 1000;
    const aggregatedResults = this.aggregateResults(totalTime, totalFound);

    // Save comprehensive results
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `glasswing_full_site_${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(aggregatedResults, null, 2));

    logger.info('🎉 COMPLETE SITE SCRAPING FINISHED!');
    logger.info('==================================');
    logger.info(`📊 Total Products Found: ${totalFound}`);
    logger.info(`✅ Successfully Scraped: ${this.totalProductsScraped}`);
    logger.info(`❌ Failed Batches: ${this.failedBatches.length}`);
    logger.info(`⏱️ Total Time: ${(totalTime / 3600).toFixed(1)} hours`);
    logger.info(`⚡ Performance: ${(this.totalProductsScraped / totalTime).toFixed(2)} products/second`);
    logger.info(`💾 Results saved to: ${filename}`);
    logger.info('📝 Full log: full_site_scraping.log');

    // Cleanup
    try {
      fs.unlinkSync(discoveryScriptPath);
    } catch (e) {}

    return aggregatedResults;
  }

  async runDiscovery(scriptPath: string): Promise<DiscoveryResult | null> {
    return new Promise((resolve) => {
      const child = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {}

        if (code === 0) {
          try {
            const resultMatch = stdout.match(/DISCOVERY_RESULT_START\n(.*?)\nDISCOVERY_RESULT_END/s);
            if (resultMatch) {
              const result = JSON.parse(resultMatch[1]);
              resolve(result);
            } else {
              logger.error('No valid discovery result found');
              resolve(null);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Discovery parsing failed: ${errorMessage}`);
            resolve(null);
          }
        } else {
          logger.error(`Discovery failed with code ${code}`);
          logger.error(`STDERR: ${stderr}`);
          resolve(null);
        }
      });
    });
  }

  async processBatchesInParallel(batches: string[][]): Promise<void> {
    const queue: BatchData[] = [...batches.map((batch, index) => ({ batch, index }))];
    let completedCount = 0;
    const totalBatches = batches.length;

    // Progress tracking
    const progressInterval = setInterval(() => {
      this.updateProgress(completedCount, totalBatches);
    }, 10000); // Update every 10 seconds

    const processNext = (): void => {
      if (queue.length === 0) {return;}

      const { batch, index } = queue.shift()!;
      this.processBatch(batch, index).then(() => {
        completedCount++;
        this.updateProgress(completedCount, totalBatches);
        processNext();
      });
    };

    // Start initial processes
    const initialProcesses = Math.min(this.maxConcurrent, queue.length);
    for (let i = 0; i < initialProcesses; i++) {
      processNext();
    }

    // Wait for all to complete
    await new Promise<void>((resolve) => {
      const checkComplete = (): void => {
        if (this.activeProcesses.size === 0 && queue.length === 0) {
          clearInterval(progressInterval);
          resolve();
        } else {
          setTimeout(checkComplete, 1000);
        }
      };
      checkComplete();
    });
  }

  async processBatch(productUrls: string[], batchIndex: number): Promise<void> {
    const processId = `batch-${batchIndex + 1}`;
    const startTime = Date.now();

    const batchScript = `
const GlasswingScraper = require('../../src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => {},
  error: (...args) => console.error('[BATCH-${batchIndex + 1}]', ...args),
  warn: (...args) => {},
  debug: (...args) => {}
};

async function scrapeBatch() {
  const scraper = new GlasswingScraper(logger);
  const productUrls = ${JSON.stringify(productUrls)};
  const results = [];
  
  try {
    for (let i = 0; i < productUrls.length; i++) {
      try {
        const productData = await scraper.scrapeProductPage(productUrls[i]);
        results.push(productData);
      } catch (error) {
        results.push({ url: productUrls[i], error: error.message });
      }
      
      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(\`[BATCH-${batchIndex + 1}] Progress: \${i + 1}/\${productUrls.length}\`);
      }
    }
    
    console.log('BATCH_RESULT_START');
    console.log(JSON.stringify({
      batchIndex: ${batchIndex},
      results: results,
      summary: {
        totalProcessed: productUrls.length,
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length
      }
    }));
    console.log('BATCH_RESULT_END');
    
    await scraper.close();
    process.exit(0);
  } catch (error) {
    console.error('BATCH_ERROR:', error.message);
    await scraper.close();
    process.exit(1);
  }
}

scrapeBatch();
`;

    const scriptPath = path.join(__dirname, `temp_batch_${processId}.js`);
    fs.writeFileSync(scriptPath, batchScript);

    return new Promise((resolve) => {
      const child = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Show batch progress in real-time
        const progressLines = output.split('\n').filter(line => line.includes('Progress:'));
        progressLines.forEach(line => {
          console.log(line);
        });
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        // Cleanup
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {}

        this.activeProcesses.delete(processId);

        if (code === 0) {
          try {
            const resultMatch = stdout.match(/BATCH_RESULT_START\n(.*?)\nBATCH_RESULT_END/s);
            if (resultMatch) {
              const batchResult: BatchResult = JSON.parse(resultMatch[1]);
              this.completedBatches.push(batchResult);
              this.totalProductsScraped += batchResult.summary.successful;

              const duration = ((Date.now() - startTime) / 1000).toFixed(1);
              logger.info(`✅ Batch ${batchIndex + 1} completed: ${batchResult.summary.successful}/${batchResult.summary.totalProcessed} products (${duration}s)`);
            } else {
              throw new Error('No valid batch result found');
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`❌ Batch ${batchIndex + 1} result parsing failed: ${errorMessage}`);
            this.failedBatches.push({ batchIndex, error: errorMessage, stdout, stderr });
          }
        } else {
          logger.error(`❌ Batch ${batchIndex + 1} failed with code ${code}`);
          this.failedBatches.push({ batchIndex, error: `Process exited with code ${code}`, stdout, stderr });
        }

        resolve();
      });

      this.activeProcesses.set(processId, { child, batchIndex, startTime });
    });
  }

  updateProgress(completed: number, total: number): void {
    const now = Date.now();
    if (now - this.lastProgressUpdate < 5000 && completed < total) {return;} // Throttle updates

    this.lastProgressUpdate = now;
    const elapsed = (now - this.startTime!) / 1000;
    const rate = this.totalProductsScraped / elapsed;
    const remaining = total - completed;
    const eta = remaining > 0 ? (remaining * (elapsed / completed)) / 60 : 0;

    logProgress(completed, total, `| Products: ${this.totalProductsScraped} | Rate: ${rate.toFixed(2)}/sec | ETA: ${eta.toFixed(1)}min`);
  }

  aggregateResults(totalTime: number, totalFound: number): AggregatedResult {
    const allProducts: any[] = [];
    const batchSummary: BatchSummaryItem[] = [];

    this.completedBatches.forEach(batch => {
      allProducts.push(...batch.results.filter(r => !r.error));
      batchSummary.push({
        batchIndex: batch.batchIndex,
        processed: batch.summary.totalProcessed,
        successful: batch.summary.successful,
        failed: batch.summary.failed,
        successRate: ((batch.summary.successful / batch.summary.totalProcessed) * 100).toFixed(1),
      });
    });

    return {
      scrapeInfo: {
        site: 'glasswingshop.com',
        timestamp: new Date().toISOString(),
        scrapeType: 'complete-site-parallel',
        totalTime: totalTime,
        concurrentProcesses: this.maxConcurrent,
      },
      discovery: {
        totalProductsFound: totalFound,
        productsAttempted: this.completedBatches.reduce((sum, b) => sum + b.summary.totalProcessed, 0),
      },
      results: {
        totalBatches: this.completedBatches.length + this.failedBatches.length,
        successfulBatches: this.completedBatches.length,
        failedBatches: this.failedBatches.length,
        totalProductsScraped: this.totalProductsScraped,
        successRate: ((this.totalProductsScraped / totalFound) * 100).toFixed(1),
      },
      performance: {
        productsPerSecond: (this.totalProductsScraped / totalTime).toFixed(2),
        timeInHours: (totalTime / 3600).toFixed(2),
        speedupVsSequential: (this.maxConcurrent * 0.8).toFixed(1), // Conservative estimate
      },
      batchSummary: batchSummary,
      products: allProducts,
      failedBatches: this.failedBatches,
    };
  }

  chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

async function runFullSiteScraping(): Promise<boolean> {
  const scraper = new FullSiteParallelScraper(6); // 6 concurrent processes for maximum performance

  try {
    console.log('\n🚀 GLASSWING COMPLETE SITE PARALLEL SCRAPING');
    console.log('===========================================');
    console.log('⚠️  WARNING: This will scrape 5,000+ products');
    console.log('⏱️  Estimated time: 45-90 minutes');
    console.log('💻 Using 6 concurrent processes');
    console.log('📝 Progress logged to: full_site_scraping.log');
    console.log('\n🎯 Starting in 3 seconds...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const results = await scraper.scrapeEntireSite();

    if (results) {
      console.log('\n🎉 MISSION ACCOMPLISHED!');
      console.log('========================');
      console.log('🌐 Complete Glasswing inventory scraped');
      console.log(`📊 ${results.results.totalProductsScraped} products captured`);
      console.log(`⏱️  Completed in ${results.performance.timeInHours} hours`);
      console.log(`⚡ ${results.performance.productsPerSecond} products/second`);
      console.log(`🚀 ~${results.performance.speedupVsSequential}x faster than sequential`);
      console.log(`✅ ${results.results.successRate}% success rate`);

      return true;
    } else {
      console.log('\n❌ SCRAPING FAILED');
      return false;
    }

  } catch (error) {
    logger.error('Full site scraping crashed:', error);
    return false;
  }
}

if (require.main === module) {
  runFullSiteScraping()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Script crashed:', error);
      process.exit(1);
    });
}

export { FullSiteParallelScraper };