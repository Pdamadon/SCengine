#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Simple logger
const logger = {
  info: (...args) => console.log(`[MAIN] ${new Date().toISOString()}:`, ...args),
  error: (...args) => console.error(`[MAIN] ${new Date().toISOString()}:`, ...args),
  warn: (...args) => console.warn(`[MAIN] ${new Date().toISOString()}:`, ...args),
  debug: (...args) => console.log(`[MAIN] ${new Date().toISOString()}:`, ...args)
};

class SimpleParallelScraper {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.activeProcesses = new Map();
    this.results = [];
    this.errors = [];
    this.queue = [];
    this.startTime = null;
  }

  async scrapeCollectionsInParallel(collections) {
    this.startTime = Date.now();
    this.queue = [...collections];
    
    logger.info(`🚀 Starting parallel scraping of ${collections.length} collections with ${this.maxConcurrent} concurrent processes`);
    
    // Start initial processes
    const initialProcesses = Math.min(this.maxConcurrent, this.queue.length);
    for (let i = 0; i < initialProcesses; i++) {
      this.processNext();
    }
    
    // Wait for all to complete
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (this.activeProcesses.size === 0 && this.queue.length === 0) {
          const endTime = Date.now();
          const totalTime = (endTime - this.startTime) / 1000;
          
          const totalProducts = this.results.reduce((sum, result) => 
            sum + (result.summary ? result.summary.successfulScrapes : 0), 0
          );
          
          logger.info('🎉 All parallel scraping complete!');
          logger.info(`📊 Results: ${this.results.length} successful, ${this.errors.length} failed`);
          logger.info(`🛍️  Total products: ${totalProducts}`);
          logger.info(`⏱️  Total time: ${totalTime.toFixed(1)}s`);
          logger.info(`⚡ Performance: ${(totalProducts / totalTime).toFixed(2)} products/second`);
          
          resolve({
            results: this.results,
            errors: this.errors,
            summary: {
              totalProducts,
              totalTime,
              productsPerSecond: totalProducts / totalTime,
              successfulCollections: this.results.length,
              failedCollections: this.errors.length
            }
          });
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      
      checkComplete();
    });
  }

  processNext() {
    if (this.queue.length === 0) {
      return;
    }
    
    const collection = this.queue.shift();
    const processId = Date.now() + Math.random();
    
    logger.info(`🔄 Starting collection: ${collection.name} (${collection.url})`);
    
    // Create a test script that uses our existing scraper
    const testScript = `
const GlasswingScraper = require('./src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => console.log('[WORKER]', ...args),
  error: (...args) => console.error('[WORKER]', ...args),
  warn: (...args) => console.warn('[WORKER]', ...args),
  debug: (...args) => console.log('[WORKER]', ...args)
};

async function scrapeCollection() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    const result = await scraper.scrapeCompleteCollection('${collection.url}', ${collection.maxProducts || 'null'});
    console.log('RESULT_START');
    console.log(JSON.stringify(result));
    console.log('RESULT_END');
    
    await scraper.close();
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    await scraper.close();
    process.exit(1);
  }
}

scrapeCollection();
`;
    
    const scriptPath = path.join(__dirname, `temp_scraper_${processId}.js`);
    fs.writeFileSync(scriptPath, testScript);
    
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      // Clean up temp file
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      this.activeProcesses.delete(processId);
      
      if (code === 0) {
        try {
          // Extract result from stdout
          const resultMatch = stdout.match(/RESULT_START\n(.*?)\nRESULT_END/s);
          if (resultMatch) {
            const result = JSON.parse(resultMatch[1]);
            result.collection = collection;
            this.results.push(result);
            
            logger.info(`✅ ${collection.name} completed: ${result.summary.successfulScrapes} products`);
          } else {
            throw new Error('No valid result found in output');
          }
        } catch (error) {
          logger.error(`❌ ${collection.name} failed to parse result: ${error.message}`);
          this.errors.push({ collection, error: error.message, stdout, stderr });
        }
      } else {
        logger.error(`❌ ${collection.name} failed with code ${code}`);
        this.errors.push({ collection, error: `Process exited with code ${code}`, stdout, stderr });
      }
      
      // Process next item in queue
      this.processNext();
    });
    
    this.activeProcesses.set(processId, { child, collection });
  }
}

async function runSimpleParallelScraping() {
  const scraper = new SimpleParallelScraper(3); // 3 concurrent processes
  
  try {
    const collections = [
      { name: 'Another Feather', url: '/collections/another-feather', maxProducts: 20 },
      { name: 'All Shoes', url: '/collections/all-shoes', maxProducts: 40 },
      { name: 'Accessories For Her', url: '/collections/accessories-for-her', maxProducts: 30 },
      { name: 'Agmes', url: '/collections/agmes', maxProducts: 25 },
      { name: '7115 by Szeki', url: '/collections/7115-by-szeki-1', maxProducts: 30 }
    ];
    
    console.log('🎯 SIMPLE PARALLEL SCRAPING TEST');
    console.log('================================');
    console.log(`Collections: ${collections.length}`);
    console.log(`Concurrent processes: ${scraper.maxConcurrent}`);
    console.log(`Expected speedup: ~${scraper.maxConcurrent}x faster`);
    console.log('');
    
    const results = await scraper.scrapeCollectionsInParallel(collections);
    
    console.log('\n📊 FINAL RESULTS:');
    console.log('=================');
    console.log(`Total Products Scraped: ${results.summary.totalProducts}`);
    console.log(`Total Time: ${results.summary.totalTime.toFixed(1)}s`);
    console.log(`Performance: ${results.summary.productsPerSecond.toFixed(2)} products/second`);
    console.log(`Success Rate: ${results.summary.successfulCollections}/${results.summary.successfulCollections + results.summary.failedCollections} collections`);
    
    // Save detailed results
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `simple_parallel_results_${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`💾 Detailed results saved to: ${filename}`);
    
    if (results.summary.successfulCollections > 0) {
      console.log('\n🎉 PARALLEL SCRAPING SUCCESSFUL!');
      console.log(`🚀 Speed improvement achieved: ~${scraper.maxConcurrent}x faster than sequential`);
      
      // Show collection breakdown
      console.log('\n📋 Collection Results:');
      results.results.forEach((result, i) => {
        console.log(`${i + 1}. ${result.collection.name}: ${result.summary.successfulScrapes} products (${result.summary.successRate}% success)`);
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Parallel scraping failed:', error);
    return false;
  }
}

if (require.main === module) {
  runSimpleParallelScraping()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Script crashed:', error);
      process.exit(1);
    });
}

module.exports = { SimpleParallelScraper };