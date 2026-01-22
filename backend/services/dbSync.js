import mongoose from 'mongoose';

/**
 * Database Synchronization Service
 * Handles syncing data to a duplicate database
 */

let backupConnection = null;
let backupOrderModel = null;
let isSyncEnabled = true;

/**
 * Initialize the backup database connection
 */
export async function initializeBackupDB() {
  try {
    const mainUri = process.env.MONGODB_URI;
    if (!mainUri) {
      console.warn('[DB Sync] MONGODB_URI not found, skipping backup DB initialization');
      return false;
    }

    // Create backup database URI by appending _backup to the database name
    const uriParts = mainUri.split('/');
    const dbName = uriParts[uriParts.length - 1].split('?')[0];
    const backupDbName = `${dbName}_backup`;
    
    // Replace the database name in the URI
    const backupUri = mainUri.replace(`/${dbName}`, `/${backupDbName}`).replace(`/${dbName}?`, `/${backupDbName}?`);

    // Create a separate connection for the backup database
    backupConnection = mongoose.createConnection(backupUri);

    backupConnection.on('connected', () => {
      console.log(`[DB Sync] ✅ Backup database connected: ${backupDbName}`);
    });

    backupConnection.on('error', (err) => {
      console.error('[DB Sync] ❌ Backup database connection error:', err);
    });

    backupConnection.on('disconnected', () => {
      console.warn('[DB Sync] ⚠️  Backup database disconnected');
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      backupConnection.once('connected', resolve);
      backupConnection.once('error', reject);
      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    // Create the Order model for backup database
    const orderSchema = new mongoose.Schema({}, { strict: false, collection: 'orders' });
    backupOrderModel = backupConnection.model('Order', orderSchema);

    return true;
  } catch (error) {
    console.error('[DB Sync] Failed to initialize backup database:', error.message);
    isSyncEnabled = false;
    return false;
  }
}

/**
 * Sync an order document to the backup database
 */
export async function syncOrderToBackup(orderDoc, operation = 'save') {
  if (!isSyncEnabled || !backupOrderModel || !backupConnection) {
    return;
  }

  // Check if backup connection is ready
  if (backupConnection.readyState !== 1) {
    console.warn('[DB Sync] Backup database not connected, skipping sync');
    return;
  }

  try {
    // Convert Mongoose document to plain object
    const orderData = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
    
    // Ensure we have an orderNo to identify the order
    if (!orderData.orderNo) {
      console.warn('[DB Sync] Order document missing orderNo, skipping sync');
      return;
    }
    
    if (operation === 'delete') {
      // Delete from backup
      await backupOrderModel.deleteOne({ orderNo: orderData.orderNo });
      console.log(`[DB Sync] ✅ Deleted order ${orderData.orderNo} from backup`);
    } else {
      // Upsert (insert or update) to backup
      // Use $set to preserve all fields, including nested objects
      await backupOrderModel.findOneAndUpdate(
        { orderNo: orderData.orderNo },
        { $set: orderData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      // Only log occasionally to avoid spam (every 100th sync)
      if (Math.random() < 0.01) {
        console.log(`[DB Sync] ✅ Synced order ${orderData.orderNo} to backup (${operation})`);
      }
    }
  } catch (error) {
    // Log error but don't throw - we don't want to break main operations
    console.error(`[DB Sync] ❌ Error syncing order ${orderDoc.orderNo || 'unknown'} to backup:`, error.message);
    // Optionally, you could implement retry logic or error queue here
  }
}

/**
 * Sync multiple orders to backup (for bulk operations)
 */
export async function syncOrdersToBackup(orders, operation = 'save') {
  if (!isSyncEnabled || !backupOrderModel || !backupConnection) {
    return;
  }

  try {
    if (operation === 'delete') {
      const orderNos = orders.map(o => o.orderNo || o);
      await backupOrderModel.deleteMany({ orderNo: { $in: orderNos } });
      console.log(`[DB Sync] ✅ Deleted ${orderNos.length} orders from backup`);
    } else {
      const operations = orders.map(order => {
        const orderData = order.toObject ? order.toObject() : order;
        return {
          updateOne: {
            filter: { orderNo: orderData.orderNo },
            update: { $set: orderData },
            upsert: true
          }
        };
      });
      
      if (operations.length > 0) {
        await backupOrderModel.bulkWrite(operations);
        console.log(`[DB Sync] ✅ Synced ${operations.length} orders to backup`);
      }
    }
  } catch (error) {
    console.error(`[DB Sync] ❌ Error bulk syncing orders to backup:`, error.message);
  }
}

/**
 * Enable or disable synchronization
 */
export function setSyncEnabled(enabled) {
  isSyncEnabled = enabled;
  console.log(`[DB Sync] Synchronization ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Get sync status
 */
export function getSyncStatus() {
  return {
    enabled: isSyncEnabled,
    connected: backupConnection?.readyState === 1,
    dbName: backupConnection?.name || null
  };
}

/**
 * Get the backup connection (for direct access if needed)
 */
export function getBackupConnection() {
  return backupConnection;
}

/**
 * Get the backup Order model (for direct access if needed)
 */
export function getBackupOrderModel() {
  return backupOrderModel;
}
