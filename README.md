# construction-project-management
Stack: AWS CDK - Microservices - Serverless - Lambda - DynamoDB - S3 - Cognito

# BuildTrack — Construction Project Management App

## Overview

BuildTrack is a construction project management application designed for construction companies to manage their projects end to end. It covers site management, worker tracking, material procurement, daily progress logging, and cost reporting — all in one place.

---

## Business Roles

| Role | Description |
|---|---|
| **Admin** | Full access — create and manage projects, workers, materials, costs, and view all reports |
| **User (Site Supervisor)** | Field-level access — update daily progress, log material usage, mark worker attendance |

---

## Core Modules

### 1. Projects
- Create and manage construction projects
- Each project has a name, location, start date, end date, and budget
- Track project status: `Planning → Active → On Hold → Completed`
- Upload blueprints and contracts to cloud storage
- View budget vs actual spend at any time

### 2. Workers
- Maintain a worker registry (name, role, phone, daily wage)
- Mark daily attendance per project per worker
- System auto-calculates labour cost based on attendance and daily wage
- Track total labour cost per project

### 3. Materials
- Catalogue all material types (cement, steel, sand, bricks, etc.)
- Record purchases with quantity, unit price, vendor, and date
- Upload purchase bills to cloud storage
- Track material usage per project
- Get alerts when stock falls below threshold
- View total material cost per project

### 4. Daily Progress Log
- Site supervisor logs daily work completed
- Records materials consumed that day
- Records workers present that day
- Uploads site photos for visual tracking
- Adds issues or remarks for the day
- Admin can view full timeline of any project

### 5. Cost Tracking
- Labour cost — auto-calculated from worker attendance
- Material cost — auto-calculated from material purchases and usage
- Other expenses — equipment hire, transport, misc
- Budget vs actual comparison per project
- Profit / overrun indicator shown clearly

### 6. Dashboard (Admin only)
- Total active projects
- Overall budget vs spent across all projects
- Worker headcount for today
- Low stock material alerts
- Monthly expense summary

---

## Business Flow

```
Admin creates project
        ↓
Admin adds workers assigned to project
        ↓
Admin records material purchases → stock updates
        ↓
Site Supervisor marks daily attendance → labour cost auto-calculated
        ↓
Site Supervisor logs daily progress → materials used deducted from stock
        ↓
Admin views cost tracking → budget vs actual
        ↓
Project marked Completed → final cost report available
```

---

## Cloud Storage (S3) Usage

| Folder | What is stored |
|---|---|
| `project-documents/` | Blueprints, contracts, project files |
| `progress-photos/` | Daily site photos uploaded by supervisors |
| `material-bills/` | Purchase receipts and invoices |
| `worker-documents/` | Worker ID proofs (optional) |

---

## Key Business Rules

- Only Admin can create or delete projects, workers, and materials
- A User (supervisor) can only update progress and attendance — they cannot change budgets or costs
- Material stock is automatically reduced when usage is logged
- Labour cost is automatically calculated — no manual entry needed
- A project cannot be marked Completed if there are pending cost entries
- Low stock alert triggers when material quantity falls below the configured threshold
- All file uploads go directly to S3 — never stored on the server

---

## Summary

BuildTrack gives construction teams a single source of truth for every project — from the day the blueprint is uploaded to the day the final cost report is generated. Field supervisors stay focused on the site while management has full visibility on costs, progress, and resources in real time.
