import pool from './config/database.js';

async function inspectGroups() {
    try {
        const res = await pool.query('SELECT id, group_name, dedicated_name FROM mt5_groups');
        console.log('--- ALL GROUPS ---');
        res.rows.forEach(g => {
            console.log(`ID: ${g.id}, Name: ${g.group_name}, Dedicated: ${g.dedicated_name}`);
        });
        console.log('--- END ---');
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

inspectGroups();
