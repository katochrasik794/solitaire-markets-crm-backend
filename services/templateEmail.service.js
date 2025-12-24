/**
 * Email Service using Templates from Admin Panel
 * This service sends emails using templates stored in the email_templates table
 */

import pool from '../config/database.js';
import { sendEmail, getLogoUrl } from './email.js';

/**
 * Get template by key from database
 * Priority: 1) action_type, 2) email_type, 3) name
 * This allows admins to assign templates to specific CRM actions
 * @param {string} templateKey - Template name, email_type, or action_type
 * @returns {Promise<object|null>} - Template object or null
 */
async function getTemplateByName(templateKey) {
  try {
    // 1) Try by action_type first (highest priority - for CRM action assignments)
    try {
      let result = await pool.query(
        'SELECT * FROM email_templates WHERE action_type = $1 LIMIT 1',
        [templateKey]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
    } catch (actionErr) {
      // action_type column may not exist on older databases – ignore
      console.warn('email_templates.action_type not available yet:', actionErr.message);
    }

    // 2) Try by exact name
    let result = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1 LIMIT 1',
      [templateKey]
    );
    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // 3) Fallback: try by email_type so templates can be renamed in UI
    try {
      result = await pool.query(
        'SELECT * FROM email_templates WHERE email_type = $1 LIMIT 1',
        [templateKey]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
    } catch (typeErr) {
      // email_type column may not exist on older databases – ignore
      console.warn('email_templates.email_type not available yet:', typeErr.message);
    }

    return null;
  } catch (error) {
    console.error(`Error fetching template "${templateKey}":`, error);
    return null;
  }
}

/**
 * Replace variables in template HTML
 * @param {string} html - HTML template with {{variables}}
 * @param {object} variables - Variables to replace
 * @returns {string} - HTML with variables replaced
 */
function replaceTemplateVariables(html, variables) {
  if (!html) return '';
  
  let result = html;
  const logoUrl = getLogoUrl(); // This now returns the actual URL: https://portal.solitairemarkets.com/logo.svg
  
  // Get frontend URL - use live URL as default
  const frontendUrl = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
  const dashboardUrl = `${frontendUrl}/user/dashboard`;
  
  // Default variables - use actual logo URL
  const defaultVars = {
    logoUrl: logoUrl, // Use actual URL: https://portal.solitairemarkets.com/logo.svg
    companyName: 'Solitaire Markets',
    companyEmail: 'support@solitairemarkets.me',
    dashboardUrl: dashboardUrl,
    frontendUrl: frontendUrl,
    currentYear: new Date().getFullYear(),
    ...variables
  };
  
  // Replace all variables (case-insensitive, handle spaces)
  Object.keys(defaultVars).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    result = result.replace(regex, String(defaultVars[key] || ''));
  });
  
  // Force replace any remaining logoUrl variations (multiple passes to catch all)
  // Replace with actual URL
  result = result.replace(/\{\{\s*logoUrl\s*\}\}/gi, logoUrl);
  result = result.replace(/\{\{\s*logo_url\s*\}\}/gi, logoUrl);
  result = result.replace(/\{\{\s*LOGO_URL\s*\}\}/gi, logoUrl);
  result = result.replace(/\{\{logoUrl\}\}/gi, logoUrl);
  result = result.replace(/\{\{logo_url\}\}/gi, logoUrl);
  result = result.replace(/\{\{LOGO_URL\}\}/gi, logoUrl);
  
  // Replace any CID references with actual URL
  result = result.replace(/cid:solitaire-logo/gi, logoUrl);
  
  // Also replace any base64 logo URLs that might already be in the template
  const LOGO_SVG_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzE2IiBoZWlnaHQ9IjExMCIgdmlld0JveD0iMCAwIDMxNiAxMTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+';
  if (result.includes(LOGO_SVG_BASE64.substring(0, 50))) {
    // Find and replace base64 logo patterns
    const base64Pattern = /data:image\/svg\+xml;base64,[^"'\s>]+/gi;
    result = result.replace(base64Pattern, logoUrl);
  }
  
  // Fix common issue: replace companyEmail in href attributes with dashboardUrl
  // This handles cases where templates incorrectly use {{companyEmail}} as a URL
  result = result.replace(/href=["']\{\{\s*companyEmail\s*\}\}["']/gi, `href="${dashboardUrl}"`);
  result = result.replace(/href=["']\{\{companyEmail\}\}["']/gi, `href="${dashboardUrl}"`);
  
  // Also replace dashboardUrl variations
  result = result.replace(/\{\{\s*dashboardUrl\s*\}\}/gi, dashboardUrl);
  result = result.replace(/\{\{\s*dashboard_url\s*\}\}/gi, dashboardUrl);
  result = result.replace(/\{\{\s*DASHBOARD_URL\s*\}\}/gi, dashboardUrl);
  result = result.replace(/\{\{dashboardUrl\}\}/gi, dashboardUrl);
  result = result.replace(/\{\{dashboard_url\}\}/gi, dashboardUrl);
  result = result.replace(/\{\{DASHBOARD_URL\}\}/gi, dashboardUrl);
  
  // CRITICAL: Replace all hardcoded wrong URLs with correct dashboard URL
  // Replace any solitairemarkets.me URLs (wrong domain) with correct dashboard URL
  result = result.replace(/https?:\/\/solitairemarkets\.me\/[^"'\s>]*/gi, dashboardUrl);
  result = result.replace(/https?:\/\/www\.solitairemarkets\.me\/[^"'\s>]*/gi, dashboardUrl);
  
  // Replace any "View Dashboard" or similar links that might have wrong URLs
  // Look for common link patterns with wrong domains
  result = result.replace(/href=["']https?:\/\/solitairemarkets\.me[^"']*["']/gi, `href="${dashboardUrl}"`);
  result = result.replace(/href=["']https?:\/\/www\.solitairemarkets\.me[^"']*["']/gi, `href="${dashboardUrl}"`);
  
  // Also replace any localhost URLs that might be in templates
  result = result.replace(/href=["']https?:\/\/localhost[^"']*["']/gi, `href="${dashboardUrl}"`);
  
  // Replace any href attributes that contain "dashboard" but have wrong domain
  result = result.replace(/href=["']([^"']*solitairemarkets\.me[^"']*dashboard[^"']*)["']/gi, `href="${dashboardUrl}"`);
  
  // Ensure logo is always present - check if logo image exists in HTML
  const hasLogoImg = /<img[^>]*src[^>]*>/i.test(result) && 
                    (result.toLowerCase().includes('logo') || result.toLowerCase().includes('solitaire') || result.includes(logoUrl));
  
  if (!hasLogoImg) {
    console.log('📧 No logo detected in template, injecting logo with URL...');
    // Try to inject logo after <body> tag or at the beginning
    const bodyMatch = result.match(/<body[^>]*>/i);
    if (bodyMatch) {
      const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
        <img src="${logoUrl}" alt="Solitaire Markets" style="height: 60px; max-width: 250px; display: block; margin: 0 auto;" />
      </div>`;
      result = result.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
    } else {
      // If no body tag, add at the very beginning
      result = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
        <img src="${logoUrl}" alt="Solitaire Markets" style="height: 60px; max-width: 250px; display: block; margin: 0 auto;" />
      </div>` + result;
    }
  } else {
    // Verify logo URL is actually replaced (not still a placeholder)
    const logoPlaceholderRegex = /\{\{.*logo.*\}\}/i;
    if (logoPlaceholderRegex.test(result)) {
      console.warn('⚠️ Logo placeholder still found after replacement, forcing replacement...');
      result = result.replace(/\{\{.*logo.*\}\}/gi, logoUrl);
    }
    // Replace any CID references with actual URL
    result = result.replace(/cid:solitaire-logo/gi, logoUrl);
  }
  
  return result;
}

/**
 * Send email using a template from the database
 * @param {string} templateName - Name of the template
 * @param {string} recipientEmail - Recipient email address
 * @param {object} variables - Variables to replace in template
 * @param {string} customSubject - Optional custom subject (overrides template)
 * @returns {Promise<object>} - Send result
 */
export async function sendTemplateEmail(templateName, recipientEmail, variables = {}, customSubject = null) {
  try {
    // Get template from database
    const template = await getTemplateByName(templateName);
    
    if (!template) {
      console.warn(`Template "${templateName}" not found in database. Sending basic email.`);
      // Fallback to basic email
      const logoUrl = getLogoUrl();
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f7fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="${logoUrl}" alt="Solitaire Markets" style="height: 60px; max-width: 250px;" />
            </div>
            <div style="color: #1f2937;">
              ${variables.content || 'You have received a notification from Solitaire Markets.'}
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 13px;">
              © ${new Date().getFullYear()} Solitaire Markets. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `;
      
      return await sendEmail({
        to: recipientEmail,
        subject: customSubject || templateName,
        html,
        includeLogo: true
      });
    }
    
    // Replace variables in template
    let htmlContent = replaceTemplateVariables(template.html_code, variables);
    
    // Final check: ensure logo is present and properly replaced with actual URL
    const logoUrl = getLogoUrl(); // Returns: https://portal.solitairemarkets.com/logo.svg
    const logoPlaceholderRegex = /\{\{.*logo.*\}\}/i;
    if (logoPlaceholderRegex.test(htmlContent)) {
      console.warn(`⚠️ Logo placeholder still found in template "${templateName}", forcing replacement...`);
      htmlContent = htmlContent.replace(/\{\{.*logo.*\}\}/gi, logoUrl);
    }
    
    // Replace any CID references with actual URL
    htmlContent = htmlContent.replace(/cid:solitaire-logo/gi, logoUrl);
    
    // Replace any base64 logo URLs with actual URL
    const base64Pattern = /data:image\/svg\+xml;base64,[^"'\s>]+/gi;
    htmlContent = htmlContent.replace(base64Pattern, logoUrl);
    
    // Verify logo is actually in the HTML (check for URL or logo image tag)
    const hasActualLogo = htmlContent.includes(logoUrl) || 
                         (/<img[^>]*src[^>]*>/i.test(htmlContent) && (htmlContent.toLowerCase().includes('logo') || htmlContent.toLowerCase().includes('solitaire')));
    if (!hasActualLogo) {
      console.warn(`⚠️ Logo not found in final HTML for template "${templateName}", injecting with URL...`);
      const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
        <img src="${logoUrl}" alt="Solitaire Markets" style="height: 60px; max-width: 250px; display: block; margin: 0 auto;" />
      </div>`;
      const bodyMatch = htmlContent.match(/<body[^>]*>/i);
      if (bodyMatch) {
        htmlContent = htmlContent.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
      } else {
        htmlContent = logoHtml + htmlContent;
      }
    }
    
    // Determine subject
    const subject = customSubject || template.name;
    
    // Debug: Log logo status for troubleshooting
    console.log(`📧 Sending email "${templateName}" to ${recipientEmail}`);
    console.log(`📧 Logo URL: ${logoUrl}`);
    
    // Send email with logo URL
    return await sendEmail({
      to: recipientEmail,
      subject,
      html: htmlContent,
      includeLogo: true // This will ensure logo is present
    });
    
  } catch (error) {
    console.error(`Error sending template email "${templateName}":`, error);
    throw error;
  }
}

/**
 * Send Welcome Email on account creation
 * Uses action_type: 'account_creation' if assigned, otherwise falls back to name 'Welcome Email'
 */
export async function sendWelcomeEmail(userEmail, userName) {
  return await sendTemplateEmail(
    'account_creation', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      recipientEmail: userEmail
    }
  );
}

/**
 * Send MT5 Account Created Email
 * Uses action_type: 'mt5_account_created' if assigned, otherwise falls back to name 'MT5 Account Created'
 */
export async function sendMT5AccountCreatedEmail(userEmail, userName, accountType, login, password) {
  return await sendTemplateEmail(
    'mt5_account_created', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      accountType: accountType || 'Standard',
      login: login || '',
      password: password || ''
    }
  );
}

/**
 * Send Deposit Request Created Email
 * Uses action_type: 'deposit_request' if assigned, otherwise falls back to name 'Deposit Request Created'
 */
export async function sendDepositRequestEmail(userEmail, userName, accountLogin, amount, date) {
  return await sendTemplateEmail(
    'deposit_request', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      accountLogin: accountLogin || '',
      amount: amount || '0.00',
      date: date || new Date().toLocaleDateString()
    }
  );
}

/**
 * Send Withdrawal Request Created Email
 * Uses action_type: 'withdrawal_request' if assigned, otherwise falls back to name 'Withdrawal Request Created'
 */
export async function sendWithdrawalRequestEmail(userEmail, userName, accountLogin, amount, date) {
  return await sendTemplateEmail(
    'withdrawal_request', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      accountLogin: accountLogin || '',
      amount: amount || '0.00',
      date: date || new Date().toLocaleDateString()
    }
  );
}

/**
 * Send Transaction Completed Email (Deposit/Withdrawal)
 * Uses action_type: 'transaction_completed' if assigned, otherwise falls back to name 'Transaction Completed'
 */
export async function sendTransactionCompletedEmail(userEmail, userName, transactionType, accountLogin, amount, date) {
  return await sendTemplateEmail(
    'transaction_completed', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      transactionType: transactionType || 'Transaction',
      accountLogin: accountLogin || '',
      amount: amount || '0.00',
      date: date || new Date().toLocaleDateString()
    }
  );
}

/**
 * Send Internal Transfer Completed Email
 * Uses action_type: 'internal_transfer' if assigned, otherwise falls back to name 'Internal Transfer Completed'
 */
export async function sendInternalTransferEmail(userEmail, userName, fromAccount, toAccount, amount, date) {
  return await sendTemplateEmail(
    'internal_transfer', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      fromAccount: fromAccount || '',
      toAccount: toAccount || '',
      amount: amount || '0.00',
      date: date || new Date().toLocaleDateString()
    }
  );
}

/**
 * Send OTP Verification Email
 * Uses action_type: 'otp_verification' if assigned, otherwise falls back to name 'OTP Verification'
 */
export async function sendOTPVerificationEmail(userEmail, userName, otp, verificationMessage) {
  return await sendTemplateEmail(
    'otp_verification', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'User',
      otp: otp || '',
      verificationMessage: verificationMessage || 'Please use this code to verify your request.'
    }
  );
}

/**
 * Send KYC Completion Email
 * Uses action_type: 'kyc_completed' if assigned, otherwise falls back to name 'Transaction Completed'
 */
export async function sendKYCCompletionEmail(userEmail, userName) {
  return await sendTemplateEmail(
    'kyc_completed', // Try action_type first
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      transactionType: 'KYC Verification',
      accountLogin: 'N/A',
      amount: 'N/A',
      date: new Date().toLocaleDateString(),
      content: 'Your KYC verification has been completed and approved. You now have full access to all platform features.'
    },
    'KYC Verification Completed'
  );
}

/**
 * Send Ticket Created Email
 */
/**
 * Send Ticket Created Email (when user creates a ticket)
 * Uses ticket template from DB:
 *  - Prefer template with email_type = 'ticket_created'
 *  - Fallback to template with name = 'Ticket Created'
 */
export async function sendTicketCreatedEmail(userEmail, userName, ticketId, subject, category = 'General', priority = 'medium') {
  return await sendTemplateEmail(
    'ticket_created', // Try action_type first, then email_type, then name
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      ticketId,
      ticketSubject: subject,
      ticketCategory: category,
      ticketPriority: priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Medium',
      ticketDate: new Date().toLocaleDateString(),
      logoUrl: getLogoUrl(),
      dashboardUrl: `${process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com'}/user/dashboard`,
      currentYear: new Date().getFullYear()
    },
    `Support Ticket #${ticketId} Created`
  );
}

/**
 * Send Ticket Response Email (when admin replies)
 * Uses ticket template from DB:
 *  - Prefer template with email_type = 'ticket_response'
 *  - Fallback to template with name = 'Ticket Response'
 */
export async function sendTicketResponseEmail(userEmail, userName, ticketId, subject, adminMessage, ticketStatus = 'Open') {
  return await sendTemplateEmail(
    'ticket_response', // Try action_type first, then email_type, then name
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      ticketId,
      ticketSubject: subject,
      ticketStatus: ticketStatus ? ticketStatus.charAt(0).toUpperCase() + ticketStatus.slice(1) : 'Open',
      adminMessage: adminMessage || 'Please check your dashboard for the full response.',
      logoUrl: getLogoUrl(),
      dashboardUrl: `${process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com'}/user/dashboard`,
      currentYear: new Date().getFullYear()
    },
    `Response on Support Ticket #${ticketId}`
  );
}

