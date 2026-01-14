import pool from '../config/database.js';

async function checkSchemas() {
    try {
        console.log('--- Schema Audit ---');

        const tables = await pool.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('ib_requests', 'ib_commissions', 'users')
            ORDER BY table_name, table_schema;
        `);

        console.log('Found tables:');
        tables.rows.forEach(row => {
            console.log(`- ${row.table_schema}.${row.table_name}`);
        });

        const searchPath = await pool.query('SHOW search_path');
        console.log('\nCurrent search_path:', searchPath.rows[0].search_path);

        for (const row of tables.rows) {
            const countRes = await pool.query(`SELECT COUNT(*) FROM "${row.table_schema}"."${row.table_name}"`);
            console.log(`Count in ${row.table_schema}.${row.table_name}: ${countRes.rows[0].count}`);
        }

    } catch (error) {
        console.error('Schema audit error:', error);
    } finally {
        process.exit();
    }
}

checkSchemas();
