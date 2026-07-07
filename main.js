const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { modalKey } = require('./components/modalKey');
const { yoti } = require('./components/yoti');
const { geoCheck } = require('./components/geoCheck');
const { siteCrawler } = require('./components/siteCrawler');

const config = {
  headless: true,
  navigationTimeoutMs: 30000,
  waitAfterLoadMs: 1500,

  components: {
    modalKey: {
      enabled: true,
      timeoutMs: 7000,
    },
  geoCheck: {
      enabled: true,
      timeoutMs: 15000,
      expectedRegion: 'Iowa',
    },
  yoti: {
      enabled: true,
      timeoutMs: 25000,
      randomEmail: `qa-random-${Date.now()}@gmail.com`,
      validEmail: 'rencykalagayan@stunnermedia.com',
      safePassageUrlPattern: /safepassageapp\.com/i,
    },
  siteCrawler: {
  enabled: true,
  timeoutMs: 30000,
  waitAfterLoadMs: 1000,
  mrandomSceneCount: 5,
  randomModelCount: 5,
},

  },
};

function readUrls(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function summarizeWholeTest(result) {
  const geoCheck = result.geoCheck || null;
  const yoti = result.yoti || null;
  const siteCrawler = result.siteCrawler || null;

  const testedScenes = siteCrawler?.scenes?.testedItems || [];
  const testedModels = siteCrawler?.models?.testedItems || [];

  const brokenScenes = siteCrawler?.scenes?.brokenItems || [];
  const brokenModels = siteCrawler?.models?.brokenItems || [];

  const scenePagesPassed = testedScenes.filter((item) => {
    return item.ok === true && item.status === 200 && !item.error;
  }).length;

  const sceneVideoPassed = testedScenes.filter((item) => {
    return item.videoPlayback?.passed === true;
  }).length;

  const sceneVideoFailed = testedScenes.filter((item) => {
    return item.videoPlayback && item.videoPlayback.passed !== true;
  }).length;

  const modelPagesPassed = testedModels.filter((item) => {
    return item.ok === true && item.status === 200 && !item.error;
  }).length;

  const yotiModalPassed = yoti?.modalPresence?.fullyPresent === true;
  const yotiRandomPassed = yoti?.randomEmailTest?.passed === true;

  const yotiValidPassed =
    yoti?.validEmailTest?.passed === true ||
    yoti?.validEmailTest?.analysis?.passed === true;

  const siteCrawlerPassed =
    brokenScenes.length === 0 &&
    brokenModels.length === 0 &&
    sceneVideoFailed === 0;

  const passed =
    siteCrawlerPassed &&
    (!yoti || (yotiModalPassed && yotiRandomPassed && yotiValidPassed));

  return {
    url: result.url,
    finalUrl: result.finalUrl,
    passed,

    geo: geoCheck
      ? {
          ipProvider: geoCheck.ipProvider || null,
          ip: geoCheck.ip || null,
          city: geoCheck.city || null,
          region: geoCheck.detectedRegion || null,
          expectedRegion: geoCheck.expectedRegion || null,
          regionMatched: geoCheck.ipRegionMatched === true,
        }
      : null,

    yoti: yoti
      ? {
          modalFound: yotiModalPassed,
          randomEmailToSafepassage: yotiRandomPassed,
          validEmailToTourContent: yotiValidPassed,
          error: yoti.error || null,
        }
      : null,

    siteCrawler: siteCrawler
      ? {
          passed: siteCrawlerPassed,

          scenes: {
            cardsFound: siteCrawler.scenes?.cardsFound || 0,
            tested: testedScenes.length,
            pagesPassed: scenePagesPassed,
            videoPassed: sceneVideoPassed,
            videoFailed: sceneVideoFailed,
            broken: brokenScenes.length,
          },

          models: {
            cardsFound: siteCrawler.models?.cardsFound || 0,
            tested: testedModels.length,
            pagesPassed: modelPagesPassed,
            broken: brokenModels.length,
          },

          totalTested: testedScenes.length + testedModels.length,
          totalBroken: brokenScenes.length + brokenModels.length,
        }
      : null,
  };
}

async function runFlowForUrl(page, url) {
  console.log(`\n[main] opening ${url}`);

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.navigationTimeoutMs,
  });

  console.log('[main] waiting for page to settle');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(config.waitAfterLoadMs);

  let modalResult = null;

  if (config.components.modalKey?.enabled) {
    console.log('[main] running modalKey');

    const hostname = new URL(page.url()).hostname;
    const hostCleaned = hostname.replace(/^www\./, '');

    modalResult = await modalKey(page, {
      name: hostname,
      host: hostCleaned,
      timeoutMs: config.components.modalKey.timeoutMs,
    });

    console.log(`[main] modalKey result: ${JSON.stringify(modalResult)}`);
  }

  let geoResult = null;

  if (config.components.geoCheck?.enabled) {
    console.log('[main] running geoCheck');

    geoResult = await geoCheck(page, {
      name: 'geoCheck',
      timeoutMs: config.components.geoCheck.timeoutMs,
      expectedRegion: config.components.geoCheck.expectedRegion,
    });

    console.log(`[main] geoCheck result: ${JSON.stringify(geoResult, null, 2)}`);
  }

  let yotiResult = null;

  if (config.components.yoti?.enabled) {
    console.log('[main] about to run yoti');

    yotiResult = await yoti(page, {
      name: 'yoti',
      timeoutMs: config.components.yoti.timeoutMs,
      randomEmail: config.components.yoti.randomEmail,
      validEmail: config.components.yoti.validEmail,
      safePassageUrlPattern: config.components.yoti.safePassageUrlPattern,
      tourUrlPattern: config.components.yoti.tourUrlPattern,
    });

    console.log(`[main] yoti result: ${JSON.stringify(yotiResult, null, 2)}`);
  } else {
    console.log('[main] yoti is disabled or missing from config');
  }

let siteCrawlerResult = null;

if (config.components.siteCrawler?.enabled) {
  console.log('[main] running siteCrawler');

  siteCrawlerResult = await siteCrawler(page, {
    name: 'siteCrawler',
    timeoutMs: config.components.siteCrawler.timeoutMs,
    waitAfterLoadMs: config.components.siteCrawler.waitAfterLoadMs,
    randomSceneCount: config.components.siteCrawler.randomSceneCount,
    randomModelCount: config.components.siteCrawler.randomModelCount,
  });

  console.log(`[main] siteCrawler result: ${JSON.stringify(siteCrawlerResult, null, 2)}`);

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.navigationTimeoutMs,
  });

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(config.waitAfterLoadMs);
}

  console.log('[main] ready for next step');

  await page.waitForTimeout(3000);

  const fullResult = {
  url,
  finalUrl: page.url(),
  geoCheck: geoResult,
  siteCrawler: siteCrawlerResult,
  yoti: yotiResult,
};

return summarizeWholeTest(fullResult);
}

function saveResultsJson(results) {
  const outputDir = path.resolve(process.cwd(), 'results');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const outputPath = path.join(outputDir, `qa-summary-${timestamp}.json`);

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');

  console.log('');
  console.log(`[main] summary JSON saved to: ${outputPath}`);

  return outputPath;
}

async function main() {
  const urlsPath = path.resolve(process.cwd(), 'urls.txt');
  const urls = readUrls(urlsPath);

  if (!urls.length) {
    throw new Error('No active URLs found in urls.txt');
  }

  const browser = await chromium.launch({
    headless: config.headless,
  });

  const page = await browser.newPage({
    viewport: {
      width: 1920,
      height: 1080,
    },
  });

  const results = [];

  try {
    for (const url of urls) {
      const result = await runFlowForUrl(page, url);
        results.push(result);
      }
        console.log('\n========== SUMMARY RESULTS ==========');
        console.log(JSON.stringify(results, null, 2));
      const outputPath = saveResultsJson(results);
        console.log(`[main] result file: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[main] failed:', error);
  process.exit(1);
});