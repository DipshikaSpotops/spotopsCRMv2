# Database Synchronization

This system automatically maintains a duplicate backup database (`ordersDB_backup`) that mirrors all changes made to the main `ordersDB` database.

## Overview

- **Main Database**: Your primary `ordersDB` database (as specified in `MONGODB_URI`)
- **Backup Database**: Automatically created as `ordersDB_backup` (same connection string, different database name)
- **Synchronization**: Automatic, real-time synchronization of all order operations

## Features

✅ **Automatic Sync**: All create, update, and delete operations are automatically synced  
✅ **Real-time**: Changes are synced immediately after they occur  
✅ **Non-blocking**: Sync failures won't affect your main database operations  
✅ **Initial Copy**: Script to duplicate all existing orders to the backup database  

## How It Works

1. **On Server Start**: The backup database connection is automatically initialized
2. **On Order Save**: Mongoose hooks automatically sync the order to the backup database
3. **On Order Update**: All updates are synced to maintain consistency
4. **On Order Delete**: Deletions are also synced to the backup database

## Initial Setup

### Step 1: Duplicate Existing Orders

Run the duplication script to copy all existing orders to the backup database:

```bash
node backend/scripts/duplicateOrdersDB.js
```

This script will:
- Connect to both main and backup databases
- Copy all existing orders
- Show progress and statistics
- Verify the duplication was successful

### Step 2: Start Your Server

The server will automatically:
- Connect to the main database
- Initialize the backup database connection
- Start syncing all new changes

No additional configuration needed!

## Database Structure

The backup database has the same structure as your main database:
- Collection name: `orders`
- Schema: Identical to main database
- Indexes: Automatically created by MongoDB

## Monitoring

### Check Sync Status

The sync service logs its activity:
- `✅ Synced order [orderNo] to backup` - Successful syncs
- `❌ Error syncing order...` - Sync errors (non-fatal)
- `⚠️ Backup database not connected` - Connection issues

### Sync Status API (Future Enhancement)

You can check sync status programmatically:

```javascript
import { getSyncStatus } from './services/dbSync.js';

const status = getSyncStatus();
console.log(status);
// {
//   enabled: true,
//   connected: true,
//   dbName: 'ordersDB_backup'
// }
```

## Troubleshooting

### Backup Database Not Connecting

1. Check your `MONGODB_URI` environment variable
2. Ensure MongoDB server is running and accessible
3. Verify network connectivity
4. Check server logs for connection errors

### Sync Not Working

1. Verify backup database connection in server logs
2. Check that `initializeBackupDB()` was called successfully
3. Look for error messages in the logs
4. Ensure the Order model hooks are loaded

### Manual Sync

If you need to manually sync specific orders:

```javascript
import { syncOrderToBackup } from './services/dbSync.js';
import Order from './models/Order.js';

const order = await Order.findOne({ orderNo: 'ORDER123' });
await syncOrderToBackup(order, 'save');
```

## Disabling Sync

To temporarily disable synchronization:

```javascript
import { setSyncEnabled } from './services/dbSync.js';

setSyncEnabled(false); // Disable sync
setSyncEnabled(true);  // Re-enable sync
```

## Performance Considerations

- Sync operations are asynchronous and non-blocking
- Sync failures are logged but don't affect main operations
- The sync service uses upsert operations for efficiency
- Logging is throttled to avoid console spam

## Backup Database Access

You can access the backup database directly if needed:

```javascript
import { getBackupOrderModel } from './services/dbSync.js';

const BackupOrder = getBackupOrderModel();
const orders = await BackupOrder.find({});
```

## Important Notes

⚠️ **Backup Database is Separate**: The backup database is a completely separate database, not just a collection. This means:
- It requires its own storage space
- It can be on a different MongoDB server (by changing the connection string)
- It has its own indexes and can be optimized independently

⚠️ **Not a Replacement for Regular Backups**: This is a real-time sync, not a backup solution. You should still maintain regular database backups.

⚠️ **One-Way Sync**: Currently, sync is one-way (main → backup). Changes made directly to the backup database will not sync back to main.

## Future Enhancements

Potential improvements:
- [ ] Sync status API endpoint
- [ ] Retry queue for failed syncs
- [ ] Sync metrics and monitoring dashboard
- [ ] Configurable sync filters
- [ ] Two-way sync support
- [ ] Sync conflict resolution
