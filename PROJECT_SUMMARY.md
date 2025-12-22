# SpotOps360 CRM - Complete Project Summary

## Project Overview

**SpotOps360 CRM** is a comprehensive Customer Relationship Management system built for managing automotive parts orders, sales agent leads, and business operations. The system provides real-time order tracking, lead management through Gmail integration, automated incentive calculations, and a complete order lifecycle management system.

---

## Architecture & Technology Stack

### **Frontend**
- **Framework**: React 19.1.0 with Vite 7.0.4
- **State Management**: Redux Toolkit 2.9.0
- **Styling**: Tailwind CSS 3.4.1 with custom glassmorphism design
- **Routing**: React Router DOM 6.26.0
- **Real-time Communication**: Socket.IO Client 4.8.1
- **Charts & Visualization**: Chart.js 4.5.0, Recharts 3.1.0
- **Date Handling**: date-fns 4.1.0, moment-timezone 0.6.0
- **PDF Generation**: jsPDF 3.0.3, html2canvas 1.4.1
- **UI Components**: Bootstrap 5.3.7, Font Awesome 7.0.0, React Icons 5.5.0

### **Backend**
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js 4.21.2
- **Database**: MongoDB with Mongoose 7.8.7
- **Authentication**: JWT (jsonwebtoken 9.0.0), bcryptjs 2.4.3
- **Real-time**: Socket.IO 4.8.1
- **Email Integration**: Google APIs (googleapis 134.0.0)
- **File Upload**: Multer 2.0.2
- **Email Sending**: Nodemailer 7.0.5
- **Web Scraping**: Puppeteer 24.23.0

### **Infrastructure**
- **Hosting**: AWS EC2
- **Domain Management**: Route 53 (AWS) + Namecheap
- **Web Server**: Nginx (reverse proxy)
- **Process Manager**: PM2
- **SSL**: Let's Encrypt (via Certbot)

---

## Database Structure

### **MongoDB Collections**

#### 1. **Orders Collection** (`Order` Model)
- **Purpose**: Core order management
- **Key Fields**:
  - `orderNo` (unique identifier)
  - `orderDate`, `orderStatus`
  - Customer info: `fName`, `lName`, `email`, `phone`, addresses
  - Vehicle info: `make`, `model`, `year`, `vin`
  - Part info: `partNo`, `pReq`, `desc`, `warranty`
  - Financial: `soldP`, `chargedAmount`, `costP`, `shippingFee`, `salestax`, `grossProfit`, `actualGP`
  - `salesAgent` (assigned sales agent)
  - `additionalInfo[]` (array of yard/supplier information)
  - `orderHistory[]` (audit trail)
  - `supportNotes[]`
  - `images[]` (uploaded images)
  - Status tracking: `isCancelled`, `disputedDate`, `cancelledDate`, etc.

#### 2. **Users Collection** (`User` Model)
- **Purpose**: User authentication and authorization
- **Key Fields**:
  - `firstName`, `lastName`, `email` (unique), `password` (hashed)
  - `role`: Admin, Sales, or Support
  - `team`: Shankar or Vinutha
  - Timestamps (createdAt, updatedAt)

#### 3. **GmailMessage Collection** (`GmailMessage` Model)
- **Purpose**: Store Gmail messages from Pub/Sub
- **Key Fields**:
  - `messageId` (unique Gmail message ID)
  - `threadId`, `historyId`, `internalDate`
  - `subject`, `from`, `to[]`, `deliveredTo[]`
  - `agentEmail` (detected sales agent email)
  - `snippet`, `bodyHtml` (full email body)
  - `status`: active, claimed, closed
  - `claimedBy`, `claimedAt`
  - `labels[]` (custom labels)
  - `comments[]` (agent comments)

#### 4. **Leads Collection** (`Lead` Model)
- **Purpose**: Structured lead data extracted from emails
- **Key Fields**:
  - `messageId` (links to GmailMessage)
  - `gmailMessageId` (reference)
  - Lead info: `name`, `phone`, `year`, `make`, `model`, `partRequired`
  - Email details: `subject`, `from`
  - `salesAgent` (first name of claiming agent)
  - `claimedBy` (user ID), `claimedAt`
  - `status`: claimed, closed, converted
  - `labels[]`

#### 5. **GmailSyncState Collection** (`GmailSyncState` Model)
- **Purpose**: Track Gmail watch state and sync status
- **Key Fields**:
  - `userEmail`
  - `historyId` (last processed)
  - `expiration` (watch expiration)
  - `topicName` (Pub/Sub topic)

#### 6. **Yards Collection** (`Yards` Model)
- **Purpose**: Supplier/yard information
- **Key Fields**: Name, contact info, ratings, addresses

#### 7. **PartName Collection** (`PartName` Model)
- **Purpose**: Part catalog/reference

#### 8. **LoggedInUser Collection** (`LoggedInUser` Model)
- **Purpose**: Track active user sessions

---

## Frontend Architecture

### **Page Structure**
The frontend is organized into multiple pages for different functionalities:

#### **Order Management Pages**
- `AddOrder.jsx` - Create new orders
- `EditOrder.jsx` - Edit existing orders
- `OrderDetails.jsx` - Detailed order view with real-time updates
- `AllOrders.jsx` - Comprehensive order listing
- `PlacedOrders.jsx` - Orders in "Placed" status
- `PartiallyChargedOrders.jsx` - Partially paid orders
- `CustomerApproved.jsx` - Customer-approved orders
- `MonthlyOrders.jsx` - Monthly order reports

#### **Status-Specific Pages**
- `YardProcessing.jsx` - Orders being processed by yards
- `OwnShippingOrders.jsx` - Customer shipping orders
- `InTransit.jsx` - Orders in transit
- `FulfilledOrders.jsx` - Completed orders
- `CancelledOrders.jsx` - Cancelled orders
- `RefundedOrders.jsx` - Refunded orders
- `DisputedOrders.jsx` - Disputed orders
- `OverallEscalationOrders.jsx` - All escalations
- `OngoingEscalations.jsx` - Active escalations

#### **Lead Management Pages**
- `EmailLeads.jsx` - Live Gmail leads from Pub/Sub
- `Leads.jsx` - Claimed and managed leads
- `IncentiveCalculation.jsx` - Automated incentive reports

#### **Reporting Pages**
- `Dashboard.jsx` - Main dashboard with KPIs
- `SalesReport.jsx` - Sales performance reports
- `SalesData.jsx` - Detailed sales analytics
- `POReport.jsx` - Purchase order reports
- `Purchases.jsx` - Purchase tracking
- `StoreCredit.jsx` - Store credit management
- `ShippingExpenses.jsx` - Shipping cost analysis
- `TrackingReport.jsx` - Tracking information reports
- `DeliveryReport.jsx` - Delivery status reports
- `ReimbursementReport.jsx` - Reimbursement tracking
- `UPSClaims.jsx` - UPS claim management
- `CollectRefund.jsx` - Refund collection tracking
- `CardNotCharged.jsx` - Uncharged card reports

#### **User Management**
- `Login.jsx` - User authentication
- `Signup.jsx` - User registration
- `CreateUser.jsx` - Admin user creation
- `ViewUsers.jsx` - User management
- `UserActivity.jsx` - User activity logs
- `viewUserActivity.jsx` - Individual user activity

#### **Task Management**
- `AllTasks.jsx` - All tasks view
- `MyTasks.jsx` - User-specific tasks
- `Teams.jsx` - Team management

### **Component Architecture**
- **Layout Components**: `MainLayout`, `Sidebar`, `Navbar`, `NavbarForm`
- **Order Components**: `OrderCard`, `OrdersTable`, `YardList`, `YardCard`
- **Modals**: Various modals for order actions (CardCharged, Refund, Cancel, Dispute, Escalation, etc.)
- **UI Components**: `GlassCard`, `Pill`, `Input`, `Select`, `Field`, `Stat`
- **Real-time**: WebSocket integration for live order updates

### **State Management**
- Redux store for global state (auth, orders, etc.)
- Local state for component-specific data
- Real-time updates via Socket.IO

---

##  Backend Architecture

### **API Routes Structure**

#### **Authentication Routes** (`/api/auth`)
- POST `/signup` - User registration
- POST `/login` - User login
- POST `/logout` - User logout
- GET `/me` - Get current user

#### **Order Routes** (`/api/orders`)
- GET `/orders` - List orders (with filters)
- POST `/orders` - Create new order
- GET `/orders/:orderNo` - Get order details
- PUT `/orders/:orderNo` - Update order
- PATCH `/orders/:orderNo/storeCredits` - Use store credit
- GET `/dashboard` - Dashboard aggregates
- Status-specific routes:
  - `/placed`, `/partially-charged`, `/customerApproved`
  - `/yardProcessingOrders`, `/ownShippingOrders`, `/inTransitOrders`
  - `/cancelledOrders`, `/refundedOrders`, `/disputedOrders`
  - `/fulfilledOrders`, `/overallEscalationOrders`, `/ongoingEscalationOrders`

#### **Gmail/Lead Routes** (`/api/gmail`)
- GET `/messages` - List Gmail messages/leads
- GET `/messages/:id` - Get message details
- POST `/messages/:id/claim-and-view` - Claim a lead
- PATCH `/messages/:id/labels` - Update labels
- PATCH `/messages/:id/close` - Close lead
- PATCH `/messages/:id/reopen` - Reopen lead
- POST `/messages/:id/comments` - Add comment
- POST `/watch` - Start/renew Gmail watch
- POST `/sync` - Manual Gmail sync
- POST `/pubsub` - Pub/Sub webhook endpoint
- GET `/state` - Get sync state
- GET `/statistics/daily` - Daily statistics
- GET `/oauth2/url` - Get OAuth URL
- GET `/oauth2/callback` - OAuth callback

#### **User Routes** (`/api/users`)
- GET `/users` - List users
- POST `/users` - Create user
- PUT `/users/:id` - Update user
- DELETE `/users/:id` - Delete user

#### **Other Routes**
- `/api/parts` - Part management
- `/api/yards` - Yard/supplier management
- `/api/emails` - Email sending
- `/api/utils/zip-lookup` - ZIP code lookup
- `/api/orders/storeCredits` - Store credit management

### **Real-time Features**
- **Socket.IO Integration**: Real-time order updates
- **Server-Sent Events (SSE)**: Live Gmail message streaming
- **Presence Tracking**: Track users viewing specific orders
- **Typing Indicators**: Real-time typing status

---

## Gmail Integration & Lead Management

### **Google Pub/Sub Setup**
1. **Gmail API Configuration**:
   - Service account with domain-wide delegation
   - OAuth2 credentials for Gmail access
   - Pub/Sub topic created in Google Cloud
   - Push subscription pointing to `/api/gmail/pubsub`

2. **Environment Variables**:
   ```
   GCP_CLIENT_EMAIL=svc-account@project.iam.gserviceaccount.com
   GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GMAIL_IMPERSONATED_USER=sales-inbox@yourdomain.com
   GMAIL_PUBSUB_TOPIC=projects/<project>/topics/gmail-crm
   GMAIL_PUBSUB_VERIFY_TOKEN=shared-secret
   GMAIL_WATCH_LABELS=INBOX,UNREAD
   SALES_AGENT_EMAILS=agent1@yourdomain.com,agent2@yourdomain.com
   ```

3. **How It Works**:
   - Gmail publishes `historyId` notifications to Pub/Sub
   - Pub/Sub pushes to `/api/gmail/pubsub` webhook
   - Backend fetches new messages from Gmail API
   - Messages are stored in `GmailMessage` collection
   - Agent email is auto-detected from `Delivered-To`, `To`, or `Cc` headers
   - Messages appear in real-time via SSE to frontend

### **Lead Claiming Process**
1. Sales agents view live Gmail messages in `EmailLeads` page
2. Messages are filtered by agent email (for Sales role)
3. Agent clicks "Claim" button
4. System:
   - Marks message as "claimed" in database
   - Extracts structured fields (name, phone, year, make, model, part required)
   - Creates `Lead` record linked to `GmailMessage`
   - Assigns lead to sales agent
   - Updates status to "claimed"
5. Leads can be closed or converted to orders
6. All activity is tracked for incentive calculation

### **Auto-Renewal**
- Gmail watch auto-renews every 6 hours
- Token refresh runs hourly
- Automatic watch initialization on server startup

---

##  Incentive Calculation System

### **Purpose**
Automatically calculate sales agent incentives based on:
- Leads claimed from Gmail
- Orders created and fulfilled
- Gross profit (GP) generated
- Lead conversion rates

### **Data Sources**
1. **Leads Collection**: Tracks claimed leads per agent
2. **Orders Collection**: Tracks orders with `salesAgent` field
3. **GmailMessage Collection**: Tracks email activity
4. **Daily Statistics API**: `/api/gmail/statistics/daily` - Aggregated metrics per agent

### **API Endpoint: Daily Statistics**
**Endpoint**: `GET /api/gmail/statistics/daily`

**Query Parameters**:
- `startDate` (optional): Start date in YYYY-MM-DD format
- `endDate` (optional): End date in YYYY-MM-DD format
- `agentEmail` (optional): Filter by specific agent email

**Response Structure**:
```json
{
  "dailyStats": [
    {
      "date": "2025-01-15",
      "total": 10,
      "agents": [
        {
          "agentId": "user_id",
          "agentName": "John",
          "agentEmail": "john@example.com",
          "count": 5,
          "leads": [
            {
              "_id": "lead_id",
              "messageId": "gmail_message_id",
              "subject": "Part Request",
              "from": "customer@example.com",
              "claimedAt": "2025-01-15T10:30:00Z",
              "name": "Customer Name",
              "phone": "123-456-7890",
              "year": "2020",
              "make": "Toyota",
              "model": "Camry",
              "partRequired": "Engine",
              "salesAgent": "John",
              "labels": ["urgent"],
              "status": "claimed"
            }
          ]
        }
      ]
    }
  ],
  "totalLeads": 10,
  "agentStats": [
    {
      "agentId": "user_id",
      "agentName": "John",
      "agentEmail": "john@example.com",
      "totalLeads": 5,
      "leads": [...]
    }
  ],
  "dateRange": {
    "start": "2025-01-15T00:00:00.000Z",
    "end": "2025-01-15T23:59:59.999Z"
  }
}
```

### **Calculation Logic**
- **Lead Metrics**: 
  - Total leads claimed per agent
  - Leads closed/converted
  - Daily, weekly, monthly aggregations
  - Lead details (name, phone, vehicle info, part required)
- **Order Metrics**: 
  - Orders created per agent (from Orders collection)
  - GP per order (`actualGP` field)
  - Total GP per agent
  - Order status breakdown
- **Conversion Rates**: 
  - Leads to orders ratio
  - Lead status tracking (claimed → closed → converted)
- **Time-based Aggregations**: 
  - Daily statistics grouped by date
  - Agent-level totals across date range
  - Sortable by date or lead count

### **IncentiveCalculation Page**
- **Location**: `/incentive-calculation`
- **Features**:
  - Displays agent performance metrics
  - Shows lead counts, order counts, GP totals
  - Time period filtering (daily, weekly, monthly)
  - Agent-specific filtering
  - Detailed lead information per agent
  - Export capabilities for reporting
  - Real-time data from Leads and Orders collections

### **How It Works**
1. **Lead Tracking**: When a sales agent claims a lead:
   - Lead record created in `Lead` collection
   - `claimedBy` set to user ID
   - `claimedAt` timestamp recorded
   - `salesAgent` set to agent's first name
   - Status set to "claimed"

2. **Statistics Calculation**:
   - Queries `Lead` collection for claimed/closed leads
   - Groups by date and agent
   - Aggregates lead counts per agent
   - Includes full lead details (extracted from email)
   - Filters by date range and agent email

3. **Order Integration**:
   - Orders linked to agents via `salesAgent` field
   - GP calculated from `actualGP` field in Orders
   - Combined metrics show lead-to-order conversion

4. **Reporting**:
   - Daily statistics endpoint provides structured data
   - Frontend displays in tabular format
   - Export to CSV/PDF for payroll/accounting

---

## 💳 Payment Processing (Stripe Integration)

### **Customer Payment Interface**
The system provides a customer-facing interface for payment processing using Stripe API:

1. **Payment Flow**:
   - Customer receives order confirmation
   - Payment link/interface provided
   - Stripe Checkout or embedded payment form
   - Secure card processing via Stripe
   - Payment confirmation updates order status

2. **Order Status Updates**:
   - `chargedAmount` field tracks payment amount
   - Order status changes based on payment:
     - "Placed" → Full payment received
     - "Partially charged order" → Partial payment
   - Payment history tracked in `orderHistory`

3. **Integration Points**:
   - Stripe webhook for payment confirmations
   - Order status updates on successful payment
   - Refund processing through Stripe
   - Store credit management

*Note: Stripe integration code may be in a separate service or customer-facing portal not included in this codebase.*

---

## 🌐 AWS Hosting & Infrastructure

### **EC2 Setup**
- **Instance**: AWS EC2 running Ubuntu
- **Application Path**: `/var/www/spotopsCRMv2`
- **Process Manager**: PM2 (process name: `spotops360-api`)
- **Port**: Backend runs on port 5000
- **Node.js**: Latest LTS version

### **Nginx Configuration**
- **Config File**: `/etc/nginx/sites-available/spotops360`
- **Frontend**: Serves React build from `/var/www/spotopsCRMv2/client/dist`
- **API Proxy**: `/api/*` → `http://127.0.0.1:5000`
- **WebSocket**: `/socket.io/` → `http://127.0.0.1:5000`
- **SSL**: Let's Encrypt certificates (when configured)

### **Route 53 & DNS**
1. **Route 53 Setup**:
   - Hosted zone created for `spotops360.com`
   - A record pointing to EC2 public IP
   - CNAME record for `www.spotops360.com`

2. **Namecheap Integration**:
   - Domain registered on Namecheap
   - Nameservers updated to Route 53 nameservers
   - DNS records managed in Route 53:
     - **A Record**: `@` (root) → EC2 IP address
     - **A Record**: `www` → EC2 IP address
     - **CNAME Record**: `www` → `spotops360.com` (alternative)

3. **DNS Propagation**:
   - TTL set to 300 seconds (5 minutes) for faster updates
   - Full propagation typically 1-4 hours
   - Global propagation up to 48 hours

### **Deployment Strategy**
- **Zero-Downtime Deployment**: PM2 reload (not restart)
- **Atomic Frontend Swaps**: Build swapped atomically
- **Automatic Rollback**: Health check failures trigger rollback
- **Backup Management**: Timestamped backups before each deployment
- **Deployment Scripts**: Located in `/scripts/` directory

### **Deployment Process**
1. **Backup**: Create timestamped backup of current build
2. **Pull Code**: Fetch latest from Git repository
3. **Install Dependencies**: `npm install` for backend
4. **Build Frontend**: `npm run build` in client directory
5. **Health Check**: Verify current service is healthy
6. **Atomic Swap**: Swap new frontend build
7. **PM2 Reload**: Zero-downtime restart
8. **Verify**: Check service health after deployment
9. **Auto-Rollback**: Rollback if health check fails

---

## 🔐 Security & Authentication

### **Authentication Flow**
1. User logs in via `/api/auth/login`
2. JWT token generated and stored in HTTP-only cookie
3. Token validated on protected routes via `requireAuth` middleware
4. Role-based access control (Admin, Sales, Support)

### **Password Security**
- Passwords hashed with bcryptjs (salt rounds: 10)
- Pre-save hook in User model
- Password comparison method for login

### **Authorization**
- **Admin**: Full access to all features
- **Sales**: Access to leads, orders, limited reports
- **Support**: Order management, customer support features

---

## 📊 Key Features

### **Order Management**
- Complete order lifecycle tracking
- Multiple yard/supplier support per order
- Real-time status updates
- Order history and audit trail
- Image uploads for orders
- Escalation management
- Refund and cancellation handling
- Store credit system

### **Lead Management**
- Real-time Gmail message streaming
- Automatic agent assignment
- Lead claiming and tracking
- Structured data extraction from emails
- Lead status management (claimed, closed, converted)
- Comment system for leads

### **Reporting & Analytics**
- Dashboard with KPIs
- Sales reports by agent, date, status
- Gross profit calculations
- Purchase order reports
- Shipping expense tracking
- Delivery and tracking reports
- Monthly and yearly aggregations

### **Real-time Features**
- Live order updates via Socket.IO
- Presence tracking (who's viewing what)
- Typing indicators
- Server-Sent Events for Gmail updates
- Real-time dashboard updates

### **Financial Management**
- Gross profit (GP) calculations
- Actual GP tracking
- Store credit system
- Refund management
- Reimbursement tracking
- UPS claims processing

---

## 🚀 Development Workflow

### **Local Development**
```bash
# Backend
cd backend
npm install
npm run dev  # Uses nodemon

# Frontend
cd client
npm install
npm run dev  # Vite dev server
```

### **Production Build**
```bash
# Frontend build
cd client
npm run build  # Outputs to client/dist

# Backend
cd backend
npm start  # Production mode
```

### **Deployment Commands**
```bash
# On EC2 server
cd /var/www/spotopsCRMv2
./scripts/deploy.sh          # Deploy main branch
./scripts/deploy.sh feature  # Deploy specific branch
./scripts/rollback.sh        # Rollback to last deployment
```

---

## 📝 Database Management

### **MongoDB Connection**
- Connection string in `backend/config/db.js`
- Environment variable: `MONGODB_URI`
- Connection pooling enabled
- Automatic reconnection

### **Backup Strategy**
- **Automated Backups**: Weekly MongoDB backups via `mongo_weekly_backup.mjs`
- **Deployment Backups**: Automatic before each deployment
- **Backup Location**: `/var/www/spotopsCRMv2/backups/`
- **Backup Format**: Timestamped directories (YYYYMMDD_HHMMSS)

### **Data Models**
- Mongoose schemas with validation
- Indexes for performance (messageId, orderNo, email, etc.)
- Timestamps enabled on most models
- Soft deletes where applicable

---

## 🔄 Real-time Communication

### **Socket.IO**
- **Purpose**: Real-time order updates, presence tracking
- **Rooms**: Per-order rooms (`order.{orderNo}`)
- **Events**:
  - `order:msg` - Order updates
  - `joinOrder` - User joins order view
  - `leaveOrder` - User leaves order view
  - `typing:start` / `typing:stop` - Typing indicators

### **Server-Sent Events (SSE)**
- **Endpoint**: `/events`
- **Purpose**: Live Gmail message updates
- **Event Type**: `gmail`
- **Auto-reconnect**: Handles disconnections

---

## 📈 Performance Optimizations

1. **Frontend**:
   - Code splitting with React.lazy()
   - Vite build optimization
   - Image optimization
   - Debounced search inputs

2. **Backend**:
   - MongoDB indexes on frequently queried fields
   - Aggregation pipelines for reports
   - Connection pooling
   - PM2 cluster mode (if configured)

3. **Database**:
   - Indexed fields: orderNo, messageId, email, salesAgent, status
   - Compound indexes for complex queries
   - Lean queries where possible

---

## 🛠️ Additional Tools & Services

- **Puppeteer**: Web scraping for part lookups
- **Nodemailer**: Email notifications
- **Moment-timezone**: Timezone handling (America/Chicago)
- **Date-fns**: Date formatting and manipulation
- **Chart.js / Recharts**: Data visualization
- **jsPDF / html2canvas**: PDF generation for reports

---

## 📋 Project Planning Summary

### **Frontend Planning**
- **Design System**: Glassmorphism UI with dark theme
- **Component Library**: Reusable UI components
- **State Management**: Redux for global state, local state for UI
- **Routing**: Protected routes with authentication
- **Responsive Design**: Mobile-friendly with Tailwind breakpoints

### **Backend Planning**
- **RESTful API**: Standard REST endpoints
- **Real-time**: Socket.IO for live updates
- **Modular Structure**: Controllers, routes, models, services
- **Error Handling**: Centralized error handling
- **Validation**: Input validation middleware

### **Database Planning**
- **Schema Design**: Normalized structure with references
- **Indexing Strategy**: Indexes on frequently queried fields
- **Data Relationships**: References between Orders, Users, Leads, GmailMessages
- **Audit Trail**: Order history and timestamps

### **Infrastructure Planning**
- **Scalability**: PM2 for process management
- **Reliability**: Zero-downtime deployments
- **Monitoring**: PM2 logs, health checks
- **Backup Strategy**: Automated backups
- **Security**: SSL, JWT authentication, role-based access

---

## 🎯 Key Integrations

1. **Google Gmail API**: Email ingestion via Pub/Sub
2. **Stripe API**: Payment processing (customer interface)
3. **Socket.IO**: Real-time bidirectional communication
4. **MongoDB**: Document database for flexible data storage
5. **AWS Services**: EC2, Route 53
6. **Nginx**: Reverse proxy and static file serving

---

## 📚 Documentation Files

- `DEPLOYMENT.md` - Deployment guide
- `QUICK_DEPLOY.md` - Quick deployment reference
- `DOMAIN_MIGRATION_CHECKLIST.md` - DNS migration steps
- `backend/GMAIL_SETUP_GUIDE.md` - Gmail integration setup
- `backend/OAUTH2_SETUP.md` - OAuth2 configuration
- `backend/docs/gmail-pubsub.md` - Pub/Sub documentation
- Various migration and deployment scripts

---

## 🔮 Future Enhancements (Potential)

Based on the codebase structure, potential future enhancements could include:
- Enhanced Stripe integration with webhook handling
- Advanced analytics and reporting dashboards
- Mobile app (React Native)
- Automated email responses
- Advanced search and filtering
- Bulk operations
- API rate limiting
- Caching layer (Redis)
- Multi-tenant support

---

## 📞 Support & Maintenance

- **Logs**: PM2 logs (`pm2 logs spotops360-api`)
- **Health Check**: `GET /api/health`
- **Monitoring**: PM2 status, Nginx logs
- **Backups**: Automated weekly + deployment backups
- **Rollback**: One-command rollback script

---

*This summary was generated based on the codebase analysis. For specific implementation details, refer to the source code and inline documentation.*

