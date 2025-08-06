import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import JSZip from 'jszip';

const s3 = new S3Client({ region: 'us-west-2' });
const BUCKET = process.env.BUCKET_NAME;

const listPrefix = async (prefix) => {
  const cmd = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix
  });

  const result = await s3.send(cmd);
  const files = (result.Contents || [])
    .map(obj => obj.Key)
    .filter(key => key.endsWith('.gpx') || key.endsWith('.tcx'));
  return files;
};

const getS3File = async (key) => {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const result = await s3.send(cmd);
  const chunks = [];
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const putS3File = async (key, buffer) => {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/zip'
  });
  await s3.send(cmd);
};

const createZip = async (zipName, fileKeys) => {
  const zip = new JSZip();
  for (const key of fileKeys) {
    const fileData = await getS3File(key);
    zip.file(key.split('/').pop(), fileData);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await putS3File(`tracks/zipped/${zipName}`, zipBuffer);
};

export const handler = async (event) => {
  if (event?.rawPath === '/zip') {
    // Get requested size from event (queryStringParameters, body, or direct property)
    let size = event?.queryStringParameters?.size || event?.size;
    // If using HTTP API, you may need to parse event.body if sent as POST
    if (!size && event?.body) {
      try {
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        size = body.size;
      } catch {}
    }
    if (!['small', 'medium', 'full'].includes(size)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing or invalid size parameter. Must be small, medium, or full.' })
      };
    }

    // List all needed files
    const [combined, legsTenth, legsSixth, legsThird, sectionsTenth] = await Promise.all([
      listPrefix('tracks/gpx-combined/'),
      listPrefix('tracks/gpx-legs/tenth/'),
      listPrefix('tracks/gpx-legs/sixth/'),
      listPrefix('tracks/gpx-legs/third/'),
      listPrefix('tracks/sections/tenth/')
    ]);

    let zipName, fileKeys;
    if (size === 'small') {
      zipName = 'gpxSmall.zip';
      fileKeys = [
        combined.find(f => f.endsWith('tiny.gpx')),
        ...legsTenth
      ].filter(Boolean);
    } else if (size === 'medium') {
      zipName = 'gpxMedium.zip';
      fileKeys = [
        combined.find(f => f.endsWith('medium.gpx')),
        ...legsSixth,
        ...sectionsTenth
      ].filter(Boolean);
    } else if (size === 'full') {
      zipName = 'gpxFull.zip';
      fileKeys = [
        combined.find(f => f.endsWith('full.gpx')),
        ...legsThird
      ].filter(Boolean);
    }

    await createZip(zipName, fileKeys);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `ZIP file created for size: ${size}`,
        zipped: [`tracks/zipped/${zipName}`]
      })
    };
  }

  // Default: list files as before
  const gpxSections = await listPrefix('tracks/sections/');
  const gpxCombined = await listPrefix('tracks/gpx-combined/');
  const gpxLegs = await listPrefix('tracks/gpx-legs/');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'gpx-sections': gpxSections,
      'gpx-combined': gpxCombined,
      'gpx-legs': gpxLegs
    })
  };
};