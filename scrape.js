// 1. Dependencies & Stealth
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('node:fs/promises'); // Use promise version

puppeteer.use(StealthPlugin());

// 2. Central Configuration
const CONFIG = {
    MAP_URL: 'https://www.realtor.ca/map#view=list&Sort=6-D&GeoIds=g30_c3nfkdtg&GeoName=Calgary%2C%20AB&PropertyTypeGroupID=1&TransactionTypeId=2&PropertySearchTypeId=3&NumberOfDays=1&OwnershipTypeGroupId=2&Currency=CAD',
    API_URL: 'https://api2.realtor.ca/Listing.svc/PropertySearch_Post',
    OUTPUT_FILE: 'realtor_listings_perfect.json',
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    TIMEOUT_MS: 60000, // For navigation and waiting for response
    HEADLESS: false, // true = faster, no UI. false = slower, visual, better for debug/evasion.
    EXECUTABLE_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // <<-- THIS IS NOW UNCOMMENTED
    BLOCKED_RESOURCE_TYPES: ['image', 'media', 'font', 'stylesheet', 'other'], // Efficiency: block non essential
    BLOCKED_URL_PATTERNS: ['.css', 'google-analytics', 'googletagmanager', 'doubleclick', 'scorecardresearch', 'youtube', 'intergient'], // Efficiency
};

// 3. Core Logic Function
async function runScraper(browser) {
     console.log("Setting up page...");
     const page = await browser.newPage();
     await page.setUserAgent(CONFIG.USER_AGENT);
     await page.setViewport({ width: 1280, height: 800 }); // Consistent viewport
     await page.setRequestInterception(true);

      // Efficiency: Block resources
      page.on('request', (request) => {
         const url = request.url();
         const resourceType = request.resourceType();
          if (
             CONFIG.BLOCKED_RESOURCE_TYPES.includes(resourceType) ||
             CONFIG.BLOCKED_URL_PATTERNS.some(pattern => url.includes(pattern))
            ) {
              // console.log(`[BLOCK] ${resourceType} ${url.substring(0, 60)}...`);
               request.abort();
          } else {
               // console.log(`[ALLOW] ${resourceType} ${url.substring(0, 60)}...`);
               request.continue();
          }
     });

     console.log(`Waiting for API: ${CONFIG.API_URL}`);
      // Best Practice: Idiomatic Wait
     const apiResponsePromise = page.waitForResponse(
          (response) => response.url() === CONFIG.API_URL && response.request().method() === 'POST',
         { timeout: CONFIG.TIMEOUT_MS }
     );

     console.log(`Navigating to: ${CONFIG.MAP_URL}`);
      await page.goto(CONFIG.MAP_URL, {
          waitUntil: 'networkidle0', // Efficiency: Wait only for essential network calls
         timeout: CONFIG.TIMEOUT_MS,
      });

       // Optional scroll trigger
      try {
            await page.evaluate(() => window.scrollBy(0, 50));
        } catch (e) { /* ignore scroll errors */ }

       console.log("Awaiting API response...");
       const response = await apiResponsePromise; // Wait for the specific response

       console.log(`API Response Status: ${response.status()}`);
       if (!response.ok()) {
           const text = await response.text();
           throw new Error(`API HTTP Error ${response.status()} ${response.statusText()}. Body: ${text.substring(0, 200)}`);
        }

       const data = await response.json(); // Throws if JSON is invalid
       console.log("API response JSON parsed.");
       return data;
}

// 4. Data Saving Function
async function saveData(data, filePath) {
     if (!data) {
         console.warn("No data to save.");
         return;
     }
      // Best Practice: Async file IO
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`Data saved: ${filePath}`);
       console.log(`Listings found: ${data.Results?.length || 0}`);
}

// 5. Main Orchestration Function
async function main() {
     console.log("Script start.");
     let browser;
     try {
        console.log(`Launching browser (Headless: ${CONFIG.HEADLESS})...`);
        // ADDED DEBUG LINE:
        console.log('DEBUG: Launching with executablePath:', CONFIG.EXECUTABLE_PATH); 
        browser = await puppeteer.launch({
             headless: CONFIG.HEADLESS,
            executablePath: CONFIG.EXECUTABLE_PATH, // <<-- THIS IS NOW UNCOMMENTED
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreHTTPSErrors: true,
        });
        const data = await runScraper(browser);
        await saveData(data, CONFIG.OUTPUT_FILE);
        console.log("Script success.");

    } catch (error) {
        console.error("Script Error:", error.message || error);
    } finally {
        if (browser) {
            console.log("Closing browser.");
            await browser.close();
        }
         console.log("Script end.");
    }
}

// Execute
main().catch(err => {
     console.error("Unhandled Main Error:", err);
     process.exit(1); // Exit with error code
});