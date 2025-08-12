/**
 * Multisite scraping system types
 */

import { URL, Domain, Selector, Timestamp } from './common.types';
import { SupportedPlatform, SiteCapabilities, SelectorSet } from './intelligence.types';
import { Product, Category, ScrapingResult } from './scraping.types';

// Platform-specific configurations
export interface PlatformConfig {
  platform: SupportedPlatform;
  default_selectors: SelectorSet;
  api_patterns?: {
    product_api?: string;
    collection_api?: string;
    search_api?: string;
  };
  rate_limits: {
    requests_per_minute: number;
    concurrent_requests: number;
    delay_between_requests: number;
  };
  anti_bot_config: {
    user_agents: string[];
    proxy_required: boolean;
    javascript_required: boolean;
    session_management: boolean;
  };
  capabilities: SiteCapabilities;
}

// Scraper factory types
export interface ScraperInfo {
  scraper: BaseScraper;
  platformInfo: {
    platform: SupportedPlatform;
    confidence: number;
    detected_features: string[];
  };
  config: PlatformConfig;
}

export interface ScraperFactoryConfig {
  cacheTimeout?: number;
  enableDeepAnalysis?: boolean;
  fallbackToUniversal?: boolean;
  proxyConfig?: ProxyConfig;
}

// Proxy configuration
export interface ProxyConfig {
  enabled: boolean;
  provider?: 'brightdata' | 'custom';
  endpoints?: string[];
  rotation_interval?: number;
  authentication?: {
    username: string;
    password: string;
  };
}

// Universal scraper types
export interface UniversalScrapingOptions {
  target_url: URL;
  scraping_type: 'product' | 'category' | 'search';
  selectors?: SelectorSet;
  max_retry_attempts?: number;
  enable_fallback_selectors?: boolean;
  progressive_enhancement?: boolean;
}

export interface UniversalScrapingResult {
  success: boolean;
  data: Product[] | Category[];
  platform_detected?: SupportedPlatform;
  confidence_score: number;
  selectors_used: Record<string, Selector>;
  fallbacks_triggered: string[];
  performance_metrics: {
    total_time_ms: number;
    selector_resolution_time: number;
    extraction_time: number;
    retry_count: number;
  };
}

// Base scraper interface
export interface BaseScraper {
  platform: SupportedPlatform;
  domain: Domain;
  
  // Core scraping methods
  scrapeProductPage(url: URL): Promise<Product>;
  scrapeCategoryPage?(url: URL): Promise<Category>;
  scrapeWithCategories?(options: any): Promise<ScrapingResult>;
  scrape?(progressCallback?: (progress: number, message?: string) => void): Promise<ScrapingResult>;
  
  // Configuration and lifecycle
  configure(config: PlatformConfig): void;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
  
  // Health and status
  healthCheck?(): Promise<boolean>;
  getCapabilities?(): SiteCapabilities;
}

// Multisite scraping results
export interface MultisiteScrapingResult {
  platform: SupportedPlatform;
  products: MultisiteProduct[];
  pages: MultisitePage[];
  summary: {
    pagesScraped: number;
    productsFound: number;
    successRate: number;
    duration: number;
    errors: string[];
  };
  metadata: {
    scraper_used: string;
    selectors_effective: Record<string, boolean>;
    platform_confidence: number;
    fallbacks_used: string[];
  };
}

export interface MultisiteProduct {
  title: string;
  price: number | string;
  url: URL;
  description?: string;
  images?: Array<{ src: string; alt?: string }>;
  available?: boolean;
  brand?: string;
  sizes?: Array<{ text: string; value: string }>;
  colors?: Array<{ name: string; value: string }>;
  scrapedAt: Timestamp;
  platform: SupportedPlatform;
}

export interface MultisitePage {
  url: URL;
  title?: string;
  scraped_at: Timestamp;
  products_found: number;
  success: boolean;
  error?: string;
}

// Selector library types
export interface SelectorPattern {
  selector: Selector;
  priority: number;
  platform_compatibility: SupportedPlatform[];
  fallback_selectors?: Selector[];
  validation_rules?: {
    required_attributes?: string[];
    expected_content_pattern?: RegExp;
    minimum_matches?: number;
  };
}

export interface SelectorLibrary {
  product: {
    title: SelectorPattern[];
    price: SelectorPattern[];
    image: SelectorPattern[];
    description: SelectorPattern[];
    availability: SelectorPattern[];
    variants: SelectorPattern[];
  };
  category: {
    product_links: SelectorPattern[];
    pagination: SelectorPattern[];
    filters: SelectorPattern[];
    breadcrumbs: SelectorPattern[];
  };
  navigation: {
    main_menu: SelectorPattern[];
    categories: SelectorPattern[];
    search: SelectorPattern[];
  };
}

// Anti-bot detection and mitigation
export interface AntiBotConfig {
  detection_patterns: {
    captcha_selectors: Selector[];
    rate_limit_indicators: string[];
    blocked_content_patterns: RegExp[];
  };
  mitigation_strategies: {
    delay_randomization: {
      min_delay: number;
      max_delay: number;
    };
    user_agent_rotation: {
      enabled: boolean;
      agents: string[];
    };
    proxy_rotation: {
      enabled: boolean;
      config: ProxyConfig;
    };
    session_management: {
      enabled: boolean;
      session_duration: number;
    };
  };
}

export interface AntiBotStatus {
  is_blocked: boolean;
  detection_confidence: number;
  detected_measures: string[];
  recommended_actions: string[];
  retry_after_ms?: number;
}