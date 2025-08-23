const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const yazl = require('yazl');

const s3 = new S3Client({ region: 'us-west-2' });
const cloudfront = new CloudFrontClient({ region: 'us-west-2' });
const BUCKET = 'trailmatt.com';
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID; 

// Configuration: take every Nth data point for combined track
const COMBINED_POINT_INTERVAL = 3; // Configurable - change this to make file smaller/larger
const START_SECTION = 'PCTCA_Q_trimmed.gpx'; // Starting section - configurable
const END_SECTION = 'PCTWA_L_trimmed.gpx'; // Ending section 

async function listFiles(prefix) {
  const cmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix });
  const result = await s3.send(cmd);
  return (result.Contents || []).map(obj => obj.Key).filter(key => key.endsWith('.gpx'));
}

async function zipFilesToS3(fileKeys, outputKey) {
  const zipfile = new yazl.ZipFile();
  for (const key of fileKeys) {
    const s3Obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    zipfile.addBuffer(await streamToBuffer(s3Obj.Body), key.replace('tracks/', ''));
  }
  zipfile.end();

  // Collect the zip stream into a buffer
  const chunks = [];
  for await (const chunk of zipfile.outputStream) {
    chunks.push(chunk);
  }
  const zipBuffer = Buffer.concat(chunks);

  // Upload ZIP to S3
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: outputKey,
    Body: zipBuffer,
    ContentType: 'application/zip'
  }));
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Usage: node index.js
(async () => {
  // List all needed files
  const [combined, legsTenth, legsSixth, legsThird, sectionsTenth] = await Promise.all([
    listFiles('tracks/gpx-combined/'),
    listFiles('tracks/gpx-legs/tenth/'),
    listFiles('tracks/gpx-legs/sixth/'),
    listFiles('tracks/gpx-legs/third/'),
    listFiles('tracks/sections/tenth/')
  ]);

  // Debug: Show what files were found
  console.log('Files found:');
  console.log('- Combined:', combined.length);
  console.log('- Legs tenth:', legsTenth.length);
  console.log('- Legs sixth:', legsSixth.length);
  console.log('- Legs third:', legsThird.length);
  console.log('- Sections tenth:', sectionsTenth.length);

  // Define files for each zip (excluding combined files since they're separate now)
  const smallFiles = [
    ...legsTenth
  ].filter(Boolean);
  const mediumFiles = [
    ...legsSixth,
    ...sectionsTenth
  ].filter(Boolean);
  const fullFiles = [
    ...legsThird
  ].filter(Boolean);

  // Debug: Show file counts for each zip
  console.log('\nFiles per zip:');
  console.log('- Small files:', smallFiles.length);
  console.log('- Medium files:', mediumFiles.length, '(sixth:', legsSixth.length, '+ sections:', sectionsTenth.length, ')');
  console.log('- Full files:', fullFiles.length);

  // Output S3 keys
  const smallZipKey = 'tracks/zipped/gpxSmall.zip';
  const mediumZipKey = 'tracks/zipped/gpxMedium.zip';
  const fullZipKey = 'tracks/zipped/gpxFull.zip';

  // Create combined GPX files
  async function createCombinedGPX(fileKeys, outputKey, pointInterval = 1) {
    console.log(`Creating combined GPX from ${fileKeys.length} files (every ${pointInterval} points)...`);
    
    // Start with GPX header
    let combinedContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailMatt Combiner" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>PCT Combined Track</name>
    <trkseg>`;

    let pointCount = 0;
    let totalPoints = 0;

    // Add each file's track points in order (sections are already geographically ordered)
    for (const key of fileKeys) {
      const s3Obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const gpxContent = await streamToBuffer(s3Obj.Body);
      const gpxText = gpxContent.toString();
      
      // Extract track points from each file
      const trkptMatches = gpxText.match(/<trkpt[^>]*>[\s\S]*?<\/trkpt>/gi);
      if (trkptMatches) {
        trkptMatches.forEach((trkpt, index) => {
          totalPoints++;
          if (index % pointInterval === 0) {
            combinedContent += '\n      ' + trkpt;
            pointCount++;
          }
        });
      }
    }

    // Close GPX
    combinedContent += `
    </trkseg>
  </trk>
</gpx>`;

    console.log(`Combined GPX: ${pointCount} points (from ${totalPoints} total) - using sections`);

    // Upload combined GPX to S3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: outputKey,
      Body: combinedContent,
      ContentType: 'application/gpx+xml'
    }));
    
    return outputKey;
  }

// Create combined track
  const combinedSmallKey = 'tracks/combined/combined-small.gpx';
  
  // Filter sections to only include the range we've hiked
  const sectionsInRange = sectionsTenth.filter(section => {
    const filename = section.split('/').pop();
    return filename >= START_SECTION && filename <= END_SECTION;
  }).sort(); // Sort alphabetically to ensure correct geographic order
  
  console.log(`Using ${sectionsInRange.length} sections from ${START_SECTION} to ${END_SECTION}`);
  
  await createCombinedGPX(sectionsInRange, combinedSmallKey, COMBINED_POINT_INTERVAL);
  console.log('Combined small GPX created:', combinedSmallKey);

  // Compress the combined track
  const combinedZipKey = 'tracks/combined/combined-small.zip';
  await zipFilesToS3([combinedSmallKey], combinedZipKey);
  console.log('Combined small ZIP created:', combinedZipKey);

  // Create and upload each zip sequentially (no longer including combined files in individual zips)
  await zipFilesToS3(smallFiles, smallZipKey);
  console.log('Small zip uploaded:', smallZipKey);
  await zipFilesToS3(mediumFiles, mediumZipKey);
  console.log('Medium zip uploaded:', mediumZipKey);
  await zipFilesToS3(fullFiles, fullZipKey);
  console.log('Full zip uploaded:', fullZipKey);

  // Invalidate CloudFront cache
  if (CLOUDFRONT_DISTRIBUTION_ID) {
    try {
      await cloudfront.send(new CreateInvalidationCommand({
        DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `zip-invalidation-${Date.now()}`,
          Paths: {
            Quantity: 2,
            Items: ['/tracks/zipped/*', '/tracks/combined/*']
          }
        }
      }));
      console.log('CloudFront cache invalidated for /tracks/zipped/*');
    } catch (error) {
      console.warn('CloudFront invalidation failed:', error.message);
    }
  }
})();