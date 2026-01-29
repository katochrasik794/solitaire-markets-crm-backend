/**
 * Script to verify all CRM transaction email actions and templates are properly set up
 * Run with: node scripts/verify_crm_transaction_emails.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function verifySetup() {
    try {
        console.log('🔍 Verifying CRM transaction email setup...\n');

        const result = await pool.query(`
            SELECT 
                ua.action_name,
                ua.system_type,
                ua.template_id,
                et.name as template_name,
                CASE 
                    WHEN ua.template_id IS NULL THEN '❌ Missing Template'
                    WHEN et.id IS NULL THEN '⚠️  Template Not Found'
                    ELSE '✅ Assigned'
                END as status
            FROM unified_actions ua
            LEFT JOIN email_templates et ON ua.template_id = et.id
            WHERE ua.action_name LIKE '%Deposit%' 
               OR ua.action_name LIKE '%Withdrawal%'
            ORDER BY 
                CASE 
                    WHEN ua.action_name LIKE 'Deposit%' THEN 1
                    WHEN ua.action_name LIKE 'Withdrawal%' THEN 2
                    WHEN ua.action_name LIKE 'IB%' THEN 3
                    ELSE 4
                END,
                ua.action_name
        `);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 CRM Transaction Email Actions Status:\n');

        let allGood = true;
        const depositActions = [];
        const withdrawalActions = [];
        const ibActions = [];

        result.rows.forEach(row => {
            const status = row.status;
            if (status !== '✅ Assigned') {
                allGood = false;
            }

            const actionInfo = {
                action: row.action_name,
                systemType: row.system_type,
                templateId: row.template_id,
                templateName: row.template_name,
                status: status
            };

            if (row.action_name.includes('IB')) {
                ibActions.push(actionInfo);
            } else if (row.action_name.includes('Deposit')) {
                depositActions.push(actionInfo);
            } else if (row.action_name.includes('Withdrawal')) {
                withdrawalActions.push(actionInfo);
            }
        });

        console.log('💰 DEPOSIT ACTIONS:');
        depositActions.forEach(a => {
            console.log(`   ${a.status} ${a.action} [${a.systemType}]`);
            if (a.templateName) {
                console.log(`      └─ Template: ${a.templateName} (ID: ${a.templateId})`);
            }
        });

        console.log('\n💸 WITHDRAWAL ACTIONS:');
        withdrawalActions.forEach(a => {
            console.log(`   ${a.status} ${a.action} [${a.systemType}]`);
            if (a.templateName) {
                console.log(`      └─ Template: ${a.templateName} (ID: ${a.templateId})`);
            }
        });

        console.log('\n🤝 IB WITHDRAWAL ACTIONS:');
        ibActions.forEach(a => {
            console.log(`   ${a.status} ${a.action} [${a.systemType}]`);
            if (a.templateName) {
                console.log(`      └─ Template: ${a.templateName} (ID: ${a.templateId})`);
            }
        });

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (allGood) {
            console.log('✅ All CRM transaction email actions have templates assigned!');
        } else {
            console.log('⚠️  Some actions are missing templates. Please check above.');
        }
        
        console.log(`\n📊 Total Actions: ${result.rows.length}`);
        console.log(`✅ Assigned: ${result.rows.filter(r => r.status === '✅ Assigned').length}`);
        console.log(`❌ Missing: ${result.rows.filter(r => r.status === '❌ Missing Template').length}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await pool.end();
        process.exit(allGood ? 0 : 1);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await pool.end();
        process.exit(1);
    }
}

verifySetup();
