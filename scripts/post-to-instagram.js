#!/usr/bin/env node
// post-to-instagram.js
// Instagram Graph API で画像または動画（Reels）を公開する
//
// 使い方:
//   # 静止画投稿
//   node scripts/post-to-instagram.js --image-url "https://your-cdn.com/img.png" --caption "本文"
//   # Reels（動画）
//   node scripts/post-to-instagram.js --video-url "https://your-cdn.com/video.mp4" --caption "本文" --reels
//
// 必要な環境変数:
//   IG_USER_ID             = Instagram Business Account ID（数字）
//   IG_ACCESS_TOKEN        = Long-lived Page Access Token
//
// 前提:
//   1. Instagram を Business/Creator に切替
//   2. Facebook ページを作成し Instagram と連携
//   3. Meta for Developers でアプリ作成、instagram_business_basic + instagram_business_content_publish 権限
//   4. 画像/動画は **公開URL** から参照できる必要がある（ローカルファイル不可）
//      → S3, Cloudinary, GitHub Pages 等に先にアップロード
//
// 依存: npm install dotenv
//
// 参考: https://developers.facebook.com/docs/instagram-platform/content-publishing/

'use strict';

const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GRAPH = 'graph.facebook.com';
const VERSION = 'v21.0';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--image-url') out.imageUrl = args[++i];
    else if (args[i] === '--video-url') out.videoUrl = args[++i];
    else if (args[i] === '--caption') out.caption = args[++i];
    else if (args[i] === '--reels') out.reels = true;
  }
  return out;
}

function apiRequest(method, pathStr, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: GRAPH,
        path: pathStr,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            const data = JSON.parse(text);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject(new Error(`HTTP ${res.statusCode}: ${text}`));
          } catch {
            reject(new Error(`Invalid JSON: ${text}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createContainer({ igUserId, token, caption, imageUrl, videoUrl, reels }) {
  const params = new URLSearchParams({
    access_token: token,
    caption: caption || '',
  });
  if (imageUrl) params.set('image_url', imageUrl);
  if (videoUrl) {
    params.set('video_url', videoUrl);
    params.set('media_type', reels ? 'REELS' : 'VIDEO');
  }
  const res = await apiRequest('POST', `/${VERSION}/${igUserId}/media?${params.toString()}`);
  return res.id;
}

async function waitForContainer(containerId, token) {
  // 動画は処理に時間がかかる。FINISHED になるまでポーリング
  for (let i = 0; i < 30; i++) {
    const res = await apiRequest(
      'GET',
      `/${VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    if (res.status_code === 'FINISHED') return;
    if (res.status_code === 'ERROR') throw new Error('Container processing failed');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Container processing timeout');
}

async function publishContainer(igUserId, containerId, token) {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: token,
  });
  return apiRequest('POST', `/${VERSION}/${igUserId}/media_publish?${params.toString()}`);
}

(async () => {
  const args = parseArgs();
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;

  if (!igUserId || !token) {
    console.error('Missing IG_USER_ID / IG_ACCESS_TOKEN in .env');
    process.exit(1);
  }
  if (!args.imageUrl && !args.videoUrl) {
    console.error('Provide --image-url or --video-url (must be publicly accessible URL)');
    process.exit(1);
  }

  console.log('[ig] creating container...');
  const containerId = await createContainer({
    igUserId,
    token,
    caption: args.caption,
    imageUrl: args.imageUrl,
    videoUrl: args.videoUrl,
    reels: args.reels,
  });
  console.log(`[ig] container_id: ${containerId}`);

  if (args.videoUrl) {
    console.log('[ig] waiting for video processing...');
    await waitForContainer(containerId, token);
  }

  console.log('[ig] publishing...');
  const res = await publishContainer(igUserId, containerId, token);
  console.log('[ig] done:', JSON.stringify(res, null, 2));
})().catch((err) => {
  console.error('[ig] error:', err.message);
  process.exit(1);
});
