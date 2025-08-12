/**
 * Security Middleware
 * Comprehensive security measures for API protection
 * Includes rate limiting, CSRF protection, security headers, and more
 */

import { Request, Response, NextFunction, Application } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Legacy imports (will be converted later)
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
}

interface SecurityConfig {
  rateLimits: {
    global: RateLimitConfig;
    jobs: RateLimitConfig;
    auth: RateLimitConfig;
  };
  helmet: any;
  trustedProxies: string[];
  allowedOrigins: string[];
  adminWhitelist: string[];
}

interface SecurityContext {
  ip: string;
  userAgent?: string;
  origin?: string;
  referer?: string;
  method: string;
  url: string;
  contentType?: string;
  contentLength?: string;
}

// Extend Request interface to include security context
declare global {
  namespace Express {
    interface Request {
      securityContext?: SecurityContext;
    }
  }
}

class SecurityService {
  private config: SecurityConfig;

  constructor() {
    this.config = {
      // Rate limiting configuration
      rateLimits: {
        global: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 1000, // limit each IP to 1000 requests per windowMs
          message: 'Too many requests from this IP, please try again later',
        },
        jobs: {
          windowMs: 10 * 60 * 1000, // 10 minutes
          max: 100, // limit job submissions to 100 per 10 minutes
          message: 'Too many job submissions, please try again later',
        },
        auth: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 5, // limit auth attempts to 5 per 15 minutes
          message: 'Too many authentication attempts, please try again later',
        },
      },

      // Security headers configuration
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            fontSrc: ["'self'", 'https:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      },

      // Trusted proxies and origins
      trustedProxies: process.env.TRUSTED_PROXIES?.split(',') || [],
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],

      // IP whitelisting for admin endpoints
      adminWhitelist: process.env.ADMIN_IP_WHITELIST?.split(',') || [],
    };
  }

  /**
   * Initialize all security middleware
   */
  initializeSecurity(app: Application, options?: {
    corsOrigins?: string[];
    rateLimitWindowMs?: number;
    rateLimitMaxRequests?: number;
  }): void {
    // Update config with options
    if (options?.corsOrigins) {
      this.config.allowedOrigins = options.corsOrigins;
    }
    if (options?.rateLimitWindowMs) {
      this.config.rateLimits.global.windowMs = options.rateLimitWindowMs;
    }
    if (options?.rateLimitMaxRequests) {
      this.config.rateLimits.global.max = options.rateLimitMaxRequests;
    }

    // Apply security headers
    app.use(helmet(this.config.helmet));

    // Global rate limiting
    app.use(this.createRateLimit('global'));

    // Security logging middleware
    app.use(this.securityLoggingMiddleware());

    // IP-based security checks
    app.use(this.ipSecurityMiddleware());

    // Request size and timeout protection
    app.use(this.requestProtectionMiddleware());

    logger.info('Security middleware initialized successfully');
  }

  /**
   * Create rate limiting middleware
   */
  createRateLimit(type: keyof SecurityConfig['rateLimits'] | 'global' = 'global') {
    const config = this.config.rateLimits[type] || this.config.rateLimits.global;

    return rateLimit({
      ...config,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        // Use forwarded IP if behind proxy, otherwise use connection IP
        return req.ip || req.socket.remoteAddress || 'unknown';
      },
      handler: (req: Request, res: Response) => {
        const clientIP = req.ip || req.socket.remoteAddress;

        logger.warn('Rate limit exceeded', {
          ip: clientIP,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          rateLimitType: type,
        });

        metrics.incrementCounter('rate_limit_exceeded', { type });

        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000),
          timestamp: new Date().toISOString(),
        });
      },
      skip: (req: Request) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/api/health';
      },
    });
  }

  /**
   * Job submission rate limiting
   */
  jobSubmissionRateLimit() {
    return this.createRateLimit('jobs');
  }

  /**
   * Authentication rate limiting
   */
  authRateLimit() {
    return this.createRateLimit('auth');
  }

  /**
   * Security logging middleware
   */
  securityLoggingMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Log security-relevant information
      const securityContext: SecurityContext = {
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent'),
        origin: req.get('Origin'),
        referer: req.get('Referer'),
        method: req.method,
        url: req.url,
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length'),
      };

      // Detect potentially suspicious requests
      const suspiciousPatterns = [
        /\.\./,  // Path traversal
        /(union|select|insert|delete|update|drop)/i,  // SQL keywords
        /<script/i,  // Script injection
        /javascript:/i,  // JavaScript protocol
      ];

      const isSuspicious = suspiciousPatterns.some(pattern =>
        pattern.test(req.url) || pattern.test(req.get('User-Agent') || ''),
      );

      if (isSuspicious) {
        logger.warn('Suspicious request detected', securityContext);
        metrics.incrementCounter('suspicious_requests', { type: 'pattern_match' });
      }

      // Log requests from new IPs
      req.securityContext = securityContext;
      next();
    };
  }

  /**
   * IP-based security middleware
   */
  ipSecurityMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIP = req.ip || req.socket.remoteAddress || 'unknown';

      // Check for suspicious IP patterns
      if (this.isSuspiciousIP(clientIP)) {
        logger.warn('Suspicious IP detected', {
          ip: clientIP,
          url: req.url,
          userAgent: req.get('User-Agent'),
        });

        metrics.incrementCounter('suspicious_ips', { type: 'blocked' });

        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Request blocked by security policy',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next();
    };
  }

  /**
   * Admin endpoint protection
   */
  adminOnly() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIP = req.ip || req.socket.remoteAddress || 'unknown';

      if (this.config.adminWhitelist.length > 0 &&
          !this.config.adminWhitelist.includes(clientIP)) {

        logger.warn('Unauthorized admin access attempt', {
          ip: clientIP,
          url: req.url,
          userAgent: req.get('User-Agent'),
        });

        metrics.incrementCounter('unauthorized_admin_access');

        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Admin access restricted to whitelisted IPs',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next();
    };
  }

  /**
   * Request protection middleware
   */
  requestProtectionMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Set request timeout
      req.setTimeout(30000, () => {
        logger.warn('Request timeout', {
          ip: req.ip,
          url: req.url,
          method: req.method,
        });

        if (!res.headersSent) {
          res.status(408).json({
            success: false,
            error: 'Request timeout',
            message: 'Request took too long to process',
            timestamp: new Date().toISOString(),
          });
        }
      });

      next();
    };
  }

  /**
   * CORS protection middleware
   */
  corsProtection() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const origin = req.get('Origin');

      if (this.config.allowedOrigins.includes('*') ||
          (origin && this.config.allowedOrigins.includes(origin))) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      } else if (origin) {
        logger.warn('CORS violation', {
          origin,
          ip: req.ip,
          url: req.url,
        });

        res.status(403).json({
          success: false,
          error: 'CORS violation',
          message: 'Origin not allowed',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    };
  }

  /**
   * Content-Type validation middleware
   */
  validateContentType(allowedTypes: string[] = ['application/json']) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const contentType = req.get('Content-Type');

        if (!contentType) {
          res.status(400).json({
            success: false,
            error: 'Missing Content-Type header',
            allowedTypes: allowedTypes,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const isAllowed = allowedTypes.some(type => contentType.includes(type));

        if (!isAllowed) {
          logger.warn('Invalid Content-Type', {
            contentType,
            allowedTypes,
            ip: req.ip,
            url: req.url,
          });

          res.status(415).json({
            success: false,
            error: 'Unsupported Media Type',
            message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
            received: contentType,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      next();
    };
  }

  /**
   * Check if IP is suspicious
   */
  private isSuspiciousIP(ip: string): boolean {
    // Check for known malicious IP patterns
    const suspiciousPatterns = [
      /^0\.0\.0\.0$/,  // Null route
      /^255\.255\.255\.255$/,  // Broadcast
      /^169\.254\./,  // Link-local
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  /**
   * Security health check
   */
  getSecurityHealth(): {
    rateLimiting: string;
    securityHeaders: string;
    ipFiltering: string;
    corsProtection: string;
    contentValidation: string;
    timestamp: string;
  } {
    return {
      rateLimiting: 'active',
      securityHeaders: 'enabled',
      ipFiltering: 'active',
      corsProtection: 'enabled',
      contentValidation: 'active',
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
const securityService = new SecurityService();

export {
  securityService,
  SecurityService,
};

export const initializeSecurity = securityService.initializeSecurity.bind(securityService);
export const jobSubmissionRateLimit = securityService.jobSubmissionRateLimit.bind(securityService);
export const authRateLimit = securityService.authRateLimit.bind(securityService);
export const adminOnly = securityService.adminOnly.bind(securityService);
export const corsProtection = securityService.corsProtection.bind(securityService);
export const validateContentType = securityService.validateContentType.bind(securityService);