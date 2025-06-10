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
    TIMEOUT_MS: 90000, 
    HEADLESS: true, // MUST BE TRUE for server deployment on Render
    // For Docker deployment where Chrome is installed via Dockerfile:
    EXECUTABLE_PATH: '/usr/bin/google-chrome-stable', // Standard path if installed via apt in Docker
    // If NOT using Docker and relying on Render's native Node + Puppeteer's bundled Chromium, 
    // you might try setting EXECUTABLE_PATH to null or process.env.PUPPETEER_EXECUTABLE_PATH
    // but Docker is more reliable.
    BLOCKED_RESOURCE_TYPES: ['image', 'media', 'font', 'stylesheet', 'other'],
    BLOCKED_URL_PATTERNS: ['.css', 'google-analytics', 'googletagmanager', 'doubleclick', 'scorecardresearch', 'youtube', 'intergient'],
};

async function runScraper(browser) {
    console.log("Setting up page...");
    const page = await browser.newPage();
    try {
        await page.setUserAgent(CONFIG.USER_AGENT);
        await page.setViewport({ width: 1280, height: 800 });
        await page.setRequestInterception(true);

        page.on('request', (request) => {
            const url = request.url();
            const resourceType = request.resourceType();
            if (CONFIG.BLOCKED_RESOURCE_TYPES.includes(resourceType) || CONFIG.BLOCKED_URL_PATTERNS.some(pattern => url.includes(pattern))) {
                request.abort();
            } else {
                request.continue();
            }
        });

        console.log(`Waiting for API: ${CONFIG.API_URL}`);
        const apiResponsePromise = page.waitForResponse(
            (response) => response.url() === CONFIG.API_URL && response.request().method() === 'POST',
            { timeout: CONFIG.TIMEOUT_MS }
        );

        console.log(`Navigating to: ${CONFIG.MAP_URL}`);
        await page.goto(CONFIG.MAP_URL, { waitUntil: 'networkidle0', timeout: CONFIG.TIMEOUT_MS });
        try { await page.evaluate(() => window.scrollBy(0, 50)); } catch (e) { console.warn("Scroll failed, continuing..."); }

        console.log("Awaiting API response...");
        const response = await apiResponsePromise;
        console.log(`API Response Status: ${response.status()}`);
        if (!response.ok()) {
            const text = await response.text();
            throw new Error(`API HTTP Error ${response.status()} ${response.statusText()}. Body: ${text.substring(0, 200)}`);
        }
        const data = await response.json();
        console.log("API response JSON parsed.");
        return data; // Returns the raw JSON data from the API
    } finally {
        if (page && !page.isClosed()) {
            await page.close();
        }
    }
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
                '--disable-gpu' // Often recommended for server environments
            ],
            ignoreHTTPSErrors: true,
        };
        // Only set executablePath if it's explicitly defined in CONFIG
        if (CONFIG.EXECUTABLE_PATH) {
            launchOptions.executablePath = CONFIG.EXECUTABLE_PATH;
        }
        
        browser = await puppeteer.launch(launchOptions);

        const scrapedData = await runScraper(browser); // This is the raw JSON from Realtor's API
        console.log("Scraping successful, sending data back.");
        res.json(scrapedData); // Send this raw data

    } catch (error) {
        console.error("Error during scraping:", error.message || error);
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

app.get('/health', (req, res) => { // Health check endpoint for Render
    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`Scraper server listening on port ${port}`);
    console.log(`To trigger a scrape, call the /run-scrape endpoint.`);
});