import pool from './config/database.js';

const testConnection = async () => {
    try {
        console.log('Testing DB connection and Tables...');
        // Check connection
        await pool.query('SELECT NOW()');
        console.log('✅ Connection OK');

        // Check Schemas
        const menus = await pool.query('SELECT count(*) FROM menu_features');
        console.log('✅ Menu Features Table OK:', menus.rows[0].count);

        const accounts = await pool.query('SELECT count(*) FROM trading_accounts');
        console.log('✅ Trading Accounts Table OK:', accounts.rows[0].count);

        process.exit(0);
    } catch (error) {
        console.error('❌ DB Test Failed:', error);
        process.exit(1);
    }
};

testConnection();
