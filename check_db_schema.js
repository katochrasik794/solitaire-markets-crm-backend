import pool from './config/database.js';

async function checkDb() {
    try {
        const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        console.log('Tables:', tables.rows.map(r => r.table_name));

        const ibPlansCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ib_plans'
    `);
        console.log('ib_plans columns:', ibPlansCols.rows.map(r => r.column_name));

        const ibRequestsCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ib_requests'
    `);
        console.log('ib_requests columns:', ibRequestsCols.rows.map(r => r.column_name));

        const sampleRequest = await pool.query('SELECT id, user_id FROM ib_requests LIMIT 5');
        console.log('Sample ib_requests:', sampleRequest.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkDb();
