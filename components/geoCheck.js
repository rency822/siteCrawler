async function fetchJsonWithFallback(page, urls, opts = {}) {
  const name = opts.name || 'geoCheck';
  const timeoutMs = opts.timeoutMs || 15000;

  for (const url of urls) {
    try {
      console.log(`[${name}] trying IP lookup: ${url}`);

      const response = await page.request.get(url, {
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 QA Geo Check',
        },
      });

      console.log(`[${name}] ${url} status=${response.status()}`);

      if (!response.ok()) {
        continue;
      }

      const data = await response.json();

      return {
        providerUrl: url,
        data,
      };
    } catch (error) {
      console.log(`[${name}] ${url} failed: ${error.message}`);
    }
  }

  return null;
}

function normalizeGeoData(providerUrl, data) {
  // ipwho.is response
  if (providerUrl.includes('ipwho.is')) {
    return {
      ip: data.ip || null,
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      raw: data,
    };
  }

  // ip-api.com response
  if (providerUrl.includes('ip-api.com')) {
    return {
      ip: data.query || null,
      city: data.city || null,
      region: data.regionName || null,
      country: data.country || null,
      raw: data,
    };
  }

  // ipinfo.io response
  if (providerUrl.includes('ipinfo.io')) {
    return {
      ip: data.ip || null,
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      raw: data,
    };
  }

  // ipapi.co response
  return {
    ip: data.ip || null,
    city: data.city || null,
    region: data.region || null,
    country: data.country_name || data.country || null,
    raw: data,
  };
}

async function geoCheck(page, opts = {}) {
  const name = opts.name || 'geoCheck';
  const expectedRegion = opts.expectedRegion || 'Iowa';
  const timeoutMs = opts.timeoutMs || 15000;

  console.log('');
  console.log(`[${name}] starting geo check`);
  console.log(`[${name}] expectedRegion=${expectedRegion}`);

  const result = {
    component: 'geoCheck',

    expectedRegion,

    ipProvider: null,
    ip: null,
    city: null,
    detectedRegion: null,
    country: null,
    ipRegionMatched: false,

    yotiModalPresent: false,
    modalBoxPresent: false,
    ageTextPresent: false,

    likelyGeoGate: false,
    error: null,
  };

  try {
    const lookup = await fetchJsonWithFallback(
      page,
      [
        'https://ipwho.is/',
        'http://ip-api.com/json/?fields=status,message,query,country,regionName,city',
        'https://ipinfo.io/json',
        'https://ipapi.co/json/',
      ],
      {
        name,
        timeoutMs,
      }
    );

    if (!lookup) {
      throw new Error('All IP lookup providers failed');
    }

    const geo = normalizeGeoData(lookup.providerUrl, lookup.data);

    result.ipProvider = lookup.providerUrl;
    result.ip = geo.ip;
    result.city = geo.city;
    result.detectedRegion = geo.region;
    result.country = geo.country;

    result.ipRegionMatched =
      String(result.detectedRegion || '').toLowerCase() ===
      String(expectedRegion || '').toLowerCase();

    console.log(`[${name}] ipProvider=${result.ipProvider}`);
    console.log(`[${name}] ip=${result.ip}`);
    console.log(`[${name}] city=${result.city}`);
    console.log(`[${name}] detectedRegion=${result.detectedRegion}`);
    console.log(`[${name}] country=${result.country}`);
    console.log(`[${name}] ipRegionMatched=${result.ipRegionMatched}`);

    console.log(`[${name}] checking Yoti modal on page`);

    result.yotiModalPresent = await page
      .locator('#YppAgeTourModal')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    result.modalBoxPresent = await page
      .locator('#YppAgeTourModal .modal-box')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    const bodyText = await page
      .locator('body')
      .innerText({ timeout: 5000 })
      .catch(() => '');

    result.ageTextPresent = /age verification|required|18\+|region|laws/i.test(bodyText);

    console.log(`[${name}] yotiModalPresent=${result.yotiModalPresent}`);
    console.log(`[${name}] modalBoxPresent=${result.modalBoxPresent}`);
    console.log(`[${name}] ageTextPresent=${result.ageTextPresent}`);

    result.likelyGeoGate =
      result.ipRegionMatched &&
      (
        result.yotiModalPresent ||
        result.modalBoxPresent ||
        result.ageTextPresent
      );

    console.log(`[${name}] likelyGeoGate=${result.likelyGeoGate}`);

    return result;
  } catch (error) {
    result.error = error.message;
    console.log(`[${name}] error=${error.message}`);
    return result;
  }
}

module.exports = {
  geoCheck,
};