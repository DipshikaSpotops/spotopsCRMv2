/**
 * Diagnostic script to check Gmail OAuth token status
 * Helps identify why tokens are expiring daily
 * 
 * Usage: node backend/scripts/checkGmailToken.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

function checkTokenStatus() {
  console.log('🔍 Gmail OAuth Token Diagnostic\n');
  console.log('='.repeat(60));

  // Check if token.json exists
  if (!fs.existsSync(TOKEN_PATH)) {
    console.log('\n token.json NOT FOUND');
    console.log('   → Token file does not exist');
    console.log('   → Solution: Visit /api/gmail/oauth2/url to authorize\n');
    return;
  }

  console.log('\n token.json EXISTS');
  
  try {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    
    // Check for refresh token
    console.log('\n Token Analysis:');
    console.log('─'.repeat(60));
    
    const hasRefreshToken = !!tokenData.refresh_token;
    const hasAccessToken = !!tokenData.access_token;
    const hasExpiryDate = !!tokenData.expiry_date;
    
    console.log(`Refresh Token: ${hasRefreshToken ? ' PRESENT' : ' MISSING'}`);
    if (hasRefreshToken) {
      console.log(`   Preview: ${tokenData.refresh_token.substring(0, 30)}...`);
    } else {
      console.log('     CRITICAL: No refresh token means token will expire!');
      console.log('   → Solution: Reauthorize with prompt=consent');
    }
    
    console.log(`\nAccess Token: ${hasAccessToken ? ' PRESENT' : ' MISSING'}`);
    if (hasAccessToken) {
      if (tokenData.access_token === 'blocked_by_reauth_policy') {
        console.log('     BLOCKED by reauth policy');
        console.log('   → Solution: Reauthorize via /api/gmail/oauth2/url');
      } else {
        console.log(`   Preview: ${tokenData.access_token.substring(0, 30)}...`);
      }
    }
    
    console.log(`\nExpiry Date: ${hasExpiryDate ? ' PRESENT' : ' MISSING'}`);
    if (hasExpiryDate) {
      const expiryDate = new Date(tokenData.expiry_date);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      const diffMinutes = Math.round(diffMs / 60000);
      const diffHours = Math.round(diffMs / 3600000);
      
      if (diffMs < 0) {
        console.log(`     EXPIRED ${Math.abs(diffMinutes)} minutes ago`);
        console.log(`   Expired: ${expiryDate.toISOString()}`);
      } else if (diffMinutes < 60) {
        console.log(`     Expires in ${diffMinutes} minutes`);
        console.log(`   Expires: ${expiryDate.toISOString()}`);
      } else {
        console.log(`    Valid for ${diffHours} more hours`);
        console.log(`   Expires: ${expiryDate.toISOString()}`);
      }
    }
    
    // Check token type
    if (tokenData.token_type) {
      console.log(`\nToken Type: ${tokenData.token_type}`);
    }
    
    // Check for id_token (user info)
    if (tokenData.id_token) {
      console.log(`\nID Token:  PRESENT`);
      try {
        // Decode JWT to get email
        const base64Url = tokenData.id_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
        const decoded = JSON.parse(jsonPayload);
        if (decoded.email) {
          console.log(`   User Email: ${decoded.email}`);
        }
      } catch (e) {
        // Ignore decode errors
      }
    }
    
    // Diagnose issues
    console.log('\n Diagnosis:');
    console.log('─'.repeat(60));
    
    if (!hasRefreshToken) {
      console.log(' PROBLEM: No refresh token found');
      console.log('   This is why you need to reauthorize daily!');
      console.log('\n   Possible causes:');
      console.log('   1. OAuth app is in "Testing" mode (refresh tokens expire after 7 days)');
      console.log('   2. Token was obtained without prompt=consent');
      console.log('   3. User revoked access');
      console.log('\n   Solution:');
      console.log('   1. Check GCP → OAuth consent screen → Publish status');
      console.log('   2. Reauthorize via /api/gmail/oauth2/url');
      console.log('   3. Ensure app is PUBLISHED (not Testing)');
    } else if (hasExpiryDate && new Date(tokenData.expiry_date).getTime() < Date.now()) {
      console.log('  WARNING: Access token is expired');
      console.log('   But refresh token exists, so it should auto-refresh');
      console.log('   If refresh fails, check GCP OAuth settings');
    } else if (hasRefreshToken) {
      console.log(' Refresh token exists - should work automatically');
      console.log('   If still having issues, check:');
      console.log('   1. GCP OAuth consent screen is PUBLISHED');
      console.log('   2. User is added as test user (if in Testing mode)');
      console.log('   3. Redirect URIs match exactly');
    }
    
    // Check credentials.json
    const CREDS_PATH = path.join(__dirname, '..', 'credentials.json');
    if (fs.existsSync(CREDS_PATH)) {
      console.log('\n credentials.json EXISTS');
      try {
        const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
        const web = creds.web || creds.installed;
        if (web && web.client_id) {
          console.log(`   Client ID: ${web.client_id.substring(0, 30)}...`);
          if (web.redirect_uris && web.redirect_uris.length > 0) {
            console.log(`   Redirect URIs: ${web.redirect_uris.join(', ')}`);
          }
        }
      } catch (e) {
        console.log('  Could not parse credentials.json');
      }
    } else {
      console.log('\n credentials.json NOT FOUND');
      console.log('   → Download from GCP → APIs & Services → Credentials');
    }
    
  } catch (error) {
    console.error('\n ERROR reading token.json:', error.message);
    console.log('   → File may be corrupted');
    console.log('   → Solution: Delete token.json and reauthorize');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n Next Steps:');
  console.log('   1. Review GCP_OAUTH_FIX.md for detailed GCP settings');
  console.log('   2. Check GCP → OAuth consent screen → Publishing status');
  console.log('   3. Verify redirect URIs match exactly');
  console.log('   4. If in Testing mode, publish the app or add test users');
  console.log('\n');
}

checkTokenStatus();
