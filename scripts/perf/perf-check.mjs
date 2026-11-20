#!/usr/bin/env node
// Lab user-experience measurement for a running production build.
// Cold-cache, mobile-throttled page loads; reports medians of FCP, LCP, CLS, TBT, TTFB and JS/total bytes.
// Usage:
//   node scripts/perf/perf-check.mjs --base-url http://127.0.0.1:3200 --routes /,/photos --runs 5 --out perf/current.json
//   node scripts/perf/perf-check.mjs ... --baseline perf/baseline.json   # exits 1 on regression
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith("--")) pairs.push([token.slice(2), all[index + 1]?.startsWith("--") || all[index + 1] === undefined ? "true" : all[index + 1]]);
    return pairs;
  }, []),
);
const baseUrl = args["base-url"] ?? "http://127.0.0.1:3200";
const routes = (args.routes ?? "/").split(",").map((route) => route.trim()).filter(Boolean);
const runs = Number(args.runs ?? 5);
const profile = args.profile ?? "mobile";
const storageState = args["storage-state"];

// Lighthouse-like "Slow 4G" mobile profile; desktop is unthrottled.
const PROFILES = {
  mobile: { viewport: { width: 412, height: 823 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, cpu: 4,
    network: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 } },
  desktop: { viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, cpu: 1, network: null },
};

// Regression = worse than baseline by more than BOTH the relative and absolute tolerance (filters lab noise).
const TOLERANCE = {
  fcp: { rel: 0.1, abs: 100 }, lcp: { rel: 0.1, abs: 150 }, tbt: { rel: 0.2, abs: 50 }, ttfb: { rel: 0.2, abs: 100 },
  cls: { rel: 0, abs: 0.02 }, jsBytes: { rel: 0.05, abs: 10_240 }, totalBytes: { rel: 0.1, abs: 51_200 },
};

const OBSERVER = () => {
  window.__ux = { lcp: 0, cls: 0, longTasks: [] };
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__ux.lcp = entry.startTime; })
    .observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__ux.cls += entry.value; })
    .observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__ux.longTasks.push([entry.startTime, entry.duration]); })
    .observe({ type: "longtask", buffered: true });
};

async function measure(browser, route) {
  const settings = PROFILES[profile];
  const viewport = { ...settings.viewport, ...(args.width ? { width: Number(args.width) } : {}) };
  const context = await browser.newContext({ ...settings, viewport, cpu: undefined, network: undefined, storageState });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (settings.network) await cdp.send("Network.emulateNetworkConditions", settings.network);
  if (settings.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: settings.cpu });
  const bytes = { js: 0, total: 0 };
  const resourceTypes = new Map();
  cdp.on("Network.responseReceived", (event) => resourceTypes.set(event.requestId, event.type));
  cdp.on("Network.loadingFinished", (event) => {
    bytes.total += event.encodedDataLength;
    if (resourceTypes.get(event.requestId) === "Script") bytes.js += event.encodedDataLength;
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(OBSERVER);
  const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "load", timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const tti = nav.domInteractive + 5_000;
    const tbt = window.__ux.longTasks.filter(([start]) => start >= fcp && start <= Math.max(tti, nav.loadEventEnd))
      .reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
    return { ttfb: nav.responseStart, fcp, lcp: window.__ux.lcp, cls: window.__ux.cls, tbt };
  });
  const images = await page.locator('main img').evaluateAll((nodes) => nodes.map((node) => {
    const resources = performance.getEntriesByName(node.currentSrc, 'resource');
    const resource = resources.at(-1);
    return { src: node.getAttribute('src'), currentSrc: node.currentSrc, alt: node.alt,
      loaded: node.complete && node.naturalWidth > 0,
      ...(resource ? { startTime: resource.startTime, responseEnd: resource.responseEnd } : {}),
    };
  }));
  if (args.screenshot) await page.screenshot({ path: args.screenshot, fullPage: true });
  await context.close();
  return { status: response?.status() ?? 0, ...metrics, jsBytes: bytes.js, totalBytes: bytes.total, errors, images };
}

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const KEYS = ["ttfb", "fcp", "lcp", "cls", "tbt", "jsBytes", "totalBytes"];

const browser = await chromium.launch();
const result = { baseUrl, profile, runs, measuredAt: new Date().toISOString(), routes: {} };
for (const route of routes) {
  await measure(browser, route); // warm the server (JIT, connection pools); not recorded
  const samples = [];
  for (let run = 0; run < runs; run += 1) samples.push(await measure(browser, route));
  const summary = Object.fromEntries(KEYS.map((key) => [key, Number(median(samples.map((sample) => sample[key])).toFixed(key === "cls" ? 4 : 0))]));
  result.routes[route] = { ...summary, samples, statuses: [...new Set(samples.map((s) => s.status))], errors: [...new Set(samples.flatMap((s) => s.errors))] };
}
await browser.close();

if (args.out) { await mkdir(dirname(args.out), { recursive: true }); await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`); }

const baseline = args.baseline ? JSON.parse(await readFile(args.baseline, "utf8")) : null;
const regressions = [];
const fmt = (key, value) => value === undefined ? "–" : key === "cls" ? value.toFixed(3) : key.endsWith("Bytes") ? `${(value / 1024).toFixed(1)} KB` : `${Math.round(value)} ms`;
console.log(`\n### UX performance (${profile}, median of ${runs} cold loads)\n`);
console.log(`| Route | Metric | ${baseline ? "Baseline | " : ""}Current | Status |`);
console.log(`| --- | --- | ${baseline ? "--- | " : ""}--- | --- |`);
for (const [route, current] of Object.entries(result.routes)) {
  if (current.errors.length || current.statuses.some((status) => status >= 400)) regressions.push(`${route}: HTTP ${current.statuses.join(",")} errors=${current.errors.length}`);
  for (const key of KEYS) {
    const before = baseline?.routes?.[route]?.[key];
    const limit = before === undefined ? undefined : before + Math.max(before * TOLERANCE[key].rel, TOLERANCE[key].abs);
    const regressed = limit !== undefined && current[key] > limit;
    if (regressed) regressions.push(`${route} ${key}: ${fmt(key, before)} -> ${fmt(key, current[key])}`);
    console.log(`| ${route} | ${key} | ${baseline ? `${fmt(key, before)} | ` : ""}${fmt(key, current[key])} | ${regressed ? "REGRESSED" : "ok"} |`);
  }
}
if (regressions.length) { console.error(`\nPerformance regressions:\n- ${regressions.join("\n- ")}`); process.exit(1); }
