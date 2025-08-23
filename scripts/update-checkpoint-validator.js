/**
 * Update the checkpoints collection validator to include job_id field
 * Run with: node scripts/update-checkpoint-validator.js
 */

require('dotenv').config();
const mongoDBClient = require('../src/database/MongoDBClient');

async function updateCheckpointValidator() {
  try {
    console.log('Updating checkpoints collection validator...\n');
    
    await mongoDBClient.connect();
    const db = mongoDBClient.getDatabase();
    
    // New validator that includes job_id
    const newValidator = {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "checkpoint_id",
          "site_domain", 
          "job_type",
          "pipeline_step",
          "status",
          "created_at",
          "updated_at"
        ],
        properties: {
          checkpoint_id: {
            bsonType: "string",
            description: "Unique checkpoint identifier (UUID)"
          },
          job_id: {
            bsonType: "string",
            description: "Job identifier for checkpoint retrieval"
          },
          site_domain: {
            bsonType: "string",
            description: "Domain of the site being scraped"
          },
          job_type: {
            bsonType: "string",
            enum: ["product_catalog", "product_detail", "category_discovery", "search_results"],
            description: "Type of scraping job"
          },
          pipeline_step: {
            bsonType: "int",
            minimum: 1,
            maximum: 4,
            description: "Current pipeline step (1-4)"
          },
          pipeline_data: {
            bsonType: "object",
            properties: {
              urls_discovered: {
                bsonType: "array",
                items: { bsonType: "string" }
              },
              urls_processed: {
                bsonType: "array",
                items: { bsonType: "string" }
              },
              current_page: {
                bsonType: "int",
                minimum: 1
              },
              pagination_state: {
                bsonType: "object"
              },
              extraction_results: {
                bsonType: "array"
              }
            }
          },
          status: {
            bsonType: "string",
            enum: ["active", "completed", "failed", "expired"],
            description: "Checkpoint status"
          },
          metadata: {
            bsonType: "object",
            description: "Additional metadata"
          },
          error_details: {
            bsonType: "object",
            properties: {
              message: { bsonType: "string" },
              stack: { bsonType: "string" },
              timestamp: { bsonType: "date" }
            }
          },
          created_at: {
            bsonType: "date",
            description: "Creation timestamp"
          },
          updated_at: {
            bsonType: "date",
            description: "Last update timestamp"
          },
          expires_at: {
            bsonType: "date",
            description: "Expiration timestamp for TTL"
          }
        }
      }
    };
    
    // Update the collection validator
    await db.command({
      collMod: "checkpoints",
      validator: newValidator,
      validationLevel: "moderate", // Allow existing invalid documents
      validationAction: "warn" // Warn on validation failures instead of error
    });
    
    console.log('✅ Validator updated successfully!');
    console.log('Added fields: job_id, metadata');
    console.log('Validation level: moderate (allows existing documents)');
    console.log('Validation action: warn (logs warnings instead of blocking)\n');
    
    // Verify the update
    const result = await db.command({listCollections: 1, filter: {name: 'checkpoints'}});
    if (result.cursor && result.cursor.firstBatch && result.cursor.firstBatch[0]) {
      const hasJobId = result.cursor.firstBatch[0].options.validator.$jsonSchema.properties.job_id;
      if (hasJobId) {
        console.log('✅ Confirmed: job_id field is now allowed in checkpoints collection');
      }
    }
    
  } catch (error) {
    console.error('Error updating validator:', error);
  } finally {
    await mongoDBClient.disconnect();
  }
}

updateCheckpointValidator();