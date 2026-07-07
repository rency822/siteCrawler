const { chromium } = require('@playwright/test');

const DEFAULT_ENTER_PATTERNS = [
  /\benter\b/i,
  /^(continue|proceed|okay|ok|yes|i agree)$/i,
  /^(start|watch now)$/i,
  /^(click to enter|enter here|enter|i agree let me enter)$/i,
];

const DEFAULT_MODAL_PATTERNS = [
  /warning/i,
  /warning\s*18\+/i,
  /18\+/i,
  /terms and conditions/i,
  /adult(s)? only/i,
  /age (verification|gate)/i,
  /privacy policy/i,
  /by clicking/i,
  /entering this site/i,
];

const HOST_OVERRIDES = {
  'rickysroom.com': {
    enterPatterns: [/^ricky's rooms/i, /\benter\b/i],
  },
  'homegrownvideo.com': {
    enterPatterns: [/\benter\b/i, /enter site/i, /continue/i],
  },
  'phoenixxx.com': {
    enterPatterns: [/\benter\b/i, /^enter now$/i, /^get instant access now$/i],
  },
  'daddysexfiles.com': {
    enterPatterns: [/\benter\b/i, /enter button/i, /get instant access now/i],
  },
  'mariskax.com': {
    enterPatterns: [/\benter\b/i, /save now/i, /join mariska x now/i],
  },
};

async function inferModalFromSignals(page, name) {
  const signals = [
    '#ageVerificationModal',
    '#ageVerificationModal #enterButton',
    '#enterButton',
    'button#enterButton',
    'button[id*="enter" i]',
    'input[id*="enter" i]',
    '[role="button"][id*="enter" i]',
    '#modalContent',
    '[id*="modal" i]',
    '[class*="modal" i]',
    '[id*="warning" i]',
    '[class*="warning" i]',
  ];

  for (const selector of signals) {
    try {
      const signal = page.locator(selector).first();

      if (await signal.isVisible({ timeout: 250 })) {
        console.log(`[${name}] modal inferred from visible signal selector=${selector}`);
        return true;
      }
    } catch {}
  }

  return false;
}

async function clickAgeVerificationModal(page, name, clickTimeoutMs, clearTimeoutMs) {
  const modal = page.locator('#ageVerificationModal').first();

  try {
    const modalVisible = await modal.isVisible({ timeout: 300 }).catch(() => false);

    if (!modalVisible) {
      return false;
    }

    console.log(`[${name}] #ageVerificationModal detected`);

    const enterButton = page
      .locator(
        [
          '#ageVerificationModal #enterButton',
          '#ageVerificationModal button#enterButton',
          '#ageVerificationModal button:has-text("ENTER")',
          '#ageVerificationModal button:has-text("Enter")',
        ].join(', ')
      )
      .first();

    const buttonVisible = await enterButton.isVisible({ timeout: 300 }).catch(() => false);

    if (!buttonVisible) {
      console.log(`[${name}] #ageVerificationModal found but enter button not visible`);
      return false;
    }

    const label = await enterButton.textContent().catch(() => '');

    console.log(
      `[${name}] clicking #ageVerificationModal enter button label=${JSON.stringify(
        (label || '').trim()
      )}`
    );

    await enterButton.click({
      timeout: clickTimeoutMs,
      force: true,
    });

    console.log(`[${name}] waiting for #ageVerificationModal to clear`);

    await page
      .locator('#ageVerificationModal')
      .waitFor({
        state: 'hidden',
        timeout: clearTimeoutMs,
      })
      .catch(async () => {
        const stillVisible = await page
          .locator('#ageVerificationModal')
          .isVisible({ timeout: 250 })
          .catch(() => false);

        if (stillVisible) {
          console.log(`[${name}] #ageVerificationModal still visible after click`);
        }
      });

    const modalStillVisible = await page
      .locator('#ageVerificationModal')
      .isVisible({ timeout: 250 })
      .catch(() => false);

    if (modalStillVisible) {
      return false;
    }

    console.log(`[${name}] #ageVerificationModal cleared`);

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(250);

    return true;
  } catch (err) {
    console.log(`[${name}] #ageVerificationModal handler skipped: ${err.message}`);
    return false;
  }
}

async function clickExactEnterButton(page, name, clickTimeoutMs) {
  try {
    const enterButton = page.locator('button#enterButton, #enterButton').first();

    if (await enterButton.count()) {
      const visible = await enterButton.isVisible({ timeout: 300 }).catch(() => false);
      const label = await enterButton.textContent().catch(() => '');

      console.log(
        `[${name}] found #enterButton visible=${visible} label=${JSON.stringify(
          (label || '').trim()
        )}`
      );

      if (visible) {
        await enterButton.click({
          timeout: clickTimeoutMs,
          force: true,
        });

        console.log(`[${name}] clicked #enterButton`);

        await page.waitForTimeout(250);

        return true;
      }
    }
  } catch (err) {
    console.log(`[${name}] #enterButton fallback skipped: ${err.message}`);
  }

  return false;
}

async function clickModalContentEnter(page, name, clickTimeoutMs) {
  try {
    const modalContentEnter = page
      .locator(
        [
          '#modalContent button#enterButton',
          '#modalContent #enterButton',
          '#modalContent button:has-text("ENTER")',
          '#modalContent button:has-text("Enter")',
          '#modalContent a:has-text("ENTER")',
          '#modalContent a:has-text("Enter")',
          '#modalContent [role="button"]:has-text("ENTER")',
          '#modalContent [role="button"]:has-text("Enter")',
        ].join(', ')
      )
      .first();

    if (await modalContentEnter.count()) {
      const visible = await modalContentEnter.isVisible({ timeout: 300 }).catch(() => false);
      const label = await modalContentEnter.textContent().catch(() => '');

      console.log(
        `[${name}] found #modalContent enter control visible=${visible} label=${JSON.stringify(
          (label || '').trim()
        )}`
      );

      if (visible) {
        await modalContentEnter.click({
          timeout: clickTimeoutMs,
          force: true,
        });

        console.log(`[${name}] clicked #modalContent enter control`);

        await page.waitForTimeout(250);

        return true;
      }
    }
  } catch (err) {
    console.log(`[${name}] #modalContent enter fallback skipped: ${err.message}`);
  }

  return false;
}

async function clickEnterLikeButton(page, name, clickTimeoutMs) {
  try {
    const enterLikeButton = page
      .locator(
        [
          'button[id*="enter" i]',
          'input[id*="enter" i]',
          '[role="button"][id*="enter" i]',
          'button:has-text("ENTER")',
          'button:has-text("Enter")',
          'a:has-text("ENTER")',
          'a:has-text("Enter")',
          'input[type="button"][value*="ENTER" i]',
          'input[type="submit"][value*="ENTER" i]',
        ].join(', ')
      )
      .first();

    if (await enterLikeButton.count()) {
      const visible = await enterLikeButton.isVisible({ timeout: 300 }).catch(() => false);

      const label =
        (await enterLikeButton.textContent().catch(() => '')) ||
        (await enterLikeButton.getAttribute('value').catch(() => ''));

      console.log(
        `[${name}] found enter-like button visible=${visible} label=${JSON.stringify(
          (label || '').trim()
        )}`
      );

      if (visible) {
        await enterLikeButton.click({
          timeout: clickTimeoutMs,
          force: true,
        });

        console.log(`[${name}] clicked enter-like button`);

        await page.waitForTimeout(250);

        return true;
      }
    }
  } catch (err) {
    console.log(`[${name}] enter-like button fallback skipped: ${err.message}`);
  }

  return false;
}

async function clickImageBasedEnter(page, name, clickTimeoutMs) {
  try {
    const imageFallback = page
      .locator(
        [
          'dialog .warning-content__buttons a.enter-btn',
          '[role="dialog"] .warning-content__buttons a.enter-btn',
          'dialog a.enter-btn',
          '[role="dialog"] a.enter-btn',
          'a.enter-btn',
          '.enter-btn',
        ].join(', ')
      )
      .first();

    if (await imageFallback.isVisible({ timeout: 300 })) {
      const aria = await imageFallback.getAttribute('aria-label').catch(() => null);
      const title = await imageFallback.getAttribute('title').catch(() => null);
      const text = (await imageFallback.textContent().catch(() => '') || '').trim();
      const imgAlt = await imageFallback.locator('img').first().getAttribute('alt').catch(() => null);
      const probe = [aria, title, text, imgAlt].filter(Boolean).join(' ');

      if (/\benter\b/i.test(probe)) {
        console.log(`[${name}] clicking image-based fallback probe=${JSON.stringify(probe)}`);

        await imageFallback.click({
          timeout: clickTimeoutMs,
          force: true,
        });

        await page.waitForTimeout(250);

        return true;
      }
    }
  } catch (err) {
    console.log(`[${name}] image fallback skipped: ${err.message}`);
  }

  return false;
}

async function clickGenericDialogControl(page, name, clickTimeoutMs) {
  try {
    const fallback = page
      .locator(
        [
          'dialog a:has-text("ENTER")',
          'dialog button:has-text("ENTER")',
          '[role="dialog"] a:has-text("ENTER")',
          '[role="dialog"] button:has-text("ENTER")',
          'dialog a:has-text("Enter")',
          'dialog button:has-text("Enter")',
          '[role="dialog"] a:has-text("Enter")',
          '[role="dialog"] button:has-text("Enter")',
        ].join(', ')
      )
      .first();

    if (await fallback.isVisible({ timeout: 300 })) {
      const label = await fallback.textContent().catch(() => '');

      console.log(
        `[${name}] clicking generic dialog enter control label=${JSON.stringify(
          (label || '').trim()
        )}`
      );

      await fallback.click({
        timeout: clickTimeoutMs,
        force: true,
      });

      await page.waitForTimeout(250);

      return true;
    }
  } catch (err) {
    console.log(`[${name}] generic dialog fallback skipped: ${err.message}`);
  }

  return false;
}

async function clickFirstSafeDialogControl(page, name, clickTimeoutMs) {
  try {
    const fallback = page
      .locator('dialog button, [role="dialog"] button, dialog a, [role="dialog"] a')
      .filter({
        hasNotText:
          /exit|leave|google|privacy|terms|policy|net nanny|cybersitter|cyberpatrol|asacp/i,
      })
      .first();

    if (await fallback.isVisible({ timeout: 300 })) {
      const label = await fallback.textContent().catch(() => '');

      console.log(
        `[${name}] clicking first safe dialog control label=${JSON.stringify(
          (label || '').trim()
        )}`
      );

      await fallback.click({
        timeout: clickTimeoutMs,
        force: true,
      });

      await page.waitForTimeout(250);

      return true;
    }
  } catch (err) {
    console.log(`[${name}] first safe dialog fallback skipped: ${err.message}`);
  }

  return false;
}

async function waitForModalToClear(page, name, clearTimeoutMs) {
  const modalSelectors = [
    '#ageVerificationModal',
    '#modalContent',
    '[role="dialog"]',
    'dialog',
    '[id*="modal" i]',
    '[class*="modal" i]',
    '[id*="warning" i]',
    '[class*="warning" i]',
  ];

  console.log(`[${name}] waiting for modal to clear`);

  const start = Date.now();

  while (Date.now() - start < clearTimeoutMs) {
    let anyVisible = false;

    for (const selector of modalSelectors) {
      try {
        const visible = await page.locator(selector).first().isVisible({ timeout: 100 });

        if (visible) {
          anyVisible = true;
          break;
        }
      } catch {}
    }

    if (!anyVisible) {
      console.log(`[${name}] modal cleared`);
      return true;
    }

    await page.waitForTimeout(150);
  }

  console.log(`[${name}] modal did not fully clear before timeout`);
  return false;
}

async function modalKey(page, opts = {}) {
  const name = opts.name || 'modalKey';

  const host =
    opts.host ||
    (() => {
      try {
        return new URL(page.url()).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })();

  const hostOverride = HOST_OVERRIDES[host] || {};
  const enterPatterns = opts.enterPatterns || hostOverride.enterPatterns || DEFAULT_ENTER_PATTERNS;
  const modalPatterns = opts.modalPatterns || DEFAULT_MODAL_PATTERNS;

  const timeoutMs = opts.timeoutMs || 3500;
  const detectTimeoutMs = opts.detectTimeoutMs || Math.min(timeoutMs, 1500);
  const clickTimeoutMs = opts.clickTimeoutMs || Math.min(timeoutMs, 2500);
  const clearTimeoutMs = opts.clearTimeoutMs || Math.min(timeoutMs, 2000);

  console.log(`[${name}] start url=${page.url()}`);

  console.log(
    `[${name}] host ${host} enterPatterns=${enterPatterns
      .map((re) => re.toString())
      .join('|')}`
  );

  const modalLocator = page.getByRole('dialog').first();
  const textCandidates = modalPatterns.map((re) => `text=${re.source}`);

  console.log(`[${name}] scanning modal candidates: dialog+ ${textCandidates.join(', ')}`);

  let modalVisible = false;

  for (let attempt = 1; attempt <= 2 && !modalVisible; attempt += 1) {
    console.log(`[${name}] detect attempt ${attempt}/2`);

    try {
      modalVisible = await modalLocator.isVisible({ timeout: detectTimeoutMs });

      if (modalVisible) {
        console.log(`[${name}] modal role dialog found`);
        break;
      }
    } catch {}
  }

  if (!modalVisible) {
    for (const re of modalPatterns) {
      const hit = page.getByText(re).first();

      try {
        if (await hit.isVisible({ timeout: 250 })) {
          modalVisible = true;
          console.log(`[${name}] modal matched text pattern=${re}`);
          break;
        }
      } catch {}
    }
  }

  if (!modalVisible) {
    modalVisible = await inferModalFromSignals(page, name);
  }

  if (!modalVisible) {
    console.log(`[${name}] no modal detected; skipping`);

    return {
      found: false,
      clicked: false,
      reason: 'no modal detected',
    };
  }

  let clicked = false;
  let chosen = null;
  const beforeUrl = page.url();

  clicked = await clickAgeVerificationModal(page, name, clickTimeoutMs, clearTimeoutMs);

  if (clicked) {
    return {
      found: true,
      clicked: true,
      chosen: 'ageVerificationModal',
      reason: '#ageVerificationModal cleared',
    };
  }

  const candidates = [];

  for (const re of enterPatterns) {
    candidates.push(page.getByRole('link', { name: re }).first());
    candidates.push(page.getByRole('button', { name: re }).first());
    candidates.push(page.getByText(re).first());
  }

  for (const [idx, loc] of candidates.entries()) {
    try {
      if (await loc.isVisible({ timeout: 300 })) {
        chosen = idx;
        const label = await loc.textContent().catch(() => '');

        console.log(`[${name}] clicking candidate#${idx} label=${JSON.stringify((label || '').trim())}`);

        await loc.click({
          timeout: clickTimeoutMs,
          force: true,
        });

        clicked = true;
        break;
      }
    } catch (err) {
      console.log(`[${name}] candidate#${idx} skipped: ${err.message}`);
    }
  }

  if (!clicked) clicked = await clickExactEnterButton(page, name, clickTimeoutMs);
  if (!clicked) clicked = await clickModalContentEnter(page, name, clickTimeoutMs);
  if (!clicked) clicked = await clickEnterLikeButton(page, name, clickTimeoutMs);
  if (!clicked) clicked = await clickImageBasedEnter(page, name, clickTimeoutMs);
  if (!clicked) clicked = await clickGenericDialogControl(page, name, clickTimeoutMs);
  if (!clicked) clicked = await clickFirstSafeDialogControl(page, name, clickTimeoutMs);

  if (!clicked) {
    console.log(`[${name}] modal detected but no enter CTA found treating as non-gate`);

    return {
      found: true,
      clicked: false,
      reason: 'modal text found but no enter CTA',
    };
  }

  const modalCleared = await waitForModalToClear(page, name, clearTimeoutMs);

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(250);

  const afterUrl = page.url();
  const remainingDialogs = await page.getByRole('dialog').count().catch(() => 0);

  const enterButtonStillVisible = await page
    .locator('#enterButton, button[id*="enter" i]')
    .first()
    .isVisible({ timeout: 250 })
    .catch(() => false);

  const success =
    afterUrl !== beforeUrl ||
    remainingDialogs === 0 ||
    !enterButtonStillVisible ||
    modalCleared;

  if (!success) {
    console.log(
      `[${name}] click did not change url, clear dialog, hide enter button, or clear modal`
    );

    return {
      found: true,
      clicked: false,
      reason: 'click did not change url, clear dialog, hide enter button, or clear modal',
    };
  }

  console.log(
    `[${name}] click complete remainingDialogs=${remainingDialogs} modalCleared=${modalCleared} url=${page.url()}`
  );

  return {
    found: true,
    clicked: true,
    chosen,
    modalCleared,
  };
}

async function run() {
  const urls = process.argv.slice(2);

  if (!urls.length) {
    console.error('Usage: node modalKey.js <url> [url...]');
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

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(750);

      const hostname = new URL(url).hostname;
      const hostCleaned = hostname.replace(/^www\./, '');

      const result = await modalKey(page, {
        name: hostname,
        host: hostCleaned,
        timeoutMs: 3500,
      });

      console.log(`[runner] result ${url} => ${JSON.stringify(result)}`);

      await page.waitForTimeout(750);
    } catch (err) {
      console.error(`[runner] error processing ${url}: ${err.message}`);
    }
  }

  await browser.close();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  modalKey,
};