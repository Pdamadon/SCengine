/**
 * ProgressReporter - Consolidated progress tracking and reporting
 * 
 * Manages:
 * - Progress callbacks for active jobs
 * - WebSocket progress updates
 * - SSE (Server-Sent Events) updates
 * - Progress history and metrics
 * 
 * This provides unified progress reporting across all phases
 */

class ProgressReporter {
  constructor(logger) {
    this.logger = logger;
    
    // Progress tracking
    this.activeCallbacks = new Map(); // jobId -> callback function
    this.progressHistory = new Map(); // jobId -> progress events
    this.websocketClients = new Set();
    this.sseClients = new Set();
    
    // Metrics
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      averageDuration: 0
    };
  }

  /**
   * Initialize progress reporter
   */
  async initialize() {
    // WebSocket and SSE services would be initialized here if needed
    this.logger.info('ProgressReporter initialized');
  }

  /**
   * Attach a progress callback for a job
   */
  attachCallback(jobId, callback) {
    if (typeof callback !== 'function') {
      this.logger.warn('Invalid progress callback provided', { jobId });
      return;
    }
    
    this.activeCallbacks.set(jobId, callback);
    this.progressHistory.set(jobId, []);
    
    this.logger.debug('Progress callback attached', { jobId });
  }

  /**
   * Detach progress callback for a job
   */
  detachCallback(jobId) {
    this.activeCallbacks.delete(jobId);
    
    // Keep history for a while
    setTimeout(() => {
      this.progressHistory.delete(jobId);
    }, 60000); // Clear after 1 minute
    
    this.logger.debug('Progress callback detached', { jobId });
  }

  /**
   * Report progress for a job
   */
  reportProgress(jobId, percentage, message, metadata = {}) {
    const progressEvent = {
      jobId,
      percentage: Math.min(100, Math.max(0, percentage)),
      message,
      metadata,
      timestamp: new Date().toISOString()
    };
    
    // Store in history
    if (this.progressHistory.has(jobId)) {
      this.progressHistory.get(jobId).push(progressEvent);
    }
    
    // Call attached callback
    const callback = this.activeCallbacks.get(jobId);
    if (callback) {
      try {
        callback(progressEvent.percentage, progressEvent.message, progressEvent.metadata);
      } catch (error) {
        this.logger.error('Progress callback error', {
          jobId,
          error: error.message
        });
      }
    }
    
    // Broadcast to WebSocket clients
    this.broadcastToWebSocket(progressEvent);
    
    // Broadcast to SSE clients
    this.broadcastToSSE(progressEvent);
    
    // Log significant milestones
    if (percentage === 0 || percentage === 100 || percentage % 25 === 0) {
      this.logger.debug('Progress milestone', {
        jobId,
        percentage,
        message
      });
    }
  }

  /**
   * Report phase completion
   */
  reportPhaseComplete(jobId, phase, results) {
    const message = `${phase} phase completed`;
    const metadata = {
      phase,
      results: {
        success: results.success || false,
        itemsProcessed: results.itemsProcessed || 0,
        duration: results.duration || 0
      }
    };
    
    // Calculate percentage based on phase
    const phasePercentages = {
      discovery: 30,
      learning: 70,
      extraction: 95,
      complete: 100
    };
    
    const percentage = phasePercentages[phase] || 50;
    
    this.reportProgress(jobId, percentage, message, metadata);
  }

  /**
   * Report job start
   */
  reportJobStart(jobId, url, options = {}) {
    this.metrics.totalJobs++;
    
    this.reportProgress(jobId, 0, 'Job started', {
      url,
      options,
      startTime: new Date().toISOString()
    });
  }

  /**
   * Report job completion
   */
  reportJobComplete(jobId, success, results) {
    if (success) {
      this.metrics.completedJobs++;
    } else {
      this.metrics.failedJobs++;
    }
    
    const message = success ? 'Job completed successfully' : 'Job failed';
    
    this.reportProgress(jobId, 100, message, {
      success,
      results: {
        productsFound: results.productsFound || 0,
        quality: results.quality || 0,
        duration: results.duration || 0
      },
      endTime: new Date().toISOString()
    });
    
    // Update average duration
    if (results.duration) {
      this.updateAverageDuration(results.duration);
    }
  }

  /**
   * Report error
   */
  reportError(jobId, error, phase = 'unknown') {
    this.reportProgress(jobId, -1, `Error in ${phase} phase`, {
      error: error.message || error,
      phase,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get progress history for a job
   */
  getProgressHistory(jobId) {
    return this.progressHistory.get(jobId) || [];
  }

  /**
   * Get current progress for a job
   */
  getCurrentProgress(jobId) {
    const history = this.getProgressHistory(jobId);
    if (history.length === 0) {
      return null;
    }
    
    return history[history.length - 1];
  }

  /**
   * Broadcast to WebSocket clients
   */
  broadcastToWebSocket(progressEvent) {
    // This would integrate with WebSocketService
    // For now, just log
    if (this.websocketClients.size > 0) {
      this.logger.debug('Broadcasting to WebSocket clients', {
        clients: this.websocketClients.size,
        jobId: progressEvent.jobId,
        percentage: progressEvent.percentage
      });
    }
  }

  /**
   * Broadcast to SSE clients
   */
  broadcastToSSE(progressEvent) {
    // This would integrate with ServerSentEventsService
    // For now, just log
    if (this.sseClients.size > 0) {
      this.logger.debug('Broadcasting to SSE clients', {
        clients: this.sseClients.size,
        jobId: progressEvent.jobId,
        percentage: progressEvent.percentage
      });
    }
  }

  /**
   * Register WebSocket client
   */
  registerWebSocketClient(clientId, socket) {
    this.websocketClients.add({ clientId, socket });
    this.logger.debug('WebSocket client registered', { clientId });
  }

  /**
   * Unregister WebSocket client
   */
  unregisterWebSocketClient(clientId) {
    this.websocketClients.forEach(client => {
      if (client.clientId === clientId) {
        this.websocketClients.delete(client);
      }
    });
    this.logger.debug('WebSocket client unregistered', { clientId });
  }

  /**
   * Register SSE client
   */
  registerSSEClient(clientId, response) {
    this.sseClients.add({ clientId, response });
    this.logger.debug('SSE client registered', { clientId });
  }

  /**
   * Unregister SSE client
   */
  unregisterSSEClient(clientId) {
    this.sseClients.forEach(client => {
      if (client.clientId === clientId) {
        this.sseClients.delete(client);
      }
    });
    this.logger.debug('SSE client unregistered', { clientId });
  }

  /**
   * Update average duration metric
   */
  updateAverageDuration(duration) {
    const totalCompleted = this.metrics.completedJobs + this.metrics.failedJobs;
    if (totalCompleted === 0) {
      this.metrics.averageDuration = duration;
    } else {
      this.metrics.averageDuration = 
        (this.metrics.averageDuration * (totalCompleted - 1) + duration) / totalCompleted;
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeJobs: this.activeCallbacks.size,
      successRate: this.metrics.totalJobs > 0 
        ? (this.metrics.completedJobs / this.metrics.totalJobs * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Create progress callback wrapper
   */
  createProgressCallback(jobId) {
    return (percentage, message, metadata) => {
      this.reportProgress(jobId, percentage, message, metadata);
    };
  }

  /**
   * Clear old history
   */
  clearOldHistory() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [jobId, history] of this.progressHistory.entries()) {
      if (history.length === 0) {
        this.progressHistory.delete(jobId);
        continue;
      }
      
      const lastEvent = history[history.length - 1];
      const eventTime = new Date(lastEvent.timestamp).getTime();
      
      if (eventTime < oneHourAgo && !this.activeCallbacks.has(jobId)) {
        this.progressHistory.delete(jobId);
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Clear all callbacks
    this.activeCallbacks.clear();
    
    // Clear history
    this.progressHistory.clear();
    
    // Clear client connections
    this.websocketClients.clear();
    this.sseClients.clear();
    
    this.logger.info('ProgressReporter cleaned up');
  }
}

module.exports = ProgressReporter;