const { chromium } = require('@playwright/test');

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function getOrigin(url) {
  return new URL(url).origin;
}

function isSameHost(baseUrl, targetUrl) {
  try {
    return new URL(baseUrl).hostname === new URL(targetUrl).hostname;
  } catch {
    return false;
  }
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function dedupeByUrl(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const url = normalizeUrl(item.url);

    if (!seen.has(url)) {
      seen.add(url);
      output.push({
        ...item,
        url,
      });
    }
  }

  return output;
}

function isJoinUrl(url) {
  if (!url) return false;

  return (
    /\/join(?:\/|\?|#|$)/i.test(url) ||
    /\/signup(?:\/|\?|#|$)/i.test(url) ||
    /\/members\/join(?:\/|\?|#|$)/i.test(url) ||
    /join/i.test(url)
  );
}

function isSkippableHref(href) {
  if (!href) return true;

  return (
    href.startsWith('#') ||
    href.startsWith('javascript:') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  );
}

function isLikelyAssetUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp|svg|css|js|ico|woff|woff2|ttf|eot|mp4|mov|m3u8|mpd|zip|rar|pdf)(\?|#|$)/i.test(
    url
  );
}

async function checkUrlWithoutClicking(page, url, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 15000;

  const result = {
    url,
    fullUrl: url,
    status: null,
    ok: false,
    redirected: false,
    finalUrl: null,
    fullFinalUrl: null,
    error: null,
  };

  try {
    const response = await page.request.get(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
    });

    result.status = response.status();
    result.ok = response.ok();
    result.finalUrl = response.url();
    result.fullFinalUrl = response.url();
    result.redirected = normalizeUrl(result.finalUrl) !== normalizeUrl(url);

    console.log(`[${name}] checked url=${url} status=${result.status} ok=${result.ok}`);

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] check failed url=${url} error=${error.message}`);
    return result;
  }
}

async function discoverSitemapUrls(page, origin, opts = {}) {
  const name = opts.name || 'siteCrawler';

  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemaps.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/robots.txt`,
  ];

  const sitemapUrls = [];

  for (const candidate of candidates) {
    try {
      console.log(`[${name}] probing sitemap candidate=${candidate}`);

      const response = await page.request.get(candidate, {
        timeout: 10000,
        maxRedirects: 3,
      });

      if (!response.ok()) {
        continue;
      }

      const text = await response.text();

      if (candidate.endsWith('/robots.txt')) {
        const robotSitemaps = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => /^sitemap:/i.test(line))
          .map((line) => line.replace(/^sitemap:\s*/i, '').trim())
          .filter(Boolean);

        for (const sitemapUrl of robotSitemaps) {
          sitemapUrls.push({
            source: candidate,
            url: normalizeUrl(sitemapUrl),
          });
        }

        continue;
      }

      if (/<urlset|<sitemapindex|<loc>/i.test(text)) {
        sitemapUrls.push({
          source: 'direct',
          url: normalizeUrl(candidate),
        });
      }
    } catch (error) {
      console.log(`[${name}] sitemap probe skipped candidate=${candidate} error=${error.message}`);
    }
  }

  return dedupeByUrl(sitemapUrls);
}

async function parseSitemapXml(page, sitemapUrl, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const origin = opts.origin;
  const timeoutMs = opts.timeoutMs || 15000;

  const result = {
    sitemapUrl,
    fullSitemapUrl: sitemapUrl,
    status: null,
    ok: false,
    childSitemaps: [],
    urls: [],
    error: null,
  };

  try {
    console.log(`[${name}] reading sitemap=${sitemapUrl}`);

    const response = await page.request.get(sitemapUrl, {
      timeout: timeoutMs,
      maxRedirects: 5,
    });

    result.status = response.status();
    result.ok = response.ok();

    if (!response.ok()) {
      result.error = `Sitemap returned status ${response.status()}`;
      return result;
    }

    const text = await response.text();

    const locs = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
      match[1].trim()
    );

    for (const loc of locs) {
      if (!isSameHost(origin, loc)) {
        continue;
      }

      if (/\.xml(\?|#|$)/i.test(loc)) {
        result.childSitemaps.push({
          source: sitemapUrl,
          url: normalizeUrl(loc),
        });
      } else if (!isLikelyAssetUrl(loc)) {
        result.urls.push({
          source: sitemapUrl,
          url: normalizeUrl(loc),
        });
      }
    }

    result.childSitemaps = dedupeByUrl(result.childSitemaps);
    result.urls = dedupeByUrl(result.urls);

    console.log(
      `[${name}] sitemap parsed urls=${result.urls.length} childSitemaps=${result.childSitemaps.length}`
    );

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] sitemap parse error=${error.message}`);
    return result;
  }
}

async function extractNavigationLinks(page, baseUrl) {
  const navSelectors = [
    'nav a[href]',
    'header a[href]',
    '.navbar a[href]',
    '.nav a[href]',
    '.menu a[href]',
    '.main-menu a[href]',
    '.site-menu a[href]',
    '.header-menu a[href]',
    'footer a[href]',
  ];

  const links = [];

  for (const selector of navSelectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      const href = await item.getAttribute('href').catch(() => null);

      if (isSkippableHref(href)) {
        continue;
      }

      let url;

      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }

      if (!isSameHost(baseUrl, url)) {
        continue;
      }

      if (isLikelyAssetUrl(url)) {
        continue;
      }

      const text = await item
        .innerText({ timeout: 500 })
        .catch(async () => item.getAttribute('aria-label').catch(() => ''))
        .catch(() => '');

      links.push({
        text: (text || '').trim(),
        url,
        fullUrl: url,
        selector,
      });
    }
  }

  return dedupeByUrl(links);
}

async function testNavigationWithoutClicking(page, startUrl, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 15000;

  const result = {
    startUrl,
    linksFound: 0,
    linksChecked: 0,
    passedLinks: 0,
    brokenLinks: [],
    links: [],
    error: null,
  };

  try {
    console.log(`[${name}] testing navigation without clicking`);

    await gotoAndSettle(page, startUrl, {
      timeoutMs: opts.pageTimeoutMs || 30000,
      waitAfterLoadMs: opts.waitAfterLoadMs || 1000,
    });

    const links = await extractNavigationLinks(page, startUrl);

    result.links = links;
    result.linksFound = links.length;

    for (const link of links) {
      const checked = await checkUrlWithoutClicking(page, link.url, {
        name,
        timeoutMs,
      });

      result.linksChecked += 1;

      if (checked.ok) {
        result.passedLinks += 1;
      } else {
        result.brokenLinks.push({
          text: link.text,
          url: link.url,
          fullUrl: link.fullUrl || link.url,
          selector: link.selector,
          status: checked.status,
          finalUrl: checked.finalUrl,
          fullFinalUrl: checked.fullFinalUrl,
          error: checked.error,
        });
      }
    }

    console.log(
      `[${name}] navigation check complete found=${result.linksFound} checked=${result.linksChecked} broken=${result.brokenLinks.length}`
    );

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] navigation test error=${error.message}`);
    return result;
  }
}

async function testSitemapsWithoutClicking(page, origin, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 15000;
  const randomSitemapLinkCount = opts.randomSitemapLinkCount || 30;
  const priorityLinks = opts.priorityLinks || [];

  const result = {
    discoveredSitemaps: [],
    parsedSitemaps: [],
    priorityLinksFound: priorityLinks.length,
    priorityLinksChecked: 0,
    randomSitemapLinksRequested: randomSitemapLinkCount,
    randomSitemapLinksChecked: 0,
    urlsFound: 0,
    urlsChecked: 0,
    passedUrls: 0,
    brokenUrls: [],
    checkedUrls: [],
    reportLine: null,
    error: null,
  };

  try {
    console.log(`[${name}] testing sitemap/navigation priority links without clicking`);

    const queue = await discoverSitemapUrls(page, origin, {
      name,
    });

    result.discoveredSitemaps = queue;

    const seenSitemaps = new Set();
    const allSitemapUrls = [];

    while (queue.length > 0) {
      const sitemap = queue.shift();
      const sitemapUrl = normalizeUrl(sitemap.url);

      if (seenSitemaps.has(sitemapUrl)) {
        continue;
      }

      seenSitemaps.add(sitemapUrl);

      const parsed = await parseSitemapXml(page, sitemapUrl, {
        name,
        origin,
        timeoutMs,
      });

      result.parsedSitemaps.push(parsed);

      for (const child of parsed.childSitemaps || []) {
        if (!seenSitemaps.has(normalizeUrl(child.url))) {
          queue.push(child);
        }
      }

      for (const item of parsed.urls || []) {
        allSitemapUrls.push(item);
      }
    }

    const uniquePriorityLinks = dedupeByUrl(
      priorityLinks.map((link) => ({
        source: 'navbar-footer-priority',
        text: link.text || '',
        url: link.url,
        fullUrl: link.fullUrl || link.url,
        selector: link.selector || null,
      }))
    );

    const uniqueSitemapUrls = dedupeByUrl(allSitemapUrls);
    result.urlsFound = uniqueSitemapUrls.length;

    const priorityUrlSet = new Set(uniquePriorityLinks.map((item) => normalizeUrl(item.url)));

    const randomSitemapUrls = shuffle(
      uniqueSitemapUrls.filter((item) => !priorityUrlSet.has(normalizeUrl(item.url)))
    ).slice(0, randomSitemapLinkCount);

    const urlsToCheck = [
      ...uniquePriorityLinks.map((item) => ({
        ...item,
        checkType: 'priority-navigation',
      })),
      ...randomSitemapUrls.map((item) => ({
        ...item,
        fullUrl: item.url,
        checkType: 'random-sitemap',
      })),
    ];

    for (const item of urlsToCheck) {
      const checked = await checkUrlWithoutClicking(page, item.url, {
        name,
        timeoutMs,
      });

      result.urlsChecked += 1;

      if (item.checkType === 'priority-navigation') {
        result.priorityLinksChecked += 1;
      }

      if (item.checkType === 'random-sitemap') {
        result.randomSitemapLinksChecked += 1;
      }

      const checkedResult = {
        checkType: item.checkType,
        text: item.text || null,
        source: item.source,
        url: item.url,
        fullUrl: item.fullUrl || item.url,
        status: checked.status,
        ok: checked.ok,
        finalUrl: checked.finalUrl,
        fullFinalUrl: checked.fullFinalUrl,
        error: checked.error,
      };

      result.checkedUrls.push(checkedResult);

      if (checked.ok) {
        result.passedUrls += 1;
      } else {
        result.brokenUrls.push(checkedResult);
      }
    }

    result.reportLine = `sitemap priority check complete priority=${result.priorityLinksChecked} random=${result.randomSitemapLinksChecked} broken=${result.brokenUrls.length}`;

    console.log(`[${name}] ${result.reportLine}`);

    return result;
  } catch (error) {
    result.error = error.message;
    result.reportLine = `sitemap priority check complete priority=${result.priorityLinksChecked} random=${result.randomSitemapLinksChecked} broken=${result.brokenUrls.length}`;
    console.log(`[${name}] sitemap test error=${error.message}`);
    return result;
  }
}

async function pageHasJoinForm(page) {
  const currentUrl = page.url();

  if (isJoinUrl(currentUrl)) {
    return true;
  }

  const joinSelectors = [
    'form[action*="join" i]',
    'form[action*="signup" i]',
    'input[name*="card" i]',
    'input[name*="cc" i]',
    'input[name*="email" i]',
    'input[name*="password" i]',
    'button:has-text("Join")',
    'button:has-text("Sign Up")',
    'button:has-text("Continue")',
    'a:has-text("Join Now")',
    'text=/Join Now/i',
    'text=/Get Your Instant Access/i',
    'text=/Create Account/i',
    'text=/Start Your Membership/i',
    'text=/Complete Your Membership/i',
  ];

  for (const selector of joinSelectors) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (visible) {
      return true;
    }
  }

  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 1000 })
    .catch(() => '');

  return /join now|get your instant access|create account|start your membership|complete your membership|choose your membership|payment information/i.test(
    bodyText
  );
}

async function getPageBasics(page) {
  return {
    finalUrl: page.url(),
    title: await page.title().catch(() => null),
    h1: await page
      .locator('h1')
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => null),
  };
}

async function gotoAndSettle(page, url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 700;

  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });

  await page.waitForTimeout(waitAfterLoadMs);

  return response;
}

async function extractCards(page, type, baseUrl) {
  const sceneHrefPatterns = [
    '/scenes/',
    '/scene/',
    '/videos/',
    '/video/',
  ];

  const modelHrefPatterns = [
    '/models/',
    '/model/',
  ];

  const selectors =
    type === 'scene'
      ? [
          'a.content-title[href]',
          '.content-item-small a[href]',
          '.content-border a[href]',
          '#latest-videos-wrap a[href]',
          '.video-item a[href]',
          '.video-card a[href]',
          '.scene-item a[href]',
          '.scene-card a[href]',
          'a[href*="/scenes/"]',
          'a[href*="/scene/"]',
          'a[href*="/videos/"]',
          'a[href*="/video/"]',
        ]
      : [
          'a.model-name[href]',
          '.model-card a[href]',
          '.model-loop a[href]',
          '.model-item a[href]',
          'a[href*="/models/"]',
          'a[href*="/model/"]',
        ];

  const allowedPatterns = type === 'scene' ? sceneHrefPatterns : modelHrefPatterns;

  const cards = [];

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);

      const href = await item.getAttribute('href').catch(() => null);

      if (!href) {
        continue;
      }

      let url;

      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }

      if (!isSameHost(baseUrl, url)) {
        continue;
      }

      if (isLikelyAssetUrl(url)) {
        continue;
      }

      const urlPath = new URL(url).pathname.toLowerCase();

      const isAllowedCardUrl = allowedPatterns.some((pattern) => {
        return urlPath.includes(pattern);
      });

      if (!isAllowedCardUrl) {
        continue;
      }

      const text = await item
        .innerText({ timeout: 500 })
        .catch(async () => item.getAttribute('title').catch(() => ''))
        .catch(async () => item.locator('img').first().getAttribute('alt').catch(() => ''))
        .catch(() => '');

      cards.push({
        type,
        text: (text || '').trim(),
        url,
        fullUrl: url,
        selector,
      });
    }
  }

  return dedupeByUrl(cards);
}

async function quickVideoPlaybackCheck(page, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 8000;
  const playCheckMs = opts.playCheckMs || 2000;

  const result = {
    playerFound: false,
    posterFound: false,
    playButtonFound: false,
    videoElementFound: false,
    fakeThumbFound: false,

    clicked: false,
    clickedTarget: null,

    redirectedToJoin: false,
    joinFormFound: false,

    joinDetectedBeforeClick: false,
    joinDetectedAfterClick: false,
    acceptedJoinAfterClick: false,

    beforeUrl: page.url(),
    afterUrl: null,

    currentTimeBefore: null,
    currentTimeAfter: null,
    timeAdvanced: false,
    pausedAfterCheck: false,

    passed: false,
    passReason: null,
    error: null,
  };

  try {
    console.log(`[${name}] checking video playback quickly`);

    result.joinDetectedBeforeClick = await pageHasJoinForm(page).catch(() => false);

    const player = page.locator('.video-js, .vjs-tech, video').first();
    const poster = page.locator('.vjs-poster').first();
    const playButton = page.locator('.vjs-big-play-button, .vjs-play-control').first();

    const fakeThumb = page
      .locator(
        [
          '.fake-thumb-wrap',
          '.fake-thumb-wrap img',
          '.content-page-header-inner .fake-thumb-wrap',
          '.content-page-header-inner .fake-thumb-wrap img',
          '.content-page-header-inner img.img-responsive',
          '.content-page-header img.img-responsive',
        ].join(', ')
      )
      .first();

    result.playerFound = await player
      .isVisible({ timeout: timeoutMs })
      .catch(() => false);

    result.posterFound = await poster
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.playButtonFound = await playButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.videoElementFound = await page
      .locator('video')
      .count()
      .then((count) => count > 0)
      .catch(() => false);

    result.fakeThumbFound = await fakeThumb
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.currentTimeBefore = await page
      .locator('video')
      .first()
      .evaluate((video) => video.currentTime)
      .catch(() => null);

    if (result.playButtonFound) {
      await playButton.click({
        timeout: 3000,
        force: true,
      });

      result.clicked = true;
      result.clickedTarget = 'play-button';
    } else if (result.posterFound) {
      await poster.click({
        timeout: 3000,
        force: true,
      });

      result.clicked = true;
      result.clickedTarget = 'poster-thumb';
    } else if (result.videoElementFound) {
      await page
        .locator('video')
        .first()
        .evaluate((video) => video.play())
        .catch(() => null);

      result.clicked = true;
      result.clickedTarget = 'video-play-api';
    } else if (result.fakeThumbFound) {
      console.log(`[${name}] no Video.js/video found, clicking fake thumbnail`);

      await fakeThumb.click({
        timeout: 3000,
        force: true,
      });

      result.clicked = true;
      result.clickedTarget = 'fake-thumb';
    } else {
      result.afterUrl = page.url();
      result.error = 'No video player/poster/video element/fake thumb found';

      console.log(`[${name}] ${result.error}`);

      return result;
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(playCheckMs);

    result.afterUrl = page.url();
    result.redirectedToJoin = isJoinUrl(result.afterUrl);
    result.joinDetectedAfterClick = await pageHasJoinForm(page).catch(() => false);

    result.joinFormFound =
      result.joinDetectedAfterClick === true &&
      result.joinDetectedBeforeClick !== true;

    result.acceptedJoinAfterClick =
      result.clicked === true &&
      (
        result.redirectedToJoin === true ||
        result.joinFormFound === true
      );

    if (result.acceptedJoinAfterClick) {
      result.passed = true;
      result.passReason = result.redirectedToJoin
        ? 'video click redirected to join page'
        : 'video click opened join form';

      console.log(`[${name}] video accepted as pass because click redirected/opened join`);
      console.log(`[${name}] clickedTarget=${result.clickedTarget}`);
      console.log(`[${name}] beforeUrl=${result.beforeUrl}`);
      console.log(`[${name}] afterUrl=${result.afterUrl}`);
      console.log(`[${name}] redirectedToJoin=${result.redirectedToJoin}`);
      console.log(`[${name}] joinFormFound=${result.joinFormFound}`);
      console.log(`[${name}] acceptedJoinAfterClick=${result.acceptedJoinAfterClick}`);

      return result;
    }

    result.currentTimeAfter = await page
      .locator('video')
      .first()
      .evaluate((video) => video.currentTime)
      .catch(() => null);

    result.timeAdvanced =
      typeof result.currentTimeBefore === 'number' &&
      typeof result.currentTimeAfter === 'number' &&
      result.currentTimeAfter > result.currentTimeBefore + 0.3;

    await page
      .locator('video')
      .first()
      .evaluate((video) => {
        video.pause();
        video.currentTime = 0;
      })
      .then(() => {
        result.pausedAfterCheck = true;
      })
      .catch(() => {});

    result.passed =
      result.videoElementFound &&
      result.clicked &&
      result.timeAdvanced;

    result.passReason = result.passed
      ? 'video currentTime advanced'
      : 'video did not play and click did not redirect/open join';

    console.log(`[${name}] video playerFound=${result.playerFound}`);
    console.log(`[${name}] video posterFound=${result.posterFound}`);
    console.log(`[${name}] video playButtonFound=${result.playButtonFound}`);
    console.log(`[${name}] video videoElementFound=${result.videoElementFound}`);
    console.log(`[${name}] video fakeThumbFound=${result.fakeThumbFound}`);
    console.log(`[${name}] video clicked=${result.clicked}`);
    console.log(`[${name}] video clickedTarget=${result.clickedTarget}`);
    console.log(`[${name}] video currentTimeBefore=${result.currentTimeBefore}`);
    console.log(`[${name}] video currentTimeAfter=${result.currentTimeAfter}`);
    console.log(`[${name}] video timeAdvanced=${result.timeAdvanced}`);
    console.log(`[${name}] video redirectedToJoin=${result.redirectedToJoin}`);
    console.log(`[${name}] video joinDetectedBeforeClick=${result.joinDetectedBeforeClick}`);
    console.log(`[${name}] video joinDetectedAfterClick=${result.joinDetectedAfterClick}`);
    console.log(`[${name}] video joinFormFound=${result.joinFormFound}`);
    console.log(`[${name}] video acceptedJoinAfterClick=${result.acceptedJoinAfterClick}`);
    console.log(`[${name}] video passed=${result.passed}`);

    return result;
  } catch (error) {
    result.afterUrl = page.url();
    result.redirectedToJoin = isJoinUrl(result.afterUrl);
    result.joinDetectedAfterClick = await pageHasJoinForm(page).catch(() => false);

    result.joinFormFound =
      result.joinDetectedAfterClick === true &&
      result.joinDetectedBeforeClick !== true;

    result.acceptedJoinAfterClick =
      result.clicked === true &&
      (
        result.redirectedToJoin === true ||
        result.joinFormFound === true
      );

    if (result.acceptedJoinAfterClick) {
      result.passed = true;
      result.passReason = result.redirectedToJoin
        ? 'video click redirected to join page'
        : 'video click opened join form';
      result.error = null;

      return result;
    }

    result.error = error.message;
    console.log(`[${name}] video check error=${error.message}`);

    return result;
  }
}

async function testScenePage(page, scene, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;

  const result = {
    type: 'scene',
    sourceText: scene.text,
    url: scene.url,
    fullUrl: scene.fullUrl || scene.url,
    finalUrl: null,
    fullFinalUrl: null,
    status: null,
    ok: false,
    title: null,
    h1: null,
    hasSceneTitle: false,
    hasModelLink: false,
    hasTrailerOrJoin: false,
    videoPlayback: null,
    error: null,
  };

  try {
    console.log(`[${name}] testing scene ${scene.url}`);

    const response = await gotoAndSettle(page, scene.url, {
      timeoutMs,
      waitAfterLoadMs,
    });

    result.status = response ? response.status() : null;
    result.ok = response ? response.ok() : false;

    const basics = await getPageBasics(page);

    result.finalUrl = basics.finalUrl;
    result.fullFinalUrl = basics.finalUrl;
    result.title = basics.title;
    result.h1 = basics.h1;

    result.hasSceneTitle = Boolean(result.h1 || result.title);

    result.hasModelLink = await page
      .locator('a[href*="/models/"], .model-name, text=/Featuring|Starring|Model/i')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.hasTrailerOrJoin = await page
      .locator('text=/Watch Trailer|Join|Get Your Instant Access|Become a Member|Start Your Membership/i')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.videoPlayback = await quickVideoPlaybackCheck(page, {
      name,
      timeoutMs: 8000,
      playCheckMs: 2000,
    });

    if (result.videoPlayback?.passed === true) {
      result.ok = result.status === 200 || result.status === 301 || result.status === 302 || result.ok;
    }

    return result;
  } catch (error) {
    result.finalUrl = page.url();
    result.fullFinalUrl = page.url();
    result.error = error.message;
    console.log(`[${name}] scene error=${error.message}`);
    return result;
  }
}

async function testModelPage(page, model, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;

  const result = {
    type: 'model',
    sourceText: model.text,
    url: model.url,
    fullUrl: model.fullUrl || model.url,
    finalUrl: null,
    fullFinalUrl: null,
    status: null,
    ok: false,
    title: null,
    h1: null,
    hasModelName: false,
    hasScenes: false,
    hasJoin: false,
    error: null,
  };

  try {
    console.log(`[${name}] testing model ${model.url}`);

    const response = await gotoAndSettle(page, model.url, {
      timeoutMs,
      waitAfterLoadMs,
    });

    result.status = response ? response.status() : null;
    result.ok = response ? response.ok() : false;

    const basics = await getPageBasics(page);

    result.finalUrl = basics.finalUrl;
    result.fullFinalUrl = basics.finalUrl;
    result.title = basics.title;
    result.h1 = basics.h1;

    result.hasModelName = Boolean(result.h1 || result.title);

    result.hasScenes = await page
      .locator('a[href*="/scenes/"], #latest-videos-wrap, .content-item-small, .content-border')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.hasJoin = await page
      .locator('a.modal-join, .join-now, .join-button, text=/Join|Get Your Instant Access/i')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    return result;
  } catch (error) {
    result.finalUrl = page.url();
    result.fullFinalUrl = page.url();
    result.error = error.message;
    console.log(`[${name}] model error=${error.message}`);
    return result;
  }
}

async function resolveSectionUrl(page, origin, type, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 15000;

  const candidates =
    type === 'scene'
      ? [
          `${origin}/scenes`,
          `${origin}/scene`,
          `${origin}/videos`,
          `${origin}/video`,
        ]
      : [
          `${origin}/models`,
          `${origin}/model`,
        ];

  const result = {
    type,
    found: false,
    skipped: false,
    sectionUrl: null,
    triedUrls: [],
    reason: null,
    error: null,
  };

  for (const candidateUrl of candidates) {
    const check = {
      url: candidateUrl,
      status: null,
      ok: false,
      cardsFound: 0,
      error: null,
    };

    try {
      console.log(`[${name}] checking ${type} section candidate=${candidateUrl}`);

      const response = await gotoAndSettle(page, candidateUrl, {
        timeoutMs,
        waitAfterLoadMs: 1000,
      });

      check.status = response ? response.status() : null;
      check.ok = response ? response.ok() : false;

      if (!check.ok) {
        result.triedUrls.push(check);
        continue;
      }

      const cards = await extractCards(page, type, origin);
      check.cardsFound = cards.length;

      result.triedUrls.push(check);

      if (cards.length > 0) {
        result.found = true;
        result.sectionUrl = candidateUrl;

        console.log(
          `[${name}] ${type} section found url=${candidateUrl} cardsFound=${cards.length}`
        );

        return result;
      }

      console.log(
        `[${name}] ${type} section candidate had no cards url=${candidateUrl}`
      );
    } catch (error) {
      check.error = error.message;
      result.triedUrls.push(check);

      console.log(
        `[${name}] ${type} section candidate failed url=${candidateUrl} error=${error.message}`
      );
    }
  }

  result.found = false;
  result.skipped = true;
  result.reason =
    type === 'model'
      ? 'No model/models page found. Skipping model checks.'
      : 'No scene/scenes/video/videos page found. Skipping scene checks.';

  console.log(`[${name}] ${result.reason}`);

  return result;
}

async function testRandomSectionItems(page, sectionUrl, type, count, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;
  const baseUrl = opts.baseUrl;

  const result = {
    type,
    sectionUrl,
    fullSectionUrl: sectionUrl,
    skipped: false,
    skipReason: null,
    cardsFound: 0,
    selectedItems: [],
    testedItems: [],
    brokenItems: [],
    error: null,
  };

  if (!sectionUrl) {
    result.skipped = true;
    result.skipReason =
      type === 'model'
        ? 'No model/models page found. Skipping model checks.'
        : 'No scene/scenes/video/videos page found. Skipping scene checks.';

    console.log(`[${name}] ${result.skipReason}`);

    return result;
  }

  try {
    console.log(`[${name}] opening ${type} section ${sectionUrl}`);

    const response = await gotoAndSettle(page, sectionUrl, {
      timeoutMs,
      waitAfterLoadMs,
    });

    const status = response ? response.status() : null;
    const ok = response ? response.ok() : false;

    if (!ok) {
      result.skipped = true;
      result.skipReason = `${type} section returned status ${status}. Skipping ${type} checks.`;

      console.log(`[${name}] ${result.skipReason}`);

      return result;
    }

    const cards = await extractCards(page, type, baseUrl);

    result.cardsFound = cards.length;

    if (cards.length === 0) {
      result.skipped = true;
      result.skipReason =
        type === 'model'
          ? 'Model page found but no model cards found. Skipping model checks.'
          : 'Scene/video page found but no scene cards found. Skipping scene checks.';

      console.log(`[${name}] ${result.skipReason}`);

      return result;
    }

    result.selectedItems = shuffle(cards).slice(0, count);

    console.log(`[${name}] ${type} cardsFound=${result.cardsFound}`);
    console.log(`[${name}] ${type} selected=${result.selectedItems.length}`);

    for (const item of result.selectedItems) {
      const tested =
        type === 'scene'
          ? await testScenePage(page, item, opts)
          : await testModelPage(page, item, opts);

      result.testedItems.push(tested);

      const isBroken =
        tested.error ||
        tested.ok !== true ||
        tested.status < 200 ||
        tested.status >= 400 ||
        (type === 'scene' && tested.videoPlayback?.passed !== true);

      if (isBroken) {
        result.brokenItems.push(tested);
      }
    }

    return result;
  } catch (error) {
    result.skipped = true;
    result.skipReason = `${type} section failed. Skipping ${type} checks.`;
    result.error = error.message;

    console.log(`[${name}] ${result.skipReason} error=${error.message}`);

    return result;
  }
}

async function siteCrawler(page, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;
  const randomSceneCount = opts.randomSceneCount || 5;
  const randomModelCount = opts.randomModelCount || 5;
  const randomSitemapLinkCount = opts.randomSitemapLinkCount || 30;

  const startUrl = page.url();
  const origin = getOrigin(startUrl);

  const result = {
    component: 'siteCrawler',
    startUrl,
    fullStartUrl: startUrl,

    scenesUrl: null,
    fullScenesUrl: null,
    scenesSectionResolution: null,

    modelsUrl: null,
    fullModelsUrl: null,
    modelsSectionResolution: null,

    navigationCheck: null,
    sitemapCheck: null,
    scenes: null,
    models: null,
    error: null,
  };

  try {
    console.log(`[${name}] started`);

    result.navigationCheck = await testNavigationWithoutClicking(page, startUrl, {
      name,
      timeoutMs: 15000,
      pageTimeoutMs: timeoutMs,
      waitAfterLoadMs,
    });

    result.sitemapCheck = await testSitemapsWithoutClicking(page, origin, {
      name,
      timeoutMs: 15000,
      priorityLinks: result.navigationCheck?.links || [],
      randomSitemapLinkCount,
    });

    result.scenesSectionResolution = await resolveSectionUrl(page, origin, 'scene', {
      name,
      timeoutMs,
    });

    result.scenesUrl = result.scenesSectionResolution.sectionUrl;
    result.fullScenesUrl = result.scenesSectionResolution.sectionUrl;

    result.scenes = await testRandomSectionItems(
      page,
      result.scenesUrl,
      'scene',
      randomSceneCount,
      {
        name,
        timeoutMs,
        waitAfterLoadMs,
        baseUrl: origin,
      }
    );

    result.modelsSectionResolution = await resolveSectionUrl(page, origin, 'model', {
      name,
      timeoutMs,
    });

    result.modelsUrl = result.modelsSectionResolution.sectionUrl;
    result.fullModelsUrl = result.modelsSectionResolution.sectionUrl;

    result.models = await testRandomSectionItems(
      page,
      result.modelsUrl,
      'model',
      randomModelCount,
      {
        name,
        timeoutMs,
        waitAfterLoadMs,
        baseUrl: origin,
      }
    );

    console.log(`[${name}] completed`);

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] error=${error.message}`);
    return result;
  }
}

function summarizeSiteCrawlerResult(result) {
  const testedScenes = result.scenes?.testedItems || [];
  const testedModels = result.models?.testedItems || [];

  const sceneVideoPassed = testedScenes.filter((item) => {
    return item.videoPlayback?.passed === true;
  }).length;

  const sceneVideoFailed = testedScenes.filter((item) => {
    return item.videoPlayback && item.videoPlayback.passed !== true;
  }).length;

  const scenePagesPassed = testedScenes.filter((item) => {
    return item.ok === true && item.status === 200 && !item.error;
  }).length;

  const modelPagesPassed = testedModels.filter((item) => {
    return item.ok === true && item.status === 200 && !item.error;
  }).length;

  const brokenScenes = result.scenes?.brokenItems || [];
  const brokenModels = result.models?.brokenItems || [];

  return {
  component: 'siteCrawler',
  startUrl: result.startUrl,
  fullStartUrl: result.fullStartUrl || result.startUrl,

  scenesUrl: result.scenesUrl,
  fullScenesUrl: result.fullScenesUrl || result.scenesUrl,
  scenesSectionResolution: result.scenesSectionResolution || null,

  modelsUrl: result.modelsUrl,
  fullModelsUrl: result.fullModelsUrl || result.modelsUrl,
  modelsSectionResolution: result.modelsSectionResolution || null,

    summary: {
      sitemapPriorityReport:
        result.sitemapCheck?.reportLine ||
        `sitemap priority check complete priority=${result.sitemapCheck?.priorityLinksChecked || 0} random=${result.sitemapCheck?.randomSitemapLinksChecked || 0} broken=${result.sitemapCheck?.brokenUrls?.length || 0}`,

      navigationLinksFound: result.navigationCheck?.linksFound || 0,
      navigationLinksChecked: result.navigationCheck?.linksChecked || 0,
      navigationBrokenLinks: result.navigationCheck?.brokenLinks?.length || 0,

      sitemapUrlsFound: result.sitemapCheck?.urlsFound || 0,
      sitemapPriorityLinksChecked: result.sitemapCheck?.priorityLinksChecked || 0,
      sitemapRandomLinksChecked: result.sitemapCheck?.randomSitemapLinksChecked || 0,
      sitemapBrokenUrls: result.sitemapCheck?.brokenUrls?.length || 0,

      sceneCardsFound: result.scenes?.cardsFound || 0,
      randomScenesTested: testedScenes.length,
      scenePagesPassed,
      sceneVideoPassed,
      sceneVideoFailed,
      brokenScenes: brokenScenes.length,
      sceneSectionSkipped: result.scenes?.skipped === true,
      sceneSectionSkipReason: result.scenes?.skipReason || null,

      modelCardsFound: result.models?.cardsFound || 0,
      randomModelsTested: testedModels.length,
      modelPagesPassed,
      brokenModels: brokenModels.length,
      modelSectionSkipped: result.models?.skipped === true,
      modelSectionSkipReason: result.models?.skipReason || null,

      totalTested:
        (result.navigationCheck?.linksChecked || 0) +
        (result.sitemapCheck?.urlsChecked || 0) +
        testedScenes.length +
        testedModels.length,

      totalBroken:
        (result.navigationCheck?.brokenLinks?.length || 0) +
        (result.sitemapCheck?.brokenUrls?.length || 0) +
        brokenScenes.length +
        brokenModels.length,

      passed:
        (result.navigationCheck?.brokenLinks?.length || 0) === 0 &&
        (result.sitemapCheck?.brokenUrls?.length || 0) === 0 &&
        brokenScenes.length === 0 &&
        brokenModels.length === 0 &&
        sceneVideoFailed === 0,
    },

    navigationCheck: {
      linksFound: result.navigationCheck?.linksFound || 0,
      linksChecked: result.navigationCheck?.linksChecked || 0,
      passedLinks: result.navigationCheck?.passedLinks || 0,
      brokenLinks: result.navigationCheck?.brokenLinks || [],
      error: result.navigationCheck?.error || null,
    },

    sitemapCheck: {
      reportLine:
        result.sitemapCheck?.reportLine ||
        `sitemap priority check complete priority=${result.sitemapCheck?.priorityLinksChecked || 0} random=${result.sitemapCheck?.randomSitemapLinksChecked || 0} broken=${result.sitemapCheck?.brokenUrls?.length || 0}`,

      discoveredSitemaps: result.sitemapCheck?.discoveredSitemaps || [],
      urlsFound: result.sitemapCheck?.urlsFound || 0,
      priorityLinksFound: result.sitemapCheck?.priorityLinksFound || 0,
      priorityLinksChecked: result.sitemapCheck?.priorityLinksChecked || 0,
      randomSitemapLinksRequested: result.sitemapCheck?.randomSitemapLinksRequested || 30,
      randomSitemapLinksChecked: result.sitemapCheck?.randomSitemapLinksChecked || 0,
      urlsChecked: result.sitemapCheck?.urlsChecked || 0,
      passedUrls: result.sitemapCheck?.passedUrls || 0,
      brokenUrls: result.sitemapCheck?.brokenUrls || [],
      error: result.sitemapCheck?.error || null,
    },

    scenes: testedScenes.map((item) => ({
      name: item.sourceText,
      url: item.url,
      fullUrl: item.fullUrl || item.url,
      status: item.status,
      pagePassed: item.ok === true && item.status === 200 && !item.error,
      h1: item.h1,
      hasSceneTitle: item.hasSceneTitle,
      hasModelLink: item.hasModelLink,
      videoPassed: item.videoPlayback?.passed === true,
      videoPassReason: item.videoPlayback?.passReason || null,
      videoRedirectedToJoin: item.videoPlayback?.redirectedToJoin === true,
      joinFormFound: item.videoPlayback?.joinFormFound === true,
      videoTimeBefore: item.videoPlayback?.currentTimeBefore ?? null,
      videoTimeAfter: item.videoPlayback?.currentTimeAfter ?? null,
      error: item.error || item.videoPlayback?.error || null,
    })),

    models: testedModels.map((item) => ({
      name: item.sourceText,
      url: item.url,
      fullUrl: item.fullUrl || item.url,
      status: item.status,
      pagePassed: item.ok === true && item.status === 200 && !item.error,
      h1: item.h1,
      hasModelName: item.hasModelName,
      hasScenes: item.hasScenes,
      error: item.error || null,
    })),
  };
}

async function run() {
  const urls = process.argv.slice(2);

  if (!urls.length) {
    console.error('Usage: node siteCrawler.js <url> [url...]');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: !process.env.HEADED,
  });

  const page = await browser.newPage({
    viewport: {
      width: 1920,
      height: 1080,
    },
  });

  for (const url of urls) {
    try {
      console.log(`\n[runner] visiting ${url}`);

      await gotoAndSettle(page, url, {
        timeoutMs: 30000,
        waitAfterLoadMs: 1000,
      });

      const result = await siteCrawler(page, {
        name: 'siteCrawler',
        timeoutMs: 30000,
        waitAfterLoadMs: 1000,
        randomSceneCount: 5,
        randomModelCount: 5,
        randomSitemapLinkCount: 30,
      });

      console.log(JSON.stringify(summarizeSiteCrawlerResult(result), null, 2));
    } catch (error) {
      console.error(`[runner] error processing ${url}: ${error.message}`);
    }
  }

  await browser.close();
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  siteCrawler,
  summarizeSiteCrawlerResult,
};