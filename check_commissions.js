import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/solitaire_crm'
});

async function checkData() {
    try {
        const tableExists = await pool.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ib_commissions')"
        );
        console.log('Table ib_commissions exists:', tableExists.rows[0].exists);

        if (tableExists.rows[0].exists) {
            const statusCounts = await pool.query(
                "SELECT status, COUNT(*) FROM ib_commissions GROUP BY status"
            );
            console.log('Status counts:', statusCounts.rows);

            const recentRows = await pool.query(
                "SELECT * FROM ib_commissions ORDER BY created_at DESC LIMIT 5"
            );
            console.log('Recent commission rows:', recentRows.rows);

            const distinctIbs = await pool.query(
                "SELECT COUNT(DISTINCT ib_id) FROM ib_commissions"
            );
            console.log('Distinct IBs in commissions:', distinctIbs.rows[0].count);
        }
    } catch (err) {
        console.error('Check error:', err);
    } finally {
        await pool.end();
    }
}

checkData();
