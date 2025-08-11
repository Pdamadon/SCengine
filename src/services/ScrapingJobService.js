/**
 * Scraping Job Service
 * Business logic for managing scraping jobs and their lifecycle
 * Integrates with job queue and database persistence
 */

const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const { queueManager } = require('./QueueManager');
const { v4: uuidv4 } = require('uuid');

class ScrapingJobService {
  constructor(mongoClient) {
    this.mongoClient = mongoClient;
    this.db = mongoClient ? mongoClient.db('ai_shopping_scraper') : null;
    this.jobsCollection = 'scraping_jobs';
    this.resultsCollection = 'scraping_job_results';
  }

  /**
   * Submit a new scraping job
   */
  async submitJob(jobData) {
    const jobId = uuidv4();
    const submittedAt = new Date();

    const jobRecord = {
      _id: jobId,
      job_id: jobId,
      target_url: jobData.target_url,
      scraping_type: jobData.scraping_type,
      priority: jobData.priority || 'normal',
      status: 'queued',
      progress: 0,
      
      // Request details
      correlation_id: jobData.correlation_id,
      submitted_by: jobData.submitted_by || 'anonymous',
      submitted_at: submittedAt,
      client_ip: jobData.client_ip,
      user_agent: jobData.user_agent,
      
      // Configuration
      max_pages: jobData.max_pages || 100,
      respect_robots_txt: jobData.respect_robots_txt !== false,
      rate_limit_delay_ms: jobData.rate_limit_delay_ms || 1000,
      timeout_ms: jobData.timeout_ms || 30000,
      
      // Target options
      category_filters: jobData.category_filters || [],
      product_filters: jobData.product_filters || [],
      custom_selectors: jobData.custom_selectors || {},
      
      // Processing options
      extract_images: jobData.extract_images || false,
      extract_reviews: jobData.extract_reviews || false,
      extract_pricing_history: jobData.extract_pricing_history || false,
      
      // Timestamps
      created_at: submittedAt,
      updated_at: submittedAt,
      started_at: null,
      completed_at: null,
      
      // Results tracking
      results_summary: null,
      error_details: null,
      retry_count: 0,
      max_retries: 3,
      
      // Estimated metrics
      estimated_duration_ms: this.estimateJobDuration(jobData),
      estimated_completion: null,
    };

    // Set estimated completion time
    jobRecord.estimated_completion = new Date(
      submittedAt.getTime() + jobRecord.estimated_duration_ms
    );

    try {
      // Store job in database
      if (this.db) {
        await this.db.collection(this.jobsCollection).insertOne(jobRecord);
      }

      // Add to queue (will be implemented in Phase 2.2)
      const queuePosition = await this.addToQueue(jobRecord);

      logger.info('SCRAPING_JOB_CREATED', {
        job_id: jobId,
        correlation_id: jobData.correlation_id,
        target_url: jobData.target_url,
        scraping_type: jobData.scraping_type,
        priority: jobData.priority,
        queue_position: queuePosition,
        estimated_duration_ms: jobRecord.estimated_duration_ms,
      });

      metrics.incrementCounter('scraping_jobs_created', {
        type: jobData.scraping_type,
        priority: jobData.priority || 'normal',
      });

      return {
        job_id: jobId,
        estimated_completion: jobRecord.estimated_completion,
        estimated_duration_ms: jobRecord.estimated_duration_ms,
        queue_position: queuePosition,
      };

    } catch (error) {
      logger.error('SCRAPING_JOB_CREATION_FAILED', {
        correlation_id: jobData.correlation_id,
        target_url: jobData.target_url,
        error: error.message,
      });

      metrics.trackError('JobCreationError', 'scraping_job_service');
      throw new Error(`Failed to create scraping job: ${error.message}`);
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      const job = await this.db.collection(this.jobsCollection)
        .findOne({ job_id: jobId });

      if (!job) {
        return null;
      }

      // Calculate real-time progress if job is running
      if (job.status === 'running' && job.started_at) {
        const elapsedMs = Date.now() - job.started_at.getTime();
        const progressPercent = Math.min(
          Math.round((elapsedMs / job.estimated_duration_ms) * 100),
          95 // Cap at 95% until completion
        );
        job.progress = Math.max(job.progress, progressPercent);
      }

      return {
        job_id: jobId,
        status: job.status,
        progress: job.progress,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        estimated_completion: job.estimated_completion,
        results_summary: job.results_summary,
        error_details: job.error_details,
        retry_count: job.retry_count,
      };

    } catch (error) {
      logger.error('SCRAPING_JOB_STATUS_RETRIEVAL_FAILED', {
        job_id: jobId,
        error: error.message,
      });

      metrics.trackError('StatusRetrievalError', 'scraping_job_service');
      throw error;
    }
  }

  /**
   * Get job results
   */
  async getJobResults(jobId, format = 'json') {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      // Get job record first
      const job = await this.db.collection(this.jobsCollection)
        .findOne({ job_id: jobId });

      if (!job) {
        return null;
      }

      if (job.status !== 'completed') {
        throw new Error(`Job is not completed (current status: ${job.status})`);
      }

      // Get results from results collection
      const results = await this.db.collection(this.resultsCollection)
        .findOne({ job_id: jobId });

      if (!results) {
        throw new Error('Results not found');
      }

      // Format results based on requested format
      const formattedData = await this.formatResults(results.data, format);

      return {
        status: 'completed',
        data: formattedData,
        total_items: results.total_items || 0,
        categories_found: results.categories_found || 0,
        processing_time_ms: results.processing_time_ms || 0,
        data_quality_score: results.data_quality_score || 0,
      };

    } catch (error) {
      logger.error('SCRAPING_RESULTS_RETRIEVAL_FAILED', {
        job_id: jobId,
        format: format,
        error: error.message,
      });

      metrics.trackError('ResultsRetrievalError', 'scraping_job_service');
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      const job = await this.db.collection(this.jobsCollection)
        .findOne({ job_id: jobId });

      if (!job) {
        return {
          success: false,
          reason: 'not_found',
        };
      }

      // Check if job can be cancelled
      if (!['queued', 'running'].includes(job.status)) {
        return {
          success: false,
          reason: 'cannot_cancel',
          current_status: job.status,
        };
      }

      // Update job status to cancelled
      await this.db.collection(this.jobsCollection).updateOne(
        { job_id: jobId },
        {
          $set: {
            status: 'cancelled',
            completed_at: new Date(),
            updated_at: new Date(),
            error_details: 'Job cancelled by user request',
          },
        }
      );

      // Remove from queue if still queued
      if (job.status === 'queued') {
        await this.removeFromQueue(jobId);
      }

      logger.info('SCRAPING_JOB_CANCELLED', {
        job_id: jobId,
        previous_status: job.status,
        cancelled_at: new Date(),
      });

      metrics.incrementCounter('scraping_jobs_cancelled', {
        status: job.status,
      });

      return {
        success: true,
        previous_status: job.status,
      };

    } catch (error) {
      logger.error('SCRAPING_JOB_CANCELLATION_FAILED', {
        job_id: jobId,
        error: error.message,
      });

      metrics.trackError('JobCancellationError', 'scraping_job_service');
      throw error;
    }
  }

  /**
   * List jobs with filtering and pagination
   */
  async listJobs(filters = {}, pagination = { page: 1, limit: 20 }) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      // Build MongoDB query from filters
      const query = {};
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.scraping_type) {
        query.scraping_type = filters.scraping_type;
      }
      
      if (filters.submitted_after) {
        query.submitted_at = { $gte: new Date(filters.submitted_after) };
      }
      
      if (filters.submitted_before) {
        if (query.submitted_at) {
          query.submitted_at.$lte = new Date(filters.submitted_before);
        } else {
          query.submitted_at = { $lte: new Date(filters.submitted_before) };
        }
      }

      // Get total count
      const total = await this.db.collection(this.jobsCollection)
        .countDocuments(query);

      // Get paginated results
      const skip = (pagination.page - 1) * pagination.limit;
      const jobs = await this.db.collection(this.jobsCollection)
        .find(query)
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(pagination.limit)
        .project({
          job_id: 1,
          target_url: 1,
          scraping_type: 1,
          status: 1,
          progress: 1,
          priority: 1,
          submitted_at: 1,
          started_at: 1,
          completed_at: 1,
          estimated_completion: 1,
          results_summary: 1,
        })
        .toArray();

      return {
        jobs: jobs,
        total: total,
      };

    } catch (error) {
      logger.error('SCRAPING_JOBS_LIST_FAILED', {
        filters: filters,
        pagination: pagination,
        error: error.message,
      });

      metrics.trackError('JobListError', 'scraping_job_service');
      throw error;
    }
  }

  /**
   * Estimate job duration based on parameters
   */
  estimateJobDuration(jobData) {
    const baseTimeMs = 30000; // 30 seconds base
    const pageTimeMs = 2000; // 2 seconds per page
    const maxPages = jobData.max_pages || 100;

    let estimatedTime = baseTimeMs + (maxPages * pageTimeMs);

    // Adjust based on scraping type
    switch (jobData.scraping_type) {
      case 'full_site':
        estimatedTime *= 3; // Full site takes longer
        break;
      case 'category':
        estimatedTime *= 1.5; // Category scraping is medium complexity
        break;
      case 'product':
        estimatedTime *= 0.5; // Single product is faster
        break;
      case 'search':
        estimatedTime *= 1; // Search results are normal complexity
        break;
    }

    // Apply priority adjustments (high priority gets better resources)
    switch (jobData.priority) {
      case 'urgent':
        estimatedTime *= 0.7;
        break;
      case 'high':
        estimatedTime *= 0.8;
        break;
      case 'low':
        estimatedTime *= 1.3;
        break;
    }

    return Math.max(estimatedTime, 10000); // Minimum 10 seconds
  }

  /**
   * Add job to processing queue
   */
  async addToQueue(jobRecord) {
    try {
      // Ensure queue manager is initialized
      if (!queueManager.isInitialized) {
        await queueManager.initialize();
      }

      // Add job to Redis queue
      const queueResult = await queueManager.addJob(
        'scraping',
        jobRecord.scraping_type,
        jobRecord,
        {
          attempts: jobRecord.max_retries || 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      logger.info('JOB_ADDED_TO_QUEUE', {
        job_id: jobRecord.job_id,
        priority: jobRecord.priority,
        queue_position: queueResult.queuePosition,
        estimated_wait: queueResult.estimatedWaitTime,
      });

      return queueResult.queuePosition;

    } catch (error) {
      logger.error('FAILED_TO_ADD_JOB_TO_QUEUE', {
        job_id: jobRecord.job_id,
        error: error.message,
      });

      // Fallback to mock behavior if queue is unavailable
      const priorityPositions = {
        urgent: 1,
        high: 5,
        normal: 10,
        low: 20,
      };

      return priorityPositions[jobRecord.priority] || 10;
    }
  }

  /**
   * Remove job from queue
   */
  async removeFromQueue(jobId) {
    try {
      // Ensure queue manager is initialized
      if (!queueManager.isInitialized) {
        await queueManager.initialize();
      }

      // Remove job from Redis queue
      const result = await queueManager.removeJob('scraping', jobId);

      logger.info('JOB_REMOVED_FROM_QUEUE', {
        job_id: jobId,
        success: result.success,
        reason: result.reason,
      });

      return result.success;

    } catch (error) {
      logger.error('FAILED_TO_REMOVE_JOB_FROM_QUEUE', {
        job_id: jobId,
        error: error.message,
      });

      // Return true as fallback (job removal is best-effort)
      return true;
    }
  }

  /**
   * Format results according to requested format
   */
  async formatResults(data, format) {
    switch (format) {
      case 'csv':
        return this.convertToCSV(data);
      case 'xml':
        return this.convertToXML(data);
      case 'json':
      default:
        return data;
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',')
      ),
    ];

    return csvRows.join('\n');
  }

  /**
   * Convert data to XML format
   */
  convertToXML(data) {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
    const xmlRows = data.map(item => {
      const itemXml = Object.entries(item)
        .map(([key, value]) => `    <${key}>${this.escapeXml(value)}</${key}>`)
        .join('\n');
      return `  <item>\n${itemXml}\n  </item>`;
    }).join('\n');

    return `${xmlHeader}\n<results>\n${xmlRows}\n</results>`;
  }

  /**
   * Escape XML special characters
   */
  escapeXml(unsafe) {
    if (typeof unsafe !== 'string') {
      return unsafe;
    }
    
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}

module.exports = ScrapingJobService;