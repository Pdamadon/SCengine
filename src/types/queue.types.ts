/**
 * Redis queue system types
 */

import { JobStatus, Priority, UUID, Timestamp, ProgressUpdate, ErrorDetails } from './common.types';
import { ScrapingJobData, ScrapingResult } from './scraping.types';

// Bull.js job options
export interface QueueJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
  jobId?: string;
  repeat?: {
    cron?: string;
    every?: number;
    limit?: number;
  };
}

// Queue configuration
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest?: number;
    retryDelayOnFailover?: number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
    connectTimeout?: number;
    commandTimeout?: number;
  };
  defaultJobOptions: QueueJobOptions;
}

// Queue statistics
export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface QueueStats {
  name: string;
  counts: QueueCounts;
  isPaused: boolean;
  workers?: number;
  throughput?: {
    jobsPerMinute: number;
    avgProcessingTime: number;
  };
}

// Job status and tracking
export interface QueueJobStatus {
  jobId: UUID;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'stalled';
  progress: number | ProgressUpdate;
  data: ScrapingJobData;
  opts: QueueJobOptions;
  attemptsMade: number;
  finishedOn?: number;
  processedOn?: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: ScrapingResult;
}

// Queue events
export interface QueueJobEvent {
  jobId: UUID;
  queueName: string;
  status: JobStatus;
  timestamp: Timestamp;
  progress?: number;
  message?: string;
  details?: Record<string, any>;
  error?: string;
  duration?: number;
  result?: ScrapingResult;
}

// Queue manager interface
export interface IQueueManager {
  isInitialized: boolean;
  initialize(): Promise<boolean>;
  createQueue(queueName: string, options?: QueueJobOptions): Promise<any>;
  addJob(queueName: string, jobType: string, jobData: ScrapingJobData, options?: QueueJobOptions): Promise<{
    jobId: string;
    queuePosition: number | null;
    estimatedWaitTime: number;
  }>;
  removeJob(queueName: string, jobId: UUID): Promise<{
    success: boolean;
    reason?: string;
    previousState?: string;
  }>;
  getJobStatus(queueName: string, jobId: UUID): Promise<QueueJobStatus | null>;
  getQueueStats(queueName: string): Promise<QueueStats>;
  getAllQueueStats(): Promise<Record<string, QueueStats>>;
  pauseQueue(queueName: string): Promise<void>;
  resumeQueue(queueName: string): Promise<void>;
  cleanQueue(queueName: string, grace?: number): Promise<number>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<{
    healthy: boolean;
    redis?: string;
    queues?: Record<string, { healthy: boolean; error?: string }>;
    reason?: string;
    error?: string;
  }>;
}

// Worker types
export interface WorkerHealthStatus {
  isProcessing: boolean;
  activeJobs: number;
  maxConcurrency: number;
  jobDetails: Array<{
    jobId: UUID;
    duration: number;
    status: string;
  }>;
}

export interface WorkerConfig {
  concurrency?: number;
  mongoClient?: any;
  queueNames?: string[];
}