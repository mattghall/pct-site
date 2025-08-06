const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const yazl = require('yazl');

const s3 = new S3Client({ region: 'us-west-2' });
const BUCKET = 'trailmatt.com';

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

  // Define files for each zip
  const smallFiles = [
    combined.find(f => f.endsWith('tiny.gpx')),
    ...legsTenth
  ].filter(Boolean);
  const mediumFiles = [
    combined.find(f => f.endsWith('medium.gpx')),
    ...legsSixth,
    ...sectionsTenth
  ].filter(Boolean);
  const fullFiles = [
    combined.find(f => f.endsWith('full.gpx')),
    ...legsThird
  ].filter(Boolean);

  // Output S3 keys
  const smallZipKey = 'tracks/zipped/gpxSmall.zip';
  const mediumZipKey = 'tracks/zipped/gpxMedium.zip';
  const fullZipKey = 'tracks/zipped/gpxFull.zip';

  // Create and upload each zip sequentially
  await zipFilesToS3(smallFiles, smallZipKey);
  console.log('Small zip uploaded:', smallZipKey);
  await zipFilesToS3(mediumFiles, mediumZipKey);
  console.log('Medium zip uploaded:', mediumZipKey);
  await zipFilesToS3(fullFiles, fullZipKey);
  console.log('Full zip uploaded:', fullZipKey);
})();