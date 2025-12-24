# Unified Actions Table

## Overview

The `unified_actions` table is a **simple reference list** of all email-triggering actions in the system. Each row represents one type of email that can be sent.

## Table Structure

```sql
CREATE TABLE unified_actions (
    id SERIAL PRIMARY KEY,
    action_name VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'Welcome Email - Create Account'
    system_type VARCHAR(50) NOT NULL,          -- 'crm_admin', 'crm_user', 'ib_client', 'ib_admin'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Current Actions

The table contains the following email actions:

### CRM User Actions
- Welcome Email - Create Account
- Forgot Password Email - on Forgot Password
- MT5 Account Creation Email - on New MT5 Account
- Deposit Request Email - on Deposit Request
- Withdrawal Request Email - on Withdrawal Request
- Internal Transfer Email - on Internal Transfer
- KYC Email - on KYC Submission
- Ticket Email - on Ticket Creation
- OTP Verification Email - on OTP Request

### CRM Admin Actions
- Deposit Approved Email - on Deposit Approval
- Withdrawal Approved Email - on Withdrawal Approval
- Transaction Completed Email - Deposit
- Transaction Completed Email - Withdrawal
- KYC Completion Email - on KYC Approval
- Ticket Response Email - on Ticket Response
- Custom Email - on Admin Send Email

### IB Client Actions
- IB Request Email - on IB Request

### IB Admin Actions
- IB Request Accepted Email - on IB Request Approval

## API Endpoints

### GET /api/admin/unified-actions
Get all email actions (optionally filtered by system_type)

**Query Parameters:**
- `system_type` (optional): Filter by 'crm_admin', 'crm_user', 'ib_client', 'ib_admin', or 'all'
- `search` (optional): Search in action_name

**Example:**
```
GET /api/admin/unified-actions?system_type=crm_user
GET /api/admin/unified-actions?search=Welcome
```

### GET /api/admin/unified-actions/stats
Get statistics about actions by system type

### GET /api/admin/unified-actions/by-system
Get actions grouped by system type

### GET /api/admin/unified-actions/:id
Get details of a specific action

## Adding New Actions

To add a new email action, insert it into the table:

```sql
INSERT INTO unified_actions (action_name, system_type) 
VALUES ('New Email Action - on Event', 'crm_user')
ON CONFLICT (action_name) DO NOTHING;
```

## Purpose

This table serves as a **reference list** of all email-triggering actions in the system. It can be used to:
- Display available email actions in admin panels
- Map email templates to actions
- Track which actions require email notifications
- Generate reports on email action types

## Notes

- This is **not** a logging table - it doesn't track individual email sends
- Each action name must be unique
- Actions are organized by system type for easy filtering

