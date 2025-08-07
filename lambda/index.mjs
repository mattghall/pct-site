// Lambda function to fetch Blogger posts and append only new ones to blog_posts.json in S3
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import he from "he";

const BUCKET = 'trailmatt.com';
const BLOG_JSON_KEY = 'resources/blog_posts.json';
const BLOGGER_FEED = 'https://mattghall-pct.blogspot.com/feeds/posts/default?alt=json';
const CLOUDFRONT_DISTRIBUTION_ID = 'E15DX3Q3T2CEBL'; 
const s3 = new S3Client();

export const handler = async () => {
  console.log('Lambda started');

  const res = await fetch(BLOGGER_FEED);
  if (!res.ok) throw new Error('Failed to fetch Blogger feed');
  const feed = await res.json();
  const entries = feed.feed.entry || [];
  console.log(`Loaded ${entries.length} entries from Blogger feed.`);
  for (let i = 0; i < Math.min(3, entries.length); i++) {
    const t = entries[i].title && typeof entries[i].title.$t === 'string' ? entries[i].title.$t : '[no title]';
    console.log(`Entry ${i + 1} title:`, t);
  }

  // Helper to convert to Pacific Time
  function getPacificDate(dateStr) {
    const d = new Date(dateStr);
    return new Date(d.getTime() - (7 * 60 * 60 * 1000));
  }

  // Helper to get the day number for PCT Day 3-{number}
  function getPCTDayNumber(pacificDate) {
    const base = new Date(Date.UTC(2025, 7, 10)); // Aug 10, 2025
    const diff = Math.floor((pacificDate - base) / (1000 * 60 * 60 * 24));
    return 14 + diff;
  }

  const combineStart = 20250810;
  const combineEnd = 20250901;
  const newPosts = [];
  const grouped = {};

  for (const entry of entries) {
    // Always start with a default post
    let post = {
      title: 'PCT Update',
      body: 'New Post',
      datetime: new Date().toISOString()
    };
    try {
      // Try to extract datetime
      let datetime = '';
      if (entry.published && entry.published.$t) {
        datetime = entry.published.$t;
      }
      if (datetime) post.datetime = datetime;

      // Try to extract body
      let body = '';
      if (entry.content && typeof entry.content === 'object' && '$t' in entry.content) {
        body = entry.content.$t;
      } else if (typeof entry.content === 'string') {
        body = entry.content;
      } else if (entry.summary && typeof entry.summary === 'object' && '$t' in entry.summary) {
        body = entry.summary.$t;
      } else if (typeof entry.summary === 'string') {
        body = entry.summary;
      }
      body = he.decode(body);
      // Always extract text from <div> if present, else strip all HTML tags
      const divMatch = body.match(/^<div[^>]*>([\s\S]*?)<\/div>\s*$/i);
      if (divMatch) {
        body = divMatch[1];
      } else {
        body = body.replace(/<[^>]+>/g, '');
      }
      body = body.trim();
      if (body) post.body = body;

      // Try to extract title
      let title = '';
      if (entry.title && typeof entry.title.$t === 'string') {
        title = entry.title.$t;
      }
      // Fallback title logic: apply if title is empty string or falsy
      let dateNum = 0;
      if (post.datetime) {
        const pacificDate = getPacificDate(post.datetime);
        const y = pacificDate.getUTCFullYear();
        const m = pacificDate.getUTCMonth() + 1;
        const d = pacificDate.getUTCDate();
        dateNum = Number(`${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`);
        if (!title || title.trim() === '') {
          if (dateNum < 20250809) {
            title = 'Mid-trip Update';
          } else if (dateNum >= 20250810 && dateNum <= 20250901) {
            title = `PCT Day 3-${getPCTDayNumber(pacificDate)}`;
          } else {
            title = 'PCT Update';
          }
        }
      }
      if (title) post.title = title;
    } catch (err) {
      // If anything fails, keep the default post
      console.warn('Failed to extract post, using default:', err);
    }
    newPosts.push(post);
  }

  // Combine grouped posts
  // (Grouping logic removed: every entry is now a post)
  // 3. Write all newPosts as the new blog_posts.json, sorted newest first
  const updatedPosts = newPosts
    .map(p => ({
      title: p.title || '',
      body: p.body || '',
      datetime: p.datetime || ''
    }))
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()); // Newest first

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: BLOG_JSON_KEY,
    Body: JSON.stringify(updatedPosts, null, 2),
    ContentType: 'application/json'
  }));

  // Invalidate CloudFront cache for blog_posts.json
  if (CLOUDFRONT_DISTRIBUTION_ID && CLOUDFRONT_DISTRIBUTION_ID !== 'YOUR_DISTRIBUTION_ID') {
    const cloudfront = new CloudFrontClient();
    await cloudfront.send(new CreateInvalidationCommand({
      DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [`/${BLOG_JSON_KEY}`]
        }
      }
    }));
    console.log('CloudFront invalidation requested for', BLOG_JSON_KEY);
  } else {
    console.warn('CloudFront invalidation skipped: CLOUDFRONT_DISTRIBUTION_ID not set');
  }

  return { status: 'Overwritten', count: updatedPosts.length };
};

// Helper to convert stream to string (for S3 GetObjectCommand)
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}
