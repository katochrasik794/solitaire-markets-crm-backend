import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function fixFK() {
    const client = await pool.connect();
    try {
        console.log('🔧 Fixing sent_emails foreign key...');

        // Drop incorrect constraint
        // Note: The error message said "sent_emails_admin_id_fkey", so we drop that.
        await client.query('ALTER TABLE sent_emails DROP CONSTRAINT IF EXISTS sent_emails_admin_id_fkey');
        console.log('Dropped old constraint');

        // Add correct constraint referencing "admin" table
        // We assume the table name is "admin" based on the login query "FROM admin"
        await client.query('ALTER TABLE sent_emails ADD CONSTRAINT sent_emails_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES admin(id)');
        console.log('Added new constraint referencing admin(id)');

        console.log('✅ Foreign key fixed!');
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

fixFK();
