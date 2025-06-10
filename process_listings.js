const fs = require('node:fs/promises');

const INPUT_JSON_FILE = 'realtor_listings_perfect.json';
const OUTPUT_PROCESSED_FILE = 'condo_report_input_data_v3.json'; // New output file name
const REALTOR_BASE_URL = 'https://www.realtor.ca';

async function extractListingInfo() {
    console.log(`Attempting to read and process ${INPUT_JSON_FILE}...`);
    let rawData;
    let jsonData;

    try {
        rawData = await fs.readFile(INPUT_JSON_FILE, 'utf8');
        console.log("✅ JSON file read successfully.");
    } catch (error) {
        console.error(`❌ Error reading the JSON file (${INPUT_JSON_FILE}):`, error.message);
        return;
    }

    try {
        jsonData = JSON.parse(rawData);
        console.log("✅ JSON data parsed successfully.");
    } catch (error) {
        console.error(`❌ Error parsing the JSON data from ${INPUT_JSON_FILE}:`, error.message);
        return;
    }

    if (!jsonData || !jsonData.Results || !Array.isArray(jsonData.Results)) {
        console.warn("⚠️ JSON data does not have the expected 'Results' array structure.");
        return;
    }

    const extractedListings = [];

    for (const listing of jsonData.Results) {
        const primaryRealtorInfo = listing.Individual && listing.Individual.length > 0 ? listing.Individual[0] : null;
        const organizationInfo = primaryRealtorInfo?.Organization;

        // --- Listing Fields ---
        const realtorCaListingId = listing.Id || 'N/A';
        const mlsNumber = listing.MlsNumber || 'N/A';
        const listingFullAddress = listing.Property?.Address?.AddressText?.replace(" | ", ", ") || 'N/A';
        const relativeLink = listing.RelativeDetailsURL;
        const listingLink = relativeLink ? `${REALTOR_BASE_URL}${relativeLink}` : 'N/A';
        const ownershipType = listing.Property?.OwnershipType || 'N/A';
        const priceFormatted = listing.Property?.Price || 'N/A';
        const priceUnformatted = listing.Property?.PriceUnformattedValue || null;
        const buildingType = listing.Building?.Type || 'N/A';
        const sizeInterior = listing.Building?.SizeInterior || 'N/A';
        const timeOnRealtor = listing.TimeOnRealtor || 'N/A';

        // --- Realtor Fields ---
        const realtorName = primaryRealtorInfo?.Name || 'N/A';
        const realtorPhonesArray = primaryRealtorInfo?.Phones?.map(phone => ({
            type: phone.PhoneType,
            number: `${phone.AreaCode}-${phone.PhoneNumber}`
        })) || [];
        const realtorWebsitesArray = primaryRealtorInfo?.Websites || [];

        // --- Brokerage (Organization) Fields ---
        const brokerageName = organizationInfo?.Name || 'N/A';
        const brokerageAddress = organizationInfo?.Address?.AddressText?.replace(" | ", ", ") || 'N/A';
        const brokeragePhonesArray = organizationInfo?.Phones?.map(phone => ({
            type: phone.PhoneType,
            number: `${phone.AreaCode}-${phone.PhoneNumber}`
        })) || [];
        // Brokerage websites are sometimes present under Organization.Websites
        const brokerageWebsitesArray = organizationInfo?.Websites || [];
        // Brokerage emails are sometimes present under Organization.Emails (often just a ContactId)
        const brokerageEmailsArray = organizationInfo?.Emails || [];


        extractedListings.push({
            // Listing
            realtorCaListingId,
            mlsNumber,
            listingFullAddress,
            listingLink,
            ownershipType,
            priceFormatted,
            priceUnformatted,
            buildingType,
            sizeInterior,
            timeOnRealtor,
            // Realtor
            realtorName,
            realtorPhones: realtorPhonesArray,
            realtorWebsites: realtorWebsitesArray,
            // Brokerage
            brokerageName,
            brokerageAddress,
            brokeragePhones: brokeragePhonesArray,
            brokerageWebsites: brokerageWebsitesArray,
            brokerageEmails: brokerageEmailsArray,
        });
    }

    if (extractedListings.length > 0) {
        console.log(`\n✅ Extracted information for ${extractedListings.length} listings:\n`);
        extractedListings.forEach((info, index) => {
            console.log(`--- Listing ${index + 1} ---`);
            console.log(`  Realtor.ca ID:    ${info.realtorCaListingId}`);
            console.log(`  MLS® Number:      ${info.mlsNumber}`);
            console.log(`  Listing Address:  ${info.listingFullAddress}`);
            console.log(`  Listing Link:     ${info.listingLink}`);
            console.log(`  Ownership Type:   ${info.ownershipType}`);
            console.log(`  Price:            ${info.priceFormatted} (Raw: ${info.priceUnformatted})`);
            console.log(`  Building Type:    ${info.buildingType}`);
            console.log(`  Size:             ${info.sizeInterior}`);
            console.log(`  Time on Realtor:  ${info.timeOnRealtor}`);
            console.log(`  Realtor Name:     ${info.realtorName}`);
            info.realtorPhones.forEach(phone => console.log(`    Realtor Phone (${phone.type}): ${phone.number}`));
            info.realtorWebsites.forEach(site => console.log(`    Realtor Website (Type ${site.WebsiteTypeId}): ${site.Website}`));
            console.log(`  Brokerage Name:   ${info.brokerageName}`);
            console.log(`  Brokerage Address:${info.brokerageAddress}`);
            info.brokeragePhones.forEach(phone => console.log(`    Brokerage Phone (${phone.type}): ${phone.number}`));
            info.brokerageWebsites.forEach(site => console.log(`    Brokerage Website (Type ${site.WebsiteTypeId}): ${site.Website}`));
            if (info.brokerageEmails.length > 0) {
                 console.log("  Brokerage Emails/Contacts:");
                 info.brokerageEmails.forEach(email => console.log(`    - Contact ID: ${email.ContactId}`)); // Usually just a contact ID
            }
            console.log(`------------------\n`);
        });

        try {
            await fs.writeFile(OUTPUT_PROCESSED_FILE, JSON.stringify(extractedListings, null, 2), 'utf8');
            console.log(`💾 Processed data also saved to ${OUTPUT_PROCESSED_FILE}`);
        } catch (error) {
            console.error("❌ Error saving processed data:", error.message);
        }

    } else {
        console.log("ℹ️ No listings found in the JSON 'Results' array to process.");
    }
}

extractListingInfo().catch(error => {
    console.error("An unexpected error occurred during processing:", error);
});