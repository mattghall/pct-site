// Usage: node utils/clean_blog_posts.js
// Cleans blog_posts.json to only keep title, body, datetime, and sorts by datetime (most recent first)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../resources/blog_posts.json');

let raw = fs.readFileSync(filePath, 'utf-8');
let posts;
try {
  posts = JSON.parse(raw);
} catch (e) {
  // Try to recover from trailing commas or partial corruption
  raw = raw.replace(/,\s*([}\]])/g, '$1');
  posts = JSON.parse(raw);
}

// Flatten if not an array
if (!Array.isArray(posts)) {
  posts = [posts];
}

// Only keep title, body, datetime
const cleaned = posts
  .map(p => ({
    title: p.title || '',
    body: p.body || '',
    datetime: p.datetime || ''
  }))
  .filter(p => p.title && p.datetime && p.body)
  .sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2));

console.log(`Cleaned and sorted ${cleaned.length} posts.`);
