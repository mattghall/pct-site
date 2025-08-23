# Matt's Pacific Crest Trail Site

## Overview
This repository contains my PCT web page including the map of my trip, a photo gallery showcasing images I took on the Pacific Crest Trail, and blog posts from my trip. The gallery features many images I took on my trip in a horizontally-scrolling layout with automatic scrolling functionality and dynamically loaded images.

## Recent Updates (August 2025)
- **Blog Post Filtering**: Only displays posts from 2025 with automatic "Load More" functionality
- **GPX Track Optimization**: Switched from individual hiking days to PCT sections for better geographic continuity
- **Combined Route Separation**: Combined tracks are now separate from individual leg files for better performance
- **Layer Management**: Combined route displays as blue background with individual legs as orange foreground
- **Photo Loading Optimization**: Photo markers only load after all GPX tracks are loaded for smoother user experience
- **Local Development Setup**: Added sync script for local development workflow

## Features

### Map and Tracking
- Interactive Leaflet map with GPX track display
- Combined route (blue, semi-transparent background track)
- Individual leg tracks (orange/red, full opacity foreground)
- Photo markers with clustering for better performance
- Automatic layer ordering (combined track behind, individual legs in front)

### Image Gallery
- Horizontally-scrolling image gallery
- Images loaded dynamically from a JSON file
- Automatic scrolling with manual scroll override
- Display of image titles and dates on hover
- Responsive design for various screen sizes
- Photo markers on map with click-to-view functionality

### Blog Integration
- Automatic sync from Blogger RSS feed
- Filters for 2025 posts only
- "Load More" button for pagination
- Special handling for inReach messages vs blog posts

## Future Plans
- [ ] Quicker map loading
- [ ] Tagging images on the map
- [ ] Percentage counter of how much of the PCT I've finished
- [ ] Gear section
- [ ] Lessons I learned
- [ ] Scrollable Elevation Graph
- [ ] Allowing easy integration for future trips

# Updating GPX Tracks

## Step 1: Process New Activities
1. Export all activities from Garmin into a directory
2. Name them `PCT_3-00000.tcx` updating the number sequentially
3. Zip the encompassing directory
4. Load the track processor in the utils folder and load the zip
5. Export trimmed files as GPX for every 3rd, 6th, and 10th data points
6. Upload the exported files to their respective directories in S3:
   - `s3://trailmatt.com/tracks/gpx-legs/third/`
   - `s3://trailmatt.com/tracks/gpx-legs/sixth/`
   - `s3://trailmatt.com/tracks/gpx-legs/tenth/`

## Step 2: Update ZIP Files Locally

### Prerequisites
1. Ensure you have AWS CLI configured with proper credentials or it will get pissy
2. Set the CloudFront distribution ID environment variable:
   ```bash
   export CLOUDFRONT_DISTRIBUTION_ID=E15DX3Q3T2CEBL
   ```

### Run the ZIP aggregator script
```bash
cd ecs/
npm install  # Install dependencies if not already done
CLOUDFRONT_DISTRIBUTION_ID=E15DX3Q3T2CEBL node index.js
```

### What the script does
- Creates a combined track from PCT sections (PCTCA_Q to PCTWA_L), using every 3rd data point
- Generates 3 ZIP files for individual legs (NO LONGER includes combined files):
  - `gpxSmall.zip` - Contains tenth-precision legs only (61 files)
  - `gpxMedium.zip` - Contains sixth-precision legs + sections (90 files)
  - `gpxFull.zip` - Contains third-precision legs only (61 files)
- Creates separate `tracks/combined/combined-small.zip` (143KB) for the combined route
- Uploads all files to S3
- Invalidates CloudFront cache

### Key Changes (August 2025)
- **Section-based combining**: Uses PCT sections instead of individual hiking days for better geographic continuity
- **Separate combined files**: Combined tracks are no longer included in individual leg ZIP files
- **Configurable point sampling**: Easy to adjust compression via `COMBINED_POINT_INTERVAL`
- **Smaller file sizes**: Combined track reduced from 320KB to 143KB

### Configuration
To make the combined track smaller/larger, edit `COMBINED_POINT_INTERVAL` in `ecs/index.js`:
- `3` = every 3rd point (current, ~143KB zip)
- `5` = every 5th point (smaller file)
- `1` = every point (larger file)

## Alternative that I would love to get working someday
1. Go to ECS Console → Clusters → `trailmatt-s3-zip`
2. Click "Tasks" tab → "Run new task"
3. Select "Fargate"
4. Use existing task definition with proper CloudFront distribution ID
5. Run - it will execute once and stop

# Local Development

## Running the Site Locally
1. Start a local HTTP server from the project root:
   ```bash
   python3 -m http.server 8000
   ```
2. Visit `http://localhost:8000` in your browser

## Syncing Files from S3
Use the minimal sync script to download only essential files for local development:
```bash
./sync-minimal.sh
```

This downloads:
- Blog posts JSON files
- JSON file containing images for the map
- GPX track files (combined and individual legs)

## File Structure
```
tracks/
├── combined/
│   └── combined-small.zip     # Blue background combined route
├── gpx-sections/             # PCT sections for combining
└── zipped/
    ├── gpxSmall.zip          # Individual legs (orange/red)
    ├── gpxMedium.zip         # More detailed legs + sections
    └── gpxFull.zip           # Fullest detail legs (every third point)
```

## Frontend Architecture
- **Combined Route**: Loaded first via `loadCombinedRoute()` as blue semi-transparent background
- **Individual Legs**: Loaded via `getLegs()` as orange/red foreground tracks  
- **Photo Markers**: Only load after all GPX tracks finish loading
- **Blog Posts**: Load with pagination ("Load More" button)
- **Layer Management**: Automatic ordering ensures proper visual hierarchy