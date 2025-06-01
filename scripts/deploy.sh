#!/bin/bash

echo "Building templates..."
npm run build-templates

echo "Deploy to which environment?"
echo "1) Preview (default)"
echo "2) Production"
read -p "Enter choice [1]: " choice

case $choice in
    2)
        echo "Deploying to production..."
        npx wrangler deploy
        ;;
    *)
        echo "Deploying to preview..."
        npx wrangler deploy --env preview
        ;;
esac