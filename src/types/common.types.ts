/**
 * Common types used throughout the scraping system
 */

// Logger interface - matches StructuredLogger from utils/logger.ts
export interface Logger {
  debug(message: string, meta?: any, correlationId?: string | null): void;
  info(message: string, meta?: any, correlationId?: string | null): void;
  warn(message: string, meta?: any, correlationId?: string | null): void;
  error(message: string, meta?: any, correlationId?: string | null): void;
  startTimer(name: string, correlationId?: string): void;
  endTimer(name: string, correlationId?: string, meta?: any): number | null;
  scrapingStarted(requestId: string, siteUrl: string, meta?: any): void;
  scrapingCompleted(requestId: string, siteUrl: string, results: any, meta?: any): void;
  scrapingFailed(requestId: string, siteUrl: string, error: Error, meta?: any): void;
}

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

// Utility function to ensure Error type consistency
export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

// Utility function to safely extract error message
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}