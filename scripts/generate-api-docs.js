#!/usr/bin/env node

/**
 * API Documentation Generator
 * Validates and generates API documentation from OpenAPI specification
 * Ensures compliance with SCRAPING_REQUIREMENTS.md standards
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class APIDocumentationGenerator {
  constructor() {
    this.openApiSpec = null;
    this.validationErrors = [];
    this.validationWarnings = [];
  }

  /**
   * Generate API documentation and validate compliance
   */
  async generate() {
    console.log('📚 API DOCUMENTATION GENERATOR');
    console.log('==============================');

    try {
      // Load and validate OpenAPI specification
      await this.loadOpenApiSpec();
      await this.validateSpecification();
      await this.generateDocumentation();
      
      this.generateReport();
      
      if (this.validationErrors.length === 0) {
        console.log('\n✅ API documentation generated successfully');
        return true;
      } else {
        console.log('\n❌ API documentation has validation errors');
        return false;
      }
    } catch (error) {
      console.error('Documentation generation failed:', error.message);
      return false;
    }
  }

  /**
   * Load OpenAPI specification
   */
  async loadOpenApiSpec() {
    const specPath = path.join(__dirname, '..', 'docs', 'api', 'openapi.yaml');
    
    try {
      const specContent = await fs.readFile(specPath, 'utf8');
      this.openApiSpec = yaml.load(specContent);
      console.log(`✅ Loaded OpenAPI specification from ${specPath}`);
    } catch (error) {
      throw new Error(`Failed to load OpenAPI spec: ${error.message}`);
    }
  }

  /**
   * Validate specification against SCRAPING_REQUIREMENTS.md standards
   */
  async validateSpecification() {
    console.log('\n🔍 Validating API specification compliance...');

    // Validate basic OpenAPI structure
    this.validateBasicStructure();
    
    // Validate performance requirements
    this.validatePerformanceRequirements();
    
    // Validate security requirements
    this.validateSecurityRequirements();
    
    // Validate error handling
    this.validateErrorHandling();
    
    // Validate monitoring capabilities
    this.validateMonitoringCapabilities();
    
    console.log(`Validation complete: ${this.validationErrors.length} errors, ${this.validationWarnings.length} warnings`);
  }

  /**
   * Validate basic OpenAPI structure
   */
  validateBasicStructure() {
    const spec = this.openApiSpec;
    
    // Check required fields
    if (!spec.openapi) {
      this.addError('Missing OpenAPI version specification');
    }
    
    if (!spec.info || !spec.info.title || !spec.info.version) {
      this.addError('Missing required info section (title, version)');
    }
    
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      this.addError('No API paths defined');
    }
    
    // Check for health check endpoint (SCRAPING_REQUIREMENTS.md requirement)
    if (!spec.paths['/health']) {
      this.addError('Missing required /health endpoint');
    }
    
    console.log('  ✅ Basic structure validation');
  }

  /**
   * Validate performance requirements
   */
  validatePerformanceRequirements() {
    const spec = this.openApiSpec;
    
    // Check if performance targets are documented
    const healthEndpoint = spec.paths['/health'];
    if (healthEndpoint && healthEndpoint.get && healthEndpoint.get.description) {
      if (!healthEndpoint.get.description.includes('50ms')) {
        this.addWarning('Health endpoint should document < 50ms target response time');
      }
    }
    
    // Check for response time headers
    let hasResponseTimeHeaders = false;
    Object.values(spec.paths).forEach(pathItem => {
      Object.values(pathItem).forEach(operation => {
        if (operation.responses) {
          Object.values(operation.responses).forEach(response => {
            if (response.headers && response.headers['X-Response-Time']) {
              hasResponseTimeHeaders = true;
            }
          });
        }
      });
    });
    
    if (!hasResponseTimeHeaders) {
      this.addWarning('API should include X-Response-Time headers for performance monitoring');
    }
    
    console.log('  ✅ Performance requirements validation');
  }

  /**
   * Validate security requirements
   */
  validateSecurityRequirements() {
    const spec = this.openApiSpec;
    
    // Check for authentication
    if (!spec.components || !spec.components.securitySchemes) {
      this.addError('Missing security schemes definition');
    }
    
    // Check for rate limiting documentation
    let hasRateLimitResponses = false;
    Object.values(spec.paths).forEach(pathItem => {
      Object.values(pathItem).forEach(operation => {
        if (operation.responses && operation.responses['429']) {
          hasRateLimitResponses = true;
        }
      });
    });
    
    if (!hasRateLimitResponses) {
      this.addWarning('API should document rate limiting with 429 responses');
    }
    
    // Check for input validation
    let hasValidationSchemas = false;
    if (spec.components && spec.components.schemas) {
      Object.values(spec.components.schemas).forEach(schema => {
        if (schema.required && schema.required.length > 0) {
          hasValidationSchemas = true;
        }
      });
    }
    
    if (!hasValidationSchemas) {
      this.addWarning('API should define validation schemas with required fields');
    }
    
    console.log('  ✅ Security requirements validation');
  }

  /**
   * Validate error handling
   */
  validateErrorHandling() {
    const spec = this.openApiSpec;
    
    // Check for error response schema
    if (!spec.components || !spec.components.schemas || !spec.components.schemas.ErrorResponse) {
      this.addError('Missing ErrorResponse schema definition');
    }
    
    // Check for comprehensive error responses
    let hasComprehensiveErrors = true;
    Object.values(spec.paths).forEach(pathItem => {
      Object.values(pathItem).forEach(operation => {
        if (!operation.responses) return;
        
        const responses = Object.keys(operation.responses);
        const hasClientError = responses.some(code => code.startsWith('4'));
        const hasServerError = responses.some(code => code.startsWith('5'));
        
        if (!hasClientError || !hasServerError) {
          hasComprehensiveErrors = false;
        }
      });
    });
    
    if (!hasComprehensiveErrors) {
      this.addWarning('All operations should define both client (4xx) and server (5xx) error responses');
    }
    
    console.log('  ✅ Error handling validation');
  }

  /**
   * Validate monitoring capabilities
   */
  validateMonitoringCapabilities() {
    const spec = this.openApiSpec;
    
    // Check for correlation ID support
    let hasCorrelationIds = false;
    if (spec.components && spec.components.schemas && spec.components.schemas.ErrorResponse) {
      const errorSchema = spec.components.schemas.ErrorResponse;
      if (errorSchema.properties && errorSchema.properties.request_id) {
        hasCorrelationIds = true;
      }
    }
    
    if (!hasCorrelationIds) {
      this.addWarning('API should support correlation IDs for request tracing');
    }
    
    // Check for health check details
    const healthEndpoint = spec.paths['/health'];
    if (healthEndpoint && healthEndpoint.get) {
      const healthResponse = healthEndpoint.get.responses['200'];
      if (healthResponse && healthResponse.content && 
          healthResponse.content['application/json'] && 
          healthResponse.content['application/json'].schema) {
        const healthSchema = healthResponse.content['application/json'].schema;
        if (!healthSchema.$ref || !healthSchema.$ref.includes('HealthResponse')) {
          this.addWarning('Health endpoint should use structured HealthResponse schema');
        }
      }
    }
    
    console.log('  ✅ Monitoring capabilities validation');
  }

  /**
   * Generate documentation files
   */
  async generateDocumentation() {
    console.log('\n📄 Generating documentation files...');

    // Generate README section for API
    await this.generateAPIReadme();
    
    // Generate Postman collection (simplified)
    await this.generatePostmanCollection();
    
    // Generate client SDK examples
    await this.generateClientExamples();
    
    console.log('  ✅ Documentation files generated');
  }

  /**
   * Generate API section for README
   */
  async generateAPIReadme() {
    const spec = this.openApiSpec;
    
    const readme = `# API Documentation

## Overview
${spec.info.description || 'API for AI Shopping Scraper system'}

**Version:** ${spec.info.version}

## Base URLs
${spec.servers.map(server => `- ${server.url} (${server.description})`).join('\n')}

## Authentication
This API uses JWT Bearer token authentication. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Performance Standards
- Health checks: < 50ms response time
- API queries: < 200ms response time  
- Complex queries: < 1000ms response time
- Scraping requests: < 5 minutes end-to-end

## Rate Limiting
- Standard rate limit: 1000 requests/hour per API key
- Scraping requests: 10 requests/hour per API key
- Rate limit headers included in all responses

## Key Endpoints

### System Health
\`GET /health\` - System health check with detailed component status

### Scraping Management
\`POST /api/v1/scraping/request\` - Submit new scraping request
\`GET /api/v1/scraping/status/{id}\` - Get request status
\`GET /api/v1/scraping/results/{id}\` - Get scraping results

### World Model Queries
\`GET /api/v1/world-model/products\` - Query products with filters
\`GET /api/v1/world-model/categories\` - Get category hierarchy

## Error Handling
All errors return structured JSON responses:
\`\`\`json
{
  "error": "error_code",
  "message": "Human-readable description",
  "timestamp": "2025-08-11T10:30:00.000Z",
  "request_id": "correlation-id"
}
\`\`\`

## SDK and Tools
- [Interactive API Documentation](./docs/api/swagger-ui.html)
- [OpenAPI Specification](./docs/api/openapi.yaml)
- [Postman Collection](./docs/api/postman-collection.json)

## Support
For API support and questions, please contact: ${spec.info.contact?.email || 'support@example.com'}
`;

    const readmePath = path.join(__dirname, '..', 'docs', 'API.md');
    await fs.writeFile(readmePath, readme, 'utf8');
    console.log(`    Generated: ${readmePath}`);
  }

  /**
   * Generate simplified Postman collection
   */
  async generatePostmanCollection() {
    const spec = this.openApiSpec;
    
    const collection = {
      info: {
        name: spec.info.title,
        description: spec.info.description,
        version: spec.info.version,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      auth: {
        type: "bearer",
        bearer: [
          {
            key: "token",
            value: "{{jwt_token}}",
            type: "string"
          }
        ]
      },
      variable: [
        {
          key: "base_url",
          value: "http://localhost:3000",
          type: "string"
        },
        {
          key: "jwt_token", 
          value: "your_jwt_token_here",
          type: "string"
        }
      ],
      item: [
        {
          name: "Health Check",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{base_url}}/health",
              host: ["{{base_url}}"],
              path: ["health"]
            }
          }
        },
        {
          name: "Request Scraping",
          request: {
            method: "POST",
            header: [
              {
                key: "Content-Type",
                value: "application/json"
              }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                query_intent: "best price dozen roses seattle",
                product_type: "flowers",
                location: "seattle",
                priority: "high"
              }, null, 2)
            },
            url: {
              raw: "{{base_url}}/api/v1/scraping/request",
              host: ["{{base_url}}"],
              path: ["api", "v1", "scraping", "request"]
            }
          }
        }
      ]
    };

    const collectionPath = path.join(__dirname, '..', 'docs', 'api', 'postman-collection.json');
    await fs.writeFile(collectionPath, JSON.stringify(collection, null, 2), 'utf8');
    console.log(`    Generated: ${collectionPath}`);
  }

  /**
   * Generate client SDK examples
   */
  async generateClientExamples() {
    const examples = `# Client Examples

## JavaScript/Node.js

### Setup
\`\`\`bash
npm install axios
\`\`\`

### Health Check
\`\`\`javascript
const axios = require('axios');

async function checkHealth() {
  try {
    const response = await axios.get('http://localhost:3000/health');
    console.log('System Status:', response.data.status);
    console.log('Response Time:', response.headers['x-response-time']);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}
\`\`\`

### Request Scraping
\`\`\`javascript
async function requestScraping(queryIntent, productType, location) {
  try {
    const response = await axios.post('http://localhost:3000/api/v1/scraping/request', {
      query_intent: queryIntent,
      product_type: productType,
      location: location,
      priority: 'high'
    }, {
      headers: {
        'Authorization': 'Bearer ' + process.env.JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Request ID:', response.data.request_id);
    return response.data.request_id;
  } catch (error) {
    console.error('Scraping request failed:', error.response?.data || error.message);
  }
}
\`\`\`

### Query Products
\`\`\`javascript
async function queryProducts(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await axios.get(\`http://localhost:3000/api/v1/world-model/products?\${params}\`);
    
    console.log(\`Found \${response.data.total_count} products\`);
    console.log(\`Query time: \${response.data.query_time_ms}ms\`);
    
    return response.data.products;
  } catch (error) {
    console.error('Product query failed:', error.response?.data || error.message);
  }
}
\`\`\`

## Python

### Setup
\`\`\`bash
pip install requests
\`\`\`

### Example Usage
\`\`\`python
import requests
import os

class ScraperAPI:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url
        self.jwt_token = os.getenv('JWT_TOKEN')
        
    def _headers(self):
        return {
            'Authorization': f'Bearer {self.jwt_token}',
            'Content-Type': 'application/json'
        }
    
    def health_check(self):
        response = requests.get(f"{self.base_url}/health")
        return response.json()
    
    def request_scraping(self, query_intent, product_type, location):
        data = {
            "query_intent": query_intent,
            "product_type": product_type, 
            "location": location,
            "priority": "high"
        }
        response = requests.post(
            f"{self.base_url}/api/v1/scraping/request",
            json=data,
            headers=self._headers()
        )
        return response.json()
    
    def query_products(self, **filters):
        response = requests.get(
            f"{self.base_url}/api/v1/world-model/products",
            params=filters
        )
        return response.json()

# Usage
api = ScraperAPI()
health = api.health_check()
print(f"System status: {health['status']}")
\`\`\`

## cURL Examples

### Health Check
\`\`\`bash
curl -X GET "http://localhost:3000/health" \\
  -H "Accept: application/json"
\`\`\`

### Request Scraping
\`\`\`bash
curl -X POST "http://localhost:3000/api/v1/scraping/request" \\
  -H "Authorization: Bearer $JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query_intent": "best price dozen roses seattle",
    "product_type": "flowers",
    "location": "seattle",
    "priority": "high"
  }'
\`\`\`

### Query Products
\`\`\`bash
curl -X GET "http://localhost:3000/api/v1/world-model/products?brand=brand_patagonia&availability=in_stock" \\
  -H "Accept: application/json"
\`\`\`
`;

    const examplesPath = path.join(__dirname, '..', 'docs', 'api', 'client-examples.md');
    await fs.writeFile(examplesPath, examples, 'utf8');
    console.log(`    Generated: ${examplesPath}`);
  }

  /**
   * Helper methods for validation
   */
  addError(message) {
    this.validationErrors.push(message);
    console.log(`    ❌ ${message}`);
  }

  addWarning(message) {
    this.validationWarnings.push(message);
    console.log(`    ⚠️  ${message}`);
  }

  /**
   * Generate final report
   */
  generateReport() {
    console.log('\n📊 DOCUMENTATION GENERATION REPORT');
    console.log('==================================');
    console.log(`Validation Errors: ${this.validationErrors.length}`);
    console.log(`Validation Warnings: ${this.validationWarnings.length}`);
    
    if (this.validationErrors.length > 0) {
      console.log('\n❌ ERRORS TO FIX:');
      this.validationErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    if (this.validationWarnings.length > 0) {
      console.log('\n⚠️  WARNINGS TO CONSIDER:');
      this.validationWarnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }
    
    console.log('\n📄 GENERATED FILES:');
    console.log('  - docs/api/openapi.yaml (OpenAPI specification)');
    console.log('  - docs/api/swagger-ui.html (Interactive documentation)');
    console.log('  - docs/API.md (README section)');
    console.log('  - docs/api/postman-collection.json (Postman collection)');
    console.log('  - docs/api/client-examples.md (SDK examples)');
  }
}

// Add js-yaml dependency check
async function checkDependencies() {
  try {
    require('js-yaml');
  } catch (error) {
    console.error('Missing dependency: js-yaml');
    console.log('Please install: npm install --save-dev js-yaml');
    process.exit(1);
  }
}

// Run generator if called directly
if (require.main === module) {
  checkDependencies().then(() => {
    const generator = new APIDocumentationGenerator();
    generator.generate()
      .then(success => {
        process.exit(success ? 0 : 1);
      })
      .catch(error => {
        console.error('Documentation generation failed:', error);
        process.exit(1);
      });
  });
}

module.exports = { APIDocumentationGenerator };