import dotenv from 'dotenv';
import pkg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pkg;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
});

async function addCregisGateway() {
  try {
    console.log('🔄 Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Check if gateway already exists
    const checkResult = await pool.query(
      `SELECT id, wallet_name FROM auto_gateway 
       WHERE wallet_name ILIKE '%cregis%' OR wallet_name ILIKE '%USDT TRC20%' 
       OR (project_id IS NOT NULL AND api_key IS NOT NULL)`
    );

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Cregis gateway already exists:');
      checkResult.rows.forEach(row => {
        console.log(`   - ID: ${row.id}, Name: ${row.wallet_name}`);
      });
      console.log('\n💡 If you want to add a new one, please use a different name or delete the existing one first.');
      process.exit(0);
    }

    // Get values from environment or use defaults
    const walletName = process.env.CREGIS_WALLET_NAME || 'USDT TRC20';
    const apiKey = process.env.CREGIS_API_KEY || '0794b200b7d34acca7c06a72ee2cf58c';
    const secretKey = process.env.CREGIS_SECRET_KEY || '';
    const projectId = process.env.CREGIS_PROJECT_ID || '1445920661479424';
    const gatewayUrl = process.env.CREGIS_GATEWAY_URL || 'https://t-fumzndoo.cregis.io';
    const webhookSecret = process.env.CREGIS_WEBHOOK_SECRET || '';

    console.log('\n📝 Adding Cregis gateway with the following configuration:');
    console.log(`   Wallet Name: ${walletName}`);
    console.log(`   Gateway Type: Cryptocurrency`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Gateway URL: ${gatewayUrl}`);
    console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
    console.log(`   Secret Key: ${secretKey ? secretKey.substring(0, 10) + '...' : '(not set)'}`);
    console.log(`   Webhook Secret: ${webhookSecret ? webhookSecret.substring(0, 10) + '...' : '(not set)'}`);

    // Insert the gateway
    const result = await pool.query(
      `INSERT INTO auto_gateway 
       (wallet_name, gateway_type, api_key, secret_key, project_id, gateway_url, webhook_secret, description, is_active, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, wallet_name, gateway_type, is_active`,
      [
        walletName,
        'Cryptocurrency',
        apiKey,
        secretKey,
        projectId,
        gatewayUrl,
        webhookSecret,
        'Cregis USDT TRC20 payment gateway',
        true,
        0
      ]
    );

    const gateway = result.rows[0];
    console.log('\n✅ Cregis gateway added successfully!');
    console.log(`   ID: ${gateway.id}`);
    console.log(`   Name: ${gateway.wallet_name}`);
    console.log(`   Type: ${gateway.gateway_type}`);
    console.log(`   Active: ${gateway.is_active}`);
    console.log('\n🎉 Gateway is ready to use!');

  } catch (error) {
    console.error('❌ Error adding Cregis gateway:', error.message);
    if (error.code === '42P01') {
      console.error('\n💡 The auto_gateway table does not exist. Please run the migration first:');
      console.error('   node scripts/run-migrations.js');
    } else if (error.code === '23505') {
      console.error('\n💡 A gateway with this configuration already exists.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
addCregisGateway();

