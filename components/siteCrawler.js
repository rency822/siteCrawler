const { URL } = require('url');

function normalizeUrl(href, baseUrl) {
  try {
    if (!href) return null;

    const cleaned = String(href).trim();

    if (!cleaned) return null;
    if (cleaned.startsWith('javascript:')) return null;
    if (cleaned.startsWith('mailto:')) return null;
    if (cleaned.startsWith('tel:')) return null;
    if (cleaned.startsWith('#')) return null;

    const url = new URL(cleaned, baseUrl);
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}

function getOrigin(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function isSameHost(url, allowedHost) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') === allowedHost.replace(/^www\./, '');
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
    if (!item.url) continue;
    if (seen.has(item.url)) continue;

    seen.add(item.url);
    output.push(item);
  }

  return output;
}

async function getPageBasics(page, opts = {}) {
  const timeoutMs = opts.timeoutMs || 3000;

  const title = await page.title().catch(() => null);

  const h1 = await page
    .locator('h1')
    .first()
    .innerText({ timeout: timeoutMs })
    .catch(() => null);

  const bodyText = await page
    .locator('body')
    .innerText({ timeout: timeoutMs })
    .catch(() => '');

  return {
    title,
    h1,
    bodyTextPreview: bodyText.slice(0, 300),
  };
}

async function gotoAndSettle(page, url, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;

  console.log(`[${name}] opening ${url}`);

  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(waitAfterLoadMs);

  return response;
}

async function extractCards(page, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const baseUrl = page.url();
  const allowedHost = new URL(baseUrl).hostname.replace(/^www\./, '');
  const type = opts.type || 'unknown';

  console.log(`[${name}] extracting ${type} cards`);

  const rawCards = await page.evaluate((type) => {
    let selectors = [];

    if (type === 'scenes') {
      selectors = [
        'a.content-title[href*="/scenes/"]',
        '.content-item-small a[href*="/scenes/"]',
        '.content-border a[href*="/scenes/"]',
        '#latest-videos-wrap a[href*="/scenes/"]',
        'a[href*="/scenes/"]',
      ];
    }

    if (type === 'models') {
      selectors = [
        'a.model-name[href*="/models/"]',
        '.model-card a[href*="/models/"]',
        '.model-loop a[href*="/models/"]',
        'a[href*="/models/"]',
      ];
    }

    const cards = [];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((a) => {
        const href = a.getAttribute('href');
        const text = (a.innerText || a.textContent || '').trim();
        const img = a.querySelector('img');

        cards.push({
          href,
          text,
          imageAlt: img ? img.getAttribute('alt') : null,
          selector,
        });
      });
    }

    return cards;
  }, type);

  const cards = rawCards
    .map((card) => {
      const absoluteUrl = normalizeUrl(card.href, baseUrl);

      if (!absoluteUrl) return null;
      if (!isSameHost(absoluteUrl, allowedHost)) return null;

      return {
        type,
        text: card.text || card.imageAlt || '',
        href: card.href,
        url: absoluteUrl,
        sourceSelector: card.selector,
      };
    })
    .filter(Boolean);

  const deduped = dedupeByUrl(cards);

  console.log(`[${name}] ${type} cards found=${deduped.length}`);

  return deduped;
}

async function testScenePage(page, scene, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;

  const result = {
    type: 'scene',
    sourceText: scene.text,
    url: scene.url,
    finalUrl: null,
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
    console.log('');
    console.log(`[${name}] testing random scene: ${scene.text || scene.url}`);

    const response = await gotoAndSettle(page, scene.url, {
      name,
      timeoutMs,
      waitAfterLoadMs,
    });

    result.finalUrl = page.url();
    result.status = response ? response.status() : null;
    result.ok = response ? response.ok() : true;

    const basics = await getPageBasics(page);
    result.title = basics.title;
    result.h1 = basics.h1;

    result.hasSceneTitle = await page
      .locator('h1, .content-title, .scene-title')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.hasModelLink = await page
      .locator('a[href*="/models/"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.hasTrailerOrJoin = await page
  .locator('text=/Watch Trailer|Join|Get Your Instant Access|Become a Member/i')
  .first()
  .isVisible({ timeout: 3000 })
  .catch(() => false);

result.videoPlayback = await quickVideoPlaybackCheck(page, {
  name,
  timeoutMs: 8000,
  playCheckMs: 2000,
});

console.log(`[${name}] scene status=${result.status}`);
console.log(`[${name}] scene ok=${result.ok}`);
console.log(`[${name}] scene title=${JSON.stringify(result.title)}`);
console.log(`[${name}] scene video passed=${result.videoPlayback.passed}`);

return result;

  } catch (error) {
    result.finalUrl = page.url();
    result.ok = false;
    result.error = error.message;

    console.log(`[${name}] scene failed=${scene.url}`);
    console.log(`[${name}] error=${error.message}`);

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
    finalUrl: null,
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
    console.log('');
    console.log(`[${name}] testing random model: ${model.text || model.url}`);

    const response = await gotoAndSettle(page, model.url, {
      name,
      timeoutMs,
      waitAfterLoadMs,
    });

    result.finalUrl = page.url();
    result.status = response ? response.status() : null;
    result.ok = response ? response.ok() : true;

    const basics = await getPageBasics(page);
    result.title = basics.title;
    result.h1 = basics.h1;

    result.hasModelName = await page
      .locator('h1, .model-name, .model-title')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.hasScenes = await page
      .locator('a[href*="/scenes/"], #latest-videos-wrap, .content-item-small')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    result.hasJoin = await page
      .locator('a.modal-join, .join-now, .join-button, text=/Join|Get Your Instant Access/i')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    console.log(`[${name}] model status=${result.status}`);
    console.log(`[${name}] model ok=${result.ok}`);
    console.log(`[${name}] model title=${JSON.stringify(result.title)}`);

    return result;
  } catch (error) {
    result.finalUrl = page.url();
    result.ok = false;
    result.error = error.message;

    console.log(`[${name}] model failed=${model.url}`);
    console.log(`[${name}] error=${error.message}`);

    return result;
  }
}

async function testRandomSectionItems(page, sectionUrl, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const type = opts.type;
  const count = opts.count || 5;
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;

  const sectionResult = {
    type,
    sectionUrl,
    cardsFound: 0,
    selectedCards: [],
    testedItems: [],
    brokenItems: [],
    error: null,
  };

  try {
    console.log('');
    console.log(`[${name}] testing section=${sectionUrl}`);
    console.log(`[${name}] random ${type} count=${count}`);

    await gotoAndSettle(page, sectionUrl, {
      name,
      timeoutMs,
      waitAfterLoadMs,
    });

    const cards = await extractCards(page, {
      name,
      type,
    });

    sectionResult.cardsFound = cards.length;
    sectionResult.selectedCards = shuffle(cards).slice(0, count);

    console.log(`[${name}] selected ${type} cards=${sectionResult.selectedCards.length}`);

    for (const card of sectionResult.selectedCards) {
      let itemResult;

      if (type === 'scenes') {
        itemResult = await testScenePage(page, card, {
          name,
          timeoutMs,
          waitAfterLoadMs,
        });
      } else if (type === 'models') {
        itemResult = await testModelPage(page, card, {
          name,
          timeoutMs,
          waitAfterLoadMs,
        });
      } else {
        itemResult = {
          url: card.url,
          ok: false,
          error: `Unknown section type: ${type}`,
        };
      }

      sectionResult.testedItems.push(itemResult);

      if (!itemResult.ok || itemResult.error) {
        sectionResult.brokenItems.push(itemResult);
      }

      await gotoAndSettle(page, sectionUrl, {
        name,
        timeoutMs,
        waitAfterLoadMs,
      });
    }

    return sectionResult;
  } catch (error) {
    sectionResult.error = error.message;

    console.log(`[${name}] section failed=${sectionUrl}`);
    console.log(`[${name}] error=${error.message}`);

    return sectionResult;
  }
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
    clicked: false,
    currentTimeBefore: null,
    currentTimeAfter: null,
    timeAdvanced: false,
    pausedAfterCheck: false,
    passed: false,
    error: null,
  };

  try {
    console.log(`[${name}] checking video playback quickly`);

    const player = page.locator('.video-js, .vjs-tech, video').first();
    const poster = page.locator('.vjs-poster').first();
    const playButton = page.locator('.vjs-big-play-button, .vjs-play-control').first();

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

    if (!result.playerFound && !result.posterFound && !result.videoElementFound) {
      result.error = 'No video player/poster/video element found';
      console.log(`[${name}] ${result.error}`);
      return result;
    }

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
    } else if (result.posterFound) {
      await poster.click({
        timeout: 3000,
        force: true,
      });

      result.clicked = true;
    } else {
      await page
        .locator('video')
        .first()
        .evaluate((video) => video.play())
        .catch(() => null);

      result.clicked = true;
    }

    await page.waitForTimeout(playCheckMs);

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

    console.log(`[${name}] video playerFound=${result.playerFound}`);
    console.log(`[${name}] video posterFound=${result.posterFound}`);
    console.log(`[${name}] video playButtonFound=${result.playButtonFound}`);
    console.log(`[${name}] video currentTimeBefore=${result.currentTimeBefore}`);
    console.log(`[${name}] video currentTimeAfter=${result.currentTimeAfter}`);
    console.log(`[${name}] video timeAdvanced=${result.timeAdvanced}`);
    console.log(`[${name}] video passed=${result.passed}`);

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] video check error=${error.message}`);
    return result;
  }
}

async function siteCrawler(page, opts = {}) {
  const name = opts.name || 'siteCrawler';
  const timeoutMs = opts.timeoutMs || 30000;
  const waitAfterLoadMs = opts.waitAfterLoadMs || 1000;
  const randomSceneCount = opts.randomSceneCount || 5;
  const randomModelCount = opts.randomModelCount || 5;

  const startUrl = page.url();
  const origin = getOrigin(startUrl);

  const scenesUrl = opts.scenesUrl || `${origin}/scenes`;
  const modelsUrl = opts.modelsUrl || `${origin}/models`;

  console.log('');
  console.log(`[${name}] COMPONENT STARTED`);
  console.log(`[${name}] startUrl=${startUrl}`);
  console.log(`[${name}] scenesUrl=${scenesUrl}`);
  console.log(`[${name}] modelsUrl=${modelsUrl}`);

  const result = {
    component: 'siteCrawler',
    startUrl,
    scenesUrl,
    modelsUrl,
    scenes: null,
    models: null,
    summary: {
      sceneCardsFound: 0,
      randomScenesTested: 0,
      brokenScenes: 0,
      modelCardsFound: 0,
      randomModelsTested: 0,
      brokenModels: 0,
      totalBroken: 0,
    },
    error: null,
  };

  try {
    result.scenes = await testRandomSectionItems(page, scenesUrl, {
      name,
      type: 'scenes',
      count: randomSceneCount,
      timeoutMs,
      waitAfterLoadMs,
    });

    result.models = await testRandomSectionItems(page, modelsUrl, {
      name,
      type: 'models',
      count: randomModelCount,
      timeoutMs,
      waitAfterLoadMs,
    });

    result.summary.sceneCardsFound = result.scenes.cardsFound;
    result.summary.randomScenesTested = result.scenes.testedItems.length;
    result.summary.brokenScenes = result.scenes.brokenItems.length;

    result.summary.modelCardsFound = result.models.cardsFound;
    result.summary.randomModelsTested = result.models.testedItems.length;
    result.summary.brokenModels = result.models.brokenItems.length;

    result.summary.totalBroken =
      result.summary.brokenScenes + result.summary.brokenModels;

    console.log('');
    console.log(`[${name}] SUMMARY`);
    console.log(`[${name}] sceneCardsFound=${result.summary.sceneCardsFound}`);
    console.log(`[${name}] randomScenesTested=${result.summary.randomScenesTested}`);
    console.log(`[${name}] brokenScenes=${result.summary.brokenScenes}`);
    console.log(`[${name}] modelCardsFound=${result.summary.modelCardsFound}`);
    console.log(`[${name}] randomModelsTested=${result.summary.randomModelsTested}`);
    console.log(`[${name}] brokenModels=${result.summary.brokenModels}`);
    console.log(`[${name}] totalBroken=${result.summary.totalBroken}`);

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] error=${error.message}`);
    return result;
  }
}

module.exports = {
  siteCrawler,
};