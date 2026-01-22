/**
 * Test script to actually try refreshing the token and see what error we get
 * This will help diagnose why tokens are failing even though app is published
 * 
 * Usage: node backend/scripts/testTokenRefresh.js
 */

import { refreshAccessTokenIfNeeded, getGmailClient } from '../services/googleAuth.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTokenRefresh() {
  console.log(' Testing Gmail Token Refresh\n');
  console.log('='.repeat(60));

  try {
    console.log('\n1️ Testing refreshAccessTokenIfNeeded()...\n');
    const refreshedTokens = await refreshAccessTokenIfNeeded();
    console.log(' Token refresh successful!');
    console.log(`   New expiry: ${refreshedTokens.expiry_date ? new Date(refreshedTokens.expiry_date).toISOString() : 'unknown'}`);
    console.log(`   Has refresh_token: ${refreshedTokens.refresh_token ? 'YES' : 'NO'}`);
  } catch (error) {
    console.error('\n Token refresh FAILED!');
    console.error(`   Error: ${error.message}`);
    
    // Check for specific error types
    if (error.message?.includes('invalid_grant')) {
      console.error('\n DIAGNOSIS: invalid_grant error');
      console.error('   This means the refresh token is invalid or expired.');
      console.error('\n   Possible causes:');
      console.error('   1. Refresh token was revoked by user');
      console.error('   2. OAuth client credentials changed (new credentials.json)');
      console.error('   3. Redirect URI mismatch between auth and refresh');
      console.error('   4. Token was issued for a different OAuth client');
      console.error('\n   Solution:');
      console.error('   → Delete token.json');
      console.error('   → Reauthorize via /api/gmail/oauth2/url');
      console.error('   → Verify redirect URIs match exactly in GCP');
    } else if (error.message?.includes('rapt_required')) {
      console.error('\n DIAGNOSIS: RAPT (Risk-Aware Protection Token) required');
      console.error('   Google requires additional security verification.');
      console.error('\n   Solution:');
      console.error('   → Reauthorize via /api/gmail/oauth2/url');
      console.error('   → May need to verify app in GCP');
    } else if (error.message?.includes('Missing token.json')) {
      console.error('\n DIAGNOSIS: token.json not found');
      console.error('   Solution: Authorize via /api/gmail/oauth2/url');
    } else if (error.message?.includes('No refresh token')) {
      console.error('\n DIAGNOSIS: No refresh token in token.json');
      console.error('   Solution: Reauthorize with prompt=consent');
    } else {
      console.error('\n DIAGNOSIS: Unknown error');
      console.error(`   Full error: ${JSON.stringify(error, null, 2)}`);
    }
    
    console.log('\n' + '='.repeat(60));
    process.exit(1);
  }

  try {
    console.log('\n2️ Testing getGmailClient()...\n');
    const gmail = await getGmailClient();
    console.log(' Gmail client created successfully!');
    
    // Try a simple API call
    console.log('\n3️ Testing Gmail API call (getting profile)...\n');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(' Gmail API call successful!');
    console.log(`   Email: ${profile.data.emailAddress}`);
    console.log(`   Messages: ${profile.data.messagesTotal}`);
    console.log(`   Threads: ${profile.data.threadsTotal}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n ALL TESTS PASSED!');
    console.log('   Your token is working correctly.\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n Gmail API call FAILED!');
    console.error(`   Error: ${error.message}`);
    
    if (error.message?.includes('invalid_grant')) {
      console.error('\n The refresh token is invalid.');
      console.error('   Even though refreshAccessTokenIfNeeded() passed,');
      console.error('   the actual API call failed with invalid_grant.');
      console.error('\n   This suggests:');
      console.error('   1. Token was revoked between refresh and API call');
      console.error('   2. There\'s a redirect URI mismatch');
      console.error('   3. OAuth client credentials don\'t match');
    }
    
    console.log('\n' + '='.repeat(60));
    process.exit(1);
  }
}

testTokenRefresh();
