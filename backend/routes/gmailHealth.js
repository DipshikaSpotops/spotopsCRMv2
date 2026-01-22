/**
 * Gmail Health Check Route
 * Provides endpoint to check Gmail token status and get reauthorization URL
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAuthUrl } from '../services/googleAuth.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

/**
 * GET /api/gmail/health
 * Returns Gmail token health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'unknown',
      hasToken: false,
      hasRefreshToken: false,
      tokenExpired: false,
      needsReauth: false,
      error: null,
      reauthUrl: null,
      message: null,
    };

    // Check if token.json exists
    if (!fs.existsSync(TOKEN_PATH)) {
      health.status = 'no_token';
      health.message = 'No token.json found. Please authorize.';
      health.needsReauth = true;
      health.reauthUrl = process.env.NODE_ENV === 'production'
        ? 'https://www.spotops360.com/api/gmail/oauth2/url'
        : 'http://localhost:5000/api/gmail/oauth2/url';
      return res.json(health);
    }

    health.hasToken = true;

    try {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      
      // Check for refresh token
      health.hasRefreshToken = !!tokenData.refresh_token;
      
      if (!health.hasRefreshToken) {
        health.status = 'no_refresh_token';
        health.message = 'No refresh token. Please reauthorize.';
        health.needsReauth = true;
      } else {
        // Check if token is expired
        if (tokenData.expiry_date) {
          const expiryDate = new Date(tokenData.expiry_date);
          const now = new Date();
          health.tokenExpired = expiryDate.getTime() < now.getTime();
          
          if (health.tokenExpired) {
            const minutesAgo = Math.round((now.getTime() - expiryDate.getTime()) / 60000);
            health.message = `Token expired ${minutesAgo} minutes ago. Should auto-refresh, but if it fails, reauthorize.`;
          } else {
            const minutesRemaining = Math.round((expiryDate.getTime() - now.getTime()) / 60000);
            health.message = `Token valid for ${minutesRemaining} more minutes.`;
          }
        }
        
        // Check if access token is blocked
        if (tokenData.access_token === 'blocked_by_reauth_policy' || !tokenData.access_token) {
          health.status = 'blocked';
          health.message = 'Token is blocked by reauth policy. Reauthorization required.';
          health.needsReauth = true;
        } else {
          health.status = health.tokenExpired ? 'expired_but_refreshable' : 'healthy';
        }
      }
      
      // Generate reauth URL
      try {
        health.reauthUrl = getAuthUrl(null, true); // Force consent
      } catch (err) {
        health.reauthUrl = process.env.NODE_ENV === 'production'
          ? 'https://www.spotops360.com/api/gmail/oauth2/url'
          : 'http://localhost:5000/api/gmail/oauth2/url';
      }
      
    } catch (err) {
      health.status = 'error';
      health.error = err.message;
      health.message = `Error reading token: ${err.message}`;
      health.needsReauth = true;
    }

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      needsReauth: true,
    });
  }
});

export default router;
