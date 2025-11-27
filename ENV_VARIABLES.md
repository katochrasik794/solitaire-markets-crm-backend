# Environment Variables

This document describes all environment variables required for the Solitaire CRM backend.

## Database Configuration

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=solitaire
DB_USER=postgres
DB_PASSWORD=your_password_here
```

## MetaAPI Configuration

```env
# MetaAPI Base URL
METAAPI_BASE_URL=https://metaapi.zuperior.com

# MetaAPI Authentication (choose one based on API requirements)
# Option 1: API Key (Bearer token)
METAAPI_API_KEY=your_api_key_here

# Option 2: API Token (custom header)
METAAPI_TOKEN=your_token_here
```

**Note:** The MetaAPI authentication method depends on the API requirements. Check the MetaAPI documentation to determine which method to use.

## Encryption Key

```env
# Encryption key for storing sensitive passwords (must be 64 hex characters = 32 bytes)
# Generate a secure key: openssl rand -hex 32
ENCRYPTION_KEY=your_64_character_hex_key_here
```

**Important:** 
- The encryption key must be exactly 64 hexadecimal characters (32 bytes)
- If not set, a default key will be used (NOT recommended for production)
- Generate a secure key using: `openssl rand -hex 32`
- Keep this key secret and never commit it to version control

## JWT Configuration

```env
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
```

## Email Configuration (for password reset)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FROM_EMAIL=noreply@solitairemarkets.com
```

## Server Configuration

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## Example .env File

Create a `.env` file in the `server` directory with the following structure:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=solitaire
DB_USER=postgres
DB_PASSWORD=123456

# MetaAPI
METAAPI_BASE_URL=https://metaapi.zuperior.com
METAAPI_API_KEY=your_api_key_here

# Encryption
ENCRYPTION_KEY=your_64_character_hex_key_here

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## Generating Encryption Key

To generate a secure encryption key, run:

```bash
openssl rand -hex 32
```

This will output a 64-character hexadecimal string that you can use as your `ENCRYPTION_KEY`.

