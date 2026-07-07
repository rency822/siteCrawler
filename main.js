const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const { modalKey } = require('./components/modalKey');
const { yoti } = require('./components/yoti');
const { geoCheck } = require('./components/geoCheck');
const { siteCrawler } = require('./components/siteCrawler');

const config = {
  headless: false,
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

    // For debugging, run Yoti directly.
    // Do NOT skip based on geoResult yet.
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

  return {
    url,
    finalUrl: page.url(),
    modalKey: modalResult,
    geoCheck: geoResult,
    yoti: yotiResult,
    siteCrawler: siteCrawlerResult,
  };
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

    console.log('\n========== RESULTS ==========');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[main] failed:', error);
  process.exit(1);
});