#!/usr/bin/env node
// post-all-platforms.js
// /sns / /snsmovie の統一オーケストレータ
//
// /sns (mode=image):
//   入力: image (.png/.jpg/.heic/.webp)
//   X: 画像投稿
//   Instagram: 画像投稿（Graph API）
//   YouTube: 画像→15秒動画化→Shorts投稿
//   TikTok: 画像→15秒動画化→投稿
//
// /snsmovie (mode=video):
//   入力: video (.mp4/.mov)
//   X: 動画投稿
//   Instagram: Reels投稿
//   YouTube: Shorts投稿
//   TikTok: 投稿
//
// 使い方:
//   node scripts/post-all-platforms.js \
//     --mode image|video \
//     --media path/to/file \
//     --copy path/to/copy.json \
//     [--platforms x,instagram,tiktok,youtube] \
//     [--public-url https://github...raw...]
//     [--dry-run]
//
// copy.json 形式:
//   {
//     "x":         "X用キャプション",
//     "instagram": "Instagram用キャプション",
//     "tiktok":    "TikTok用キャプション",
//     "youtube":   { "title": "Title", "description": "Description" }
//   }

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    platforms: ['x', 'instagram', 'tiktok', 'youtube'],
    dryRun: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') out.mode = args[++i];
    else if (args[i] === '--media') out.media = args[++i];
    else if (args[i] === '--copy') out.copy = args[++i];
    else if (args[i] === '--platforms') out.platforms = args[++i].split(',').map((s) => s.trim());
    else if (args[i] === '--public-url') out.publicUrl = args[++i];
    else if (args[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

function runScript(script, scriptArgs, label) {
  return new Promise((resolve) => {
    console.log(`\n[${label}] starting: node ${script} ${scriptArgs.join(' ')}`);
    const proc = spawn('node', [path.join(__dirname, script), ...scriptArgs], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => resolve({ label, script, code }));
    proc.on('error', (err) => resolve({ label, script, code: -1, err: err.message }));
  });
}

function runShellScript(script, scriptArgs, label) {
  return new Promise((resolve) => {
    console.log(`\n[${label}] starting: bash ${script} ${scriptArgs.join(' ')}`);
    const proc = spawn('bash', [path.join(__dirname, script), ...scriptArgs], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => resolve({ label, script, code }));
    proc.on('error', (err) => resolve({ label, script, code: -1, err: err.message }));
  });
}

async function ensureVideoFromImage(imagePath) {
  const dir = path.join(__dirname, '..', 'docs', 'experiments');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(dir, `${stamp}-from-image.mp4`);
  const r = await runShellScript('image-to-video.sh', [imagePath, out], 'image2video');
  if (r.code !== 0 || !fs.existsSync(out)) {
    throw new Error('image-to-video.sh failed');
  }
  return out;
}

(async () => {
  const args = parseArgs();
  if (!args.mode || !['image', 'video'].includes(args.mode)) {
    console.error('Usage: --mode image|video required');
    process.exit(1);
  }
  if (!args.media || !fs.existsSync(args.media)) {
    console.error(`Missing or invalid --media: ${args.media}`);
    process.exit(1);
  }
  if (!args.copy || !fs.existsSync(args.copy)) {
    console.error(`Missing or invalid --copy: ${args.copy}`);
    process.exit(1);
  }

  const copy = JSON.parse(fs.readFileSync(args.copy, 'utf8'));
  const isImage = args.mode === 'image';

  // --- prepare video file if video mode ---
  // 画像モードでは動画変換しない (TikTokはPHOTO APIで画像投稿、YouTubeは画像非対応のためスキップ)
  let videoPath = null;
  if (!isImage) videoPath = args.media;

  if (args.dryRun) {
    console.log('\n=== DRY RUN: copy preview ===');
    for (const p of ['x', 'instagram', 'tiktok', 'youtube']) {
      const txt = typeof copy[p] === 'object' ? JSON.stringify(copy[p], null, 2) : copy[p];
      console.log(`\n--- ${p} ---\n${txt}`);
    }
    console.log('\n=== DRY RUN: media plan ===');
    console.log('  X:', args.media);
    console.log('  Instagram:', isImage ? 'image (single photo)' : 'video (Reels)');
    if (isImage) {
      console.log('  YouTube: skipped (Data API does not support image-only posts; use /snsmovie)');
      console.log('  TikTok:', `PHOTO mode via ${args.publicUrl || '(needs --public-url)'}`);
    } else {
      console.log('  YouTube:', videoPath);
      console.log('  TikTok:', videoPath);
    }
    return;
  }

  const jobs = [];

  const ttPrivacy = process.env.TIKTOK_AUDIT_PASSED === '1' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';

  // ============= X =============
  if (args.platforms.includes('x') && copy.x) {
    const xArgs = ['--text', copy.x, '--media', args.media];
    jobs.push(runScript('post-to-x.js', xArgs, 'x'));
  }

  // ============= Instagram =============
  if (args.platforms.includes('instagram') && copy.instagram) {
    const igArgs = ['--caption', copy.instagram];
    if (args.publicUrl) {
      if (isImage) igArgs.push('--image-url', args.publicUrl);
      else igArgs.push('--video-url', args.publicUrl, '--reels');
      jobs.push(runScript('post-to-instagram.js', igArgs, 'instagram'));
    } else {
      console.warn('[ig] skipped: --public-url required (Instagram requires public URL)');
    }
  }

  // ============= TikTok =============
  if (args.platforms.includes('tiktok') && copy.tiktok) {
    if (isImage) {
      // PHOTO mode requires a public URL
      if (args.publicUrl) {
        const ttArgs = [
          '--caption', copy.tiktok,
          '--photo-url', args.publicUrl,
          '--privacy', ttPrivacy,
        ];
        jobs.push(runScript('post-to-tiktok.js', ttArgs, 'tiktok'));
      } else {
        console.warn('[tiktok] skipped: --public-url required for PHOTO mode');
      }
    } else if (videoPath) {
      const ttArgs = ['--caption', copy.tiktok, '--video', videoPath, '--privacy', ttPrivacy];
      jobs.push(runScript('post-to-tiktok.js', ttArgs, 'tiktok'));
    }
  }

  // ============= YouTube =============
  if (args.platforms.includes('youtube') && copy.youtube) {
    if (isImage) {
      console.warn(
        '[youtube] skipped: YouTube Data API v3 does not support image-only posts. ' +
        'Use /snsmovie to upload videos. (Image post via Community/Posts API requires partner access.)'
      );
    } else if (videoPath) {
      const yt = copy.youtube;
      const ytArgs = [
        '--video', videoPath,
        '--title', (yt.title || 'Untitled').slice(0, 100),
        '--description', yt.description || '',
        '--privacy', 'public',
      ];
      if (yt.tags) ytArgs.push('--tags', Array.isArray(yt.tags) ? yt.tags.join(',') : yt.tags);
      jobs.push(runScript('post-to-youtube.js', ytArgs, 'youtube'));
    }
  }

  if (jobs.length === 0) {
    console.error('No platforms to post to. Check --platforms, --copy, and required assets.');
    process.exit(1);
  }

  console.log(`\n=== Posting to ${jobs.length} platforms in parallel ===\n`);
  const results = await Promise.all(jobs);

  // Log
  const dateStr = new Date().toISOString().slice(0, 10);
  const logPath = path.join(__dirname, '..', 'logs', `${dateStr}.md`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logLine = `\n## ${new Date().toISOString()} — ${args.mode} post\n${results
    .map((r) => `- ${r.label}: ${r.code === 0 ? '✓' : '✗ exit=' + r.code}`)
    .join('\n')}\n`;
  fs.appendFileSync(logPath, logLine);

  const failed = results.filter((r) => r.code !== 0);
  console.log('\n=== Results ===');
  for (const r of results) {
    console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.label} (exit=${r.code})`);
  }
  if (failed.length) {
    console.error(`\n[!] ${failed.length} platform(s) failed`);
    process.exit(1);
  }
  console.log('\n[✓] All platforms posted successfully.');
})().catch((err) => {
  console.error('[post-all] fatal:', err.message);
  process.exit(1);
});
