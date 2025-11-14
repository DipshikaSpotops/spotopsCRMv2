# Chrome Performance Troubleshooting Guide

If your application loads slowly in Chrome on Mac but works fast in Safari, try these solutions:

## Quick Fixes (Try These First)

### 1. **Close Chrome DevTools**
- DevTools significantly slows down page performance
- Press `Cmd+Option+I` to close, or `Cmd+Shift+C` to toggle
- **This is the #1 cause of Chrome slowness**

### 2. **Disable Chrome Extensions**
- Extensions (especially ad blockers, password managers, React DevTools) can slow down pages
- Test in **Incognito Mode** (`Cmd+Shift+N`) - extensions are disabled by default
- If faster in incognito, disable extensions one by one to find the culprit

### 3. **Clear Chrome Cache**
- Go to `Chrome > Settings > Privacy and Security > Clear browsing data`
- Select "Cached images and files" and "Cookies and other site data"
- Choose "All time" and click "Clear data"

### 4. **Disable Hardware Acceleration (if causing issues)**
- Go to `chrome://settings/system`
- Toggle "Use hardware acceleration when available" OFF
- Restart Chrome

## Browser-Specific Differences

### Chrome vs Safari Performance
- **Chrome's V8 engine** is optimized differently than Safari's JavaScriptCore
- Chrome may be more aggressive with memory management
- Safari may have better native Mac optimizations

## Code Optimizations Applied

The following optimizations have been made across ALL pages to improve performance:

### 1. **OrdersTable Component (Used by Most Pages)**
   - **Cached Date Formatting** - `formatDateSafe` now uses a Map-based cache (1000 entries) to avoid recreating Date objects
   - **Optimized Search Filtering** - Early returns and optimized matching logic for faster search
   - **Improved rowsWithDerived** - Added early return for empty arrays
   - **Better Memory Management** - Cache size limits prevent memory leaks

### 2. **AllOrders.jsx**
   - **Cached Date Formatting** - `formatDate` uses a ref-based cache (500 entries)
   - **Memoized Yard Rendering** - `renderYardCell` extracted and memoized with `useCallback`
   - **Reduced Function Recreations** - All helper functions properly memoized

### 3. **Purchases.jsx**
   - **Uses Shared formatDateSafe** - Now uses the optimized `formatDateSafe` from OrdersTable instead of creating new Date objects

### 4. **General Optimizations**
   - **Reduced Date Object Creation** - Date formatting is cached across renders
   - **Optimized Filtering** - Search operations use early returns and optimized matching
   - **Better useMemo Usage** - Computed values are properly memoized to prevent recalculation

These optimizations should significantly improve performance in Chrome, especially when:
- Rendering large tables (25+ rows)
- Searching/filtering data
- Sorting columns
- Expanding/collapsing rows

## Additional Performance Checks

### Check Network Tab
1. Open DevTools (`Cmd+Option+I`)
2. Go to **Network** tab
3. Reload the page
4. Look for:
   - Slow API requests (red/yellow indicators)
   - Large response sizes
   - Multiple duplicate requests

### Check Performance Tab
1. Open DevTools
2. Go to **Performance** tab
3. Click record, reload page, stop recording
4. Look for:
   - Long tasks (red bars)
   - JavaScript execution time
   - Layout/paint operations

### Check Console for Errors
- Open DevTools Console
- Look for JavaScript errors that might be slowing things down
- Check for memory warnings

## Chrome-Specific Settings to Try

### 1. Disable Site Isolation (Advanced)
- Go to `chrome://flags`
- Search for "Site Isolation"
- Set to "Disabled"
- Restart Chrome
- **Note:** This reduces security, use with caution

### 2. Enable Experimental Features
- Go to `chrome://flags`
- Try enabling:
  - "Experimental JavaScript" (if available)
  - "Throttle JavaScript timers in background"

### 3. Reset Chrome Settings
- If nothing works, reset Chrome to defaults:
  - `Chrome > Settings > Reset and clean up > Restore settings to their original defaults`

## If Still Slow After All Fixes

1. **Check if it's a specific page** - Test other pages to isolate the issue
2. **Compare network requests** - Use Network tab to see if Chrome is making different requests than Safari
3. **Check for memory leaks** - Use Chrome Task Manager (`Shift+Esc`) to see memory usage
4. **Test in different Chrome profile** - Create a new user profile to rule out profile-specific issues

## Performance Monitoring

Consider adding performance monitoring:
- Use `performance.now()` to measure render times
- Add React Profiler to identify slow components
- Monitor API response times

## Contact Support

If the issue persists after trying these solutions, provide:
- Chrome version (`chrome://version`)
- Mac OS version
- Network tab screenshot
- Performance tab recording
- Console errors (if any)

