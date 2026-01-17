
import pool from '../config/database.js';

const updatePipValues = async () => {
    try {
        console.log('Starting pip value update...');

        const updates = [
            { symbols: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'], value: 10.00 },
            { symbols: ['USDJPY'], value: 6.80 },
            { symbols: ['USDCAD'], value: 7.40 },
            { symbols: ['USDCHF'], value: 11.20 },
            { symbols: ['XAUUSD'], value: 1.00 },
        ];

        let totalUpdated = 0;

        for (const group of updates) {
            for (const symbol of group.symbols) {
                // Update all variants starting with the symbol name (e.g. EURUSD, EURUSDm, EURUSD.pro)
                const res = await pool.query(
                    `UPDATE symbols_with_categories 
             SET pip_value = $1, updated_at = NOW() 
             WHERE symbol LIKE $2`,
                    [group.value, `${symbol}%`]
                );

                console.log(`Updated ${symbol} family: ${res.rowCount} rows set to $${group.value}`);
                totalUpdated += res.rowCount;
            }
        }

        // Also generic logic for XXXUSD pairs = 10 if not covered?
        // The user specifically gave a "best standard rates" instruction.
        // Let's stick to the explicit list for now to avoid errors.

        console.log(`\nSuccess! Total rows updated: ${totalUpdated}`);
        process.exit(0);
    } catch (error) {
        console.error('Error updating pip values:', error);
        process.exit(1);
    }
};

updatePipValues();
