/**
 * Script to standardize all email templates to use the same header and footer
 * Uses the same structure as bonus email templates
 * Run with: node scripts/standardize_email_templates_header_footer.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Solitaire Markets Branding (same as bonus templates)
const BRAND_NAME = 'Solitaire Markets';
const PRIMARY_COLOR = '#D4AF37'; // Gold
const HEADER_GRADIENT = 'linear-gradient(135deg, #34495e 0%, #2c3e50 50%, #1a252f 100%)';
const COMPANY_EMAIL = 'support@solitairemarkets.me';

// Standard header HTML (same as bonus email)
const STANDARD_HEADER = `
          <!-- Header with Logo -->
          <tr>
            <td style="background: ${HEADER_GRADIENT}; padding: 40px 30px; text-align: center;">
              <img src="{{logoUrl}}" alt="${BRAND_NAME}" style="height: 60px; max-width: 250px; display: block; margin: 0 auto 20px auto;" />
              <div style="font-size: 28px; font-weight: 700; color: ${PRIMARY_COLOR}; margin: 0; line-height: 1.2;">
                ${BRAND_NAME}
              </div>
            </td>
          </tr>`;

// Standard footer HTML (same as bonus email)
const STANDARD_FOOTER = `
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px 0; line-height: 1.5;">
                © {{currentYear}} ${BRAND_NAME}. All rights reserved.<br>
                <a href="mailto:${COMPANY_EMAIL}" style="color: ${PRIMARY_COLOR}; text-decoration: none;">${COMPANY_EMAIL}</a>
              </p>
              <p style="font-size: 11px; color: #9ca3af; margin: 0; line-height: 1.6; max-width: 560px; margin-left: auto; margin-right: auto;">
                <strong>Risk Warning:</strong> Trading in financial instruments involves a significant risk of loss. Past performance is not indicative of future results. Only invest capital that you can afford to lose. Before trading, please ensure you fully understand the risks involved and seek independent advice if necessary. ${BRAND_NAME} is not responsible for any losses incurred as a result of trading decisions.
              </p>
            </td>
          </tr>`;

// Standard wrapper structure
const STANDARD_WRAPPER_START = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{title}} - ${BRAND_NAME}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">`;

const STANDARD_WRAPPER_END = `
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Extract body content from existing template HTML
 */
function extractBodyContent(html) {
  // Try multiple patterns to extract the main content area
  
  // Pattern 1: Look for content between "Main Content" comment and footer
  const pattern1 = /<!-- Main Content -->[\s\S]*?<tr>[\s\S]*?<td[^>]*style="padding:[^"]*">([\s\S]*?)<\/td>[\s\S]*?<\/tr>[\s\S]*?(?:<!-- Footer -->|<!-- \/Footer -->)/i;
  let match = html.match(pattern1);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Pattern 2: Look for td with padding 40px 30px (standard content area)
  const pattern2 = /<td[^>]*style="padding:\s*40px\s+30px[^"]*">([\s\S]*?)<\/td>/i;
  match = html.match(pattern2);
  if (match && match[1]) {
    // Check if this is actually content (not header/footer)
    const content = match[1];
    if (!content.includes('{{logoUrl}}') && 
        !content.includes('Risk Warning') && 
        !content.includes('All rights reserved')) {
      return content.trim();
    }
  }

  // Pattern 3: Extract everything between header and footer by finding table rows
  const headerEnd = html.indexOf('<!-- Main Content -->');
  const footerStart = html.indexOf('<!-- Footer -->');
  
  if (headerEnd !== -1 && footerStart !== -1 && footerStart > headerEnd) {
    const contentSection = html.substring(headerEnd, footerStart);
    const tdMatch = contentSection.match(/<td[^>]*style="padding:[^"]*">([\s\S]*?)<\/td>/i);
    if (tdMatch && tdMatch[1]) {
      const extracted = tdMatch[1].trim();
      // Verify it's actual content
      if (!extracted.includes('{{logoUrl}}') && 
          !extracted.includes('Risk Warning') && 
          extracted.length > 50) {
        return extracted;
      }
    }
  }

  // Pattern 4: Try to find the main content table cell by structure
  const tableRows = html.match(/<tr>[\s\S]*?<\/tr>/gi);
  if (tableRows && tableRows.length >= 3) {
    // Usually: row 0 = header, row 1 = content, row 2 = footer
    const contentRow = tableRows[1];
    if (contentRow) {
      const tdMatch = contentRow.match(/<td[^>]*style="padding:[^"]*">([\s\S]*?)<\/td>/i);
      if (tdMatch && tdMatch[1]) {
        const extracted = tdMatch[1].trim();
        if (!extracted.includes('{{logoUrl}}') && 
            !extracted.includes('Risk Warning') && 
            extracted.length > 50) {
          return extracted;
        }
      }
    }
  }

  // Fallback: try to extract content between body tags
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    let content = bodyMatch[1];
    // Remove header sections
    content = content.replace(/<!-- Header[\s\S]*?<!-- \/Header -->/gi, '');
    content = content.replace(/<tr>[\s\S]*?Header[\s\S]*?<\/tr>/gi, '');
    content = content.replace(/<tr>[\s\S]*?{{logoUrl}}[\s\S]*?<\/tr>/gi, '');
    // Remove footer sections
    content = content.replace(/<!-- Footer[\s\S]*?<!-- \/Footer -->/gi, '');
    content = content.replace(/<tr>[\s\S]*?Footer[\s\S]*?<\/tr>/gi, '');
    content = content.replace(/<tr>[\s\S]*?Risk Warning[\s\S]*?<\/tr>/gi, '');
    content = content.replace(/<tr>[\s\S]*?All rights reserved[\s\S]*?<\/tr>/gi, '');
    
    // Extract the main td content
    const finalMatch = content.match(/<td[^>]*style="padding:[^"]*">([\s\S]*?)<\/td>/i);
    if (finalMatch && finalMatch[1]) {
      return finalMatch[1].trim();
    }
    
    return content.trim();
  }

  return null;
}

/**
 * Rebuild template with standard header and footer
 */
function rebuildTemplateWithStandardStructure(html, templateName) {
  // Extract body content
  const bodyContent = extractBodyContent(html);
  
  if (!bodyContent) {
    console.warn(`⚠️  Could not extract body content from template "${templateName}", keeping original`);
    return html;
  }

  // Rebuild with standard structure
  const rebuiltHtml = STANDARD_WRAPPER_START + 
    STANDARD_HEADER +
    `
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${bodyContent}
            </td>
          </tr>` +
    STANDARD_FOOTER +
    STANDARD_WRAPPER_END;

  return rebuiltHtml;
}

/**
 * Check if template already has standard header/footer
 */
function hasStandardStructure(html) {
  const hasStandardHeader = html.includes('background: linear-gradient(135deg, #34495e 0%, #2c3e50 50%, #1a252f 100%)') &&
                            html.includes('{{logoUrl}}') &&
                            html.includes('font-size: 28px; font-weight: 700; color: #D4AF37');
  
  const hasStandardFooter = html.includes('Risk Warning:') &&
                            html.includes('Trading in financial instruments involves a significant risk of loss') &&
                            html.includes('support@solitairemarkets.me');

  return hasStandardHeader && hasStandardFooter;
}

async function standardizeAllTemplates() {
  try {
    console.log('🚀 Starting email template standardization...\n');

    // Get all email templates
    const templatesResult = await pool.query(
      'SELECT id, name, html_code FROM email_templates ORDER BY id'
    );

    const templates = templatesResult.rows;
    console.log(`📧 Found ${templates.length} email templates to check\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const template of templates) {
      console.log(`📝 Checking template: "${template.name}" (ID: ${template.id})`);

      // Check if already has standard structure
      if (hasStandardStructure(template.html_code)) {
        console.log(`   ✅ Already has standard header/footer structure\n`);
        skippedCount++;
        continue;
      }

      // Rebuild with standard structure
      const rebuiltHtml = rebuildTemplateWithStandardStructure(template.html_code, template.name);

      if (rebuiltHtml === template.html_code) {
        console.log(`   ⚠️  Could not rebuild, keeping original\n`);
        skippedCount++;
        continue;
      }

      // Update template
      await pool.query(
        `UPDATE email_templates 
         SET html_code = $1, updated_at = NOW()
         WHERE id = $2`,
        [rebuiltHtml, template.id]
      );

      console.log(`   ✅ Updated with standard header/footer structure\n`);
      updatedCount++;
    }

    console.log('\n✅ Template standardization completed!');
    console.log(`   Updated: ${updatedCount} templates`);
    console.log(`   Skipped: ${skippedCount} templates (already standardized or couldn't extract body)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error standardizing templates:', error);
    process.exit(1);
  }
}

standardizeAllTemplates();
