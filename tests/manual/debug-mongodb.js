/**
 * Debug MongoDB checkpoint collection
 */

require('dotenv').config();
const mongoDBClient = require('../../src/database/MongoDBClient');

async function debugMongoDB() {
  try {
    await mongoDBClient.connect();
    const db = mongoDBClient.getDatabase();
    const collection = db.collection('checkpoints');
    
    // Check documents
    const docs = await collection.find({}).limit(5).toArray();
    console.log(`\nFound ${docs.length} checkpoints in MongoDB:\n`);
    
    docs.forEach(doc => {
      console.log('Document:', {
        _id: doc._id,
        checkpoint_id: doc.checkpoint_id,
        job_id: doc.job_id,
        site_domain: doc.site_domain,
        status: doc.status,
        created_at: doc.created_at
      });
      console.log('Has job_id?', doc.job_id !== undefined);
      console.log('---');
    });
    
    // Check collection stats
    const stats = await collection.stats();
    console.log('\nCollection stats:', {
      count: stats.count,
      size: stats.size,
      avgObjSize: stats.avgObjSize
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoDBClient.disconnect();
  }
}

debugMongoDB();