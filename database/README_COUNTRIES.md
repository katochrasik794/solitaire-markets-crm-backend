# Countries Table Setup

## Table Schema

The `countries` table has been created with the following structure:

- `id` - SERIAL PRIMARY KEY (auto-incrementing)
- `name` - VARCHAR(100) - Country name
- `country_code` - VARCHAR(2) - ISO 2-letter country code (UNIQUE)
- `phone_code` - VARCHAR(10) - International phone code
- `is_active` - INTEGER - 1 = active, 0 = inactive (default: 1)
- `created_at` - TIMESTAMP - Auto-set on creation
- `updated_at` - TIMESTAMP - Auto-updated on modification

## How to Add Countries

### Option 1: Run the Complete SQL File

```bash
psql -U postgres -d solitaire -f server/database/countries_table.sql
```

### Option 2: Run Manually in PostgreSQL

1. Create the table (if not exists):
```sql
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL UNIQUE,
    phone_code VARCHAR(10) NOT NULL,
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

2. Then run the INSERT statements from `countries_table.sql`

## is_active Column

- **1** = Country is active (can be used in registration)
- **0** = Country is inactive (hidden from registration)

### Examples:

**Set a country as inactive:**
```sql
UPDATE countries SET is_active = 0 WHERE country_code = 'AF';
```

**Set a country as active:**
```sql
UPDATE countries SET is_active = 1 WHERE country_code = 'AF';
```

**Get only active countries:**
```sql
SELECT * FROM countries WHERE is_active = 1 ORDER BY name;
```

## Total Countries

All 195 countries have been added with:
- ✅ Country name
- ✅ 2-letter country code
- ✅ Phone code
- ✅ is_active = 1 (all active by default)

## Notes

- Phone codes with dashes (like "1-268") are stored as-is
- Country codes are unique (no duplicates)
- All countries are set to active (1) by default
- You can deactivate countries by setting is_active = 0

