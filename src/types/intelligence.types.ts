/**
 * Site Intelligence System types
 */

import { Domain, URL, Selector, Timestamp } from './common.types';

// Platform detection
export type SupportedPlatform = 'shopify' | 'woocommerce' | 'magento' | 'gap' | 'custom' | 'unknown';

export interface PlatformDetectionResult {
  platform: SupportedPlatform;
  confidence: number;
  detected_features: PlatformFeature[];
  selectors?: Record<string, Selector>;
  api_endpoints?: string[];
}

export interface PlatformFeature {
  feature: string;
  confidence: number;
  evidence: string[];
}

// Site capabilities
export interface SiteCapabilities {
  can_extract_products: boolean;
  can_extract_pricing: boolean;
  can_extract_variants: boolean;
  can_navigate_categories: boolean;
  can_add_to_cart: boolean;
  can_checkout: boolean;
  can_search: boolean;
  can_filter: boolean;
  can_book_appointments?: boolean;
  can_check_availability?: boolean;
}

// Navigation structures
export interface NavigationSection {
  name: string;
  url: URL;
  selector?: Selector;
  subsections?: NavigationSection[];
  category_type?: 'product' | 'gender' | 'featured' | 'brand';
}

export interface NavigationMap {
  main_sections: NavigationSection[];
  dropdown_menus: Record<string, NavigationSection[]>;
  footer_links?: NavigationSection[];
  breadcrumb_pattern?: string;
}

// Selector libraries
export interface SelectorSet {
  navigation?: {
    main_menu?: Selector;
    categories?: Selector;
    breadcrumbs?: Selector;
    search_box?: Selector;
    filters?: Selector;
  };
  products?: {
    product_card?: Selector;
    product_title?: Selector;
    product_price?: Selector;
    product_image?: Selector;
    product_link?: Selector;
    availability?: Selector;
  };
  cart?: {
    add_to_cart_button?: Selector;
    cart_icon?: Selector;
    cart_count?: Selector;
    cart_page?: Selector;
    checkout_button?: Selector;
  };
  booking?: {
    service_selector?: Selector;
    calendar?: Selector;
    time_slots?: Selector;
    book_button?: Selector;
  };
}

// Performance metrics
export interface SitePerformanceMetrics {
  average_load_time: number;
  success_rate: number;
  last_successful_scrape?: Timestamp;
  total_scrapes: number;
  error_count: number;
}

// Site intelligence document
export interface SiteIntelligence {
  domain: Domain;
  platform: SupportedPlatform;
  site_type: 'ecommerce' | 'booking' | 'directory' | 'comparison';
  intelligence_score: number; // 0-100
  capabilities: SiteCapabilities;
  selectors: SelectorSet;
  navigation_map: NavigationMap;
  cart_flow?: {
    steps: string[];
    checkout_process: Record<string, any>;
    payment_methods: string[];
    shipping_options: string[];
    guest_checkout_available: boolean;
  };
  performance_metrics: SitePerformanceMetrics;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Intelligence generation results
export interface IntelligenceGenerationResult {
  intelligence: SiteIntelligence;
  summary: {
    sections_mapped: number;
    intelligence_score: number;
    platform_detected: SupportedPlatform;
    confidence: number;
    generation_time_ms: number;
  };
  errors?: string[];
  warnings?: string[];
}

// World model types
export interface WorldModelCache {
  connected: boolean;
  redis?: any;
  memoryCache?: Map<string, any>;
}

export interface WorldModelData {
  categories: Record<string, any>;
  products: Record<string, any>;
  intelligence: Record<string, SiteIntelligence>;
  relationships: Array<{
    category_id: string;
    product_id: string;
    relationship_type: string;
  }>;
}

// Category hierarchy types (for 4-level system)
export interface CategoryHierarchy {
  level: 1 | 2 | 3 | 4;
  name: string;
  path: string;
  parent?: string;
  children?: CategoryHierarchy[];
  metadata?: {
    product_count?: number;
    estimated_products?: number;
    selectors?: SelectorSet;
    subcategory_hints?: string[];
  };
}

export interface CategoryIntelligence {
  domain: Domain;
  hierarchy: CategoryHierarchy[];
  canonical_categories: Record<string, {
    canonical_id: string;
    variations: string[];
    confidence: number;
  }>;
  relationships: Array<{
    parent: string;
    child: string;
    relationship_type: 'contains' | 'related' | 'similar';
  }>;
  generated_at: Timestamp;
}