#!/usr/bin/env node
/**
 * Standalone script: generates a 30-second animated recap video for a user.
 *
 * Usage:
 *   cd backend && node scripts/generate-recap-video.mjs --email qdenxp@gmail.com
 *
 * Requires: ffmpeg on PATH, @napi-rs/canvas installed.
 * Output: backend/scripts/output/recap-<userId>.mp4
 */
import "dotenv/config";
import { createCanvas } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { redis, redisKey } from "../services/redisClient.js";

// ── Config ──────────────────────────────────────────────────────────
const WIDTH = 1080;
const HEIGHT = 1920; // 9:16 portrait (story format)
const FPS = 30;
const CARD_DURATION_S = 5; // seconds per card
const CARD_FRAMES = FPS * CARD_DURATION_S;

const palette = {
  bg: "#0D0D0D",
  card: "#1A1A1A",
  accent: "#A78BFA",    // violet
  accentDim: "#6D28D9",
  text: "#F5F5F5",
  muted: "#9CA3AF",
  green: "#34D399",
  red: "#F87171",
  amber: "#FBBF24",
  teal: "#2DD4BF",
  ring: "#312E81",
};

// ── Args ────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--email");
  if (idx === -1 || !args[idx + 1]) {
    console.error("Usage: node generate-recap-video.mjs --email <email>");
    process.exit(1);
  }
  return { email: args[idx + 1] };
}

// ── Data fetching ───────────────────────────────────────────────────
async function resolveUserId(email) {
  const key = redisKey("userEmail", email.toLowerCase());
  const userId = await redis(["GET", key]);
  if (!userId) throw new Error(`No user found for email: ${email}`);
  return userId;
}

async function fetchReport(ownerId) {
  const base = "https://backend-five-nu-92.vercel.app";
  const url = `${base}/api/weeklyReport?deviceId=${ownerId}`;
  console.log("Fetching report:", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.data?.report || data.data || data;
}

// ── Drawing helpers ─────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackground(ctx) {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawBrandWatermark(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = palette.muted;
  ctx.font = "500 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("QuietDen", WIDTH / 2, HEIGHT - 60);
  ctx.restore();
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t * t; }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }

/** Returns a 0→1 progress for entrance (first 15 frames) and exit (last 10 frames). */
function cardAlpha(frameInCard) {
  const enterFrames = 15;
  const exitFrames = 10;
  if (frameInCard < enterFrames) return easeOut(frameInCard / enterFrames);
  if (frameInCard > CARD_FRAMES - exitFrames) return easeIn((CARD_FRAMES - frameInCard) / exitFrames);
  return 1;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Card renderers ──────────────────────────────────────────────────

function renderCard1_YourWeek(ctx, report, progress) {
  // Title
  const alpha = progress;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = palette.accent;
  ctx.font = "bold 72px sans-serif";
  ctx.textAlign = "center";
  const titleY = 380 + (1 - easeOut(clamp01(progress * 2))) * 40;
  ctx.fillText("Your Week", WIDTH / 2, titleY);

  // Subtitle
  ctx.fillStyle = palette.muted;
  ctx.font = "400 36px sans-serif";
  ctx.fillText("at a glance", WIDTH / 2, titleY + 50);

  // Main metrics
  const metricsY = 620;
  const bm = report.baselineMetrics || {};
  const feel = report.averageFeel != null ? report.averageFeel.toFixed(1) : (bm.recentAverage?.toFixed?.(1) || "—");
  const totalMoments = report.totalMoments || 0;
  const stateOfMind = bm.stateOfMind || report.aiInsight?.stateOfMind || "—";

  // Big number: total moments
  const numProgress = easeOut(clamp01((progress - 0.15) * 3));
  const displayMoments = Math.round(totalMoments * numProgress);

  ctx.fillStyle = palette.text;
  ctx.font = "bold 160px sans-serif";
  ctx.fillText(String(displayMoments), WIDTH / 2, metricsY + 100);
  ctx.fillStyle = palette.muted;
  ctx.font = "400 38px sans-serif";
  ctx.fillText("moments logged", WIDTH / 2, metricsY + 160);

  // State of mind badge
  const badgeY = metricsY + 260;
  const badgeText = stateOfMind.replace(/_/g, " ");
  roundRect(ctx, WIDTH / 2 - 200, badgeY - 40, 400, 70, 35);
  ctx.fillStyle = palette.accentDim;
  ctx.globalAlpha = alpha * 0.5;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.accent;
  ctx.font = "600 34px sans-serif";
  ctx.fillText(badgeText, WIDTH / 2, badgeY + 5);

  // Feel score
  const feelY = badgeY + 130;
  ctx.fillStyle = palette.text;
  ctx.font = "bold 80px sans-serif";
  ctx.fillText(feel, WIDTH / 2, feelY);
  ctx.fillStyle = palette.muted;
  ctx.font = "400 32px sans-serif";
  ctx.fillText("avg feel score", WIDTH / 2, feelY + 50);

  ctx.restore();
}

function renderCard2_TopTriggers(ctx, report, progress) {
  const alpha = progress;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = palette.accent;
  ctx.font = "bold 60px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Top Triggers", WIDTH / 2, 380);

  const triggerFreq = report.triggerFrequency || {};
  const sorted = Object.entries(triggerFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!sorted.length) {
    ctx.fillStyle = palette.muted;
    ctx.font = "400 36px sans-serif";
    ctx.fillText("No trigger data yet", WIDTH / 2, 700);
    ctx.restore();
    return;
  }

  const maxVal = sorted[0][1];
  const barMaxW = 600;
  const startY = 520;
  const barH = 60;
  const gap = 30;

  sorted.forEach(([trigger, count], i) => {
    const y = startY + i * (barH + gap);
    const barProgress = easeOut(clamp01((progress - 0.1 - i * 0.08) * 4));
    const barW = (count / maxVal) * barMaxW * barProgress;

    // Bar background
    roundRect(ctx, (WIDTH - barMaxW) / 2, y, barMaxW, barH, 12);
    ctx.fillStyle = palette.card;
    ctx.fill();

    // Bar fill
    if (barW > 0) {
      roundRect(ctx, (WIDTH - barMaxW) / 2, y, barW, barH, 12);
      ctx.fillStyle = palette.accentDim;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // Label
    ctx.fillStyle = palette.text;
    ctx.font = "600 30px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(trigger, (WIDTH - barMaxW) / 2 + 20, y + 40);

    // Count
    ctx.textAlign = "right";
    ctx.fillStyle = palette.muted;
    ctx.font = "400 28px sans-serif";
    ctx.fillText(`${count}x`, (WIDTH + barMaxW) / 2 - 20, y + 40);

    ctx.textAlign = "center";
  });

  ctx.restore();
}

function renderCard3_EmotionArc(ctx, report, progress) {
  const alpha = progress;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = palette.accent;
  ctx.font = "bold 60px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Emotional Arc", WIDTH / 2, 380);

  const trajectory = report.weeklyEmotionTrajectory || [];
  if (trajectory.length < 2) {
    ctx.fillStyle = palette.muted;
    ctx.font = "400 36px sans-serif";
    ctx.fillText("Not enough data for trajectory", WIDTH / 2, 700);
    ctx.restore();
    return;
  }

  const chartX = 140;
  const chartY = 520;
  const chartW = WIDTH - 280;
  const chartH = 500;

  // Grid lines
  ctx.strokeStyle = palette.card;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }

  // Draw line
  const scores = trajectory.map(d => d.score ?? 0.5);
  const minS = Math.min(...scores) - 0.05;
  const maxS = Math.max(...scores) + 0.05;
  const range = maxS - minS || 1;

  const lineProgress = easeOut(clamp01((progress - 0.15) * 2.5));
  const pointsToDraw = Math.floor(trajectory.length * lineProgress);

  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  const points = [];
  trajectory.forEach((d, i) => {
    const x = chartX + (i / (trajectory.length - 1)) * chartW;
    const y = chartY + chartH - ((d.score - minS) / range) * chartH;
    points.push({ x, y });
  });

  points.slice(0, pointsToDraw).forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Dots
  points.slice(0, pointsToDraw).forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent;
    ctx.fill();
  });

  // Day labels
  ctx.fillStyle = palette.muted;
  ctx.font = "400 24px sans-serif";
  ctx.textAlign = "center";
  points.forEach((p, i) => {
    const dayLabel = trajectory[i].date?.slice(5) || `D${i + 1}`;
    ctx.fillText(dayLabel, p.x, chartY + chartH + 40);
  });

  // Dominant emotion labels
  points.slice(0, pointsToDraw).forEach((p, i) => {
    const emotion = trajectory[i].dominantEmotion || trajectory[i].tone;
    if (emotion) {
      ctx.fillStyle = palette.teal;
      ctx.font = "500 22px sans-serif";
      ctx.fillText(emotion, p.x, p.y - 20);
    }
  });

  // Trajectory note
  if (report.trajectoryNote && lineProgress > 0.8) {
    const noteAlpha = easeOut(clamp01((lineProgress - 0.8) * 5));
    ctx.globalAlpha = alpha * noteAlpha;
    ctx.fillStyle = palette.text;
    ctx.font = "italic 30px sans-serif";
    const lines = wrapText(ctx, report.trajectoryNote, chartW);
    lines.forEach((l, li) => {
      ctx.fillText(l, WIDTH / 2, chartY + chartH + 100 + li * 40);
    });
  }

  ctx.restore();
}

function renderCard4_PatternShift(ctx, report, progress) {
  const alpha = progress;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = palette.accent;
  ctx.font = "bold 60px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Pattern Shift", WIDTH / 2, 380);

  const bm = report.baselineMetrics || {};
  const drift = bm.drift;
  const stability = bm.stability;

  const centerY = 700;

  // Drift indicator
  if (drift) {
    const driftLabel = drift.label || "stable";
    const driftDir = drift.direction || "";
    const driftVal = drift.value?.toFixed?.(2) || "0";
    const driftColor = driftDir === "improving" ? palette.green : driftDir === "declining" ? palette.red : palette.amber;

    const morphProgress = easeOut(clamp01((progress - 0.2) * 3));

    // Big arrow or indicator
    ctx.fillStyle = driftColor;
    ctx.font = "bold 120px sans-serif";
    const arrow = driftDir === "improving" ? "↑" : driftDir === "declining" ? "↓" : "→";
    ctx.globalAlpha = alpha * morphProgress;
    ctx.fillText(arrow, WIDTH / 2, centerY - 30);

    ctx.fillStyle = palette.text;
    ctx.font = "bold 48px sans-serif";
    ctx.globalAlpha = alpha * morphProgress;
    ctx.fillText(driftLabel, WIDTH / 2, centerY + 50);

    ctx.fillStyle = palette.muted;
    ctx.font = "400 32px sans-serif";
    ctx.fillText(`drift: ${driftVal}`, WIDTH / 2, centerY + 100);
  }

  // Stability
  if (stability) {
    const stabY = centerY + 200;
    const stabProgress = easeOut(clamp01((progress - 0.4) * 3));
    ctx.globalAlpha = alpha * stabProgress;

    ctx.fillStyle = palette.text;
    ctx.font = "600 40px sans-serif";
    ctx.fillText(`Stability: ${stability.label || "—"}`, WIDTH / 2, stabY);

    const stabScore = stability.score || 0;
    const barW = 500;
    const barH = 24;
    const barX = (WIDTH - barW) / 2;

    roundRect(ctx, barX, stabY + 25, barW, barH, 12);
    ctx.fillStyle = palette.card;
    ctx.fill();

    const fillW = barW * clamp01(stabScore) * stabProgress;
    if (fillW > 0) {
      roundRect(ctx, barX, stabY + 25, fillW, barH, 12);
      ctx.fillStyle = palette.teal;
      ctx.fill();
    }
  }

  // Recurrence note
  const rec = report.recurrence;
  if (rec && rec.note) {
    const recY = centerY + 350;
    const recProgress = easeOut(clamp01((progress - 0.55) * 3));
    ctx.globalAlpha = alpha * recProgress;
    ctx.fillStyle = palette.muted;
    ctx.font = "italic 28px sans-serif";
    const lines = wrapText(ctx, rec.note, 700);
    lines.forEach((l, li) => {
      ctx.fillText(l, WIDTH / 2, recY + li * 38);
    });
  }

  ctx.restore();
}

function renderCard5_Insight(ctx, report, progress) {
  const alpha = progress;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = palette.accent;
  ctx.font = "bold 56px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Your Insight", WIDTH / 2, 350);

  // Use AI summary or LLM narrative
  const summary = report.aiInsight?.summary
    || report.llmInsight?.narrative
    || report.llmTeaser?.narrative
    || "Keep logging to unlock insights.";

  // Typewriter effect
  const typewriterProgress = easeOut(clamp01((progress - 0.15) * 1.8));
  const charsToShow = Math.floor(summary.length * typewriterProgress);
  const displayText = summary.slice(0, charsToShow);

  ctx.fillStyle = palette.text;
  ctx.font = "400 36px sans-serif";
  const lines = wrapText(ctx, displayText, WIDTH - 200);
  const startTextY = 500;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, startTextY + i * 52);
  });

  // Blinking cursor
  if (typewriterProgress < 1) {
    const lastLine = lines[lines.length - 1] || "";
    const cursorX = WIDTH / 2 + ctx.measureText(lastLine).width / 2 + 5;
    const cursorY = startTextY + (lines.length - 1) * 52;
    if (Math.floor(progress * 15) % 2 === 0) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(cursorX, cursorY - 30, 3, 38);
    }
  }

  // What's working / focus areas
  const whatWorking = report.aiInsight?.whatWorking || [];
  const whereToFocus = report.aiInsight?.whereToFocus || [];
  const listsY = startTextY + lines.length * 52 + 80;
  const listProgress = easeOut(clamp01((progress - 0.6) * 3));

  if (whatWorking.length > 0 && listProgress > 0) {
    ctx.globalAlpha = alpha * listProgress;
    ctx.fillStyle = palette.green;
    ctx.font = "600 32px sans-serif";
    ctx.fillText("✓ Working", WIDTH / 2, listsY);

    ctx.fillStyle = palette.text;
    ctx.font = "400 28px sans-serif";
    whatWorking.slice(0, 2).forEach((w, i) => {
      const text = typeof w === "string" ? w : w.text || "";
      const tLines = wrapText(ctx, text, WIDTH - 240);
      tLines.slice(0, 1).forEach((l, li) => {
        ctx.fillText(l, WIDTH / 2, listsY + 45 + i * 40 + li * 35);
      });
    });
  }

  ctx.restore();
}

function renderCard6_Actions(ctx, report, progress) {
  const alpha = progress;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = palette.accent;
  ctx.font = "bold 56px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Action Pulse", WIDTH / 2, 380);

  const feedback = report.actionFeedback || [];
  const helped = feedback.filter(f => f.response === "tried" || f.response === "helped").length;
  const skipped = feedback.filter(f => f.response === "skipped" || f.response === "not_helpful").length;
  const total = helped + skipped;

  // Donut chart
  const centerX = WIDTH / 2;
  const centerY = 750;
  const radius = 180;
  const ringW = 40;

  const ringProgress = easeOut(clamp01((progress - 0.15) * 2.5));

  // Background ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.lineWidth = ringW;
  ctx.strokeStyle = palette.ring;
  ctx.stroke();

  if (total > 0) {
    const helpedAngle = (helped / total) * Math.PI * 2 * ringProgress;

    // Helped arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + helpedAngle);
    ctx.lineWidth = ringW;
    ctx.strokeStyle = palette.green;
    ctx.lineCap = "round";
    ctx.stroke();

    // Center text
    const pct = Math.round((helped / total) * 100 * ringProgress);
    ctx.fillStyle = palette.text;
    ctx.font = "bold 72px sans-serif";
    ctx.fillText(`${pct}%`, centerX, centerY + 10);
    ctx.fillStyle = palette.muted;
    ctx.font = "400 28px sans-serif";
    ctx.fillText("effective", centerX, centerY + 50);
  } else {
    ctx.fillStyle = palette.muted;
    ctx.font = "400 32px sans-serif";
    ctx.fillText("No action feedback yet", centerX, centerY + 10);
  }

  // Stats row
  const statsY = centerY + radius + 100;
  const statsProgress = easeOut(clamp01((progress - 0.45) * 3));
  ctx.globalAlpha = alpha * statsProgress;

  ctx.fillStyle = palette.green;
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(String(helped), centerX - 150, statsY);
  ctx.fillStyle = palette.muted;
  ctx.font = "400 26px sans-serif";
  ctx.fillText("helped", centerX - 150, statsY + 36);

  ctx.fillStyle = palette.red;
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(String(skipped), centerX + 150, statsY);
  ctx.fillStyle = palette.muted;
  ctx.font = "400 26px sans-serif";
  ctx.fillText("skipped", centerX + 150, statsY + 36);

  // Top regulators
  const regulators = report.regulators || [];
  if (regulators.length > 0) {
    const regY = statsY + 120;
    const regProgress = easeOut(clamp01((progress - 0.6) * 3));
    ctx.globalAlpha = alpha * regProgress;

    ctx.fillStyle = palette.accent;
    ctx.font = "600 32px sans-serif";
    ctx.fillText("Top Regulators", centerX, regY);

    ctx.fillStyle = palette.text;
    ctx.font = "400 28px sans-serif";
    regulators.slice(0, 3).forEach((r, i) => {
      ctx.fillText(`${r.trigger} + ${r.emotion} (${r.count}x)`, centerX, regY + 50 + i * 42);
    });
  }

  ctx.restore();
}

// ── Main pipeline ───────────────────────────────────────────────────
async function main() {
  const { email } = parseArgs();

  console.log(`\n🎬 QuietDen Recap Video Generator`);
  console.log(`Email: ${email}\n`);

  // 1. Resolve user
  console.log("Resolving user...");
  const ownerId = await resolveUserId(email);
  console.log(`Owner ID: ${ownerId}`);

  // 2. Fetch report
  console.log("Fetching weekly report...");
  const report = await fetchReport(ownerId);
  console.log(`Report: ${report.totalMoments || 0} moments, volatility=${report.volatilityLabel || "?"}`);

  // 3. Setup output
  const outDir = path.join(import.meta.dirname, "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `recap-${ownerId.slice(0, 8)}.mp4`);

  // 4. Cards
  const cards = [
    renderCard1_YourWeek,
    renderCard2_TopTriggers,
    renderCard3_EmotionArc,
    renderCard4_PatternShift,
    renderCard5_Insight,
    renderCard6_Actions,
  ];
  const totalFrames = cards.length * CARD_FRAMES;
  console.log(`Rendering ${cards.length} cards × ${CARD_DURATION_S}s = ${cards.length * CARD_DURATION_S}s (${totalFrames} frames @ ${FPS}fps)`);

  // 5. Spawn ffmpeg and pipe raw RGBA frames
  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${WIDTH}x${HEIGHT}`,
    "-r", String(FPS),
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "medium",
    "-crf", "23",
    "-movflags", "+faststart",
    outPath,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  let frameCount = 0;

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    for (let f = 0; f < CARD_FRAMES; f++) {
      const progress = cardAlpha(f);

      // Clear
      drawBackground(ctx);

      // Render current card
      cards[cardIndex](ctx, report, progress);

      // Watermark
      drawBrandWatermark(ctx);

      // Progress dots at bottom
      drawProgressDots(ctx, cardIndex, cards.length, f / CARD_FRAMES);

      // Write raw frame to ffmpeg
      const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
      const buf = Buffer.from(imageData.data.buffer);
      const canWrite = ffmpeg.stdin.write(buf);
      if (!canWrite) {
        await new Promise(resolve => ffmpeg.stdin.once("drain", resolve));
      }

      frameCount++;
      if (frameCount % FPS === 0) {
        process.stdout.write(`\r  Frame ${frameCount}/${totalFrames} (${Math.round(frameCount / totalFrames * 100)}%)`);
      }
    }
  }

  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

  console.log(`\n\n✅ Video saved: ${outPath}`);
  console.log(`   Duration: ${cards.length * CARD_DURATION_S}s | Resolution: ${WIDTH}×${HEIGHT}`);
}

function drawProgressDots(ctx, activeIndex, total, cardProgress) {
  const dotR = 8;
  const gap = 30;
  const totalW = total * (dotR * 2 + gap) - gap;
  const startX = (WIDTH - totalW) / 2;
  const y = HEIGHT - 130;

  for (let i = 0; i < total; i++) {
    const x = startX + i * (dotR * 2 + gap) + dotR;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    if (i === activeIndex) {
      ctx.fillStyle = palette.accent;
    } else if (i < activeIndex) {
      ctx.fillStyle = palette.accentDim;
    } else {
      ctx.fillStyle = palette.card;
    }
    ctx.fill();

    // Active dot has a progress ring
    if (i === activeIndex) {
      ctx.beginPath();
      ctx.arc(x, y, dotR + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cardProgress);
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exitCode = 1;
});
