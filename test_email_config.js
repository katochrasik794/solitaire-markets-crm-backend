import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

console.log('\n=== EMAIL CONFIGURATION TEST ===\n');

// Check environment variables
console.log('1. Checking environment variables...');
const emailHost = process.env.EMAIL_HOST;
const emailPort = process.env.EMAIL_PORT || '587';
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailFrom = process.env.EMAIL_FROM || 'no_reply@solitairemarkets.me';

console.log('   EMAIL_HOST:', emailHost || '❌ NOT SET');
console.log('   EMAIL_PORT:', emailPort);
console.log('   EMAIL_USER:', emailUser || '❌ NOT SET');
console.log('   EMAIL_PASS:', emailPass ? `${emailPass.substring(0, 5)}...${emailPass.substring(emailPass.length - 3)} (${emailPass.length} chars)` : '❌ NOT SET');
console.log('   EMAIL_FROM:', emailFrom);

if (!emailHost || !emailUser || !emailPass) {
  console.log('\n❌ ERROR: Missing required environment variables!');
  console.log('   Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS in your .env file.');
  process.exit(1);
}

// Validate SendGrid format
if (emailHost.includes('sendgrid')) {
  console.log('\n2. Validating SendGrid configuration...');
  if (emailUser !== 'apikey') {
    console.log('   ⚠️  WARNING: EMAIL_USER should be "apikey" for SendGrid');
  } else {
    console.log('   ✅ EMAIL_USER is correct ("apikey")');
  }
  
  if (!emailPass.startsWith('SG.')) {
    console.log('   ⚠️  WARNING: SendGrid API key should start with "SG."');
    console.log('   Your key starts with:', emailPass.substring(0, 5));
  } else {
    console.log('   ✅ API key format looks correct (starts with "SG.")');
  }
  
  if (emailPass.length < 50) {
    console.log('   ⚠️  WARNING: API key seems too short (should be ~69 characters)');
  } else {
    console.log('   ✅ API key length looks correct');
  }
}

// Test SMTP connection
console.log('\n3. Testing SMTP connection...');
const transporter = nodemailer.createTransport({
  host: emailHost,
  port: parseInt(emailPort),
  secure: emailPort === '465',
  auth: {
    user: emailUser.trim(),
    pass: emailPass.trim(),
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

try {
  await transporter.verify();
  console.log('   ✅ SMTP connection successful!');
  console.log('   ✅ Authentication successful!');
  console.log('\n✅ All checks passed! Your email configuration is correct.\n');
} catch (error) {
  console.log('   ❌ SMTP connection failed!');
  console.log('\n   Error details:');
  console.log('   - Code:', error.code);
  console.log('   - Message:', error.message);
  console.log('   - Response:', error.response);
  console.log('   - Response Code:', error.responseCode);
  
  if (error.code === 'EAUTH' || error.responseCode === 535) {
    console.log('\n   🔧 TROUBLESHOOTING:');
    console.log('   1. Check that EMAIL_USER is exactly "apikey" (for SendGrid)');
    console.log('   2. Check that EMAIL_PASS is your full SendGrid API key');
    console.log('   3. Go to SendGrid Dashboard → Settings → API Keys');
    console.log('   4. Make sure your API key is active and has "Mail Send" permissions');
    console.log('   5. If the key is expired/revoked, create a new one');
    console.log('   6. Copy the FULL key (starts with SG. and is ~69 characters)');
    console.log('   7. Make sure there are no extra spaces or quotes in your .env file');
  } else if (error.code === 'ECONNECTION') {
    console.log('\n   🔧 TROUBLESHOOTING:');
    console.log('   1. Check that EMAIL_HOST is correct (smtp.sendgrid.net for SendGrid)');
    console.log('   2. Check that EMAIL_PORT is correct (587 for SendGrid)');
    console.log('   3. Check your internet connection');
    console.log('   4. Check if firewall is blocking the connection');
  }
  
  console.log('\n❌ Email configuration test failed!\n');
  process.exit(1);
}

