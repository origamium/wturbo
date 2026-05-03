#!/bin/bash
# Health check script for the sample application

echo "=== wtb Sample Application Health Check ==="
echo ""

# Check PostgreSQL
echo "Checking PostgreSQL..."
if pg_isready -h postgres -U ${DB_USER:-postgres} > /dev/null 2>&1; then
    echo "  [OK] PostgreSQL is running"
else
    echo "  [FAIL] PostgreSQL is not responding"
fi

# Check Next.js
echo "Checking Next.js..."
if curl -s http://nextjs:3000 > /dev/null 2>&1; then
    echo "  [OK] Next.js is running"
else
    echo "  [FAIL] Next.js is not responding"
fi

echo ""
echo "Health check complete."
