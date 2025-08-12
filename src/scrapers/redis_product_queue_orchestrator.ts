#!/usr/bin/env node

/**
 * Redis Product Queue Orchestrator
 * 
 * Smart orchestrator that:
 * 1. Uses intelligence system to discover all product categories
 * 2. Extracts product URLs from each category
 * 3. Queues individual product scraping jobs in Redis
 * 4. Monitors progress as workers process the queue in parallel
 */

import SiteIntelligence from '../intelligence/SiteIntelligence';
import GlasswingScraper from './GlasswingScraper';
import { queueManager } from '../services/QueueManager';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../types/common.types';

interface NavigationSection {
  name: string;
  url: string;
}

interface CategoryData {
  productLinks: Array<{
    element: {
      href: string;
    };
  }>;
}

interface OrchestrationOptions {
  baseUrl?: string;
  maxCategoriesPerType?: number;
  maxProductsPerCategory?: number;
  queuePriority?: 'high' | 'normal' | 'low';
}

interface JobData {
  job_id: string;
  target_url: string;
  scraping_type: 'product';
  created_at: Date;
  max_pages: number;
  timeout_ms: number;
  extract_images: boolean;
  extract_reviews: boolean;
  respect_robots_txt: boolean;
  rate_limit_delay_ms: number;
}

interface QueuedJob {
  jobId: string;
  productUrl: string;
  queuedAt: Date;
}

interface OrchestrationResult {
  success: boolean;
  total_products_queued: number;
  total_time_seconds: number;
  categories_processed: number;
  intelligence_score: number;
}

interface Categories {
  product_categories: NavigationSection[];
  gender_demographics: NavigationSection[];
  featured_collections: NavigationSection[];
  brands: NavigationSection[];
}

interface NavigationData {
  navigation_map: {
    main_sections: NavigationSection[];
  };
}

interface ComprehensiveIntel {
  summary: {
    sections_mapped: number;
    intelligence_score: number;
  };
}

// Enhanced logger
const logger: Logger = {
  info: (...args: any[]) => {
    const msg = `[ORCHESTRATOR] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.log(msg);
  },
  error: (...args: any[]) => {
    const msg = `[ORCHESTRATOR-ERROR] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.error(msg);
  },
  warn: (...args: any[]) => {
    const msg = `[ORCHESTRATOR-WARN] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.warn(msg);
  },
  debug: (...args: any[]) => {
    const msg = `[ORCHESTRATOR-DEBUG] ${new Date().toISOString()}: ${args.join(' ')}`;
    console.log(msg);
  },
};

// Additional progress logging function
const logProgress = (current: number, total: number, extra: string = ''): void => {
  const percent = ((current / total) * 100).toFixed(1);
  const msg = `[PROGRESS] ${current}/${total} (${percent}%) ${extra}`;
  console.log(msg);
};

class RedisProductQueueOrchestrator {
  private siteIntelligence: SiteIntelligence;
  private glasswingScraper: GlasswingScraper;
  private queuedJobs: QueuedJob[];
  private processedJobs: number;
  private startTime: number | null;

  constructor() {
    this.siteIntelligence = new SiteIntelligence(logger);
    this.glasswingScraper = new GlasswingScraper(logger);
    this.queuedJobs = [];
    this.processedJobs = 0;
    this.startTime = null;
  }

  /**
   * Main orchestration method
   */
  async orchestrateProductScraping(options: OrchestrationOptions = {}): Promise<OrchestrationResult> {
    this.startTime = Date.now();
    const {
      baseUrl = 'https://glasswingshop.com',
      maxCategoriesPerType = 3,  // Limit categories to prevent overload
      maxProductsPerCategory = 50,  // Limit products per category
      queuePriority = 'normal'
    } = options;

    logger.info('🧠 REDIS PRODUCT QUEUE ORCHESTRATION STARTING');
    logger.info('==============================================');

    try {
      // Phase 1: Initialize systems
      logger.info('🔧 Phase 1: Initializing intelligence and queue systems...');
      await this.siteIntelligence.initialize();
      if (!queueManager.isInitialized) {
        await queueManager.initialize();
      }

      // Phase 2: Discover product categories using intelligence
      logger.info('🧠 Phase 2: Building site intelligence for category discovery...');
      const intelligence = await this.siteIntelligence.buildComprehensiveSiteIntelligence(
        baseUrl, 
        {
          forceRefresh: false,
          maxConcurrent: 2, // Conservative to avoid overload
          maxSubcategories: 2,
        }
      );

      logger.info(`✅ Intelligence complete: ${intelligence.summary.sections_mapped} sections, ${intelligence.summary.intelligence_score}% score`);

      // Get the actual sections from worldModel
      const navigationData = await this.siteIntelligence.worldModel.getSiteNavigation('glasswingshop.com');
      if (!navigationData || !navigationData.navigation_map || !navigationData.navigation_map.main_sections) {
        throw new Error('No navigation sections found in worldModel');
      }

      // Phase 3: Extract promising categories for product discovery
      const categoriesForScraping = this.selectCategoriesForScraping(
        navigationData.navigation_map.main_sections, 
        maxCategoriesPerType
      );

      logger.info(`📂 Phase 3: Selected ${categoriesForScraping.length} categories for product discovery`);
      categoriesForScraping.forEach(cat => {
        logger.info(`   📁 ${cat.name} (${cat.url})`);
      });

      // Phase 4: Discover product URLs from selected categories  
      logger.info('🔍 Phase 4: Discovering product URLs from categories...');
      const allProductUrls = await this.discoverProductUrls(categoriesForScraping, maxProductsPerCategory);

      logger.info(`✅ Discovered ${allProductUrls.length} unique product URLs`);

      // Phase 5: Queue product scraping jobs in Redis
      logger.info('📋 Phase 5: Queuing product scraping jobs in Redis...');
      await this.queueProductScrapingJobs(allProductUrls, queuePriority);

      // Phase 6: Monitor queue processing
      logger.info('👀 Phase 6: Monitoring queue processing...');
      await this.monitorQueueProgress();

      const endTime = Date.now();
      const totalTime = (endTime - this.startTime) / 1000;

      logger.info('🎉 ORCHESTRATION COMPLETE!');
      logger.info('==========================');
      logger.info(`📊 Total Products Queued: ${this.queuedJobs.length}`);
      logger.info(`⏱️  Total Time: ${(totalTime / 60).toFixed(1)} minutes`);
      logger.info(`⚡ Products/minute: ${(this.queuedJobs.length / (totalTime / 60)).toFixed(1)}`);

      return {
        success: true,
        total_products_queued: this.queuedJobs.length,
        total_time_seconds: totalTime,
        categories_processed: categoriesForScraping.length,
        intelligence_score: intelligence.summary.intelligence_score
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Orchestration failed:', errorMessage);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Select the most promising categories for product scraping
   */
  private selectCategoriesForScraping(sections: NavigationSection[], maxCategoriesPerType: number): NavigationSection[] {
    const categories: Categories = {
      product_categories: [],
      gender_demographics: [],
      featured_collections: [],
      brands: []
    };

    sections.forEach(section => {
      const name = section.name.toLowerCase();
      const url = section.url.toLowerCase();

      // Product categories (clothing, shoes, accessories, etc.)
      if (this.isProductCategory(name, url)) {
        categories.product_categories.push(section);
      }
      // Gender/demographic categories (men, women, unisex)
      else if (this.isGenderCategory(name, url)) {
        categories.gender_demographics.push(section);
      }
      // Featured collections (new arrivals, sale, etc.)
      else if (this.isFeaturedCollection(name, url)) {
        categories.featured_collections.push(section);
      }
      // Brand collections
      else if (this.isBrandCollection(name, url)) {
        categories.brands.push(section);
      }
    });

    // Prioritize and limit categories
    const selectedCategories: NavigationSection[] = [];

    // High priority: product categories
    selectedCategories.push(...categories.product_categories.slice(0, maxCategoriesPerType));
    
    // Medium priority: gender demographics  
    selectedCategories.push(...categories.gender_demographics.slice(0, Math.floor(maxCategoriesPerType / 2)));
    
    // Lower priority: featured collections and brands
    selectedCategories.push(...categories.featured_collections.slice(0, 2));
    selectedCategories.push(...categories.brands.slice(0, 2));

    return selectedCategories;
  }

  /**
   * Discover product URLs from selected categories (URL discovery only)
   */
  private async discoverProductUrls(categories: NavigationSection[], maxProductsPerCategory: number): Promise<string[]> {
    const allProductUrls = new Set<string>(); // Use Set to avoid duplicates
    
    for (const [index, category] of categories.entries()) {
      try {
        logger.info(`🔍 Discovering URLs from category ${index + 1}/${categories.length}: ${category.name}`);
        
        // Use category page scraping for URL discovery only (no product details)
        const categoryData = await this.glasswingScraper.scrapeCategoryPage(category.url);
        
        // Extract product URLs from the category page
        const productUrls = categoryData.productLinks
          .slice(0, maxProductsPerCategory) // Limit products per category
          .map(link => link.element.href)
          .filter(url => url && url.startsWith('http'));

        productUrls.forEach(url => allProductUrls.add(url));
        
        logger.info(`   ✅ Found ${productUrls.length} product URLs (${allProductUrls.size} total unique)`);

        // Rate limiting between categories
        if (index < categories.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`   ❌ Failed to discover URLs from ${category.name}: ${errorMessage}`);
      }
    }

    return Array.from(allProductUrls);
  }

  /**
   * Queue individual product scraping jobs in Redis
   */
  private async queueProductScrapingJobs(productUrls: string[], priority: string): Promise<void> {
    const scrapingQueue = queueManager.getQueue('scraping');
    
    for (const [index, productUrl] of productUrls.entries()) {
      const jobId = uuidv4();
      
      const jobData: JobData = {
        job_id: jobId,
        target_url: productUrl,
        scraping_type: 'product',
        created_at: new Date(),
        max_pages: 1,
        timeout_ms: 30000,
        extract_images: true,
        extract_reviews: false,
        respect_robots_txt: true,
        rate_limit_delay_ms: 1000
      };

      try {
        await scrapingQueue.add('product_scraping', jobData, {
          jobId: jobId,
          priority: priority === 'high' ? 10 : priority === 'low' ? 1 : 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10, // Keep last 10 completed jobs
          removeOnFail: 5,     // Keep last 5 failed jobs
        });

        this.queuedJobs.push({
          jobId: jobId,
          productUrl: productUrl,
          queuedAt: new Date()
        });

        if ((index + 1) % 50 === 0) {
          logProgress(index + 1, productUrls.length, `${this.queuedJobs.length} jobs queued`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`❌ Failed to queue job for ${productUrl}: ${errorMessage}`);
      }
    }

    logger.info(`✅ Successfully queued ${this.queuedJobs.length} product scraping jobs`);
  }

  /**
   * Monitor queue processing progress
   */
  private async monitorQueueProgress(): Promise<void> {
    const scrapingQueue = queueManager.getQueue('scraping');
    const totalJobs = this.queuedJobs.length;
    let lastLoggedProgress = 0;

    logger.info('👀 Starting queue monitoring...');
    logger.info('   💡 Tip: Start workers in parallel terminals with: npm run worker');
    logger.info('   📊 Queue stats will be logged every 30 seconds');

    return new Promise<void>((resolve) => {
      const monitorInterval = setInterval(async () => {
        try {
          const waiting = await scrapingQueue.waiting();
          const active = await scrapingQueue.active();
          const completed = await scrapingQueue.completed();
          const failed = await scrapingQueue.failed();

          const processed = completed.length + failed.length;
          const progressPercent = totalJobs > 0 ? (processed / totalJobs * 100).toFixed(1) : '0';

          // Log every 10% progress or every 30 seconds
          if (processed - lastLoggedProgress >= Math.ceil(totalJobs * 0.1)) {
            logProgress(processed, totalJobs, 
              `Waiting: ${waiting.length}, Active: ${active.length}, Failed: ${failed.length}`);
            lastLoggedProgress = processed;
          }

          // Check if all jobs are complete
          if (processed >= totalJobs) {
            clearInterval(monitorInterval);
            
            logger.info('🎉 All jobs processed!');
            logger.info(`   ✅ Completed: ${completed.length}`);
            logger.info(`   ❌ Failed: ${failed.length}`);
            logger.info(`   📈 Success rate: ${((completed.length / totalJobs) * 100).toFixed(1)}%`);
            
            resolve();
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('❌ Error monitoring queue:', errorMessage);
        }
      }, 30000); // Check every 30 seconds
    });
  }

  /**
   * Category classification helpers
   */
  private isProductCategory(name: string, url: string): boolean {
    const keywords = ['clothing', 'shoes', 'accessories', 'bags', 'jewelry', 'watches'];
    return keywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  private isGenderCategory(name: string, url: string): boolean {
    const keywords = ['men', 'women', 'unisex', 'mens', 'womens'];
    return keywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  private isFeaturedCollection(name: string, url: string): boolean {
    const keywords = ['new', 'sale', 'featured', 'trending', 'clearance'];
    return keywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  private isBrandCollection(name: string, url: string): boolean {
    // Brand collections typically don't contain generic product category words
    const productWords = ['clothing', 'shoes', 'accessories', 'new', 'sale', 'all'];
    const hasProductWords = productWords.some(word => name.includes(word) || url.includes(word));
    
    // Brand names are usually capitalized and specific
    const looksLikeBrand = /^[A-Z][a-z]+(\s+[A-Z&+][a-z]*)*$/.test(name);
    
    return !hasProductWords && looksLikeBrand;
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      await this.siteIntelligence.close();
      await this.glasswingScraper.close();
      logger.info('✅ Cleanup completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Cleanup failed:', errorMessage);
    }
  }
}

/**
 * CLI interface
 */
async function runOrchestration(): Promise<boolean> {
  const orchestrator = new RedisProductQueueOrchestrator();
  
  try {
    const options: OrchestrationOptions = {
      baseUrl: 'https://glasswingshop.com',
      maxCategoriesPerType: 2,  // Limit to 2 per category type for testing
      maxProductsPerCategory: 10,  // Small number for testing
      queuePriority: 'normal'
    };

    const result = await orchestrator.orchestrateProductScraping(options);
    
    console.log('\n🎉 ORCHESTRATION SUCCESS!');
    console.log('===========================');
    console.log(`📊 Products Queued: ${result.total_products_queued}`);
    console.log(`⏱️  Total Time: ${(result.total_time_seconds / 60).toFixed(1)} minutes`);
    console.log(`📂 Categories: ${result.categories_processed}`);
    console.log(`🧠 Intelligence Score: ${result.intelligence_score}%`);
    console.log('\n💡 Next steps:');
    console.log('   1. Start multiple workers: npm run worker');
    console.log('   2. Monitor progress via API: GET /api/queue/status');
    console.log('   3. Check results in MongoDB after completion');

    return true;

  } catch (error) {
    logger.error('💥 Orchestration failed:', error);
    return false;
  }
}

if (require.main === module) {
  runOrchestration()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('💥 Script crashed:', error);
      process.exit(1);
    });
}

export { RedisProductQueueOrchestrator };