/**
 * API request/response types
 */

import { UUID, URL, Timestamp, Priority, PaginationParams, PaginatedResponse, ApiResponse } from './common.types';
import { ScrapingType, ScrapingConfig, Product, Category } from './scraping.types';
import { QueueStats, QueueJobStatus } from './queue.types';
import { SiteIntelligence } from './intelligence.types';

// Request body types
export interface CreateScrapingJobRequest {
  target_url: URL;
  scraping_type: ScrapingType;
  priority?: Priority;
  max_pages?: number;
  timeout_ms?: number;
  extract_images?: boolean;
  extract_reviews?: boolean;
  respect_robots_txt?: boolean;
  rate_limit_delay_ms?: number;
  category_filters?: string[];
  custom_selectors?: Record<string, string>;
}

export interface UpdateScrapingJobRequest {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority?: Priority;
  max_pages?: number;
  timeout_ms?: number;
}

export interface CategorySearchRequest {
  base_url: URL;
  max_categories_per_type?: number;
  max_products_per_category?: number;
  queue_priority?: Priority;
  enable_intelligence_refresh?: boolean;
}

export interface ProductSearchRequest extends PaginationParams {
  domain?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  in_stock?: boolean;
  search_query?: string;
  sort_by?: 'price' | 'name' | 'date' | 'popularity';
  sort_order?: 'asc' | 'desc';
}

export interface CategorySearchFilters extends PaginationParams {
  domain?: string;
  parent_category?: string;
  has_products?: boolean;
  last_scraped_after?: Timestamp;
}

// Response types
export interface ScrapingJobResponse {
  job_id: UUID;
  target_url: URL;
  scraping_type: ScrapingType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: Priority;
  created_at: Timestamp;
  started_at?: Timestamp;
  completed_at?: Timestamp;
  estimated_completion?: Timestamp;
  queue_position?: number;
  worker_id?: string;
  results_summary?: {
    total_items: number;
    categories_found: number;
    data_quality_score: number;
  };
  error_details?: string;
}

export interface ScrapingJobListResponse extends PaginatedResponse<ScrapingJobResponse> {
  filters_applied: {
    status?: string;
    scraping_type?: string;
    created_after?: Timestamp;
    created_before?: Timestamp;
  };
}

export interface ProductListResponse extends PaginatedResponse<Product> {
  filters_applied: ProductSearchRequest;
  aggregations?: {
    price_range: { min: number; max: number };
    categories: Array<{ category: string; count: number }>;
    brands: Array<{ brand: string; count: number }>;
    availability: { in_stock: number; out_of_stock: number };
  };
}

export interface CategoryListResponse extends PaginatedResponse<Category> {
  filters_applied: CategorySearchFilters;
  hierarchy?: {
    root_categories: Category[];
    total_depth: number;
  };
}

export interface QueueStatsResponse {
  queues: Record<string, QueueStats>;
  overall: {
    total_jobs: number;
    jobs_per_minute: number;
    avg_processing_time: number;
    success_rate: number;
  };
  workers: {
    active_workers: number;
    total_capacity: number;
    utilization_percent: number;
  };
  timestamp: Timestamp;
}

export interface SiteIntelligenceResponse {
  domain: string;
  intelligence: SiteIntelligence;
  analysis: {
    platform_confidence: number;
    selector_coverage: number;
    navigation_completeness: number;
    estimated_products: number;
    scraping_difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  };
  recommendations: string[];
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: { status: 'up' | 'down'; response_time_ms?: number };
    redis: { status: 'up' | 'down'; response_time_ms?: number };
    queue: { status: 'up' | 'down'; queue_depth?: number };
    workers: { status: 'up' | 'down'; active_workers?: number };
  };
  system: {
    uptime_seconds: number;
    memory_usage_percent: number;
    cpu_usage_percent: number;
  };
  timestamp: Timestamp;
}

// WebSocket event types
export interface WebSocketJobEvent {
  event_type: 'job_started' | 'job_progress' | 'job_completed' | 'job_failed';
  job_id: UUID;
  queue_name: string;
  timestamp: Timestamp;
  data: {
    status?: string;
    progress?: number;
    message?: string;
    error?: string;
    result?: any;
    duration?: number;
  };
}

export interface WebSocketQueueEvent {
  event_type: 'queue_stats_update' | 'worker_status_change';
  queue_name?: string;
  timestamp: Timestamp;
  data: {
    stats?: QueueStats;
    worker_count?: number;
    throughput?: number;
  };
}

// Error response types
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: Timestamp;
  };
  request_id?: string;
}

// Validation error types
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}

export interface ValidationErrorResponse extends ApiErrorResponse {
  error: {
    code: 'VALIDATION_ERROR';
    message: 'Request validation failed';
    validation_errors: ValidationError[];
    timestamp: Timestamp;
  };
}

// Rate limiting types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Timestamp;
  retry_after?: number;
}

export interface RateLimitResponse extends ApiErrorResponse {
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: 'Too many requests';
    rate_limit: RateLimitInfo;
    timestamp: Timestamp;
  };
}

// Batch operation types
export interface BatchJobRequest {
  jobs: CreateScrapingJobRequest[];
  batch_priority?: Priority;
  batch_config?: {
    max_concurrent: number;
    delay_between_jobs: number;
    stop_on_error: boolean;
  };
}

export interface BatchJobResponse {
  batch_id: UUID;
  total_jobs: number;
  jobs_created: number;
  jobs_failed: number;
  job_ids: UUID[];
  errors?: Array<{
    job_index: number;
    error: string;
  }>;
  created_at: Timestamp;
}