# Email Fixes Summary

## Issues Fixed

### 1. ✅ Logo Not Appearing in Emails
**Problem**: Logo was using base64 data URIs which many email clients block.

**Solution**: 
- Changed to CID (Content-ID) inline attachments
- Logo is now attached to emails and referenced as `cid:solitaire-logo`
- Works in Gmail, Outlook, Apple Mail, and other major email clients

**Files Updated**:
- `services/email.js` - Main email sending function
- `services/templateEmail.service.js` - Template processing
- `routes/admin.js` - Admin email sending routes

### 2. ✅ Wrong Dashboard URL Redirects
**Problem**: Templates had hardcoded URLs like `https://solitairemarkets.me` instead of `https://portal.solitairemarkets.com/user/dashboard`.

**Solution**:
- Added aggressive URL replacement logic
- Replaces all `solitairemarkets.me` URLs with correct dashboard URL
- Replaces localhost URLs
- Handles both href attributes and plain URLs

**Files Updated**:
- `services/email.js` - Added URL replacement before sending
- `services/templateEmail.service.js` - Added URL replacement in template processing
- `routes/admin.js` - Added URL replacement in admin email routes

## Environment Variables Required

Make sure your `.env` file has:

```env
# Frontend URL - Used for dashboard links in emails
FRONTEND_URL=https://portal.solitairemarkets.com

# Email Configuration
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your_sendgrid_api_key_here
EMAIL_FROM=no_reply@solitairemarkets.me
```

## Next Steps

### 1. Update Existing Templates in Database

Run this script to fix all existing email templates:

```bash
cd solitaire-markets-crm-backend
node scripts/fix_email_template_urls.js
```

This will:
- Find all email templates in the database
- Replace any `solitairemarkets.me` URLs with `portal.solitairemarkets.com/user/dashboard`
- Update templates automatically

### 2. Restart Backend Server

After updating `.env` and running the script:

```bash
# Stop the server (Ctrl+C)
# Then restart
node index.js
```

### 3. Test Email Sending

1. Send a test email from admin panel
2. Check that:
   - ✅ Logo appears in the email
   - ✅ "View Dashboard" links point to `https://portal.solitairemarkets.com/user/dashboard`
   - ✅ No redirects to wrong URLs

## How It Works Now

### Logo Attachment
1. Logo SVG is extracted from base64
2. Converted to Buffer
3. Attached as inline attachment with CID `solitaire-logo`
4. HTML uses `cid:solitaire-logo` instead of base64 data URI
5. Email clients display it as an embedded image

### URL Replacement
1. All template variables are replaced (`{{dashboardUrl}}` → correct URL)
2. All hardcoded wrong URLs are replaced (`solitairemarkets.me` → `portal.solitairemarkets.com/user/dashboard`)
3. All href attributes with wrong domains are fixed
4. Final HTML is cleaned before sending

## Troubleshooting

### Logo Still Not Appearing?
1. Check server logs for attachment errors
2. Verify email client supports inline attachments (most do)
3. Check if email client is blocking images (some require "Load Images")
4. Verify `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS` are set correctly

### Wrong URLs Still Appearing?
1. Run the fix script: `node scripts/fix_email_template_urls.js`
2. Check if templates were updated in database
3. Verify `FRONTEND_URL` is set correctly in `.env`
4. Restart backend server after changing `.env`

## Files Changed

- ✅ `services/email.js` - Logo CID attachment + URL replacement
- ✅ `services/templateEmail.service.js` - Template URL replacement
- ✅ `routes/admin.js` - Admin email URL replacement
- ✅ `.env` - Updated `FRONTEND_URL`
- ✅ `scripts/fix_email_template_urls.js` - Script to fix database templates

