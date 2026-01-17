
import pool from '../config/database.js';

const updateAllPipValues = async () => {
    try {
        console.log('Starting comprehensive pip value update...');

        // 1. Fetch all symbols to iterate and process
        const res = await pool.query('SELECT id, symbol, category, group_name FROM symbols_with_categories');
        const symbols = res.rows;
        console.log(`Found ${symbols.length} symbols to process.`);

        const updates = [];
        let updatedCount = 0;

        for (const row of symbols) {
            let pipValue = 0;

            // key stripping for matching
            // Remove trailing 'm', 'pro', etc. to get the "base" symbol
            // Logic: Strip lowercase suffixes starting with . or _ or just 'm' at end if it looks like a suffix
            // Common: EURUSDm -> EURUSD, EURUSD.pro -> EURUSD
            let base = row.symbol.replace(/[._](m|pro|ecn|vip|std|mini|micro)$/i, '');
            if (base.endsWith('m') && base.length > 6 && base === base.toUpperCase() + 'm') {
                // crude check for CamelCase or similar 'm' suffix
                // actually the DB showed 'EURUSDm', 'USOILm'. So simply stripping trailing 'm' if length > 3 might match
            }
            // Better regex for the specific examples seen:
            // 'EURUSDm' -> 'EURUSD'
            // '0001.HKm' -> '0001.HK'
            if (base.endsWith('m')) {
                base = base.slice(0, -1);
            }

            const category = row.category;
            const upperBase = base.toUpperCase();

            // --- MAPPING LOGIC ---

            if (category === 'Forex') {
                if (upperBase.includes('USD')) {
                    if (upperBase.endsWith('USD')) {
                        // XXXUSD -> 10.00
                        pipValue = 10.00;
                    } else if (upperBase.startsWith('USD')) {
                        // USDXXX
                        if (upperBase.includes('JPY')) pipValue = 6.80; // USDJPY
                        else if (upperBase.includes('CAD')) pipValue = 7.40; // USDCAD
                        else if (upperBase.includes('CHF')) pipValue = 11.20; // USDCHF
                        else if (upperBase.includes('SGD')) pipValue = 7.50;
                        else pipValue = 10.00; // Default fallback
                    } else {
                        // Cross pairs (no USD in name? wait)
                        // But GBPJPY, EURGBP etc.
                        // EURGBP -> 13.00 (approx)
                        // EURJPY -> 6.80 (JPY term)
                        // GBPJPY -> 6.80
                        if (upperBase.endsWith('JPY')) pipValue = 6.80;
                        else if (upperBase.endsWith('GBP')) pipValue = 13.00;
                        else if (upperBase.endsWith('EUR')) pipValue = 11.00;
                        else if (upperBase.endsWith('AUD')) pipValue = 6.50;
                        else if (upperBase.endsWith('NZD')) pipValue = 6.00;
                        else if (upperBase.endsWith('CAD')) pipValue = 7.40;
                        else pipValue = 10.00; // Generic fallback
                    }
                } else {
                    // Cross pairs
                    // Term currency determines value usually.
                    if (upperBase.endsWith('JPY')) pipValue = 6.80;
                    else if (upperBase.endsWith('GBP')) pipValue = 13.00; // e.g. EURGBP
                    else if (upperBase.endsWith('EUR')) pipValue = 11.00;
                    else if (upperBase.endsWith('CHF')) pipValue = 11.20;
                    else if (upperBase.endsWith('CAD')) pipValue = 7.40;
                    else if (upperBase.endsWith('AUD')) pipValue = 6.50;
                    else if (upperBase.endsWith('NZD')) pipValue = 6.00;
                    else pipValue = 10.00;
                }
            } else if (category === 'Metals') {
                if (upperBase.includes('XAU')) pipValue = 1.00; // Gold
                else if (upperBase.includes('XAG')) pipValue = 50.00; // Silver (5000 units)
                else if (upperBase.includes('XPD') || upperBase.includes('XPT')) pipValue = 1.00; // Palladium/Platinum
                else pipValue = 1.00;
            } else if (category === 'Energies') {
                if (upperBase.includes('OIL') || upperBase.includes('XNG')) pipValue = 10.00;
                else pipValue = 10.00;
            } else if (category === 'Indices') {
                pipValue = 1.00; // Default for indices
            } else if (category === 'Crypto') {
                pipValue = 0.01; // Default per cent/tick
            } else if (category === 'Stocks') {
                pipValue = 0.01; // Default per cent
            } else {
                pipValue = 1.00; // Fallback "Other"
            }

            // Instead of await update, push to array
            if (pipValue > 0) {
                updates.push({ id: row.id, val: pipValue });
            }
        }

        // Batch update
        console.log(`Preparing to update ${updates.length} symbols...`);
        const chunkSize = 500;
        for (let i = 0; i < updates.length; i += chunkSize) {
            const chunk = updates.slice(i, i + chunkSize);
            // Construct CASE ... END query or similar, or just simpler mapping
            // Actually for simplicity in Postgres:
            // UPDATE symbols_with_categories AS s SET pip_value = v.val FROM (VALUES (1, 10.0), (2, 5.0)...) AS v(id, val) WHERE s.id = v.id

            const valuesList = chunk.map(u => `(${u.id}, ${u.val})`).join(',');
            await pool.query(
                `UPDATE symbols_with_categories AS s 
             SET pip_value = v.val::numeric 
             FROM (VALUES ${valuesList}) AS v(id, val) 
             WHERE s.id = v.id`
            );
            process.stdout.write(`.`);
        }

        console.log(`\nSuccessfully updated ${updates.length} symbols.`);
        process.exit(0);
    } catch (error) {
        console.error('Error updating pip values:', error);
        process.exit(1);
    }
};

updateAllPipValues();
