async function waitForYotiModal(page, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;
  const detectTimeoutMs = opts.detectTimeoutMs || 10000;
  const selectorTimeoutMs = opts.selectorTimeoutMs || 1500;

  console.log(`[${name}] checking for Yoti modal/script`);
  console.log(`[${name}] detectTimeoutMs=${detectTimeoutMs}`);

  await page
    .locator('#__next')
    .waitFor({
      state: 'attached',
      timeout: Math.min(detectTimeoutMs, 5000),
    })
    .catch(() => {
      console.log(`[${name}] #__next was not found quickly`);
    });

  await page
    .waitForFunction(
      () => {
        return Boolean(
          document.querySelector('#ypp-age-tour-script') ||
            document.querySelector('#YppAgeTourModal') ||
            document.querySelector('#ypp-age-email') ||
            document.querySelector('#ypp-age-submit')
        );
      },
      { timeout: detectTimeoutMs }
    )
    .catch(() => {
      console.log(`[${name}] YPP age script/modal did not appear before detect timeout`);
    });

  await page
    .waitForFunction(
      () => {
        const modal = document.querySelector('#YppAgeTourModal');
        const email = document.querySelector('#ypp-age-email');
        const submit = document.querySelector('#ypp-age-submit');

        if (!modal || !email || !submit) {
          return false;
        }

        const modalStyle = window.getComputedStyle(modal);
        const emailStyle = window.getComputedStyle(email);
        const submitStyle = window.getComputedStyle(submit);

        return (
          modalStyle.display !== 'none' &&
          modalStyle.visibility !== 'hidden' &&
          emailStyle.display !== 'none' &&
          emailStyle.visibility !== 'hidden' &&
          submitStyle.display !== 'none' &&
          submitStyle.visibility !== 'hidden'
        );
      },
      { timeout: Math.min(timeoutMs, detectTimeoutMs) }
    )
    .catch(() => {
      console.log(`[${name}] visible Yoti modal structure did not appear before detect timeout`);
    });

  const result = {
    yppAgeTourScriptPresent: await page
      .locator('#ypp-age-tour-script')
      .count()
      .then((count) => count > 0)
      .catch(() => false),

    yppAgeTourModalPresent: await page
      .locator('#YppAgeTourModal')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    modalBoxPresent: await page
      .locator('#YppAgeTourModal .modal-box')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    modalContentPresent: await page
      .locator('#YppAgeTourModal .ypp-modal-content')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    firstColumnPresent: await page
      .locator('#yoti-first-column')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    secondColumnPresent: await page
      .locator('#yoti-second-column')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    logoPresent: await page
      .locator('#ypp-logo')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    emailInputPresent: await page
      .locator('#ypp-age-email')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    submitButtonPresent: await page
      .locator('#ypp-age-submit')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    footerPresent: await page
      .locator('#YppAgeTourModal .yoti-footer')
      .isVisible({ timeout: selectorTimeoutMs })
      .catch(() => false),

    requiredTextPresent: false,
    fullyPresent: false,
  };

  if (!result.yppAgeTourModalPresent && !result.emailInputPresent && !result.submitButtonPresent) {
    result.fullyPresent = false;

    console.log(`[${name}] yppAgeTourScriptPresent=${result.yppAgeTourScriptPresent}`);
    console.log(`[${name}] yppAgeTourModalPresent=${result.yppAgeTourModalPresent}`);
    console.log(`[${name}] emailInputPresent=${result.emailInputPresent}`);
    console.log(`[${name}] submitButtonPresent=${result.submitButtonPresent}`);
    console.log(`[${name}] fullyPresent=${result.fullyPresent}`);

    return result;
  }

  const modalText = await page
    .locator('#YppAgeTourModal')
    .innerText({ timeout: 2000 })
    .catch(() => '');

  result.requiredTextPresent =
    /You must be 18\+ to access this website/i.test(modalText) ||
    /age verification is required/i.test(modalText) ||
    /START AGE VERIFICATION/i.test(modalText) ||
    /age verification/i.test(modalText) ||
    /18\+/i.test(modalText) ||
    /verify/i.test(modalText) ||
    /verification/i.test(modalText);

  result.fullyPresent =
    result.yppAgeTourModalPresent &&
    result.emailInputPresent &&
    result.submitButtonPresent &&
    (
      result.modalBoxPresent ||
      result.modalContentPresent ||
      result.requiredTextPresent
    );

  console.log(`[${name}] yppAgeTourScriptPresent=${result.yppAgeTourScriptPresent}`);
  console.log(`[${name}] yppAgeTourModalPresent=${result.yppAgeTourModalPresent}`);
  console.log(`[${name}] modalBoxPresent=${result.modalBoxPresent}`);
  console.log(`[${name}] modalContentPresent=${result.modalContentPresent}`);
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

  await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);

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

    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    
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

async function waitForValidEmailResult(page, opts = {}) {
  const name = opts.name || 'yoti';
  const timeoutMs = opts.timeoutMs || 25000;
  const beforeUrl = opts.beforeUrl || page.url();
  const safePassageUrlPattern = opts.safePassageUrlPattern || /safepassageapp\.com/i;

  console.log(`[${name}] waiting for valid email result`);
  console.log(`[${name}] valid email beforeUrl=${beforeUrl}`);

  try {
    await page.waitForFunction(
      ({ beforeUrlString, safePassagePatternString }) => {
        const currentUrl = window.location.href;
        const safePassageRegex = new RegExp(
          safePassagePatternString.replace(/^\/|\/[a-z]*$/gi, ''),
          'i'
        );

        const redirectedToSafepassage = safePassageRegex.test(currentUrl);
        const urlChanged = currentUrl !== beforeUrlString;

        const yotiModal = document.querySelector('#YppAgeTourModal');
        const emailInput = document.querySelector('#ypp-age-email');
        const submitButton = document.querySelector('#ypp-age-submit');

        const yotiStillVisible =
          yotiModal &&
          window.getComputedStyle(yotiModal).display !== 'none' &&
          window.getComputedStyle(yotiModal).visibility !== 'hidden';

        const bodyText = document.body ? document.body.innerText || '' : '';

        const tourContentPresent =
          /Get Your Instant Access/i.test(bodyText) ||
          /INCLUDED IN YOUR MEMBERSHIP/i.test(bodyText) ||
          /Latest Scenes/i.test(bodyText) ||
          /Newest Scene/i.test(bodyText) ||
          /All Models/i.test(bodyText) ||
          /Join/i.test(bodyText);

        const yotiCleared =
          !yotiStillVisible &&
          !emailInput &&
          !submitButton;

        return (
          redirectedToSafepassage ||
          urlChanged ||
          yotiCleared ||
          tourContentPresent
        );
      },
      {
        beforeUrlString: beforeUrl,
        safePassagePatternString: safePassageUrlPattern.toString(),
      },
      {
        timeout: timeoutMs,
      }
    );
  } catch {
    console.log(`[${name}] valid email result wait timed out`);
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const afterUrl = page.url();

  console.log(`[${name}] valid email after wait url=${afterUrl}`);
  console.log(`[${name}] valid email redirectedToSafepassage=${safePassageUrlPattern.test(afterUrl)}`);

  return {
    beforeUrl,
    afterUrl,
    redirectedToSafepassage: safePassageUrlPattern.test(afterUrl),
  };
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

  const validEmailWait = await waitForValidEmailResult(page, {
    name,
    timeoutMs,
    beforeUrl,
    safePassageUrlPattern,
  });

  const analysis = await analyzeAfterValidEmail(page, {
    name,
    timeoutMs,
    safePassageUrlPattern,
  });

  const redirectedToSafepassage =
    validEmailWait.redirectedToSafepassage === true ||
    analysis.redirectedToSafepassage === true ||
    safePassageUrlPattern.test(validEmailWait.afterUrl || '') ||
    safePassageUrlPattern.test(analysis.currentUrl || '');

  return {
    label: testCase.label,
    email: testCase.email,
    beforeUrl,
    afterUrl: analysis.currentUrl || validEmailWait.afterUrl,

    validEmailWait,

    redirectedToSafepassage,
    skipCurrentUrl: redirectedToSafepassage,
    skipReason:
      redirectedToSafepassage === true
        ? analysis.skipReason || 'Correct email redirected to SafePassage instead of start URL/tour content'
        : null,

    analysis,
    passed: redirectedToSafepassage ? false : analysis.passed,
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

    await page.waitForTimeout(2500);

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
      detectTimeoutMs: 10000,
      selectorTimeoutMs: 1500,
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
        detectTimeoutMs: 18000,
        selectorTimeoutMs: 2000,
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