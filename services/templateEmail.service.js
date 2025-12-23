/**
 * Email Service using Templates from Admin Panel
 * This service sends emails using templates stored in the email_templates table
 */

import pool from '../config/database.js';
import { sendEmail, getLogoUrl } from './email.js';

/**
 * Get template by name from database
 * @param {string} templateName - Name of the template
 * @returns {Promise<object|null>} - Template object or null
 */
async function getTemplateByName(templateName) {
  try {
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1 LIMIT 1',
      [templateName]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error(`Error fetching template "${templateName}":`, error);
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
  const logoUrl = getLogoUrl();
  
  // Default variables
  const defaultVars = {
    logoUrl: logoUrl,
    companyName: 'Solitaire Markets',
    companyEmail: 'support@solitairemarkets.me',
    currentYear: new Date().getFullYear(),
    ...variables
  };
  
  // Replace all variables (case-insensitive, handle spaces)
  Object.keys(defaultVars).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    result = result.replace(regex, String(defaultVars[key] || ''));
  });
  
  // Force replace any remaining logoUrl variations (multiple passes to catch all)
  result = result.replace(/\{\{\s*logoUrl\s*\}\}/gi, logoUrl);
  result = result.replace(/\{\{\s*logo_url\s*\}\}/gi, logoUrl);
  result = result.replace(/\{\{\s*LOGO_URL\s*\}\}/gi, logoUrl);
  result = result.replace(/\{\{logoUrl\}\}/gi, logoUrl);
  result = result.replace(/\{\{logo_url\}\}/gi, logoUrl);
  result = result.replace(/\{\{LOGO_URL\}\}/gi, logoUrl);
  
  // Ensure logo is always present - check if logo image exists in HTML
  const hasLogoImg = /<img[^>]*src[^>]*>/i.test(result) && 
                    (result.includes('logo') || result.includes('Logo') || result.includes(logoUrl) || result.includes('data:image'));
  
  if (!hasLogoImg) {
    console.log('📧 No logo detected in template, injecting logo...');
    // Try to inject logo after <body> tag or at the beginning
    const bodyMatch = result.match(/<body[^>]*>/i);
    if (bodyMatch) {
      const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0; background-color: #f5f7fa;">
        <img src="${logoUrl}" alt="Solitaire Markets" style="height: 60px; max-width: 250px; display: block; margin: 0 auto;" />
      </div>`;
      result = result.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
    } else {
      // If no body tag, add at the very beginning
      result = `<div style="text-align: center; margin: 20px 0; padding: 20px 0; background-color: #f5f7fa;">
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
    
    // Final check: ensure logo is present and properly replaced
    const logoUrl = getLogoUrl();
    const logoPlaceholderRegex = /\{\{.*logo.*\}\}/i;
    if (logoPlaceholderRegex.test(htmlContent)) {
      console.warn(`⚠️ Logo placeholder still found in template "${templateName}", forcing replacement...`);
      // Use CID reference instead of base64 for better email client support
      htmlContent = htmlContent.replace(/\{\{.*logo.*\}\}/gi, 'cid:solitaire-logo');
    }
    
    // Replace any base64 logo URLs with CID reference for better compatibility
    if (htmlContent.includes(logoUrl)) {
      htmlContent = htmlContent.replace(new RegExp(logoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'cid:solitaire-logo');
      console.log(`📧 Replaced base64 logo with CID reference in template "${templateName}"`);
    }
    
    // Verify logo is actually in the HTML (either as CID, base64, or URL)
    const hasActualLogo = htmlContent.includes('cid:solitaire-logo') || htmlContent.includes(logoUrl) || htmlContent.includes('data:image/svg+xml') || htmlContent.includes('data:image/png');
    if (!hasActualLogo) {
      console.warn(`⚠️ Logo not found in final HTML for template "${templateName}", injecting...`);
      const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
        <img src="cid:solitaire-logo" alt="Solitaire Markets" style="height: 60px; max-width: 250px; display: block; margin: 0 auto;" />
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
    const usesCid = htmlContent.includes('cid:solitaire-logo');
    console.log(`📧 Logo method: ${usesCid ? 'CID attachment (recommended)' : 'Base64 data URI'}`);
    
    // Send email with logo attachment
    return await sendEmail({
      to: recipientEmail,
      subject,
      html: htmlContent,
      includeLogo: true // This will attach the logo file and use CID reference
    });
    
  } catch (error) {
    console.error(`Error sending template email "${templateName}":`, error);
    throw error;
  }
}

/**
 * Send Welcome Email on account creation
 */
export async function sendWelcomeEmail(userEmail, userName) {
  return await sendTemplateEmail(
    'Welcome Email',
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      recipientEmail: userEmail
    }
  );
}

/**
 * Send MT5 Account Created Email
 */
export async function sendMT5AccountCreatedEmail(userEmail, userName, accountType, login, password) {
  return await sendTemplateEmail(
    'MT5 Account Created',
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
 */
export async function sendDepositRequestEmail(userEmail, userName, accountLogin, amount, date) {
  return await sendTemplateEmail(
    'Deposit Request Created',
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
 */
export async function sendWithdrawalRequestEmail(userEmail, userName, accountLogin, amount, date) {
  return await sendTemplateEmail(
    'Withdrawal Request Created',
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
 */
export async function sendTransactionCompletedEmail(userEmail, userName, transactionType, accountLogin, amount, date) {
  return await sendTemplateEmail(
    'Transaction Completed',
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
 */
export async function sendInternalTransferEmail(userEmail, userName, fromAccount, toAccount, amount, date) {
  return await sendTemplateEmail(
    'Internal Transfer Completed',
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
 */
export async function sendOTPVerificationEmail(userEmail, userName, otp, verificationMessage) {
  return await sendTemplateEmail(
    'OTP Verification',
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
 */
export async function sendKYCCompletionEmail(userEmail, userName) {
  // Use Transaction Completed template or create a custom message
  return await sendTemplateEmail(
    'Transaction Completed',
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
export async function sendTicketCreatedEmail(userEmail, userName, ticketId, subject) {
  return await sendTemplateEmail(
    'Transaction Completed',
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      transactionType: 'Support Ticket',
      accountLogin: `Ticket #${ticketId}`,
      amount: 'N/A',
      date: new Date().toLocaleDateString(),
      content: `You have opened a support ticket: "${subject}". Our support team will respond to you shortly.`
    },
    `Support Ticket #${ticketId} Created`
  );
}

/**
 * Send Ticket Response Email (when admin replies)
 */
export async function sendTicketResponseEmail(userEmail, userName, ticketId, subject, adminMessage) {
  return await sendTemplateEmail(
    'Transaction Completed',
    userEmail,
    {
      recipientName: userName || 'Valued Customer',
      transactionType: 'Support Response',
      accountLogin: `Ticket #${ticketId}`,
      amount: 'N/A',
      date: new Date().toLocaleDateString(),
      content: `You have received a response on your support ticket #${ticketId}: "${subject}".<br><br><strong>Response:</strong><br>${adminMessage || 'Please check your dashboard for the full response.'}`
    },
    `Response on Support Ticket #${ticketId}`
  );
}

