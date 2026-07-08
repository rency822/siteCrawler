async function waitForYotiModal(page, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;

  console.log(`[${name}] waiting for Next root`);

  await page
    .locator('#__next')
    .waitFor({
      state: 'attached',
      timeout: timeoutMs,
    })
    .catch(() => {
      console.log(`[${name}] #__next was not found before timeout`);
    });

  console.log(`[${name}] waiting for YPP age script or Yoti modal`);

  await page
    .waitForFunction(
      () => {
        return Boolean(
          document.querySelector('#ypp-age-tour-script') ||
            document.querySelector('#YppAgeTourModal')
        );
      },
      { timeout: timeoutMs }
    )
    .catch(() => {
      console.log(`[${name}] YPP age script/modal did not appear before timeout`);
    });

  console.log(`[${name}] waiting for full Yoti modal structure`);

  await page
    .waitForFunction(
      () => {
        return Boolean(
          document.querySelector('#YppAgeTourModal') &&
            document.querySelector('#YppAgeTourModal .modal-box') &&
            document.querySelector('#YppAgeTourModal .ypp-modal-content') &&
            document.querySelector('#ypp-age-email') &&
            document.querySelector('#ypp-age-submit')
        );
      },
      { timeout: timeoutMs }
    )
    .catch(() => {
      console.log(`[${name}] full Yoti modal structure did not appear before timeout`);
    });

  const result = {
    yppAgeTourScriptPresent: await page
      .locator('#ypp-age-tour-script')
      .count()
      .then((count) => count > 0)
      .catch(() => false),

    yppAgeTourModalPresent: await page
      .locator('#YppAgeTourModal')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    modalBoxPresent: await page
      .locator('#YppAgeTourModal .modal-box')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    modalContentPresent: await page
      .locator('#YppAgeTourModal .ypp-modal-content')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    firstColumnPresent: await page
      .locator('#yoti-first-column')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    secondColumnPresent: await page
      .locator('#yoti-second-column')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    logoPresent: await page
      .locator('#ypp-logo')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    emailInputPresent: await page
      .locator('#ypp-age-email')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    submitButtonPresent: await page
      .locator('#ypp-age-submit')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    footerPresent: await page
      .locator('#YppAgeTourModal .yoti-footer')
      .isVisible({ timeout: 1000 })
      .catch(() => false),

    requiredTextPresent: false,
    fullyPresent: false,
  };

  const modalText = await page
    .locator('#YppAgeTourModal')
    .innerText({ timeout: 1000 })
    .catch(() => '');

  result.requiredTextPresent =
    /You must be 18\+ to access this website/i.test(modalText) ||
    /age verification is required/i.test(modalText) ||
    /START AGE VERIFICATION/i.test(modalText);

  result.fullyPresent =
    result.yppAgeTourModalPresent &&
    result.modalBoxPresent &&
    result.emailInputPresent &&
    result.submitButtonPresent &&
    result.requiredTextPresent;

  console.log(`[${name}] yppAgeTourScriptPresent=${result.yppAgeTourScriptPresent}`);
  console.log(`[${name}] yppAgeTourModalPresent=${result.yppAgeTourModalPresent}`);
  console.log(`[${name}] modalBoxPresent=${result.modalBoxPresent}`);
  console.log(`[${name}] emailInputPresent=${result.emailInputPresent}`);
  console.log(`[${name}] submitButtonPresent=${result.submitButtonPresent}`);
  console.log(`[${name}] requiredTextPresent=${result.requiredTextPresent}`);
  console.log(`[${name}] fullyPresent=${result.fullyPresent}`);

  return result;
}

async function fillYotiEmail(page, email, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;

  const emailInput = page.locator('#ypp-age-email').first();

  console.log(`[${name}] filling email=${email}`);

  await emailInput.waitFor({
    state: 'visible',
    timeout: timeoutMs,
  });

  await emailInput.click({
    timeout: timeoutMs,
  });

  await emailInput.fill('', {
    timeout: timeoutMs,
  });

  await emailInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await emailInput.press('Backspace').catch(() => {});

  await emailInput.evaluate((input) => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.waitForTimeout(300);

  await emailInput.fill(email, {
    timeout: timeoutMs,
  });

  await emailInput.evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }, email);

  await page.waitForTimeout(300);

  const actualValue = await emailInput.inputValue().catch(() => '');

  console.log(`[${name}] expected email=${email}`);
  console.log(`[${name}] actual email value=${actualValue}`);

  if (actualValue !== email) {
    throw new Error(`[${name}] email input value mismatch. Expected ${email}, got ${actualValue}`);
  }

  return actualValue;
}

async function clickYotiSubmit(page, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;

  const submitButton = page.locator('#ypp-age-submit').first();

  console.log(`[${name}] clicking submit`);

  await submitButton.waitFor({
    state: 'visible',
    timeout: timeoutMs,
  });

  await submitButton.click({
    timeout: timeoutMs,
    force: true,
  });
}

async function runRandomEmailRedirectTest(page, testCase, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;

  const beforeUrl = page.url();

  console.log('');
  console.log(`[${name}] starting ${testCase.label}`);
  console.log(`[${name}] beforeUrl=${beforeUrl}`);

  await fillYotiEmail(page, testCase.email, {
    name,
    timeoutMs,
  });

  await clickYotiSubmit(page, {
    name,
    timeoutMs,
  });

  console.log(`[${name}] waiting for redirect: ${testCase.expectedUrlPattern}`);

  await page
    .waitForURL(testCase.expectedUrlPattern, {
      timeout: timeoutMs,
    })
    .catch(() => {
      console.log(`[${name}] redirect wait timed out`);
    });

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const afterUrl = page.url();
  const passed = testCase.expectedUrlPattern.test(afterUrl);

  console.log(`[${name}] afterUrl=${afterUrl}`);
  console.log(`[${name}] passed=${passed}`);

  return {
    label: testCase.label,
    email: testCase.email,
    beforeUrl,
    afterUrl,
    expectedUrlPattern: testCase.expectedUrlPattern.toString(),
    passed,
  };
}

async function analyzeAfterValidEmail(page, opts = {}) {
  const name = opts.name || 'yoti';
  const safePassageUrlPattern = opts.safePassageUrlPattern || /safepassageapp\.com/i;

  console.log(`[${name}] analyzing page after valid email`);

  const result = {
    label: 'valid-email-tour-content',
    currentUrl: page.url(),

    redirectedToSafepassage: false,
    skipCurrentUrl: false,
    skipReason: null,

    yotiModalExists: false,
    yotiModalVisible: false,
    emailInputVisible: false,
    submitButtonVisible: false,

    nextDataPresent: false,
    newsletterPresent: false,
    instantAccessPresent: false,
    memberPerksPresent: false,
    newestScenePresent: false,
    latestScenesPresent: false,
    modelsPresent: false,
    joinButtonPresent: false,
    tourContentPresent: false,

    passed: false,
  };

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const currentUrlAfterWait = page.url();

  result.currentUrl = currentUrlAfterWait;
  result.redirectedToSafepassage = safePassageUrlPattern.test(currentUrlAfterWait);

  if (result.redirectedToSafepassage) {
    result.skipCurrentUrl = true;
    result.skipReason = 'Correct email redirected to SafePassage instead of start URL/tour content';
    result.passed = false;

    console.log(`[${name}] valid email redirected to SafePassage`);
    console.log(`[${name}] currentUrl=${currentUrlAfterWait}`);
    console.log(`[${name}] marking current URL to skip`);

    return result;
  }

  result.yotiModalExists = await page
    .locator('#YppAgeTourModal')
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  result.yotiModalVisible = await page
    .locator('#YppAgeTourModal')
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  result.emailInputVisible = await page
    .locator('#ypp-age-email')
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  result.submitButtonVisible = await page
    .locator('#ypp-age-submit')
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  result.nextDataPresent = await page
    .locator('#__NEXT_DATA__')
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  result.newsletterPresent = await page
    .locator('.newsletter-container, .email-banner-wrapper')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  result.instantAccessPresent = await page
    .locator('.instant-access, a.modal-join:has-text("Get Your Instant Access")')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  result.memberPerksPresent = await page
    .locator('.member-perks')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  result.newestScenePresent = await page
    .locator('#newest-update, text=/Newest Scene/i')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  result.latestScenesPresent = await page
    .locator('#latest-videos-wrap, text=/Latest Scenes/i')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  result.modelsPresent = await page
    .locator('.model-items, text=/All Models/i')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  result.joinButtonPresent = await page
    .locator('a.modal-join, .join-now, .join-button')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 3000 })
    .catch(() => '');

  result.tourContentPresent =
    /Get Your Instant Access/i.test(bodyText) ||
    /INCLUDED IN YOUR MEMBERSHIP/i.test(bodyText) ||
    /Latest Scenes/i.test(bodyText) ||
    /Newest Scene/i.test(bodyText) ||
    /All Models/i.test(bodyText) ||
    /Join/i.test(bodyText);

  result.passed =
    !result.yotiModalVisible &&
    !result.emailInputVisible &&
    !result.submitButtonVisible &&
    (
      result.newsletterPresent ||
      result.instantAccessPresent ||
      result.memberPerksPresent ||
      result.newestScenePresent ||
      result.latestScenesPresent ||
      result.modelsPresent ||
      result.joinButtonPresent ||
      result.tourContentPresent
    );

  console.log(`[${name}] after valid email currentUrl=${result.currentUrl}`);
  console.log(`[${name}] redirectedToSafepassage=${result.redirectedToSafepassage}`);
  console.log(`[${name}] yotiModalExists=${result.yotiModalExists}`);
  console.log(`[${name}] yotiModalVisible=${result.yotiModalVisible}`);
  console.log(`[${name}] emailInputVisible=${result.emailInputVisible}`);
  console.log(`[${name}] submitButtonVisible=${result.submitButtonVisible}`);
  console.log(`[${name}] newsletterPresent=${result.newsletterPresent}`);
  console.log(`[${name}] instantAccessPresent=${result.instantAccessPresent}`);
  console.log(`[${name}] memberPerksPresent=${result.memberPerksPresent}`);
  console.log(`[${name}] newestScenePresent=${result.newestScenePresent}`);
  console.log(`[${name}] latestScenesPresent=${result.latestScenesPresent}`);
  console.log(`[${name}] modelsPresent=${result.modelsPresent}`);
  console.log(`[${name}] joinButtonPresent=${result.joinButtonPresent}`);
  console.log(`[${name}] tourContentPresent=${result.tourContentPresent}`);
  console.log(`[${name}] passed=${result.passed}`);

  return result;
}

async function runValidEmailContentTest(page, testCase, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;
  const safePassageUrlPattern = opts.safePassageUrlPattern || /safepassageapp\.com/i;

  const beforeUrl = page.url();

  console.log('');
  console.log(`[${name}] VALID EMAIL TEST IS RUNNING`);
  console.log(`[${name}] starting ${testCase.label}`);
  console.log(`[${name}] beforeUrl=${beforeUrl}`);
  console.log(`[${name}] valid email being used=${testCase.email}`);

  await fillYotiEmail(page, testCase.email, {
    name,
    timeoutMs,
  });

  await clickYotiSubmit(page, {
    name,
    timeoutMs,
  });

  const analysis = await analyzeAfterValidEmail(page, {
    name,
    timeoutMs,
    safePassageUrlPattern,
  });

  return {
    label: testCase.label,
    email: testCase.email,
    beforeUrl,
    afterUrl: analysis.currentUrl,

    redirectedToSafepassage: analysis.redirectedToSafepassage === true,
    skipCurrentUrl: analysis.redirectedToSafepassage === true,
    skipReason:
      analysis.redirectedToSafepassage === true
        ? analysis.skipReason || 'Correct email redirected to SafePassage instead of start URL/tour content'
        : null,

    analysis,
    passed: analysis.passed,
  };
}

async function returnToStartUrl(page, startUrl, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;

  console.log('');
  console.log(`[${name}] returning to original startUrl=${startUrl}`);

  await page.goto(startUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log(`[${name}] after return currentUrl=${page.url()}`);

  return page.url();
}

async function yoti(page, opts = {}) {
  console.log('[yoti] COMPONENT STARTED');

  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;

  const randomEmail = opts.randomEmail || `qa-random-${Date.now()}@gmail.com`;
  const validEmail = opts.validEmail;
  const safePassageUrlPattern = opts.safePassageUrlPattern || /safepassageapp\.com/i;

  if (!validEmail) {
    throw new Error('[yoti] validEmail is required');
  }

  const startUrl = page.url();

  const result = {
    component: 'yoti',
    startUrl,

    present: null,
    skipped: false,
    required: null,
    reason: null,

    skipCurrentUrl: false,
    skipReason: null,

    modalPresence: null,
    randomEmailTest: null,
    secondModalPresence: null,
    validEmailTest: null,

    error: null,
  };

  try {
    result.modalPresence = await waitForYotiModal(page, {
      name,
      timeoutMs,
    });

    if (!result.modalPresence.fullyPresent) {
      result.present = false;
      result.skipped = true;
      result.required = false;
      result.error = null;
      result.reason = 'Yoti modal was not present on this URL';

      console.log(`[${name}] Yoti modal not present. Skipping Yoti tests and continuing.`);

      return result;
    }

    result.present = true;
    result.skipped = false;
    result.required = true;

    result.randomEmailTest = await runRandomEmailRedirectTest(
      page,
      {
        label: 'random-email-safepassage',
        email: randomEmail,
        expectedUrlPattern: safePassageUrlPattern,
      },
      {
        name,
        timeoutMs,
      }
    );

    await returnToStartUrl(page, startUrl, {
      name,
      timeoutMs,
    });

    console.log(`[${name}] preparing valid email test`);
    console.log(`[${name}] validEmail=${validEmail}`);
    console.log(`[${name}] original startUrl=${startUrl}`);

    result.secondModalPresence = await waitForYotiModal(page, {
      name,
      timeoutMs,
    });

    console.log(
      `[${name}] secondModalPresence.fullyPresent=${result.secondModalPresence.fullyPresent}`
    );

    if (!result.secondModalPresence.fullyPresent) {
      result.error = 'Yoti modal was not present before valid email test';
      result.validEmailTest = {
        label: 'valid-email-tour-content',
        email: validEmail,
        skipped: true,
        passed: false,
        reason: 'Yoti modal was not present before valid email test',
      };

      console.log(`[${name}] valid email test skipped because modal is not present`);

      return result;
    }

    result.validEmailTest = await runValidEmailContentTest(
      page,
      {
        label: 'valid-email-tour-content',
        email: validEmail,
      },
      {
        name,
        timeoutMs,
        safePassageUrlPattern,
      }
    );

    const validEmailRedirectedToSafepassage =
      result.validEmailTest?.redirectedToSafepassage === true ||
      result.validEmailTest?.analysis?.redirectedToSafepassage === true;

    if (validEmailRedirectedToSafepassage) {
      result.skipCurrentUrl = true;
      result.skipReason =
        result.validEmailTest?.skipReason ||
        result.validEmailTest?.analysis?.skipReason ||
        'Correct email redirected to SafePassage instead of start URL/tour content';

      result.error = null;

      console.log(`[${name}] skipCurrentUrl=true`);
      console.log(`[${name}] valid email actually redirected to SafePassage`);
      console.log(`[${name}] skipReason=${result.skipReason}`);

      return result;
    }

    result.skipCurrentUrl = false;
    result.skipReason = null;

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] error=${error.message}`);
    return result;
  }
}

module.exports = {
  yoti,
};