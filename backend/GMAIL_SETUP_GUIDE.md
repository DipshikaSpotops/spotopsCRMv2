# Gmail Leads Setup Guide

This guide will help you configure the Gmail integration to receive leads in your CRM.

## Quick Setup

### Step 1: Create or Edit `.env` file

Create a `.env` file in the `backend` directory (or edit the existing one) and add the following:

```env
GMAIL_IMPERSONATED_USER=your-email@yourdomain.com
```

**Important:** Replace `your-email@yourdomain.com` with the actual Gmail address that receives your leads.

### Step 2: What Email Should You Use?

The `GMAIL_IMPERSONATED_USER` should be:
- The Gmail inbox that receives lead inquiries
- A Gmail account (or Google Workspace account) that you have access to
- The account where form submissions, inquiries, or lead emails are sent

**Examples:**
- `leads@yourcompany.com`
- `sales@yourcompany.com`
- `info@yourcompany.com`
- `inquiries@yourcompany.com`

### Step 3: Minimum Required Configuration

For the Leads page to show the email address, you only need:

```env
GMAIL_IMPERSONATED_USER=your-email@yourdomain.com
```

However, for the full Gmail integration to work (fetching and storing leads), you'll also need:

```env
GCP_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GMAIL_PUBSUB_TOPIC=projects/your-project/topics/gmail-crm
GMAIL_PUBSUB_VERIFY_TOKEN=your-secret-token
SALES_AGENT_EMAILS=agent1@yourdomain.com,agent2@yourdomain.com
```

## How to Find Your Email

If you're not sure which email to use, ask yourself:
1. **Where do lead form submissions go?** (e.g., contact form on website)
2. **What email receives customer inquiries?**
3. **What email do sales agents check for new leads?**

That's the email you should use for `GMAIL_IMPERSONATED_USER`.

## After Setting Up

1. Save the `.env` file
2. Restart your backend server
3. Refresh the Leads page - you should now see the email address displayed

## Need Help?

If you need help with:
- **Google Cloud setup** - See `backend/docs/gmail-pubsub.md`
- **Service account creation** - Check Google Cloud Console documentation
- **Finding your email** - Check with your team or check where form submissions are sent



