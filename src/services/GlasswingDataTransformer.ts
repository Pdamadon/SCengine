/**
 * Glasswing Data Transformer
 * Converts raw Glasswing scraping JSON into enhanced product schema with automation intelligence
 */

import { ProductDocument, ProductCategoryDocument } from '../types/database.types';
import { getDb } from '../database/mongo';
import crypto from 'crypto';

// Raw Glasswing scraping data structure (input)
export interface GlasswingProductData {
  url: string;
  productData: {
    title: string;
    price: string;
    description?: string;
    descriptionHtml?: string;
    descriptionLength?: number;
    url: string;
  };
  variants: Array<{
    type: string;
    label: string;
    selector: string;
    options: Array<{
      value: string;
      text: string;
      available: boolean;
      selected: boolean;
      variantType: string;
    }>;
  }>;
  images: string[];
  elements: Record<string, {
    primary: string;
    alternatives: string[];
    playwrightAction: string;
    element: {
      tag: string;
      text?: string;
      value?: string;
    };
  }>;
  workflowActions: string[];
  scrapedAt: string;
}

// Complete Glasswing scraping result structure
export interface GlasswingScrapingResult {
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
  products: GlasswingProductData[];
  failedBatches: any[];
}

// Transformation result
export interface TransformationResult {
  products_processed: number;
  products_created: number;
  products_updated: number;
  category_relationships_created: number;
  errors: Array<{
    product_url: string;
    error: string;
  }>;
  transformation_time_ms: number;
}

export class GlasswingDataTransformer {
  
  /**
   * Transform complete Glasswing scraping result into database documents
   */
  async transformScrapingResult(
    glasswingData: GlasswingScrapingResult,
    categoryId: string,
    categoryName: string
  ): Promise<TransformationResult> {
    const startTime = Date.now();
    const result: TransformationResult = {
      products_processed: 0,
      products_created: 0,
      products_updated: 0,
      category_relationships_created: 0,
      errors: [],
      transformation_time_ms: 0
    };

    console.log(`🔄 Starting transformation of ${glasswingData.products.length} Glasswing products`);
    console.log(`📁 Target category: ${categoryName} (${categoryId})`);

    const db = await getDb();
    
    for (const rawProduct of glasswingData.products) {
      try {
        result.products_processed++;
        
        // Transform single product
        const productDoc = this.transformProduct(rawProduct, glasswingData.scrapeInfo.site);
        
        // Check if product already exists (URL-based deduplication)
        const existingProduct = await db.collection('products').findOne({ url: productDoc.url });
        
        if (existingProduct) {
          // Update existing product with newer automation data
          await this.updateExistingProduct(existingProduct._id.toString(), productDoc, glasswingData.scrapeInfo.timestamp);
          result.products_updated++;
        } else {
          // Create new product (remove _id field before insert)
          const { _id, ...productDocToInsert } = productDoc;
          const insertResult = await db.collection('products').insertOne(productDocToInsert);
          result.products_created++;
        }
        
        // Create/update category relationship
        await this.upsertCategoryRelationship(
          productDoc.product_id,
          categoryId,
          categoryName,
          glasswingData.scrapeInfo.site
        );
        result.category_relationships_created++;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          product_url: rawProduct.url,
          error: errorMessage
        });
        console.error(`❌ Failed to transform product ${rawProduct.url}:`, errorMessage);
      }
    }
    
    result.transformation_time_ms = Date.now() - startTime;
    
    console.log(`✅ Transformation complete:`, result);
    return result;
  }

  /**
   * Transform single Glasswing product into ProductDocument
   */
  private transformProduct(rawProduct: GlasswingProductData, siteDomain: string): ProductDocument {
    // Generate consistent product ID from URL
    const productId = this.generateProductId(rawProduct.url);
    
    // Extract brand from title (simple heuristic)
    const brand = this.extractBrand(rawProduct.productData.title);
    
    // Parse pricing information
    const pricing = this.parsePricing(rawProduct.productData.price);
    
    // Create enhanced product document
    const productDoc: ProductDocument = {
      // Core fields
      domain: siteDomain,
      product_id: productId,
      url: rawProduct.url,
      title: rawProduct.productData.title,
      description: rawProduct.productData.description,
      description_html: rawProduct.productData.descriptionHtml,
      description_length: rawProduct.productData.descriptionLength,
      brand: brand,
      images: rawProduct.images,
      
      // Pricing
      pricing: pricing,
      
      // Enhanced: Glasswing automation intelligence
      glasswing_variants: this.transformVariants(rawProduct.variants),
      automation_elements: this.transformElements(rawProduct.elements),
      purchase_workflow: rawProduct.workflowActions,
      
      // Metadata
      scraped_at: new Date(rawProduct.scrapedAt),
      scrape_quality_score: this.calculateQualityScore(rawProduct),
      created_at: new Date(),
      updated_at: new Date(),
    };

    return productDoc;
  }

  /**
   * Update existing product with newer automation data
   */
  private async updateExistingProduct(
    existingProductId: string,
    newProductDoc: ProductDocument,
    scrapeTimestamp: string
  ): Promise<void> {
    const db = await getDb();
    
    const updateDoc = {
      $set: {
        // Update automation intelligence with latest data
        glasswing_variants: newProductDoc.glasswing_variants,
        automation_elements: newProductDoc.automation_elements,
        purchase_workflow: newProductDoc.purchase_workflow,
        
        // Update metadata
        scraped_at: new Date(scrapeTimestamp),
        scrape_quality_score: newProductDoc.scrape_quality_score,
        updated_at: new Date(),
        
        // Update core data if newer
        description: newProductDoc.description,
        description_html: newProductDoc.description_html,
        description_length: newProductDoc.description_length,
        images: newProductDoc.images,
      }
    };
    
    const { ObjectId } = require('mongodb');
    await db.collection('products').updateOne(
      { _id: new ObjectId(existingProductId) },
      updateDoc
    );
  }

  /**
   * Create or update product-category relationship
   */
  private async upsertCategoryRelationship(
    productId: string,
    categoryId: string,
    categoryName: string,
    siteDomain: string
  ): Promise<void> {
    const db = await getDb();
    
    // Upsert relationship (avoid duplicates)
    await db.collection('product_categories').updateOne(
      { 
        product_id: productId,
        category_id: categoryId 
      },
      { 
        $set: {
          domain: siteDomain,
          discovered_from_category: categoryName,
          discovery_method: 'category_scrape',
          confidence_score: 0.95,
          relationship_strength: 'primary',
          last_confirmed: new Date(),
          relationship_active: true,
          updated_at: new Date()
        },
        $setOnInsert: { 
          product_id: productId,
          category_id: categoryId,
          first_discovered: new Date(),
          created_at: new Date()
        }
      },
      { upsert: true }
    );
  }

  /**
   * Generate consistent product ID from URL
   */
  private generateProductId(url: string): string {
    // Extract product slug from URL
    const match = url.match(/\/products\/([^/?]+)/);
    if (match) {
      return match[1];
    }
    
    // Fallback: hash the URL
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Extract brand from product title using heuristics
   */
  private extractBrand(title: string): string | undefined {
    // Common brand patterns
    const brandPatterns = [
      /^([A-Z][a-z]+)\s+/,           // "Kapital Something" 
      /^"([^"]+)"\s+/,               // "Brand Name" Something
      /^([A-Z0-9]{2,})\s+/,         // "7115 Something"
    ];
    
    for (const pattern of brandPatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return undefined;
  }

  /**
   * Parse pricing information from text
   */
  private parsePricing(priceText: string): any {
    // Handle price ranges like "$28 to $58"
    const rangeMatch = priceText.match(/\$(\d+)\s+to\s+\$(\d+)/);
    if (rangeMatch) {
      return {
        min_price: parseInt(rangeMatch[1]) * 100, // Convert to cents
        max_price: parseInt(rangeMatch[2]) * 100,
        currency: 'USD',
        price_range: true,
        original_text: priceText
      };
    }
    
    // Handle single price like "$39"
    const singleMatch = priceText.match(/\$(\d+)/);
    if (singleMatch) {
      return {
        price: parseInt(singleMatch[1]) * 100, // Convert to cents
        currency: 'USD',
        price_range: false,
        original_text: priceText
      };
    }
    
    // Fallback: store as text
    return {
      original_text: priceText,
      currency: 'USD'
    };
  }

  /**
   * Calculate data quality score for product
   */
  private calculateQualityScore(product: GlasswingProductData): number {
    let score = 0;
    
    // Title quality (20 points)
    if (product.productData.title && product.productData.title.length > 10) {
      score += 20;
    }
    
    // Description quality (20 points)
    if (product.productData.description && product.productData.description.length > 50) {
      score += 20;
    }
    
    // Variants data (20 points)
    if (product.variants && product.variants.length > 0) {
      score += 20;
    }
    
    // Automation elements (20 points)
    if (product.elements && Object.keys(product.elements).length >= 3) {
      score += 20;
    }
    
    // Purchase workflow (20 points)
    if (product.workflowActions && product.workflowActions.length > 0) {
      score += 20;
    }
    
    return score;
  }

  /**
   * Transform variants to match database schema
   */
  private transformVariants(variants: any[]): any[] {
    if (!variants || !Array.isArray(variants)) return [];
    
    return variants.map(variant => ({
      ...variant,
      options: (variant.options || []).map((option: any) => ({
        ...option,
        variant_type: option.variantType || option.variant_type || 'unknown' // Map variantType -> variant_type
      }))
    }));
  }

  /**
   * Transform automation elements to match database schema
   */
  private transformElements(elements: any): any {
    if (!elements) return {};
    
    const transformed: any = {};
    
    for (const [key, element] of Object.entries(elements)) {
      // Skip null or undefined elements
      if (!element) continue;
      
      const elementData = element as any;
      transformed[key] = {
        primary: elementData.primary || '',
        alternatives: elementData.alternatives || [],
        playwright_action: elementData.playwrightAction || '', // Map playwrightAction -> playwright_action
        element: elementData.element || { tag: 'unknown' }
      };
    }
    
    return transformed;
  }
}

// Export singleton instance
export const glasswingTransformer = new GlasswingDataTransformer();