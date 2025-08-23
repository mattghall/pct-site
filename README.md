# Matt's Pacific Crest Trail Site
## Overview
This repository contains my PCT web page including
the map of my trip, a photo gallery showcasing images I took
on the Pacific Crest Trail, and blog posts from my trip. 
The gallery features many images I took on my trip in a
horizontally-scrolling layout with automatic scrolling 
functionality and dynamically loaded images. 

## Image Gallery Features 
- Horizontally-scrolling image gallery.
- Images loaded dynamically from a JSON file.
- Automatic scrolling with the ability to manually scroll through images.
- Display of image titles and dates on hover.
- Responsive design to accommodate various screen sizes.

## Future Plans
- [ ] Dynamically load blog posts
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
   export CLOUDFRONT_DISTRIBUTION_ID={{secret}}
   ```

### Run the ZIP aggregator script
```bash
cd ecs/
npm install  # Install dependencies if not already done
CLOUDFRONT_DISTRIBUTION_ID={{secret}} node index.js
```

### What the script does
- Creates a combined track from all tenth-precision files, using every 3rd data point (so essentially using every 30th point)
- Generates 3 ZIP files for the individual legs:
  - `gpxSmall.zip` - Contains tenth-precision legs + combined track
  - `gpxMedium.zip` - Contains sixth-precision legs + sections
  - `gpxFull.zip` - Contains third-precision legs (most detailed and a misnomer but I'd already named it so get off my back)
- Creates a compressed `combined-small.zip` (320KB) for fast loading of the combined route
- Uploads all files to S3
- Invalidates CloudFront cache 

### Configuration
To make the combined track smaller/larger, edit `COMBINED_POINT_INTERVAL` in `ecs/index.js`:
- `3` = every 3rd point (current, ~320KB zip)
- `5` = every 5th point (smaller file)
- `1` = every point (larger file)

## Alternative that I would love to get working someday
1. Go to ECS Console → Clusters → `trailmatt-s3-zip`
2. Click "Tasks" tab → "Run new task"
3. Select "Fargate"
4. Use existing task definition with proper CloudFront distribution ID
5. Run - it will execute once and stop