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
      timeoutMs: 3500,
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
      randomSceneCount: 5,
      randomModelCount: 5,
      randomSitemapLinkCount: 30,
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

  const navigationBrokenLinks = siteCrawler?.navigationCheck?.brokenLinks || [];
  const sitemapBrokenUrls = siteCrawler?.sitemapCheck?.brokenUrls || [];

  const scenePagesPassed = testedScenes.filter((item) => {
    return item.ok === true && item.status === 200 && !item.error;
  }).length;

  const sceneVideoPassed = testedScenes.filter((item) => {
    return item.videoPlayback?.passed === true;
  }).length;

  const sceneVideoFailed = testedScenes.filter((item) => {
    return item.videoPlayback && item.videoPlayback.passed !== true;
  }).length;

  const sceneVideoRedirectedToJoin = testedScenes.filter((item) => {
    return item.videoPlayback?.redirectedToJoin === true;
  });

  const sceneVideoOpenedJoinForm = testedScenes.filter((item) => {
    return item.videoPlayback?.joinFormFound === true;
  });

  const modelPagesPassed = testedModels.filter((item) => {
    return item.ok === true && item.status === 200 && !item.error;
  }).length;

  const yotiWasSkipped = yoti?.skipped === true || yoti?.present === false;
  const yotiSkipCurrentUrl = yoti?.skipCurrentUrl === true;

  const correctEmailRedirectedToSafepassage =
    yoti?.validEmailTest?.redirectedToSafepassage === true;

  const yotiModalPassed =
    yotiWasSkipped || yoti?.modalPresence?.fullyPresent === true;

  const yotiRandomPassed =
    yotiWasSkipped || yoti?.randomEmailTest?.passed === true;

  const yotiValidPassed =
    yotiWasSkipped ||
    yoti?.validEmailTest?.passed === true ||
    yoti?.validEmailTest?.analysis?.passed === true;

  const siteCrawlerPassed =
    !!siteCrawler &&
    navigationBrokenLinks.length === 0 &&
    sitemapBrokenUrls.length === 0 &&
    brokenScenes.length === 0 &&
    brokenModels.length === 0 &&
    sceneVideoFailed === 0;

  const passed =
    yotiSkipCurrentUrl || result.skipped
      ? false
      : siteCrawlerPassed &&
        (!yoti || (yotiModalPassed && yotiRandomPassed && yotiValidPassed));

  return {
    url: result.url,
    finalUrl: result.finalUrl,
    passed,

    ...(result.skipped === true ? { skipped: true } : {}),
    ...(result.skipReason ? { skipReason: result.skipReason } : {}),

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
          present: yoti.present === true,
          modalFound: yoti?.modalPresence?.fullyPresent === true,
          randomEmailToSafepassage: yotiWasSkipped ? null : yotiRandomPassed,
          validEmailToTourContent: yotiWasSkipped ? null : yotiValidPassed,

          ...(yoti.skipped === true ? { skipped: true } : {}),

          ...(correctEmailRedirectedToSafepassage
            ? { correctEmailRedirectedToSafepassage: true }
            : {}),

          ...(yoti.skipCurrentUrl === true ? { skipCurrentUrl: true } : {}),

          ...(yoti.skipReason ? { skipReason: yoti.skipReason } : {}),
          ...(yoti.reason ? { reason: yoti.reason } : {}),
          ...(yoti.error ? { error: yoti.error } : {}),
        }
      : null,

    siteCrawler: siteCrawler
      ? {
          passed: siteCrawlerPassed,

          sitemap: {
            report:
              siteCrawler.sitemapCheck?.reportLine ||
              `sitemap priority check complete priority=${siteCrawler.sitemapCheck?.priorityLinksChecked || 0} random=${siteCrawler.sitemapCheck?.randomSitemapLinksChecked || 0} broken=${sitemapBrokenUrls.length}`,

            discoveredSitemaps: siteCrawler.sitemapCheck?.discoveredSitemaps || [],
            urlsFound: siteCrawler.sitemapCheck?.urlsFound || 0,
            priorityLinksFound: siteCrawler.sitemapCheck?.priorityLinksFound || 0,
            priorityLinksChecked: siteCrawler.sitemapCheck?.priorityLinksChecked || 0,
            randomLinksRequested: siteCrawler.sitemapCheck?.randomSitemapLinksRequested || 30,
            randomLinksChecked: siteCrawler.sitemapCheck?.randomSitemapLinksChecked || 0,
            urlsChecked: siteCrawler.sitemapCheck?.urlsChecked || 0,
            passedUrls: siteCrawler.sitemapCheck?.passedUrls || 0,
            broken: sitemapBrokenUrls.length,
            brokenUrls: sitemapBrokenUrls.map((item) => ({
              checkType: item.checkType || null,
              text: item.text || null,
              source: item.source || null,
              url: item.fullUrl || item.url,
              status: item.status || null,
              finalUrl: item.fullFinalUrl || item.finalUrl || null,
              error: item.error || null,
            })),
            error: siteCrawler.sitemapCheck?.error || null,
          },

          navigation: {
            linksFound: siteCrawler.navigationCheck?.linksFound || 0,
            linksChecked: siteCrawler.navigationCheck?.linksChecked || 0,
            passedLinks: siteCrawler.navigationCheck?.passedLinks || 0,
            broken: navigationBrokenLinks.length,
            brokenLinks: navigationBrokenLinks.map((item) => ({
              text: item.text || null,
              url: item.fullUrl || item.url,
              selector: item.selector || null,
              status: item.status || null,
              finalUrl: item.fullFinalUrl || item.finalUrl || null,
              error: item.error || null,
            })),
            error: siteCrawler.navigationCheck?.error || null,
          },

          scenes: {
            cardsFound: siteCrawler.scenes?.cardsFound || 0,
            tested: testedScenes.length,
            pagesPassed: scenePagesPassed,
            videoPassed: sceneVideoPassed,
            videoFailed: sceneVideoFailed,

            videoRedirectedToJoin: sceneVideoRedirectedToJoin.length,
            videoOpenedJoinForm: sceneVideoOpenedJoinForm.length,

            videoRedirectedToJoinItems: sceneVideoRedirectedToJoin.map((item) => ({
              name: item.sourceText || null,
              url: item.fullUrl || item.url,
              finalUrl:
                item.videoPlayback?.afterUrl ||
                item.fullFinalUrl ||
                item.finalUrl ||
                null,
              passReason: item.videoPlayback?.passReason || null,
              videoPassed: item.videoPlayback?.passed === true,
              redirectedToJoin: item.videoPlayback?.redirectedToJoin === true,
              joinFormFound: item.videoPlayback?.joinFormFound === true,
            })),

            videoOpenedJoinFormItems: sceneVideoOpenedJoinForm.map((item) => ({
              name: item.sourceText || null,
              url: item.fullUrl || item.url,
              finalUrl:
                item.videoPlayback?.afterUrl ||
                item.fullFinalUrl ||
                item.finalUrl ||
                null,
              passReason: item.videoPlayback?.passReason || null,
              videoPassed: item.videoPlayback?.passed === true,
              redirectedToJoin: item.videoPlayback?.redirectedToJoin === true,
              joinFormFound: item.videoPlayback?.joinFormFound === true,
            })),

            broken: brokenScenes.length,
            brokenItems: brokenScenes.map((item) => ({
              name: item.sourceText || null,
              url: item.fullUrl || item.url,
              status: item.status || null,
              finalUrl: item.fullFinalUrl || item.finalUrl || null,
              videoPassed: item.videoPlayback?.passed === true,
              videoPassReason: item.videoPlayback?.passReason || null,
              videoRedirectedToJoin: item.videoPlayback?.redirectedToJoin === true,
              joinFormFound: item.videoPlayback?.joinFormFound === true,
              error: item.error || item.videoPlayback?.error || null,
            })),
          },

          models: {
            cardsFound: siteCrawler.models?.cardsFound || 0,
            tested: testedModels.length,
            pagesPassed: modelPagesPassed,
            broken: brokenModels.length,
            brokenItems: brokenModels.map((item) => ({
              name: item.sourceText || null,
              url: item.fullUrl || item.url,
              status: item.status || null,
              finalUrl: item.fullFinalUrl || item.finalUrl || null,
              error: item.error || null,
            })),
          },

          totalTested:
            (siteCrawler.navigationCheck?.linksChecked || 0) +
            (siteCrawler.sitemapCheck?.urlsChecked || 0) +
            testedScenes.length +
            testedModels.length,

          totalBroken:
            navigationBrokenLinks.length +
            sitemapBrokenUrls.length +
            brokenScenes.length +
            brokenModels.length,
        }
      : null,
  };
}

async function isYotiStillBlocking(page) {
  const yotiModalVisible = await page
    .locator('#YppAgeTourModal')
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  const emailInputVisible = await page
    .locator('#ypp-age-email')
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  const submitButtonVisible = await page
    .locator('#ypp-age-submit')
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  return yotiModalVisible || emailInputVisible || submitButtonVisible;
}

function saveResultsJson(results) {
  const outputDir = path.resolve(process.cwd(), 'results');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `qa-summary-${timestamp}.json`);

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');

  console.log('');
  console.log(`[main] summary JSON saved to: ${outputPath}`);

  return outputPath;
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

    console.log('[main] modalKey completed');
  }

  let geoResult = null;

  if (config.components.geoCheck?.enabled) {
    console.log('[main] running geoCheck');

    geoResult = await geoCheck(page, {
      name: 'geoCheck',
      timeoutMs: config.components.geoCheck.timeoutMs,
      expectedRegion: config.components.geoCheck.expectedRegion,
    });

    console.log('[main] geoCheck completed');
  }

  let yotiResult = null;

  if (config.components.yoti?.enabled) {
    console.log('[main] running yoti');

    yotiResult = await yoti(page, {
      name: 'yoti',
      timeoutMs: config.components.yoti.timeoutMs,
      randomEmail: config.components.yoti.randomEmail,
      validEmail: config.components.yoti.validEmail,
      safePassageUrlPattern: config.components.yoti.safePassageUrlPattern,
    });

    console.log('[main] yoti completed');

    if (yotiResult?.skipCurrentUrl) {
      console.log('[main] Yoti requested skipping this URL');
      console.log(`[main] reason=${yotiResult.skipReason}`);

      const fullResult = {
        url,
        finalUrl: page.url(),
        geoCheck: geoResult,
        siteCrawler: null,
        yoti: yotiResult,
        skipped: true,
        skipReason: yotiResult.skipReason,
      };

      return summarizeWholeTest(fullResult);
    }

    const yotiStillBlocking = await isYotiStillBlocking(page);

    if (yotiStillBlocking) {
      console.log('[main] Yoti modal is still blocking. Skipping siteCrawler for this URL.');

      const fullResult = {
        url,
        finalUrl: page.url(),
        geoCheck: geoResult,
        siteCrawler: null,
        yoti: yotiResult,
        skipped: true,
        skipReason: 'Yoti modal still visible after Yoti flow',
      };

      return summarizeWholeTest(fullResult);
    }
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
      randomSitemapLinkCount: config.components.siteCrawler.randomSitemapLinkCount,
    });

    console.log('[main] siteCrawler completed');
  }

  console.log('[main] ready for next step');

  const fullResult = {
    url,
    finalUrl: page.url(),
    geoCheck: geoResult,
    siteCrawler: siteCrawlerResult,
    yoti: yotiResult,
    skipped: false,
    skipReason: null,
  };

  return summarizeWholeTest(fullResult);
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