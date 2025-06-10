// scraper_server.js
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
// Render sets the PORT environment variable. Fallback for local testing.
const port = process.env.PORT || 3001; 

const CONFIG = {
    MAP_URL: 'https://www.realtor.ca/map#view=list&Sort=6-D&GeoIds=g30_c3nfkdtg&GeoName=Calgary%2C%20AB&PropertyTypeGroupID=1&TransactionTypeId=2&PropertySearchTypeId=3&NumberOfDays=1&OwnershipTypeGroupId=2&Currency=CAD',
    API_URL: 'https://api2.realtor.ca/Listing.svc/PropertySearch_Post',
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    
    // --- Timeout and Retry Settings ---
    ATTEMPT_TIMEOUT_MS: 90000, // 90 seconds for each full attempt (Adjust based on Render performance)
    MAX_RETRY_ATTEMPTS: 2,     // 1 initial attempt + 2 retries = 3 total attempts.
    // --- End Timeout and Retry Settings ---

    HEADLESS: true, // MUST BE TRUE for server deployment on Render
    EXECUTABLE_PATH: '/usr/bin/google-chrome-stable', // Standard path if installed via apt in Docker
    BLOCKED_RESOURCE_TYPES: ['image', 'media', 'font', 'stylesheet', 'other'], // Keep stylesheet blocked for server
    BLOCKED_URL_PATTERNS: ['.css', 'google-analytics', 'googletagmanager', 'doubleclick', 'scorecardresearch', 'youtube', 'intergient'], // Keep .css blocked
};

// Updated runScraper function with retry logic
async function runScraperWithRetry(browser) {
    let page;
    let lastError = null;

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRY_ATTEMPTS + 1; attempt++) {
        console.log(`--- Attempt #${attempt} of ${CONFIG.MAX_RETRY_ATTEMPTS + 1} ---`);
        try {
            if (page && !page.isClosed()) {
                console.log("Closing previous page before new attempt...");
                await page.close();
            }
            page = await browser.newPage();
            console.log("Setting up new page for attempt...");

            // Optional: Add page error listeners for debugging on Render
            page.on('pageerror', function(err) {
                const theTempValue = err.toString();
                console.log('[PAGE JS ERROR on Render attempt #' + attempt + ']: ' + theTempValue);
            });
            page.on('error', function(err) { 
                const theTempValue = err.toString();
                console.log('[PAGE CRASH/OTHER ERROR on Render attempt #' + attempt + ']: ' + theTempValue);
            });

            await page.setUserAgent(CONFIG.USER_AGENT);
            await page.setViewport({ width: 1280, height: 800 });
            await page.setRequestInterception(true);

            page.on('request', (request) => {
                const url = request.url();
                const resourceType = request.resourceType();
                if (
                    CONFIG.BLOCKED_RESOURCE_TYPES.includes(resourceType) ||
                    CONFIG.BLOCKED_URL_PATTERNS.some(pattern => url.includes(pattern))
                ) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            const apiResponsePromiseForAttempt = page.waitForResponse(
                (response) => response.url() === CONFIG.API_URL && response.request().method() === 'POST',
                { timeout: CONFIG.ATTEMPT_TIMEOUT_MS } 
            );

            console.log(`Navigating to: ${CONFIG.MAP_URL} (Timeout: ${CONFIG.ATTEMPT_TIMEOUT_MS / 1000}s)`);
            await page.goto(CONFIG.MAP_URL, { 
                waitUntil: 'networkidle2', 
                timeout: CONFIG.ATTEMPT_TIMEOUT_MS,
            });
            console.log("Navigation complete for this attempt.");

            try {
                await page.evaluate(() => window.scrollBy(0, 100));
                console.log("Page scrolled.");
            } catch (e) { 
                console.warn("Scroll failed, continuing...");
            }

            console.log(`Awaiting API response (Timeout: ${CONFIG.ATTEMPT_TIMEOUT_MS / 1000}s allocated for nav+wait)...`);
            const response = await apiResponsePromiseForAttempt; 

            console.log(`API Response Status: ${response.status()}`);
            if (!response.ok()) {
                const text = await response.text();
                const errorMsg = `API HTTP Error ${response.status()} ${response.statusText()}. Body: ${text.substring(0, 200)}`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log("API response JSON parsed successfully on attempt #" + attempt);
            if (page && !page.isClosed()) await page.close();
            return data;

        } catch (error) {
            lastError = error; 
            console.error(`Attempt #${attempt} failed: ${error.message}`);
            if (error.name === 'TimeoutError') {
                console.error(error.stack);
            }
            if (attempt > CONFIG.MAX_RETRY_ATTEMPTS) {
                console.error("Max retry attempts reached. Failing operation.");
                if (page && !page.isClosed()) await page.close();
                throw lastError; 
            }
            console.log("Preparing for next attempt after a short delay...");
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay
        }
    }
    if (page && !page.isClosed()) await page.close();
    throw lastError || new Error("Scraping failed after all attempts; unknown state.");
}


app.get('/run-scrape', async (req, res) => {
    console.log("Received request to /run-scrape");
    let browser;
    try {
        console.log(`Launching browser (Headless: ${CONFIG.HEADLESS})...`);
        console.log('DEBUG: Launch options:', { headless: CONFIG.HEADLESS, executablePath: CONFIG.EXECUTABLE_PATH });
        
        const launchOptions = {
            headless: CONFIG.HEADLESS,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            ignoreHTTPSErrors: true,
        };
        if (CONFIG.EXECUTABLE_PATH) {
            launchOptions.executablePath = CONFIG.EXECUTABLE_PATH;
        }
        
        browser = await puppeteer.launch(launchOptions);

        // Call the new function with retry logic
        const scrapedData = await runScraperWithRetry(browser); 
        
        console.log("Scraping successful, sending data back.");
        res.json(scrapedData);

    } catch (error) {
        console.error("Error during scraping (/run-scrape handler):", error.message || error);
        console.error(error.stack);
        res.status(500).json({ error: 'Failed to scrape data', details: error.message });
    } finally {
        if (browser) {
            console.log("Closing browser.");
            await browser.close();
        }
        console.log("Request to /run-scrape finished.");
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`Scraper server listening on port ${port}`);
    console.log(`To trigger a scrape, call the /run-scrape endpoint.`);
});