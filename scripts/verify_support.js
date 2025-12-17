import pg from 'pg';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function verify() {
    console.log('🔍 Starting Support System Verification...');

    // 1. Check Database
    const client = await pool.connect();
    try {
        console.log('✅ Database connected.');

        // Check tickets
        const res = await client.query(`
            SELECT status, COUNT(*) as count 
            FROM support_tickets 
            GROUP BY status
        `);
        console.log('📊 Ticket Stats:');
        console.table(res.rows);

        // Check Admin
        const adminRes = await client.query('SELECT id, username, email FROM admin LIMIT 1');
        if (adminRes.rows.length > 0) {
            console.log('✅ Admin user found:', adminRes.rows[0].username);
        } else {
            console.warn('⚠️ No admin user found!');
        }

    } catch (err) {
        console.error('❌ Database Error:', err);
    } finally {
        client.release();
        pool.end();
    }

    // 2. Check Email
    console.log('📧 Checking Email Configuration...');
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        await transporter.verify();
        console.log('✅ Email server connection verified.');
        console.log(`   Host: ${process.env.EMAIL_HOST}`);
        console.log(`   User: ${process.env.EMAIL_USER}`);
        console.log(`   From: ${process.env.EMAIL_FROM || process.env.EMAIL_USER}`);
    } catch (err) {
        console.error('❌ Email Connection Failed:', err.message);
        if (err.response && err.response.includes('550')) {
            console.error('   👉 This is likely due to unverified sender identity in SendGrid.');
        }
    }

    console.log('🏁 Verification Complete.');
}

verify();
