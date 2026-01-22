/**
 * Script to duplicate all existing orders from main database to backup database
 * 
 * Usage: node backend/scripts/duplicateOrdersDB.js
 * 
 * This script:
 * 1. Connects to both main and backup databases
 * 2. Copies all orders from main to backup
 * 3. Reports progress and statistics
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { initializeBackupDB, getBackupOrderModel, syncOrdersToBackup } from '../services/dbSync.js';
import Order from '../models/Order.js';

dotenv.config();

async function duplicateOrders() {
  try {
    console.log('🔄 Starting database duplication process...\n');

    // Connect to main database
    console.log('📡 Connecting to main database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to main database\n');

    // Initialize backup database
    console.log('📡 Connecting to backup database...');
    const backupInitialized = await initializeBackupDB();
    if (!backupInitialized) {
      console.error('❌ Failed to initialize backup database');
      process.exit(1);
    }
    console.log('✅ Connected to backup database\n');

    // Get backup model
    const BackupOrder = getBackupOrderModel();
    if (!BackupOrder) {
      console.error('❌ Backup Order model not available');
      process.exit(1);
    }

    // Count total orders in main database
    const totalOrders = await Order.countDocuments();
    console.log(`📊 Found ${totalOrders} orders in main database\n`);

    if (totalOrders === 0) {
      console.log('ℹ️  No orders to duplicate. Exiting.');
      process.exit(0);
    }

    // Check if backup already has data
    const backupCount = await BackupOrder.countDocuments();
    if (backupCount > 0) {
      console.log(`⚠️  Warning: Backup database already contains ${backupCount} orders`);
      console.log('   This script will update existing orders and add new ones.\n');
    }

    // Process orders in batches
    const batchSize = 100;
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const startTime = Date.now();

    console.log(`🚀 Starting duplication (batch size: ${batchSize})...\n`);

    // Use cursor for memory-efficient processing
    const cursor = Order.find({}).cursor();
    
    let batch = [];
    for await (const order of cursor) {
      batch.push(order);
      
      if (batch.length >= batchSize) {
        try {
          await syncOrdersToBackup(batch, 'save');
          processed += batch.length;
          process.stdout.write(`\r📦 Processed: ${processed}/${totalOrders} orders`);
          batch = [];
        } catch (error) {
          console.error(`\n❌ Error processing batch:`, error.message);
          errors += batch.length;
          batch = [];
        }
      }
    }

    // Process remaining orders
    if (batch.length > 0) {
      try {
        await syncOrdersToBackup(batch, 'save');
        processed += batch.length;
      } catch (error) {
        console.error(`\n❌ Error processing final batch:`, error.message);
        errors += batch.length;
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n\n✅ Duplication completed!\n');
    console.log('📊 Statistics:');
    console.log(`   Total orders in main DB: ${totalOrders}`);
    console.log(`   Successfully processed: ${processed}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log(`   Average: ${(processed / duration).toFixed(2)} orders/second\n`);

    // Verify backup
    const finalBackupCount = await BackupOrder.countDocuments();
    console.log(`✅ Verification: Backup database now contains ${finalBackupCount} orders\n`);

    if (finalBackupCount === totalOrders) {
      console.log('🎉 Success! All orders have been duplicated.\n');
    } else {
      console.log(`⚠️  Warning: Count mismatch. Main: ${totalOrders}, Backup: ${finalBackupCount}\n`);
    }

    // Close connections
    await mongoose.connection.close();
    const { getBackupConnection } = await import('../services/dbSync.js');
    const backupConnection = getBackupConnection();
    if (backupConnection) {
      await backupConnection.close();
    }

    console.log('👋 Connections closed. Exiting.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
duplicateOrders();
