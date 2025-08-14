/**
 * SectorDetector - Automatically classify websites into business sectors
 * Uses URL patterns, content analysis, and navigation structure to determine sector
 */

import { Page } from 'playwright';
import { Logger } from '../types/common.types';

export interface SectorClassification {
  sector: string;
  confidence: number;
  reasoning: string[];
  fallbackSector?: string;
}

export interface SectorConfig {
  name: string;
  selectors: Record<string, string[]>;
  urlPatterns: string[];
  workflows: Record<string, string[]>;
  validationRules: Record<string, any>;
}

export class SectorDetector {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Detect sector based on URL patterns, navigation, and content
   */
  async detectSector(url: string, page?: Page): Promise<SectorClassification> {
    const classification = {
      sector: 'unknown',
      confidence: 0,
      reasoning: [],
      fallbackSector: 'clothing' // Default to clothing as most common e-commerce
    };

    // Phase 1: URL-based detection (fast, reliable)
    const urlClassification = this.classifyByURL(url);
    if (urlClassification.confidence > 0.7) {
      return urlClassification;
    }

    // Phase 2: Content-based detection (requires page)
    if (page) {
      const contentClassification = await this.classifyByContent(page);
      
      // Combine URL and content signals
      if (contentClassification.confidence > urlClassification.confidence) {
        return contentClassification;
      }
      
      // Merge reasoning from both approaches
      return {
        ...urlClassification,
        reasoning: [...urlClassification.reasoning, ...contentClassification.reasoning],
        confidence: Math.max(urlClassification.confidence, contentClassification.confidence)
      };
    }

    return urlClassification.confidence > 0 ? urlClassification : {
      ...classification,
      sector: classification.fallbackSector!,
      confidence: 0.3,
      reasoning: ['Defaulting to clothing sector - most common e-commerce type']
    };
  }

  /**
   * Classify sector based on URL patterns and domain
   */
  private classifyByURL(url: string): SectorClassification {
    const domain = new globalThis.URL(url).hostname.toLowerCase();
    const path = new globalThis.URL(url).pathname.toLowerCase();
    const reasoning: string[] = [];
    let bestMatch = { sector: 'unknown', confidence: 0 };

    // Clothing/Fashion indicators
    const clothingDomains = [
      'gap.com', 'oldnavy.com', 'bananarepublic.com', 'uniqlo.com',
      'hm.com', 'forever21.com', 'ae.com', 'express.com', 'abercrombie.com',
      'jcrew.com', 'urbanoutfitters.com', 'anthropologie.com', 'zara.com',
      'kohls.com', 'jcpenney.com', 'target.com', 'macys.com', 'nordstrom.com'
    ];

    const clothingKeywords = [
      'fashion', 'clothing', 'apparel', 'style', 'wear', 'clothes',
      'shirt', 'dress', 'jean', 'shoe', 'accessory', 'outfit'
    ];

    const clothingPathPatterns = [
      '/browse/product', '/products/', '/product/', '/p/', '/clothing',
      '/men', '/women', '/kids', '/baby', '/shop', '/collection'
    ];

    // Hardware/Home Improvement indicators  
    const hardwareDomains = [
      'homedepot.com', 'lowes.com', 'menards.com', 'acehardware.com',
      'truevalue.com', 'harborfreight.com', 'tractorsupply.com'
    ];

    const hardwareKeywords = [
      'hardware', 'home', 'improvement', 'tool', 'lumber', 'garden',
      'appliance', 'supply', 'depot', 'building'
    ];

    // Booking/Services indicators
    const bookingDomains = [
      'zocdoc.com', 'healthgrades.com', 'styleseat.com', 'booksy.com',
      'schedulicity.com', 'thumbtack.com'
    ];

    const bookingKeywords = [
      'book', 'appointment', 'schedule', 'reserve', 'doctor', 'dentist',
      'salon', 'spa', 'massage', 'therapy', 'medical', 'health'
    ];

    // Food/Restaurant indicators
    const foodDomains = [
      'grubhub.com', 'doordash.com', 'ubereats.com', 'seamless.com',
      'opentable.com', 'resy.com'
    ];

    const foodKeywords = [
      'food', 'restaurant', 'menu', 'order', 'delivery', 'dining',
      'eat', 'meal', 'cuisine', 'takeout'
    ];

    // Check domain matches (highest confidence)
    if (clothingDomains.some(d => domain.includes(d))) {
      bestMatch = { sector: 'clothing', confidence: 0.95 };
      reasoning.push(`Domain ${domain} matches known clothing retailer`);
    } else if (hardwareDomains.some(d => domain.includes(d))) {
      bestMatch = { sector: 'hardware', confidence: 0.95 };
      reasoning.push(`Domain ${domain} matches known hardware store`);
    } else if (bookingDomains.some(d => domain.includes(d))) {
      bestMatch = { sector: 'booking', confidence: 0.95 };
      reasoning.push(`Domain ${domain} matches known booking service`);
    } else if (foodDomains.some(d => domain.includes(d))) {
      bestMatch = { sector: 'food', confidence: 0.95 };
      reasoning.push(`Domain ${domain} matches known food service`);
    }

    // Check domain keywords (medium confidence)
    if (bestMatch.confidence < 0.8) {
      const domainText = domain + ' ' + path;
      
      const clothingScore = clothingKeywords.filter(k => domainText.includes(k)).length;
      const hardwareScore = hardwareKeywords.filter(k => domainText.includes(k)).length;
      const bookingScore = bookingKeywords.filter(k => domainText.includes(k)).length;
      const foodScore = foodKeywords.filter(k => domainText.includes(k)).length;

      const maxScore = Math.max(clothingScore, hardwareScore, bookingScore, foodScore);
      
      if (maxScore > 0) {
        if (clothingScore === maxScore) {
          bestMatch = { sector: 'clothing', confidence: 0.6 + (clothingScore * 0.1) };
          reasoning.push(`Domain contains clothing keywords: ${clothingKeywords.filter(k => domainText.includes(k)).join(', ')}`);
        } else if (hardwareScore === maxScore) {
          bestMatch = { sector: 'hardware', confidence: 0.6 + (hardwareScore * 0.1) };
          reasoning.push(`Domain contains hardware keywords: ${hardwareKeywords.filter(k => domainText.includes(k)).join(', ')}`);
        } else if (bookingScore === maxScore) {
          bestMatch = { sector: 'booking', confidence: 0.6 + (bookingScore * 0.1) };
          reasoning.push(`Domain contains booking keywords: ${bookingKeywords.filter(k => domainText.includes(k)).join(', ')}`);
        } else if (foodScore === maxScore) {
          bestMatch = { sector: 'food', confidence: 0.6 + (foodScore * 0.1) };
          reasoning.push(`Domain contains food keywords: ${foodKeywords.filter(k => domainText.includes(k)).join(', ')}`);
        }
      }
    }

    // Check URL path patterns (lower confidence)
    if (bestMatch.confidence < 0.7) {
      if (clothingPathPatterns.some(pattern => path.includes(pattern))) {
        bestMatch = { sector: 'clothing', confidence: 0.5 };
        reasoning.push(`URL path contains clothing e-commerce patterns`);
      }
    }

    return {
      sector: bestMatch.sector,
      confidence: bestMatch.confidence,
      reasoning,
      fallbackSector: 'clothing'
    };
  }

  /**
   * Classify sector based on page content and navigation
   */
  private async classifyByContent(page: Page): Promise<SectorClassification> {
    return await page.evaluate(() => {
      const reasoning: string[] = [];
      let bestMatch = { sector: 'unknown', confidence: 0 };

      // Get page text content for analysis
      const pageText = document.body.textContent?.toLowerCase() || '';
      const title = document.title.toLowerCase();
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.toLowerCase() || '';
      const allText = pageText + ' ' + title + ' ' + metaDescription;

      // Navigation structure analysis
      const navLinks = Array.from(document.querySelectorAll('nav a, .nav a, .navigation a'))
        .map(link => link.textContent?.toLowerCase() || '')
        .join(' ');

      // Product/item structure analysis
      const hasProductGrids = document.querySelectorAll('.product, .product-item, .item, .card').length > 5;
      const hasShoppingCart = !!(
        document.querySelector('[class*="cart"], [class*="bag"], [id*="cart"]') ||
        allText.includes('add to cart') || allText.includes('shopping bag')
      );

      // Clothing/Fashion indicators
      const clothingTerms = [
        'clothing', 'fashion', 'apparel', 'style', 'wear', 'clothes',
        'shirt', 'dress', 'jean', 'shoe', 'accessory', 'outfit',
        'men', 'women', 'kids', 'baby', 'size', 'color', 'collection'
      ];

      const clothingNavTerms = [
        'men', 'women', 'kids', 'baby', 'sale', 'new arrival', 'collection',
        'tops', 'bottoms', 'dresses', 'shoes', 'accessories'
      ];

      // Hardware indicators
      const hardwareTerms = [
        'hardware', 'tools', 'lumber', 'garden', 'appliance', 'supply',
        'home improvement', 'building', 'construction', 'electrical', 'plumbing'
      ];

      // Booking indicators
      const bookingTerms = [
        'appointment', 'schedule', 'book', 'reserve', 'doctor', 'dentist',
        'salon', 'spa', 'massage', 'therapy', 'medical', 'health', 'service'
      ];

      // Food indicators
      const foodTerms = [
        'menu', 'food', 'restaurant', 'order', 'delivery', 'dining',
        'eat', 'meal', 'cuisine', 'takeout', 'recipe', 'kitchen'
      ];

      // Calculate scores
      const clothingScore = clothingTerms.filter(term => allText.includes(term)).length +
                           clothingNavTerms.filter(term => navLinks.includes(term)).length;
      
      const hardwareScore = hardwareTerms.filter(term => allText.includes(term)).length;
      const bookingScore = bookingTerms.filter(term => allText.includes(term)).length;
      const foodScore = foodTerms.filter(term => allText.includes(term)).length;

      // Determine best match
      const maxScore = Math.max(clothingScore, hardwareScore, bookingScore, foodScore);
      
      if (maxScore > 2) {
        if (clothingScore === maxScore && hasProductGrids && hasShoppingCart) {
          bestMatch = { sector: 'clothing', confidence: 0.8 + Math.min(clothingScore * 0.05, 0.15) };
          reasoning.push(`Page content strongly indicates clothing/fashion e-commerce`);
          reasoning.push(`Found ${clothingScore} clothing-related terms and e-commerce structure`);
        } else if (hardwareScore === maxScore) {
          bestMatch = { sector: 'hardware', confidence: 0.7 + Math.min(hardwareScore * 0.05, 0.15) };
          reasoning.push(`Page content indicates hardware/home improvement store`);
        } else if (bookingScore === maxScore) {
          bestMatch = { sector: 'booking', confidence: 0.7 + Math.min(bookingScore * 0.05, 0.15) };
          reasoning.push(`Page content indicates booking/appointment service`);
        } else if (foodScore === maxScore) {
          bestMatch = { sector: 'food', confidence: 0.7 + Math.min(foodScore * 0.05, 0.15) };
          reasoning.push(`Page content indicates food/restaurant service`);
        }
      }

      // Default to clothing if has e-commerce structure but unclear sector
      if (bestMatch.confidence < 0.5 && hasProductGrids && hasShoppingCart) {
        bestMatch = { sector: 'clothing', confidence: 0.4 };
        reasoning.push(`E-commerce structure detected, defaulting to clothing sector`);
      }

      return {
        sector: bestMatch.sector,
        confidence: bestMatch.confidence,
        reasoning,
        fallbackSector: 'clothing'
      };
    });
  }

  /**
   * Get sector-specific configuration
   */
  getSectorConfig(sector: string): SectorConfig | null {
    // Import sector templates - this will be moved to external file
    const sectorConfigs: Record<string, SectorConfig> = {
      clothing: {
        name: 'Clothing/Fashion E-commerce',
        selectors: {
          title: [
            'h1', '.product-title', '.product-name', '.title', '.name',
            '[data-testid*="title"]', '[data-testid*="name"]',
            '.product__title', '.item-title', '.product-single__title'
          ],
          price: [
            '[itemprop="price"]', '.price', '.money', '.cost', '.amount',
            '.product-price', '.current-price', '.sale-price',
            'span[data-test="product-price"]', 'span.c-pdp-price',
            'span.pd-price', '.markdown-price', '.current-sale-price'
          ],
          images: [
            'img[itemprop="image"]', '.product-image img', '.main-image img',
            '.featured-image img', '.gallery img', '.product__image img'
          ],
          availability: [
            '[itemprop="availability"]', '.stock', '.inventory', '.available',
            '.in-stock', '[data-stock]', '.availability', '.product-availability'
          ],
          addToCart: [
            '.add-to-cart', '.btn-cart', '[data-testid*="cart"]',
            '.cart-button', '.add-to-basket', 'button[type="submit"]'
          ]
        },
        urlPatterns: [
          '/browse/product', '/products/', '/product/', '/p/',
          '/shop/product/', '/s/', '/product/prd-', 'productpage.'
        ],
        workflows: {
          purchase: ['selectVariant', 'setQuantity', 'addToCart', 'proceedToCheckout']
        },
        validationRules: {
          title: { minLength: 3, required: true },
          price: { pattern: /\$[\d,]+\.?\d*/, required: true }
        }
      }
    };

    return sectorConfigs[sector] || null;
  }
}

export default SectorDetector;