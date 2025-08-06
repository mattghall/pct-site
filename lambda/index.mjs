import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-west-2' });
const BUCKET = 'trailmatt.com';

const ZIP_PATHS = {
  small: 'tracks/zipped/gpxSmall.zip',
  medium: 'tracks/zipped/gpxMedium.zip',
  full: 'tracks/zipped/gpxFull.zip'
};

export const handler = async (event) => {
  // Get 'size' parameter from query string, body, or direct property
  let size = event?.queryStringParameters?.size || event?.size;
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

  const zipKey = ZIP_PATHS[size];
  try {
    const s3Obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: zipKey }));
    const chunks = [];
    for await (const chunk of s3Obj.Body) {
      chunks.push(chunk);
    }
    const zipBuffer = Buffer.concat(chunks);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipKey.split('/').pop()}"`
      },
      body: zipBuffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ZIP file not found', details: err.message })
    };
  }
};
