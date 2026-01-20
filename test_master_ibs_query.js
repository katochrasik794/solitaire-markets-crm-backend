import pool from './config/database.js';

async function testQuery() {
    try {
        const query = `
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          ir.ib_type
         FROM ib_requests ir
         JOIN users u ON ir.user_id = u.id
         WHERE ir.status = 'approved'
           AND (ir.ib_type = 'master' OR ir.ib_type = 'normal' OR ir.ib_type IS NULL)
         ORDER BY u.first_name, u.last_name
      `;
        const result = await pool.query(query, []);
        console.log('Result count:', result.rows.length);
        console.log('First row:', result.rows[0]);
    } catch (err) {
        console.error('Query Error:', err);
    } finally {
        process.exit();
    }
}

testQuery();
