/**
 * NavigationTracker - Modular navigation path recorder for ML training
 * 
 * Captures the complete navigation path including:
 * - Actions taken (hover, click, scroll, wait)
 * - Selectors used (for replay capability)
 * - URLs at each step (page transitions)
 * - Element text/attributes (what was interacted with)
 * - Timing information (for human-like patterns)
 * 
 * This data is crucial for training ML models to navigate autonomously
 */

class NavigationTracker {
  constructor(logger = console) {
    this.logger = logger;
    this.navigationPath = [];
    this.startTime = Date.now();
    this.currentUrl = null;
  }

  /**
   * Initialize tracking for a new session
   */
  startTracking(initialUrl) {
    this.currentUrl = initialUrl;
    this.navigationPath = [];
    this.startTime = Date.now();
    
    this.recordAction({
      action: 'navigate',
      url: initialUrl,
      timestamp: Date.now(),
      elapsed: 0
    });
    
    this.logger.debug('Navigation tracking started', { url: initialUrl });
  }

  /**
   * Record a hover action
   */
  recordHover(selector, elementText, options = {}) {
    return this.recordAction({
      action: 'hover',
      selector,
      elementText,
      url: this.currentUrl,
      ...options
    });
  }

  /**
   * Record a click action
   */
  recordClick(selector, elementText, targetUrl = null, options = {}) {
    const record = this.recordAction({
      action: 'click',
      selector,
      elementText,
      url: this.currentUrl,
      targetUrl,
      ...options
    });
    
    // Update current URL if navigation occurred
    if (targetUrl) {
      this.currentUrl = targetUrl;
    }
    
    return record;
  }

  /**
   * Record a scroll action
   */
  recordScroll(direction, amount, options = {}) {
    return this.recordAction({
      action: 'scroll',
      direction,
      amount,
      url: this.currentUrl,
      ...options
    });
  }

  /**
   * Record waiting/delay
   */
  recordWait(duration, reason = 'page_load') {
    return this.recordAction({
      action: 'wait',
      duration,
      reason,
      url: this.currentUrl
    });
  }

  /**
   * Record extraction from current state
   */
  recordExtraction(extractionType, itemsFound, selector = null) {
    return this.recordAction({
      action: 'extract',
      extractionType,
      itemsFound,
      selector,
      url: this.currentUrl
    });
  }

  /**
   * Record a navigation action (for SubCategoryExplorer)
   */
  recordNavigation(url, details = {}) {
    const record = this.recordAction({
      action: details.action || 'navigate',
      url: url,
      from: details.from || this.currentUrl,
      path: details.path || [],
      depth: details.depth || 0,
      ...details
    });
    
    // Update current URL
    this.currentUrl = url;
    
    return record;
  }

  /**
   * Core method to record any action
   */
  recordAction(actionData) {
    const elapsed = Date.now() - this.startTime;
    
    const record = {
      step: this.navigationPath.length + 1,
      timestamp: Date.now(),
      elapsed,
      ...actionData,
      metadata: {
        ...actionData.metadata,
        recordedAt: new Date().toISOString()
      }
    };
    
    this.navigationPath.push(record);
    
    this.logger.debug(`Navigation action recorded: ${actionData.action}`, {
      step: record.step,
      selector: actionData.selector,
      elementText: actionData.elementText
    });
    
    return record;
  }

  /**
   * Get the complete navigation path
   */
  getNavigationPath() {
    return {
      totalSteps: this.navigationPath.length,
      duration: Date.now() - this.startTime,
      startUrl: this.navigationPath[0]?.url,
      finalUrl: this.currentUrl,
      path: this.navigationPath
    };
  }

  /**
   * Get a summary of the navigation
   */
  getSummary() {
    const actionCounts = {};
    const urlsVisited = new Set();
    
    this.navigationPath.forEach(step => {
      actionCounts[step.action] = (actionCounts[step.action] || 0) + 1;
      if (step.url) urlsVisited.add(step.url);
    });
    
    return {
      totalSteps: this.navigationPath.length,
      duration: Date.now() - this.startTime,
      actionCounts,
      uniqueUrlsVisited: urlsVisited.size,
      urls: Array.from(urlsVisited)
    };
  }

  /**
   * Export navigation path for ML training
   */
  exportForTraining() {
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      navigationPath: this.navigationPath.map(step => ({
        action: step.action,
        selector: step.selector,
        elementText: step.elementText,
        url: step.url,
        targetUrl: step.targetUrl,
        elapsed: step.elapsed,
        metadata: step.metadata
      }))
    };
  }

  /**
   * Create a replay script from the navigation path
   */
  generateReplayScript() {
    const script = [];
    
    this.navigationPath.forEach(step => {
      switch(step.action) {
        case 'navigate':
          script.push(`await page.goto('${step.url}');`);
          break;
        case 'hover':
          script.push(`await page.hover('${step.selector}'); // ${step.elementText}`);
          break;
        case 'click':
          script.push(`await page.click('${step.selector}'); // ${step.elementText}`);
          if (step.targetUrl) {
            script.push(`await page.waitForNavigation();`);
          }
          break;
        case 'wait':
          script.push(`await page.waitForTimeout(${step.duration}); // ${step.reason}`);
          break;
        case 'scroll':
          script.push(`await page.evaluate(() => window.scrollBy(0, ${step.amount}));`);
          break;
      }
    });
    
    return script.join('\n');
  }

  /**
   * Clear the navigation path
   */
  clear() {
    this.navigationPath = [];
    this.startTime = Date.now();
    this.currentUrl = null;
  }
}

module.exports = NavigationTracker;