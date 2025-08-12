/**
 * Common types used throughout the scraping system
 */

// Basic utility types
export type Timestamp = Date;
export type UUID = string;
export type URL = string;
export type Domain = string;
export type Selector = string;

// Priority levels for queue system
export type Priority = 'urgent' | 'high' | 'normal' | 'low';

// Status types
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ScrapeStatus = 'queued' | 'processing' | 'completed' | 'error' | 'timeout';


// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Progress tracking
export interface ProgressUpdate {
  progress: number; // 0-100
  message?: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
}

// Error types
export interface ErrorDetails {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
  stack?: string;
}

// Configuration types
export interface ConfigurationOptions {
  [key: string]: string | number | boolean | object | undefined;
}

// Health check types
export interface HealthStatus {
  healthy: boolean;
  services?: Record<string, ServiceHealth>;
  timestamp: Timestamp;
  uptime?: number;
}

export interface ServiceHealth {
  healthy: boolean;
  responseTime?: number;
  error?: string;
  lastCheck: Timestamp;
}