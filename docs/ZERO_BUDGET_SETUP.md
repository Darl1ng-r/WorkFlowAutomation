# Zero-Budget Edition Setup Guide ($0/Month)

This guide walks through deploying **Office OS** completely within **free tiers**:
- **Hosting, API, DB & Storage**: Cloudflare Workers Free (Workers, Static Assets, D1, R2, Workflows, Workers AI)
- **Identity & SSO**: Cloudflare Access Free (up to 50 users via Google Workspace)
- **Productivity & Drive Storage**: Existing Google Workspace (Gmail, Drive, Calendar, Sheets, Chat)

---

## Prerequisites
1. **Google Workspace Admin** account or developer project access.
2. **Cloudflare Account** (Free plan).
3. **Node.js 22 LTS** and `pnpm` installed locally.
4. **Wrangler CLI** installed (`npm install -g wrangler` or `pnpm add -D wrangler`).

---

## 1. Cloudflare Resources Provisioning

Login to Cloudflare via CLI:
```bash
npx wrangler login
```

### 1.1 Create the D1 Database
Cloudflare D1 provides a serverless SQLite relational database (500 MB free):
```bash
npx wrangler d1 create office_os_db
```
*Note down the `database_id` returned in the output.*

### 1.2 Create the R2 Storage Bucket
Cloudflare R2 provides 10 GB free object storage with zero egress fees:
```bash
npx wrangler r2 bucket create office-os-vault
```

### 1.3 Configure `wrangler.jsonc`
In the root of the project, configure bindings to D1, R2, Workers AI, Workflows, and Cron Triggers:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "office-os",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "office_os_db",
      "database_id": "<YOUR_D1_DATABASE_ID>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "VAULT",
      "bucket_name": "office-os-vault"
    }
  ],
  "ai": {
    "binding": "AI"
  },
  "workflows": [
    {
      "name": "office-intake-workflow",
      "binding": "INTAKE_WORKFLOW",
      "class_name": "IntakeWorkflow"
    }
  ],
  "triggers": {
    "crons": [
      "* * * * *",       // Polls Gmail and Drive delta every minute
      "0 8 * * *"        // Daily 08:00 morning digest and renewals check
    ]
  }
}
```

---

## 2. Google Workspace Integration (Zero Additional Cost)

Since you already use Google Workspace, use Google APIs directly without paid 3rd-party integration services (e.g. Zapier, Make).

### 2.1 Google Cloud Project & APIs
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project named `office-os-connect`.
3. Enable the following APIs:
   - **Gmail API**
   - **Google Drive API**
   - **Google Calendar API**
   - **Google Sheets API**
   - **Google Chat API**
4. Set up an OAuth 2.0 Client ID (Web Application) or Service Account with Domain-Wide Delegation.
5. Save the credentials securely in Cloudflare Secrets:
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

### 2.2 Shared Mailbox & Scan Folder Setup
- **Gmail Shared Inboxes**: Add labels or filters for `accounts@`, `info@`, etc.
- **Drive Scan Folder**: Create a Google Drive shared folder: `00_INBOX_SCANS`. Set your office multi-function scanner to scan directly to this folder (PDF format, 300 DPI).

---

## 3. Database Initialization (D1)

Execute the schema migration against the remote D1 instance:
```bash
npx wrangler d1 execute office_os_db --file=./schema.sql
```

A preview of the primary tables:
- `correspondence_register`: Central intake log (`ref_no`, `channel`, `status`, `hash`, `physical_location`)
- `documents`: Vault metadata and OCR payload references
- `approvals`: Human-in-the-loop audit records and diffs
- `obligations`: Insurance, registrations, licences, and expiration triggers
- `visitor_log`: Front desk visitor sign-ins and host notifications

---

## 4. Zero Trust SSO (Cloudflare Access Free)

To secure the admin dashboard and front desk kiosk:
1. In the Cloudflare Zero Trust Dashboard, navigate to **Access** > **Applications**.
2. Add an Application: `Self-Hosted` (e.g., `office.yourdomain.com`).
3. Select Identity Provider: **Google Workspace**.
4. Define Policy:
   - Rule Action: **Allow**
   - Include: Emails ending in `@yourcompany.com`
5. The application Worker will automatically receive and verify the `Cf-Access-Jwt-Assertion` header for zero-code authentication.

---

## 5. Deployment

Build the frontend single-page application and deploy the Worker:
```bash
# Build React client assets
pnpm build

# Deploy to Cloudflare Workers Edge
npx wrangler deploy
```

Once deployed, your application is live with zero monthly hosting, database, or workflow execution charges.
