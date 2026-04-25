#!/usr/bin/env node
// post-to-tiktok.js
// TikTok Content Posting API で動画をアップロードする
//
// 使い方:
//   node scripts/post-to-tiktok.js --video ./docs/experiments/2026-04-20-launch.mp4 \
//     --caption "本文 #ハイエース #バンライフ"
//   # URLからPULLする場合（推奨: TikTokサーバー側でダウンロード）
//   node scripts/post-to-tiktok.js --video-url "https://cdn.example.com/video.mp4" \
//     --caption "..."
//
// 必要な環境変数:
//   TIKTOK_ACCESS_TOKEN    = ユーザー認可後の access_token
//
// 前提:
//   1. https://developers.tiktok.com でアプリ作成
//   2. Login Kit + Content Posting API を有効化
//   3. video.upload + video.publish スコープを申請（審査 5〜10営業日）
//   4. 審査前: unaudited 状態だと投稿は PRIVATE のみになる
//
// 参考:
//   https://developers.tiktok.com/doc/content-posting-api-reference-direct-post

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const HOST = 'open.tiktokapis.com';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { privacy: 'SELF_ONLY', disableComment: false, disableDuet: false, disableStitch: false, photoUrls: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--video') out.video = args[++i];
    else if (args[i] === '--video-url') out.videoUrl = args[++i];
    else if (args[i] === '--photo-url') out.photoUrls.push(args[++i]);
    else if (args[i] === '--photo-urls') out.photoUrls = args[++i].split(',').map((s) => s.trim());
    else if (args[i] === '--title') out.title = args[++i];
    else if (args[i] === '--caption') out.caption = args[++i];
    else if (args[i] === '--privacy') out.privacy = args[++i]; // PUBLIC_TO_EVERYONE / MUTUAL_FOLLOW_FRIENDS / SELF_ONLY
    else if (args[i] === '--disable-comment') out.disableComment = true;
    else if (args[i] === '--disable-duet') out.disableDuet = true;
    else if (args[i] === '--disable-stitch') out.disableStitch = true;
  }
  return out;
}

function apiRequest({ pathStr, method = 'POST', token, body, extraHeaders = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: HOST,
        path: pathStr,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
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

async function uploadChunk({ uploadUrl, filePath, totalSize }) {
  const url = new URL(uploadUrl);
  const data = fs.readFileSync(filePath);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': data.length,
          'Content-Range': `bytes 0-${totalSize - 1}/${totalSize}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`Chunk upload HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function pollStatus(publishId, token) {
  for (let i = 0; i < 60; i++) {
    const res = await apiRequest({
      pathStr: '/v2/post/publish/status/fetch/',
      token,
      body: { publish_id: publishId },
    });
    const status = res.data?.status;
    console.log(`[tt] status: ${status}`);
    if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') return res;
    if (status && status.startsWith('FAILED')) throw new Error(`TikTok publish failed: ${JSON.stringify(res)}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('TikTok publish status timeout');
}

(async () => {
  const args = parseArgs();
  const token = process.env.TIKTOK_ACCESS_TOKEN;

  if (!token) {
    console.error('Missing TIKTOK_ACCESS_TOKEN in .env');
    process.exit(1);
  }
  const isPhotoMode = args.photoUrls && args.photoUrls.length > 0;
  if (!args.video && !args.videoUrl && !isPhotoMode) {
    console.error('Provide --video, --video-url, or --photo-url (image post)');
    process.exit(1);
  }
  if (!args.caption) {
    console.error('Provide --caption "..."');
    process.exit(1);
  }

  // ---- PHOTO MODE: TikTok Content Posting API photo carousel ----
  if (isPhotoMode) {
    const photoPostInfo = {
      title: (args.title || args.caption).slice(0, 90),
      description: args.caption.slice(0, 4000),
      privacy_level: args.privacy,
      disable_comment: args.disableComment,
      auto_add_music: true,
    };
    const photoBody = {
      post_info: photoPostInfo,
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: args.photoUrls,
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    };
    console.log(`[tt] PHOTO mode init (${args.photoUrls.length} photo(s))...`);
    const init = await apiRequest({
      pathStr: '/v2/post/publish/content/init/',
      token,
      body: photoBody,
    });
    const publishId = init.data.publish_id;
    console.log(`[tt] publish_id: ${publishId}`);
    console.log('[tt] polling status...');
    const result = await pollStatus(publishId, token);
    console.log('[tt] done:', JSON.stringify(result, null, 2));
    return;
  }

  const postInfo = {
    title: args.caption.slice(0, 2200),
    privacy_level: args.privacy,
    disable_comment: args.disableComment,
    disable_duet: args.disableDuet,
    disable_stitch: args.disableStitch,
    video_cover_timestamp_ms: 1000,
  };

  let initBody;
  let videoPath = args.video;
  let totalSize = 0;

  if (args.videoUrl) {
    initBody = {
      post_info: postInfo,
      source_info: { source: 'PULL_FROM_URL', video_url: args.videoUrl },
    };
  } else {
    totalSize = fs.statSync(videoPath).size;
    initBody = {
      post_info: postInfo,
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: totalSize,
        chunk_size: totalSize,
        total_chunk_count: 1,
      },
    };
  }

  console.log('[tt] initializing upload...');
  const init = await apiRequest({
    pathStr: '/v2/post/publish/video/init/',
    token,
    body: initBody,
  });
  const publishId = init.data.publish_id;
  console.log(`[tt] publish_id: ${publishId}`);

  if (initBody.source_info.source === 'FILE_UPLOAD') {
    console.log('[tt] uploading chunk...');
    await uploadChunk({ uploadUrl: init.data.upload_url, filePath: videoPath, totalSize });
  }

  console.log('[tt] polling status...');
  const result = await pollStatus(publishId, token);
  console.log('[tt] done:', JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error('[tt] error:', err.message);
  process.exit(1);
});
