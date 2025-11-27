# Fix: 404 Error on /api/countries

## The Problem
Getting 404 error when accessing `/api/countries`

## Solutions

### Solution 1: Restart the Server
The route was just added. **You MUST restart your server** for the new route to work:

```bash
# Stop the server (Ctrl+C)
# Then restart
cd server
npm start
```

### Solution 2: Check if Countries Table Exists
The countries table might not exist. Run this SQL:

```bash
psql -U postgres -d solitaire -f server/database/countries_table.sql
```

Or manually in PostgreSQL:
1. Open your PostgreSQL client
2. Select the `solitaire` database
3. Run the SQL from `server/database/countries_table.sql`

### Solution 3: Test the Route
After restarting, test:
```bash
curl http://localhost:5000/api/countries?active_only=true
```

You should get JSON with countries data.

## What I Fixed

1. ✅ Added countries route to server
2. ✅ Added error handling for missing table
3. ✅ Fixed route order in server/index.js

## Next Steps

1. **Restart your server** (most important!)
2. Run the countries SQL file to create the table
3. Test the endpoint

The route is now properly configured! 🚀

