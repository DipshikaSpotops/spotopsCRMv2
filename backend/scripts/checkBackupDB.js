/**
 * Script to check if the backup database exists and verify its status
 * 
 * Usage: node backend/scripts/checkBackupDB.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkBackupDB() {
  try {
    console.log('Checking backup database status...\n');

    const mainUri = process.env.MONGODB_URI;
    if (!mainUri) {
      console.error('MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    // Extract database name
    const uriParts = mainUri.split('/');
    const dbName = uriParts[uriParts.length - 1].split('?')[0];
    const backupDbName = `${dbName}_backup`;

    console.log(`📊 Main database: ${dbName}`);
    console.log(`📊 Backup database: ${backupDbName}\n`);

    // Connect to MongoDB (using admin database to list all databases)
    const adminUri = mainUri.replace(`/${dbName}`, '/admin');
    await mongoose.connect(adminUri);
    console.log('Connected to MongoDB\n');

    // Get admin database to list all databases
    const adminDb = mongoose.connection.db.admin();
    const { databases } = await adminDb.listDatabases();

    // Check if backup database exists
    const backupExists = databases.some(db => db.name === backupDbName);
    const mainExists = databases.some(db => db.name === dbName);

    console.log('Database Status:');
    console.log(`   Main DB (${dbName}): ${mainExists ? ' EXISTS' : ' NOT FOUND'}`);
    console.log(`   Backup DB (${backupDbName}): ${backupExists ? ' EXISTS' : 'NOT FOUND'}\n`);

    if (backupExists) {
      // Connect to backup database to check collection
      const backupUri = mainUri.replace(`/${dbName}`, `/${backupDbName}`);
      const backupConnection = mongoose.createConnection(backupUri);
      
      await new Promise((resolve, reject) => {
        backupConnection.once('connected', resolve);
        backupConnection.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      // Check orders collection
      const collections = await backupConnection.db.listCollections().toArray();
      const ordersCollection = collections.find(col => col.name === 'orders');

      if (ordersCollection) {
        const ordersCount = await backupConnection.db.collection('orders').countDocuments();
        console.log(`Orders collection: EXISTS`);
        console.log(`Number of orders: ${ordersCount}\n`);
      } else {
        console.log(`Orders collection:  NOT FOUND\n`);
      }

      // Check main database orders count for comparison
      const mainConnection = mongoose.createConnection(mainUri);
      await new Promise((resolve, reject) => {
        mainConnection.once('connected', resolve);
        mainConnection.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const mainOrdersCount = await mainConnection.db.collection('orders').countDocuments();
      console.log(` Main DB orders count: ${mainOrdersCount}`);
      console.log(` Backup DB orders count: ${ordersCollection ? ordersCount : 0}`);
      
      if (ordersCollection && ordersCount === mainOrdersCount) {
        console.log('\n Backup database is in sync!');
      } else if (ordersCollection && ordersCount > 0) {
        console.log(`\n  Backup database exists but has ${mainOrdersCount - ordersCount} fewer orders`);
        console.log('   Run: node backend/scripts/duplicateOrdersDB.js to sync');
      } else {
        console.log('\n  Backup database exists but is empty');
        console.log('   Run: node backend/scripts/duplicateOrdersDB.js to populate');
      }

      await backupConnection.close();
      await mainConnection.close();
    } else {
      console.log('ℹBackup database does not exist yet.');
      console.log('   It will be created when you:');
      console.log('   1. Run: node backend/scripts/duplicateOrdersDB.js');
      console.log('   OR');
      console.log('   2. Start your server and make a change to an order\n');
    }

    await mongoose.connection.close();
    console.log('Connection closed.');
    process.exit(0);

  } catch (error) {
    console.error('\n Error:', error.message);
    process.exit(1);
  }
}

checkBackupDB();
