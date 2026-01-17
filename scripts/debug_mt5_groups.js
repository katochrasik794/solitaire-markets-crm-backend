
import * as mt5Service from '../services/mt5.service.js';

const run = async () => {
    try {
        console.log('Fetching groups from MT5 API...');
        const result = await mt5Service.getGroups();
        if (result.success && result.data) {
            console.log('Successfully fetched groups.');
            // Filter looking for GBE
            const manmohanGroups = result.data.filter(g => g.Group.toLowerCase().includes('gbe'));
            console.log('Matching "GBE" groups in MT5:', JSON.stringify(manmohanGroups, null, 2));

            // Also print some regular groups to see backslash pattern
            console.log('Sample of other groups:', JSON.stringify(result.data.slice(0, 5), null, 2));
        } else {
            console.error('Failed to fetch groups:', result);
        }
    } catch (err) {
        console.error('Error:', err);
    }
    process.exit(0);
};

run();
