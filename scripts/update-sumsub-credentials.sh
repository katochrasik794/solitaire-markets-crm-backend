#!/bin/bash

# Script to update Sumsub credentials in .env file
# Usage: ./update-sumsub-credentials.sh

ENV_FILE=".env"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    touch "$ENV_FILE"
fi

# Update or add Sumsub credentials
echo "Updating Sumsub credentials in .env file..."

# Remove old Sumsub entries
sed -i.bak '/^SUMSUB_/d' "$ENV_FILE"

# Add new Sumsub credentials
echo "" >> "$ENV_FILE"
echo "# Sumsub KYC Integration" >> "$ENV_FILE"
echo "SUMSUB_APP_TOKEN=prd:BiqwzEfGbFct3yif7raVPJID.rDBoUQLrsZwI5r3IgWuLAvbK5RifV2z3" >> "$ENV_FILE"
echo "SUMSUB_SECRET_KEY=6QVSdxHTmmLipO7y3k0bETKdogLFOyV0" >> "$ENV_FILE"
echo "SUMSUB_API_URL=https://api.sumsub.com" >> "$ENV_FILE"
echo "SUMSUB_WEBHOOK_SECRET=" >> "$ENV_FILE"
echo "SUMSUB_LEVEL_NAME=id-only" >> "$ENV_FILE"

echo "✅ Sumsub credentials updated successfully!"
echo ""
echo "Please restart your server for changes to take effect."

