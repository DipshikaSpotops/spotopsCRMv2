## Gmail → Pub/Sub ingestion

The backend now supports streaming Gmail messages into MongoDB via Google Pub/Sub. This powers live lead tracking per sales agent.

### Required Google Cloud setup

1. Create a Google Cloud project with the Gmail API enabled.
2. Create a service account with domain-wide delegation.
3. Grant the service account the `https://www.googleapis.com/auth/gmail.readonly` scope for the mailbox you want to monitor.
4. Create a Pub/Sub topic (e.g. `projects/<project>/topics/gmail-crm`) and grant the Gmail API service account the `Pub/Sub Publisher` role.
5. Create a push subscription that targets your backend’s webhook URL `https://<host>/api/gmail/pubsub?token=<VERIFY_TOKEN>`.

### Environment variables

Add the following keys to your backend `.env`:

```
GCP_CLIENT_EMAIL=svc-account@project.iam.gserviceaccount.com
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GMAIL_IMPERSONATED_USER=sales-inbox@yourdomain.com
GMAIL_PUBSUB_TOPIC=projects/<project>/topics/gmail-crm
GMAIL_PUBSUB_VERIFY_TOKEN=shared-secret
GMAIL_WATCH_LABELS=INBOX,UNREAD
SALES_AGENT_EMAILS=agent1@yourdomain.com,agent2@yourdomain.com
```

Optional knobs:

```
GMAIL_HISTORY_PAGE_LIMIT=5        # max Gmail history pages per sync
```

### Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/gmail/watch` | Registers/renews the Gmail watch. Body accepts `{ labelIds, topicName }`. |
| `POST` | `/api/gmail/sync` | Manually replays Gmail history. Body query accepts `userEmail` and `startHistoryId`. |
| `POST` | `/api/gmail/pubsub` | Pub/Sub push endpoint (no auth beyond the verify token). |
| `GET`  | `/api/gmail/messages` | Returns the most recent stored Gmail messages (filter with `?agentEmail=`). |
| `GET`  | `/api/gmail/state` | Returns current watch/sync metadata. |

### How it works

1. Gmail publishes `historyId` notifications to Pub/Sub.
2. Pub/Sub pushes those notifications to `/api/gmail/pubsub`.
3. The backend looks up the last stored `historyId`, fetches the new history from Gmail, and stores each new message in the `GmailMessage` collection.
4. Each message attempts to identify the sales agent by matching any `Delivered-To`, `To`, or `Cc` address against `SALES_AGENT_EMAILS`.
5. Sales tooling can now read `/api/gmail/messages` or query MongoDB directly to calculate per-agent lead counts.

