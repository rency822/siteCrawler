# siteCrawler

A lightweight, automated web crawler built with **Node.js** and **Playwright** designed to scan and process lists of URLs efficiently.

## 🚀 Features

* **Fast Headless Crawling:** Powered by Playwright for modern, robust browser automation.
* **Bulk Processing:** Easily feed a list of target URLs via a plain text file.
* **YOTI Modal Check:** Detects and handles identity verification popups powered by YOTI.
* **Geolocation Verification:** Confirms whether geo-restrictions or localized content render correctly based on region settings.
* **Trailer Check:** Verifies video trailer playback, presence, or metadata across targeted pages.
* **Sitemap Extraction:** Parses XML sitemaps to discover and queue deep site structures for crawling.
* **Navigation Check:** Tests page layouts, broken links, and full navigational flow elements across desktop or mobile configurations.
* **Automated Workflows:** Includes GitHub Actions configuration (`.github/workflows`) for CI/CD or scheduled runs.

---

## 🛠️ File Structure

* `main.js` - The entry point and core logic of the crawler.
* `urls.txt` - The input file containing the list of URLs to crawl (one per line).
* `playwright.config.ts` - Configuration settings for the Playwright browser instances.
* `components/` - Reusable modules, selectors, or helper functions (e.g., specific checks for YOTI, geolocation, etc.).
* `package.json` - Project dependencies and scripts.

---

## 📦 Installation

To get this project running locally, ensure you have [Node.js](https://nodejs.org/) installed, then follow these steps:


1. **Clone the repository:**
   ```bash
   git clone [https://github.com/rency822/siteCrawler.git](https://github.com/rency822/siteCrawler.git)
   cd siteCrawler

## To run
Make sure URL's are inside the url.txt one per line
run npm main.js
