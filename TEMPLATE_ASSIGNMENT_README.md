# Email Template Assignment to Actions

## Overview

The system now supports assigning email templates to actions in the `unified_actions` table. When an action is performed, the assigned template will be automatically used to send the email.

## How It Works

1. **Actions List**: The `unified_actions` table contains all email-triggering actions (e.g., "Welcome Email - Create Account", "MT5 Account Creation Email - on New MT5 Account")

2. **Template Assignment**: Each action can have a `template_id` that links to an email template in the `email_templates` table

3. **Automatic Template Lookup**: When an email is sent, the system:
   - Looks up the action name in `unified_actions`
   - Finds the assigned template via `template_id`
   - Uses that template to send the email

## Database Structure

```sql
unified_actions (
  id SERIAL PRIMARY KEY,
  action_name VARCHAR(255) NOT NULL UNIQUE,
  system_type VARCHAR(50) NOT NULL,
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL
)
```

## API Endpoints

### Get All Actions with Template Info
```
GET /api/admin/unified-actions
```
Returns all actions with their assigned template information.

**Query Parameters:**
- `system_type` (optional): Filter by system type
- `search` (optional): Search in action names

### Get Actions for Template Selection
```
GET /api/admin/email-templates/actions
```
Returns all actions that can be assigned to templates. Used when creating/editing templates.

### Assign Template to Action
```
PUT /api/admin/unified-actions/:id/assign-template
Body: { "template_id": 123 }
```
Assigns a template to an action. Set `template_id` to `null` to unassign.

### Create New Action
```
POST /api/admin/unified-actions
Body: {
  "action_name": "New Email Action - on Event",
  "system_type": "crm_user",
  "template_id": 123  // optional
}
```

### Update Action
```
PUT /api/admin/unified-actions/:id
Body: {
  "action_name": "Updated Name",
  "system_type": "crm_admin",
  "template_id": 456
}
```

## Current Actions

All actions are listed in `unified_actions` table. Examples:
- Welcome Email - Create Account
- Forgot Password Email - on Forgot Password
- MT5 Account Creation Email - on New MT5 Account
- Deposit Request Email - on Deposit Request
- Withdrawal Request Email - on Withdrawal Request
- Transaction Completed Email - Deposit
- Transaction Completed Email - Withdrawal
- KYC Completion Email - on KYC Approval
- Ticket Email - on Ticket Creation
- Ticket Response Email - on Ticket Response
- OTP Verification Email - on OTP Request
- And more...

## Admin Workflow

### When Creating a New Template:

1. Admin creates a new email template
2. Admin can select an action from the list (`GET /api/admin/email-templates/actions`)
3. Template is saved
4. Admin assigns the template to an action using `PUT /api/admin/unified-actions/:id/assign-template`

### When Adding a New Action:

1. Admin creates a new action via `POST /api/admin/unified-actions`
2. Admin can optionally assign a template during creation
3. Or assign a template later using the assign endpoint

## Email Service Integration

All email service functions have been updated to use action names from `unified_actions`:

- `sendWelcomeEmail()` → Uses "Welcome Email - Create Account"
- `sendMT5AccountCreatedEmail()` → Uses "MT5 Account Creation Email - on New MT5 Account"
- `sendDepositRequestEmail()` → Uses "Deposit Request Email - on Deposit Request"
- `sendTransactionCompletedEmail()` → Uses "Transaction Completed Email - Deposit/Withdrawal"
- And all other email functions...

## Template Lookup Priority

When sending an email, the system looks up templates in this order:

1. **unified_actions assignment** (highest priority) - Checks if action has `template_id` assigned
2. **action_type** (legacy) - Checks `email_templates.action_type` column
3. **template name** - Exact match by name
4. **email_type** (legacy) - Checks `email_templates.email_type` column

## Benefits

1. **Centralized Management**: All email actions in one place
2. **Easy Assignment**: Admins can assign templates via UI
3. **Flexible**: Can add new actions and assign templates dynamically
4. **Backward Compatible**: Still supports legacy `action_type` assignments
5. **Clear Mapping**: Each action has a clear, human-readable name

## Example Usage

```javascript
// When a user creates an account
await sendWelcomeEmail(user.email, user.name);
// System looks up "Welcome Email - Create Account" in unified_actions
// Finds assigned template_id
// Uses that template to send the email

// When admin assigns a template
PUT /api/admin/unified-actions/1/assign-template
{ "template_id": 5 }
// Now "Welcome Email - Create Account" will use template #5
```

