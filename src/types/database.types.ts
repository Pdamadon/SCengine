/**
 * Database schema types
 * Based on MongoDB schema definitions
 */

import { Domain, URL, UUID, Timestamp, Selector } from './common.types';
import { Product, Category, ProductPricing, ProductVariant, ProductAvailability } from './scraping.types';
import { SiteIntelligence, NavigationMap, SiteCapabilities, SelectorSet } from './intelligence.types';

// MongoDB document base
export interface MongoDocument {
  _id?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Domains collection
export interface DomainDocument extends MongoDocument {
  domain: Domain;
  platform: 'shopify' | 'woocommerce' | 'magento' | 'custom' | 'booking' | 'directory';
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
  performance_metrics: {
    average_load_time: number;
    success_rate: number;
    last_successful_scrape?: Timestamp;
    total_scrapes: number;
    error_count: number;
  };
}

// Categories collection
export interface CategoryDocument extends MongoDocument {
  domain: Domain;
  category_path: string; // e.g., "/collections/boots"
  category_name?: string; // e.g., "Boots"
  parent_category?: string;
  subcategories?: string[];
  product_count?: number;
  url_pattern?: string;
  selectors?: {
    category_link?: Selector;
    product_grid?: Selector;
    pagination?: Selector;
    sort_options?: Selector;
    filters?: Record<string, Selector>;
  };
  filters_available?: Array<{
    name: string;
    type: 'price' | 'size' | 'color' | 'brand' | 'rating';
    options: string[];
    selector: Selector;
  }>;
  last_scraped?: Timestamp;
}

// Products collection  
export interface ProductDocument extends MongoDocument {
  domain: Domain;
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
  reviews?: {
    average_rating?: number;
    review_count?: number;
    reviews_selector?: Selector;
  };
  selectors?: {
    add_to_cart?: Selector;
    variant_selector?: Selector;
    quantity_input?: Selector;
    buy_now?: Selector;
  };
  last_scraped?: Timestamp;
  scrape_frequency?: 'hourly' | 'daily' | 'weekly';
}

// Price history collection
export interface PriceHistoryDocument extends MongoDocument {
  product_id: string;
  domain: Domain;
  price: number;
  original_price?: number;
  currency: string;
  discount_percentage?: number;
  sale_reason?: string;
  availability?: string;
  timestamp: Timestamp;
}

// Service providers collection (for booking sites)
export interface ServiceProviderDocument extends MongoDocument {
  domain: Domain;
  provider_name?: string;
  service_type: 'massage' | 'dental' | 'medical' | 'beauty' | 'fitness' | 'repair' | 'cleaning';
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  services?: Array<{
    service_name: string;
    duration_minutes: number;
    price: number;
    currency: string;
    description?: string;
  }>;
  booking_system?: {
    platform?: string;
    online_booking_available: boolean;
    phone_booking_required: boolean;
    advance_booking_days?: number;
  };
  availability_patterns?: {
    business_hours?: Record<string, any>;
    blocked_days?: string[];
    typical_availability?: string;
  };
  selectors?: {
    service_selector?: Selector;
    calendar?: Selector;
    time_slots?: Selector;
    booking_form?: Selector;
    confirmation_button?: Selector;
  };
  rating?: number;
  review_count?: number;
  last_scraped?: Timestamp;
}

// Available appointments collection
export interface AppointmentDocument extends MongoDocument {
  provider_id: string;
  domain: Domain;
  service_type: string;
  service_name?: string;
  appointment_time: Timestamp;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  available: boolean;
  booking_url?: URL;
  requirements?: string;
  scraped_at: Timestamp;
  expires_at: Timestamp;
}

// Navigation maps collection
export interface NavigationMapDocument extends MongoDocument {
  domain: Domain;
  navigation_type: 'main_menu' | 'footer' | 'breadcrumbs' | 'sidebar' | 'dropdown';
  structure: {
    sections: Array<{
      name: string;
      url: URL;
      selector?: Selector;
      subsections?: any[];
    }>;
  };
  clickable_elements?: Array<{
    text: string;
    selector: Selector;
    url: URL;
    element_type: string;
  }>;
  reliability_score?: number;
  last_verified?: Timestamp;
}

// Selector libraries collection
export interface SelectorLibraryDocument extends MongoDocument {
  domain: Domain;
  selector: Selector;
  element_type: 'product' | 'price' | 'cart' | 'navigation' | 'search' | 'filter' | 'booking';
  purpose?: string;
  reliability_score: number; // 0-1
  usage_count: number;
  success_count: number;
  last_successful_use?: Timestamp;
  last_failed_use?: Timestamp;
  alternative_selectors?: Selector[];
}

// Scraping jobs collection
export interface ScrapingJobDocument extends MongoDocument {
  job_id: UUID;
  target_url: URL;
  scraping_type: 'product' | 'category_search' | 'full_site' | 'search';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  priority: 'urgent' | 'high' | 'normal' | 'low';
  
  // Configuration
  max_pages?: number;
  timeout_ms?: number;
  extract_images?: boolean;
  extract_reviews?: boolean;
  respect_robots_txt?: boolean;
  rate_limit_delay_ms?: number;
  
  // Execution tracking
  started_at?: Timestamp;
  completed_at?: Timestamp;
  worker_id?: string;
  error_details?: string;
  results_summary?: {
    total_items: number;
    categories_found: number;
    data_quality_score: number;
  };
}

// Scraping job results collection
export interface ScrapingJobResultDocument extends MongoDocument {
  job_id: UUID;
  data: any[]; // Scraped products/categories
  total_items: number;
  categories_found: number;
  categories: string[];
  data_quality_score: number;
  processing_time_ms: number;
}

// Database connection types
export interface DatabaseConfig {
  mongodb: {
    uri: string;
    database: string;
    options: {
      maxPoolSize?: number;
      serverSelectionTimeoutMS?: number;
      socketTimeoutMS?: number;
    };
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

// Collection names
export type CollectionName = 
  | 'domains'
  | 'categories' 
  | 'products'
  | 'price_history'
  | 'service_providers'
  | 'available_appointments'
  | 'navigation_maps'
  | 'selector_libraries'
  | 'scraping_jobs'
  | 'scraping_job_results';