#!/usr/bin/env node
// post-to-x.js
// X (Twitter) API v2 に画像付きツイートを投稿する（無料 Free tier で動作）
//
// 使い方:
//   node scripts/post-to-x.js --text "本文" --media /path/to/image.png
//   node scripts/post-to-x.js --text-file docs/copy/2026-04-20-launch-copy.md --media ~/Downloads/IMG_7329.PNG
//
// 必要な環境変数（.env に記載）:
//   X_API_KEY                 = Consumer Key (API Key)
//   X_API_SECRET              = Consumer Secret (API Key Secret)
//   X_ACCESS_TOKEN            = ユーザーの Access Token
//   X_ACCESS_TOKEN_SECRET     = ユーザーの Access Token Secret
//
// 取得手順: https://developer.x.com → Projects & Apps → User authentication settings → Read and write
//
// 依存: npm install dotenv
//   （OAuth 1.0a 署名は Node 標準の crypto だけで実装しているため追加ライブラリ不要）

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ---------- CLI args ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text') out.text = args[++i];
    else if (args[i] === '--text-file') out.textFile = args[++i];
    else if (args[i] === '--media') out.media = args[++i];
  }
  return out;
}

// ---------- OAuth 1.0a helpers ----------
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function oauthHeader({ method, url, params = {}, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join('&');
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  return (
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
      .join(', ')
  );
}

// ---------- HTTP helpers ----------
function httpRequest({ hostname, path: urlPath, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve(text);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------- Detect media type ----------
function detectMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4', '.mov', '.m4v'].includes(ext)) return 'video/mp4';
  if (ext === '.gif') return 'image/gif';
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

// ---------- Generic OAuth1 form POST ----------
async function oauthFormPost({ host, pathStr, fields, creds }) {
  const url = `https://${host}${pathStr.split('?')[0]}`;
  const params = {};
  for (const [k, v] of Object.entries(fields)) params[k] = String(v);
  const authHeader = oauthHeader({
    method: 'POST', url, params,
    consumerKey: creds.apiKey, consumerSecret: creds.apiSecret,
    token: creds.accessToken, tokenSecret: creds.accessTokenSecret,
  });
  const body = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  return httpRequest({
    hostname: host, path: pathStr, method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
}

// ---------- Upload media (v1.1) ----------
// 画像: シンプル multipart upload
// 動画/GIF/大きい画像: chunked upload (INIT/APPEND/FINALIZE + STATUS)
async function uploadMedia(mediaPath, creds) {
  const fileData = fs.readFileSync(mediaPath);
  const mime = detectMediaType(mediaPath);
  const isVideo = mime.startsWith('video/');
  const isLarge = fileData.length > 5 * 1024 * 1024;

  if (!isVideo && !isLarge && mime !== 'image/gif') {
    return uploadMediaSimple(mediaPath, creds);
  }
  return uploadMediaChunked(fileData, mime, creds);
}

async function uploadMediaSimple(mediaPath, creds) {
  const fileData = fs.readFileSync(mediaPath);
  const boundary = '----NodeFormBoundary' + crypto.randomBytes(8).toString('hex');
  const authHeader = oauthHeader({
    method: 'POST',
    url: 'https://upload.twitter.com/1.1/media/upload.json',
    params: {},
    consumerKey: creds.apiKey, consumerSecret: creds.apiSecret,
    token: creds.accessToken, tokenSecret: creds.accessTokenSecret,
  });
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="media"; filename="${path.basename(mediaPath)}"\r\n`));
  parts.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`));
  parts.push(fileData);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const res = await httpRequest({
    hostname: 'upload.twitter.com', path: '/1.1/media/upload.json', method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
  });
  return res.media_id_string;
}

async function uploadMediaChunked(fileData, mime, creds) {
  const isVideo = mime.startsWith('video/');
  // INIT
  const initRes = await oauthFormPost({
    host: 'upload.twitter.com',
    pathStr: '/1.1/media/upload.json',
    fields: {
      command: 'INIT',
      total_bytes: fileData.length,
      media_type: mime,
      media_category: isVideo ? 'tweet_video' : 'tweet_gif',
    },
    creds,
  });
  const mediaId = initRes.media_id_string;
  console.log(`[x] chunked upload INIT media_id=${mediaId} size=${fileData.length} type=${mime}`);

  // APPEND chunks (5MB each)
  const CHUNK = 5 * 1024 * 1024;
  let segIdx = 0;
  for (let off = 0; off < fileData.length; off += CHUNK) {
    const chunk = fileData.subarray(off, Math.min(off + CHUNK, fileData.length));
    const boundary = '----NodeFormBoundary' + crypto.randomBytes(8).toString('hex');
    const authHeader = oauthHeader({
      method: 'POST',
      url: 'https://upload.twitter.com/1.1/media/upload.json',
      params: { command: 'APPEND', media_id: mediaId, segment_index: String(segIdx) },
      consumerKey: creds.apiKey, consumerSecret: creds.apiSecret,
      token: creds.accessToken, tokenSecret: creds.accessTokenSecret,
    });
    const parts = [];
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="media"\r\n`));
    parts.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`));
    parts.push(chunk);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    await httpRequest({
      hostname: 'upload.twitter.com',
      path: `/1.1/media/upload.json?command=APPEND&media_id=${mediaId}&segment_index=${segIdx}`,
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      body,
    });
    console.log(`[x] APPEND segment ${segIdx} (${chunk.length} bytes)`);
    segIdx++;
  }

  // FINALIZE
  const finRes = await oauthFormPost({
    host: 'upload.twitter.com', pathStr: '/1.1/media/upload.json',
    fields: { command: 'FINALIZE', media_id: mediaId }, creds,
  });
  console.log(`[x] FINALIZE`, finRes.processing_info?.state || 'done');

  // Wait for processing if needed
  if (finRes.processing_info) {
    await waitForMediaProcessing(mediaId, creds);
  }
  return mediaId;
}

async function waitForMediaProcessing(mediaId, creds) {
  for (let i = 0; i < 60; i++) {
    const url = `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`;
    const params = { command: 'STATUS', media_id: mediaId };
    const authHeader = oauthHeader({
      method: 'GET',
      url: 'https://upload.twitter.com/1.1/media/upload.json',
      params,
      consumerKey: creds.apiKey, consumerSecret: creds.apiSecret,
      token: creds.accessToken, tokenSecret: creds.accessTokenSecret,
    });
    const res = await httpRequest({
      hostname: 'upload.twitter.com',
      path: `/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
      method: 'GET',
      headers: { Authorization: authHeader },
    });
    const info = res.processing_info;
    if (!info || info.state === 'succeeded') {
      console.log(`[x] media processing succeeded`);
      return;
    }
    if (info.state === 'failed') {
      throw new Error('Media processing failed: ' + JSON.stringify(info));
    }
    const wait = (info.check_after_secs || 3) * 1000;
    console.log(`[x] media processing ${info.state}, wait ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error('Media processing timeout');
}

// ---------- Post tweet (v2) ----------
async function postTweet(text, mediaId, creds) {
  const url = 'https://api.twitter.com/2/tweets';
  const authHeader = oauthHeader({
    method: 'POST',
    url,
    params: {},
    consumerKey: creds.apiKey,
    consumerSecret: creds.apiSecret,
    token: creds.accessToken,
    tokenSecret: creds.accessTokenSecret,
  });

  const payload = { text };
  if (mediaId) payload.media = { media_ids: [mediaId] };
  const body = JSON.stringify(payload);

  return httpRequest({
    hostname: 'api.twitter.com',
    path: '/2/tweets',
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
}

// ---------- main ----------
(async () => {
  const args = parseArgs();

  const creds = {
    apiKey: process.env.X_API_KEY,
    apiSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };

  if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
    console.error('Missing X credentials. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET in .env');
    process.exit(1);
  }

  let text = args.text;
  if (!text && args.textFile) text = fs.readFileSync(args.textFile, 'utf8');
  if (!text) {
    console.error('Provide --text "..." or --text-file path');
    process.exit(1);
  }
  if (text.length > 280) {
    console.warn(`[warn] text is ${text.length} chars (>280). X will reject.`);
  }

  let mediaId = null;
  if (args.media) {
    let localPath = args.media;
    // URL の場合は一旦 tmp に DL
    if (/^https?:\/\//.test(args.media)) {
      console.log(`[x] downloading media from URL: ${args.media}`);
      const tmpPath = path.join(require('os').tmpdir(),
        `xmedia-${Date.now()}${path.extname(new URL(args.media).pathname) || '.png'}`);
      await new Promise((resolve, reject) => {
        const url = new URL(args.media);
        const lib = url.protocol === 'https:' ? https : require('http');
        const req = lib.get(args.media, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // フォロー
            return lib.get(res.headers.location, (r2) => pipe(r2)).on('error', reject);
          }
          pipe(res);
        });
        function pipe(res) {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${args.media}`));
          const ws = fs.createWriteStream(tmpPath);
          res.pipe(ws);
          ws.on('finish', () => ws.close(resolve));
          ws.on('error', reject);
        }
        req.on('error', reject);
      });
      localPath = tmpPath;
      console.log(`[x] downloaded → ${localPath} (${fs.statSync(localPath).size} bytes)`);
    }
    console.log('[x] uploading media...');
    mediaId = await uploadMedia(localPath, creds);
    console.log(`[x] media_id: ${mediaId}`);
  }

  console.log('[x] posting tweet...');
  const res = await postTweet(text, mediaId, creds);
  console.log('[x] done:', JSON.stringify(res, null, 2));
})().catch((err) => {
  console.error('[x] error:', err.message);
  process.exit(1);
});
