#!/usr/bin/env node
// post-to-youtube.js
// YouTube Data API v3 で動画（Shorts対応）をアップロードする
//
// 使い方:
//   node scripts/post-to-youtube.js --video ./docs/experiments/2026-04-20-launch.mp4 \
//     --title "ハイエース改造で200万→37万になった話" \
//     --description-file docs/copy/2026-04-20-launch-copy.md \
//     --tags "ハイエース,バンライフ,車中泊,DIY" \
//     --privacy public
//
// 必要な環境変数:
//   YT_CLIENT_ID        = OAuth 2.0 Client ID
//   YT_CLIENT_SECRET    = OAuth 2.0 Client Secret
//   YT_REFRESH_TOKEN    = ユーザーの Refresh Token（初回のみ OAuth 承認フローで取得）
//
// 前提:
//   1. Google Cloud Console で YouTube Data API v3 を有効化
//   2. OAuth 同意画面を設定し、テストユーザーに自分を追加
//   3. Desktop または Web 用の OAuth クライアントID作成
//   4. 初回のみ下記URLで認可 → code から refresh_token を取得
//      https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=consent
//
// Shorts として認識させるコツ:
//   - 動画が 60秒以下
//   - 縦長（9:16）または正方形
//   - タイトル or description に #Shorts を含める
//
// 依存: なし（Node 標準のみ）

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { tags: [], privacy: 'private' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--video') out.video = args[++i];
    else if (args[i] === '--title') out.title = args[++i];
    else if (args[i] === '--description') out.description = args[++i];
    else if (args[i] === '--description-file') out.descriptionFile = args[++i];
    else if (args[i] === '--tags') out.tags = args[++i].split(',').map((s) => s.trim());
    else if (args[i] === '--privacy') out.privacy = args[++i];
    else if (args[i] === '--category') out.categoryId = args[++i];
  }
  return out;
}

function httpRequest({ hostname, path: urlPath, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: text });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text}`));
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) req.write(body);
      else req.write(body);
    }
    req.end();
  });
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = querystring.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await httpRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  return res.body.access_token;
}

async function uploadVideo({ token, videoPath, snippet, status }) {
  // YouTube の resumable upload は 2段階:
  // 1) metadata POST → upload URL 取得
  // 2) upload URL に binary PUT
  const metadata = { snippet, status };
  const metaBody = JSON.stringify(metadata);
  const fileSize = fs.statSync(videoPath).size;

  const init = await httpRequest({
    hostname: 'www.googleapis.com',
    path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Length': Buffer.byteLength(metaBody),
      'X-Upload-Content-Length': fileSize,
      'X-Upload-Content-Type': 'video/*',
    },
    body: metaBody,
  });

  const uploadUrl = init.headers.location;
  if (!uploadUrl) throw new Error('No upload URL returned');

  const url = new URL(uploadUrl);
  const fileData = fs.readFileSync(videoPath);

  const upload = await httpRequest({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Length': fileData.length,
      'Content-Type': 'video/*',
    },
    body: fileData,
  });

  return upload.body;
}

(async () => {
  const args = parseArgs();
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN in .env');
    process.exit(1);
  }
  if (!args.video) {
    console.error('Provide --video path/to/file.mp4');
    process.exit(1);
  }
  if (!args.title) {
    console.error('Provide --title "..."');
    process.exit(1);
  }

  let description = args.description || '';
  if (!description && args.descriptionFile) {
    description = fs.readFileSync(args.descriptionFile, 'utf8');
  }

  console.log('[yt] exchanging refresh token for access token...');
  const token = await getAccessToken({ clientId, clientSecret, refreshToken });

  // 期待チャンネルIDが .env に設定されている場合、認可されたチャンネルを検証
  const expectedChannelId = process.env.YT_EXPECTED_CHANNEL_ID;
  if (expectedChannelId) {
    const ch = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'www.googleapis.com',
          path: '/youtube/v3/channels?part=id,snippet&mine=true',
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              reject(new Error('parse error'));
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    }).catch(() => null);
    const actualId = ch?.items?.[0]?.id;
    const actualName = ch?.items?.[0]?.snippet?.title;
    if (actualId && actualId !== expectedChannelId) {
      console.error(
        `[yt] ✘ Wrong channel: ${actualName} (${actualId}) — expected ${expectedChannelId}.\n` +
          `    Re-run scripts/get-yt-refresh-token.js and pick the correct channel.`
      );
      process.exit(1);
    }
    if (actualId) console.log(`[yt] ✓ Authorized channel: ${actualName} (${actualId})`);
  }

  const snippet = {
    title: args.title.slice(0, 100),
    description,
    tags: args.tags,
    categoryId: args.categoryId || '22', // People & Blogs
  };
  const status = { privacyStatus: args.privacy, selfDeclaredMadeForKids: false };

  console.log(`[yt] uploading ${args.video} (${fs.statSync(args.video).size} bytes)...`);
  const result = await uploadVideo({ token, videoPath: args.video, snippet, status });
  console.log('[yt] done:');
  console.log(`  video_id: ${result.id}`);
  console.log(`  url: https://youtu.be/${result.id}`);
})().catch((err) => {
  console.error('[yt] error:', err.message);
  process.exit(1);
});
