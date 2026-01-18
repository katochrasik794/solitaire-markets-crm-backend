
import pool from '../config/database.js';

const updateAllCommissions = async () => {
    try {
        console.log('Starting comprehensive commission update...');

        // Calculate commission as pip_per_lot * pip_value
        // If pip_per_lot is NULL, default to 1.0
        // Only update rows where pip_value > 0 to avoid zeroing out valuable data if any (though initialized to 0)

        const res = await pool.query(
            `UPDATE symbols_with_categories 
             SET commission = COALESCE(pip_per_lot, 1.0) * pip_value,
                 updated_at = NOW()
             WHERE pip_value > 0
             RETURNING id, symbol, commission`
        );

        console.log(`Successfully updated commissions for ${res.rowCount} symbols.`);

        // Log a few examples
        if (res.rows.length > 0) {
            console.log('Sample updates:');
            res.rows.slice(0, 5).forEach(row => {
                console.log(`${row.symbol}: New Commission = ${row.commission}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error updating commissions:', error);
        process.exit(1);
    }
};

updateAllCommissions();
