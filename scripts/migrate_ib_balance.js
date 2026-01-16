import pool from '../config/database.js';

async function migrate() {
    try {
        console.log('Starting migration...');

        // Add ib_balance column
        await pool.query(`
            ALTER TABLE ib_requests 
            ADD COLUMN IF NOT EXISTS ib_balance NUMERIC(15,2) DEFAULT 0;
        `);
        console.log('✅ Added ib_balance column to ib_requests');

        // Create ib_distributions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ib_distributions (
                id SERIAL PRIMARY KEY,
                ib_id INTEGER REFERENCES ib_requests(id),
                amount NUMERIC(15,2),
                notes TEXT,
                admin_id INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Created ib_distributions table');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
