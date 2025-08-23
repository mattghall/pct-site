#!/bin/bash

set -e  # Exit on any error

BUCKET="trailmatt.com"

echo "Syncing..."
echo ""

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   brew install awscli"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run:"
    echo "   aws configure"
    exit 1
fi

echo "✅ AWS CLI configured properly"
echo ""

# Create directories if they don't exist
mkdir -p tracks/combined
mkdir -p tracks/zipped
mkdir -p resources

echo "Downloading files..."

# Combined track (main route)
echo "  → Combined track zip..."
aws s3 cp s3://$BUCKET/tracks/combined/combined-small.zip tracks/combined/

# GPX collections (individual legs)
echo "  → GPX collection zips..."
aws s3 cp s3://$BUCKET/tracks/zipped/gpxSmall.zip tracks/zipped/
aws s3 cp s3://$BUCKET/tracks/zipped/gpxMedium.zip tracks/zipped/
aws s3 cp s3://$BUCKET/tracks/zipped/gpxFull.zip tracks/zipped/

# JSON resources
echo "  → JSON resources..."
aws s3 cp s3://$BUCKET/resources/blog_posts.json resources/ --no-clobber 2>/dev/null || true
aws s3 cp s3://$BUCKET/resources/blog_posts_old.json resources/ --no-clobber 2>/dev/null || true
aws s3 cp s3://$BUCKET/resources/images.json resources/ --no-clobber 2>/dev/null || true

echo ""
echo "S3 sync complete!"
echo ""
echo "You can now start local server:"
echo "   python -m http.server 8000"
echo ""
echo "http://localhost:8000"
