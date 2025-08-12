/**
 * Core scraping system types
 */

import { UUID, URL, Timestamp, Selector, Priority } from './common.types';

// Scraping job types
export type ScrapingType = 'product' | 'category' | 'category_search' | 'full_site' | 'search';

// Product data structures
export interface ProductPricing {
  current_price: number;
  original_price?: number;
  currency: string;
  discount_percentage?: number;
  sale_reason?: string;
  price_selector?: Selector;
}

export interface ProductVariant {
  variant_id: string;
  name: string;
  value: string;
  price?: number;
  sku?: string;
  availability?: string;
  selector?: Selector;
}

export interface ProductAvailability {
  in_stock: boolean;
  stock_count?: number;
  availability_text?: string;
  restock_date?: Timestamp;
}

export interface ProductReviews {
  average_rating?: number;
  review_count?: number;
  reviews_selector?: Selector;
}

export interface ProductSelectors {
  add_to_cart?: Selector;
  variant_selector?: Selector;
  quantity_input?: Selector;
  buy_now?: Selector;
}

export interface Product {
  domain: string;
  product_id: string;
  url: URL;
  title: string;
  description?: string;
  brand?: string;
  category?: string;
  images?: string[];
  pricing: ProductPricing;
  variants?: ProductVariant[];
  availability?: ProductAvailability;
  specifications?: Record<string, any>;
  reviews?: ProductReviews;
  selectors?: ProductSelectors;
  last_scraped?: Timestamp;
  scrape_frequency?: 'hourly' | 'daily' | 'weekly';
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Category data structures
export interface CategoryFilter {
  name: string;
  type: 'price' | 'size' | 'color' | 'brand' | 'rating';
  options: string[];
  selector: Selector;
}

export interface CategorySelectors {
  category_link?: Selector;
  product_grid?: Selector;
  pagination?: Selector;
  sort_options?: Selector;
  filters?: Record<string, Selector>;
}

export interface Category {
  domain: string;
  category_path: string;
  category_name?: string;
  parent_category?: string;
  subcategories?: string[];
  product_count?: number;
  url_pattern?: string;
  selectors?: CategorySelectors;
  filters_available?: CategoryFilter[];
  last_scraped?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Scraping job configuration
export interface ScrapingConfig {
  maxPages?: number;
  respectRobotsTxt?: boolean;
  rateLimitDelay?: number;
  timeout?: number;
  extractImages?: boolean;
  extractReviews?: boolean;
  categoryFilters?: string[];
  customSelectors?: Record<string, Selector>;
}

export interface ScrapingJobData {
  job_id: UUID;
  target_url: URL;
  scraping_type: ScrapingType;
  created_at: Timestamp;
  priority?: Priority;
  config?: ScrapingConfig;
  
  // Category context for relationship preservation
  category_context?: {
    category_path?: string;
    category_name?: string;
    parent_category?: string;
    site_intelligence_id?: string;
  };
}

// Scraping results
export interface ScrapingResultSummary {
  total_items: number;
  categories_found: number;
  categories: string[];
  scraping_type: ScrapingType;
  data_quality_score: number;
  platform?: string;
  pages_scraped?: number;
  success_rate?: number;
  duration_ms?: number;
}

export interface ScrapingResult {
  data: Product[] | Category[] | any[];
  summary: ScrapingResultSummary;
  raw_results?: any; // For multisite scrapers
}

// Legacy compatibility types
export interface LegacyScrapingResults {
  products?: Product[];
  categories?: Category[];
  summary: ScrapingResultSummary;
}