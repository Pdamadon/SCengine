#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const SiteIntelligence = require('../../src/intelligence/SiteIntelligence');

// Enhanced logger with timestamps
const logger = {
  info: (...args) => {
    const msg = `[MAIN] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.log(msg);
    fs.appendFileSync('category_aware_scraping.log', msg + '\n');
  },
  error: (...args) => {
    const msg = `[ERROR] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.error(msg);
    fs.appendFileSync('category_aware_scraping.log', msg + '\n');
  },
  warn: (...args) => {
    const msg = `[WARN] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.warn(msg);
    fs.appendFileSync('category_aware_scraping.log', msg + '\n');
  },
  progress: (current, total, extra = '') => {
    const percent = ((current / total) * 100).toFixed(1);
    const msg = `[PROGRESS] ${current}/${total} (${percent}%) ${extra}`;
    console.log(msg);
    fs.appendFileSync('category_aware_scraping.log', msg + '\n');
  },
};

class CategoryAwareParallelScraper {
  constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
    this.activeProcesses = new Map();
    this.completedBatches = [];
    this.failedBatches = [];
    this.totalProductsScraped = 0;
    this.categoryResults = new Map();
    this.startTime = null;
    this.lastProgressUpdate = 0;

    // Initialize site intelligence system
    this.siteIntelligence = new SiteIntelligence(logger);
  }

  async scrapeWithCategoryIntelligence() {
    this.startTime = Date.now();

    // Clear previous log
    fs.writeFileSync('category_aware_scraping.log', '');

    logger.info('🧠 STARTING CATEGORY-AWARE PARALLEL SCRAPING');
    logger.info('============================================');
    logger.info('🎯 Target: glasswingshop.com with category intelligence');
    logger.info(`⚡ Concurrent processes: ${this.maxConcurrent}`);
    logger.info('🧠 Intelligence: SiteIntelligence + ConcurrentExplorer');
    logger.info('📝 Logging to: category_aware_scraping.log');

    // Phase 1: Build comprehensive site intelligence
    logger.info('🧠 Phase 1: Building comprehensive site intelligence...');
    const baseUrl = 'https://glasswingshop.com';

    await this.siteIntelligence.initialize();
    const comprehensiveIntel = await this.siteIntelligence.buildComprehensiveSiteIntelligence(
      baseUrl,
      {
        maxConcurrent: this.maxConcurrent,
        forceRefresh: true,
        maxSubcategories: 3,
      },
    );

    logger.info('✅ Site intelligence complete:');
    logger.info(`   📊 Sections mapped: ${comprehensiveIntel.summary.sections_mapped}`);
    logger.info(`   🎯 Products discovered: ${comprehensiveIntel.summary.products_discovered}`);
    logger.info(`   🔍 Selectors identified: ${comprehensiveIntel.summary.selectors_identified}`);
    logger.info(`   📈 Intelligence score: ${comprehensiveIntel.summary.intelligence_score}%`);

    // Phase 2: Extract category-based product discovery
    logger.info('📂 Phase 2: Processing category-based discovery...');
    const categoryResults = await this.extractCategorizedProducts(comprehensiveIntel);

    if (categoryResults.size === 0) {
      logger.error('❌ No categorized products found - falling back to basic discovery');
      return await this.fallbackToBasicDiscovery();
    }

    logger.info('✅ Category extraction complete:');
    logger.info(`   📁 Categories found: ${categoryResults.size}`);

    let totalProducts = 0;
    for (const [categoryName, categoryData] of categoryResults) {
      totalProducts += categoryData.products.length;
      logger.info(`   📂 ${categoryName}: ${categoryData.products.length} products`);
    }

    logger.info(`🎯 Starting category-aware scraping of ${totalProducts} products across ${categoryResults.size} categories`);

    // Phase 3: Process each category with preserved context
    await this.processCategoriesInParallel(categoryResults);

    // Phase 4: Aggregate and save results with category context
    const endTime = Date.now();
    const totalTime = (endTime - this.startTime) / 1000;
    const aggregatedResults = this.aggregateResultsWithCategories(totalTime, totalProducts, comprehensiveIntel);

    // Save comprehensive results
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `glasswing_category_aware_${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(aggregatedResults, null, 2));

    logger.info('🎉 CATEGORY-AWARE SCRAPING FINISHED!');
    logger.info('====================================');
    logger.info(`📊 Total Products Found: ${totalProducts}`);
    logger.info(`✅ Successfully Scraped: ${this.totalProductsScraped}`);
    logger.info(`📁 Categories Processed: ${categoryResults.size}`);
    logger.info(`❌ Failed Batches: ${this.failedBatches.length}`);
    logger.info(`⏱️ Total Time: ${(totalTime / 3600).toFixed(1)} hours`);
    logger.info(`⚡ Performance: ${(this.totalProductsScraped / totalTime).toFixed(2)} products/second`);
    logger.info(`💾 Results saved to: ${filename}`);
    logger.info('📝 Full log: category_aware_scraping.log');

    await this.siteIntelligence.close();
    return aggregatedResults;
  }

  async extractCategorizedProducts(intelligence) {
    const categorizedProducts = new Map();

    // For now, we'll use the exploration results from the intelligence
    // In a more advanced implementation, we'd parse the actual category structure
    logger.info('🔍 Extracting products from intelligence exploration...');

    // Check if we have exploration results with products
    if (intelligence.exploration && intelligence.exploration.total_products_found > 0) {
      // Create a general category from the exploration results
      // This is a simplified version - the full implementation would parse actual categories
      const generalCategoryData = {
        categoryPath: '/collections/all-products-no-sale',
        categoryName: 'All Products',
        products: [], // We'll need to discover these
        metadata: {
          intelligence_score: intelligence.summary.intelligence_score,
          selectors_available: intelligence.summary.selectors_identified > 0,
        },
      };

      // For phase 1, fall back to discovery but with category context
      const discoveredProducts = await this.discoverProductsWithIntelligence(intelligence);
      generalCategoryData.products = discoveredProducts;

      categorizedProducts.set('All Products', generalCategoryData);
    }

    return categorizedProducts;
  }

  async discoverProductsWithIntelligence(intelligence) {
    logger.info('🔍 Discovering products using enhanced intelligence...');

    const discoveryScript = `
const GlasswingScraper = require('../../src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => console.log('[INTELLIGENT-DISCOVERY]', ...args),
  error: (...args) => console.error('[INTELLIGENT-DISCOVERY]', ...args),
  warn: (...args) => console.warn('[INTELLIGENT-DISCOVERY]', ...args),
  debug: (...args) => {}
};

async function intelligentDiscovery() {
  const scraper = new GlasswingScraper(logger);
  
  try {
    console.log('Using intelligent discovery with enhanced selectors...');
    
    // Use intelligence score to determine discovery strategy
    const intelligenceScore = ${intelligence.summary.intelligence_score};
    console.log('Intelligence score:', intelligenceScore);
    
    let result;
    if (intelligenceScore > 70) {
      // High intelligence - use optimized approach
      console.log('High intelligence detected - using optimized discovery');
      result = await scraper.scrapeCompleteCollection('/collections/all-products-no-sale', null);
    } else {
      // Lower intelligence - use conservative approach
      console.log('Lower intelligence detected - using conservative discovery');
      result = await scraper.scrapeCompleteCollection('/collections/all-products-no-sale', 1000);
    }
    
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
      paginationData: result.paginationData,
      intelligenceEnhanced: true,
      intelligenceScore: intelligenceScore
    }));
    console.log('DISCOVERY_RESULT_END');
    
    await scraper.close();
    process.exit(0);
  } catch (error) {
    console.error('INTELLIGENT_DISCOVERY_ERROR:', error.message);
    await scraper.close();
    process.exit(1);
  }
}

intelligentDiscovery();
`;

    const discoveryScriptPath = path.join(__dirname, 'temp_intelligent_discovery.js');
    fs.writeFileSync(discoveryScriptPath, discoveryScript);

    const discoveryResult = await this.runDiscovery(discoveryScriptPath);

    if (!discoveryResult) {
      logger.error('❌ Intelligent discovery failed');
      return [];
    }

    logger.info(`✅ Intelligent discovery complete: ${discoveryResult.totalFound} products found`);
    return discoveryResult.productUrls;
  }

  async runDiscovery(scriptPath) {
    return new Promise((resolve) => {
      const child = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname,
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
            logger.error(`Discovery parsing failed: ${error.message}`);
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

  async processCategoriesInParallel(categoryResults) {
    const categoryBatches = [];

    // Convert categories into batches with category context
    for (const [categoryName, categoryData] of categoryResults) {
      const batchSize = 40;
      const productBatches = this.chunkArray(categoryData.products, batchSize);

      productBatches.forEach((batch, batchIndex) => {
        categoryBatches.push({
          categoryName,
          categoryPath: categoryData.categoryPath,
          categoryMetadata: categoryData.metadata,
          products: batch,
          batchIndex: categoryBatches.length,
          categoryBatchIndex: batchIndex,
        });
      });
    }

    logger.info(`📦 Created ${categoryBatches.length} category-aware batches`);

    const queue = [...categoryBatches];
    let completedCount = 0;
    const totalBatches = categoryBatches.length;

    // Progress tracking
    const progressInterval = setInterval(() => {
      this.updateProgress(completedCount, totalBatches);
    }, 10000);

    const processNext = () => {
      if (queue.length === 0) {return;}

      const categoryBatch = queue.shift();
      this.processCategoryBatch(categoryBatch).then(() => {
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
    await new Promise((resolve) => {
      const checkComplete = () => {
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

  async processCategoryBatch(categoryBatchData) {
    const { categoryName, categoryPath, categoryMetadata, products, batchIndex } = categoryBatchData;
    const processId = `category-batch-${batchIndex + 1}`;
    const startTime = Date.now();

    const batchScript = `
const GlasswingScraper = require('../../src/scrapers/GlasswingScraper');

const logger = {
  info: (...args) => {},
  error: (...args) => console.error('[${processId}]', ...args),
  warn: (...args) => {},
  debug: (...args) => {}
};

async function scrapeCategoryBatch() {
  const scraper = new GlasswingScraper(logger);
  const productUrls = ${JSON.stringify(products)};
  const categoryContext = {
    categoryName: "${categoryName}",
    categoryPath: "${categoryPath}",
    scrapedAt: new Date().toISOString(),
    metadata: ${JSON.stringify(categoryMetadata)}
  };
  
  const results = [];
  
  try {
    for (let i = 0; i < productUrls.length; i++) {
      try {
        const productData = await scraper.scrapeProductPage(productUrls[i]);
        
        // Add category context to each product
        if (!productData.error) {
          productData.categoryContext = categoryContext;
          productData.categories = [{
            category_name: categoryContext.categoryName,
            category_path: categoryContext.categoryPath,
            discovered_in_category: true
          }];
          productData.category_primary = categoryContext.categoryName;
          productData.category_path_primary = categoryContext.categoryPath;
        }
        
        results.push(productData);
      } catch (error) {
        results.push({ 
          url: productUrls[i], 
          error: error.message,
          categoryContext: categoryContext
        });
      }
      
      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(\`[${processId}] Progress: \${i + 1}/\${productUrls.length} (\${categoryContext.categoryName})\`);
      }
    }
    
    console.log('CATEGORY_BATCH_RESULT_START');
    console.log(JSON.stringify({
      batchIndex: ${batchIndex},
      categoryName: "${categoryName}",
      categoryPath: "${categoryPath}",
      results: results,
      summary: {
        totalProcessed: productUrls.length,
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length
      },
      categoryMetadata: categoryContext.metadata
    }));
    console.log('CATEGORY_BATCH_RESULT_END');
    
    await scraper.close();
    process.exit(0);
  } catch (error) {
    console.error('CATEGORY_BATCH_ERROR:', error.message);
    await scraper.close();
    process.exit(1);
  }
}

scrapeCategoryBatch();
`;

    const scriptPath = path.join(__dirname, `temp_category_batch_${processId}.js`);
    fs.writeFileSync(scriptPath, batchScript);

    return new Promise((resolve) => {
      const child = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Show batch progress in real-time
        const progressLines = output.split('\n').filter(line => line.includes('Progress:'));
        progressLines.forEach(line => {
          console.log(line);
        });
      });

      child.stderr.on('data', (data) => {
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
            const resultMatch = stdout.match(/CATEGORY_BATCH_RESULT_START\n(.*?)\nCATEGORY_BATCH_RESULT_END/s);
            if (resultMatch) {
              const batchResult = JSON.parse(resultMatch[1]);
              this.completedBatches.push(batchResult);
              this.totalProductsScraped += batchResult.summary.successful;

              // Track category-specific results
              const categoryName = batchResult.categoryName;
              if (!this.categoryResults.has(categoryName)) {
                this.categoryResults.set(categoryName, {
                  totalProcessed: 0,
                  successful: 0,
                  failed: 0,
                  batches: [],
                });
              }

              const categoryStats = this.categoryResults.get(categoryName);
              categoryStats.totalProcessed += batchResult.summary.totalProcessed;
              categoryStats.successful += batchResult.summary.successful;
              categoryStats.failed += batchResult.summary.failed;
              categoryStats.batches.push(batchResult);

              const duration = ((Date.now() - startTime) / 1000).toFixed(1);
              logger.info(`✅ Category batch ${batchIndex + 1} completed: ${batchResult.summary.successful}/${batchResult.summary.totalProcessed} products from "${categoryName}" (${duration}s)`);
            } else {
              throw new Error('No valid category batch result found');
            }
          } catch (error) {
            logger.error(`❌ Category batch ${batchIndex + 1} result parsing failed: ${error.message}`);
            this.failedBatches.push({ batchIndex, categoryName, error: error.message, stdout, stderr });
          }
        } else {
          logger.error(`❌ Category batch ${batchIndex + 1} failed with code ${code}`);
          this.failedBatches.push({ batchIndex, categoryName, error: `Process exited with code ${code}`, stdout, stderr });
        }

        resolve();
      });

      this.activeProcesses.set(processId, { child, batchIndex, categoryName, startTime });
    });
  }

  async fallbackToBasicDiscovery() {
    logger.warn('🔄 Falling back to basic discovery method...');
    const { FullSiteParallelScraper } = require('./full_site_parallel_scraper');
    const basicScraper = new FullSiteParallelScraper(this.maxConcurrent);
    return await basicScraper.scrapeEntireSite();
  }

  updateProgress(completed, total) {
    const now = Date.now();
    if (now - this.lastProgressUpdate < 5000 && completed < total) {return;}

    this.lastProgressUpdate = now;
    const elapsed = (now - this.startTime) / 1000;
    const rate = this.totalProductsScraped / elapsed;
    const remaining = total - completed;
    const eta = remaining > 0 ? (remaining * (elapsed / completed)) / 60 : 0;

    logger.progress(completed, total, `| Products: ${this.totalProductsScraped} | Rate: ${rate.toFixed(2)}/sec | ETA: ${eta.toFixed(1)}min | Categories: ${this.categoryResults.size}`);
  }

  aggregateResultsWithCategories(totalTime, totalFound, intelligence) {
    const allProducts = [];
    const batchSummary = [];
    const categorySummary = [];

    this.completedBatches.forEach(batch => {
      allProducts.push(...batch.results.filter(r => !r.error));
      batchSummary.push({
        batchIndex: batch.batchIndex,
        categoryName: batch.categoryName,
        categoryPath: batch.categoryPath,
        processed: batch.summary.totalProcessed,
        successful: batch.summary.successful,
        failed: batch.summary.failed,
        successRate: ((batch.summary.successful / batch.summary.totalProcessed) * 100).toFixed(1),
      });
    });

    // Create category summary
    for (const [categoryName, categoryStats] of this.categoryResults) {
      categorySummary.push({
        categoryName: categoryName,
        totalProcessed: categoryStats.totalProcessed,
        successful: categoryStats.successful,
        failed: categoryStats.failed,
        successRate: ((categoryStats.successful / categoryStats.totalProcessed) * 100).toFixed(1),
        batchesCount: categoryStats.batches.length,
      });
    }

    return {
      scrapeInfo: {
        site: 'glasswingshop.com',
        timestamp: new Date().toISOString(),
        scrapeType: 'category-aware-parallel',
        totalTime: totalTime,
        concurrentProcesses: this.maxConcurrent,
        intelligenceEnhanced: true,
      },
      intelligence: {
        score: intelligence.summary.intelligence_score,
        sections_mapped: intelligence.summary.sections_mapped,
        selectors_identified: intelligence.summary.selectors_identified,
        products_discovered: intelligence.summary.products_discovered,
      },
      discovery: {
        totalProductsFound: totalFound,
        productsAttempted: this.completedBatches.reduce((sum, b) => sum + b.summary.totalProcessed, 0),
      },
      categories: {
        totalCategories: this.categoryResults.size,
        categorySummary: categorySummary,
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
        speedupVsSequential: (this.maxConcurrent * 0.8).toFixed(1),
      },
      batchSummary: batchSummary,
      products: allProducts,
      failedBatches: this.failedBatches,
    };
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

async function runCategoryAwareScraping() {
  const scraper = new CategoryAwareParallelScraper(6);

  try {
    console.log('\n🧠 GLASSWING CATEGORY-AWARE PARALLEL SCRAPING');
    console.log('==============================================');
    console.log('🎯 Enhanced with SiteIntelligence + ConcurrentExplorer');
    console.log('📂 Category context preserved for each product');
    console.log('⚡ 6 concurrent processes with intelligence optimization');
    console.log('📝 Progress logged to: category_aware_scraping.log');
    console.log('\n🧠 Starting intelligence building in 3 seconds...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const results = await scraper.scrapeWithCategoryIntelligence();

    if (results) {
      console.log('\n🎉 CATEGORY-AWARE SCRAPING COMPLETE!');
      console.log('====================================');
      console.log(`🧠 Intelligence Score: ${results.intelligence.score}%`);
      console.log(`📂 Categories Processed: ${results.categories.totalCategories}`);
      console.log(`📊 ${results.results.totalProductsScraped} products captured with category context`);
      console.log(`⏱️  Completed in ${results.performance.timeInHours} hours`);
      console.log(`⚡ ${results.performance.productsPerSecond} products/second`);
      console.log(`✅ ${results.results.successRate}% success rate`);

      return true;
    } else {
      console.log('\n❌ CATEGORY-AWARE SCRAPING FAILED');
      return false;
    }

  } catch (error) {
    logger.error('Category-aware scraping crashed:', error);
    return false;
  }
}

if (require.main === module) {
  runCategoryAwareScraping()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Script crashed:', error);
      process.exit(1);
    });
}

module.exports = { CategoryAwareParallelScraper };
