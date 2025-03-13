import {Browser, Page} from "puppeteer";
import puppeteerExtra from 'puppeteer-extra';
import puppeteerExtraPluginStealth from 'puppeteer-extra-plugin-stealth';
import notifier from "node-notifier";

const ARTIKEL_NAME = "Radeon RX 9070 XT";
const MINDEST_PREIS = 1200;
const CHECK_INTERVAL = 10000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Product {
    title: string;
    price: number;
    availability: boolean;
    link: string;
}

/**
 * Hauptfunktion, die das Scraping für alle Webseiten ausführt.
 */
async function scrapeSite() {
    puppeteerExtra.use(puppeteerExtraPluginStealth());
    const browser = await puppeteerExtra.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled']});

    await delay(2000);
    let trackedProducts: Product[] = [];

    // TODO bisherige seiten die funktionieren sind [Alternate, Caseking, Reichelt, Cyberport, OfficePartner, Notebook, Computeruniverse]
    const scrapers = [scrapeCyberport, scrapeReichelt, scrapeCaseking, scrapeOfficePartner, scrapeComputeruniverse, scrapeAlternate, scrapeNotebook]; // <- Füge hier neue Seiten hinzu!

    try {
        while (true) {
            let allProducts: Product[] = [];

            for (const scraper of scrapers) {
                try {
                    const products = await scraper(browser);
                    allProducts.push(...products);
                }catch (e) {
                    console.log("Fehler im Scraper:", e);
                    continue;
                }
            }
            console.log(allProducts);
            const newProducts = allProducts
                .filter(p => validateProduct(p, MINDEST_PREIS, ARTIKEL_NAME))
                .filter(p => !trackedProducts.some(existing => existing.title === p.title));

            if (newProducts.length > 0) {
                trackedProducts = [...trackedProducts, ...newProducts];
                trackedProducts.sort((a, b) => a.price - b.price);
                sendNotification(newProducts);
            }

            console.log("Aktuelle gefundene Produkte:", trackedProducts);
            await delay(CHECK_INTERVAL);
        }
    } catch (error) {
        console.error("Fehler:", error);
    } finally {
        await browser.close();
    }
}

/**
 * Überprüft, ob ein Produkt den Kriterien entspricht.
 */
function validateProduct(product: Product, maxPrice: number, productName: string): boolean {
    return (product.title.includes(productName) || product.title.includes(" Radeon RX9070 XT")) && product.price <= maxPrice && product.availability;
}

/**
 * Preis-Parser, der Euro-Preise korrekt in Zahlen umwandelt.
 */
function parsePrice(price: string): number {
    return parseFloat(price.replace(/[^\d,]/g, "").replace(",", "."));
}

/**
 * Windows-Benachrichtigung senden, wenn ein Produkt gefunden wurde.
 */
function sendNotification(products: Product[]) {
    products.forEach(product => {
        notifier.notify({
            title: "Produkt gefunden!",
            message: `${product.title} für ${product.price}€ verfügbar!`,
            sound: true,
        });
    });
}

/**
 * set fake value to your page
 * @param page
 */
async function setFakeValueToPage(page: Page){
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
    await page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
    });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    await page.emulateTimezone('Europe/Berlin');
    await page.setGeolocation({ latitude: 52.5200, longitude: 13.4050 });
// Stelle sicher, dass du vorher page.setPermission() für 'geolocation' gesetzt hast:
    await page.setExtraHTTPHeaders({
        'X-Forwarded-For': '52.5200,13.4050'
    });
}

async function scrapeAlternate(browser: Browser): Promise<Product[]> {
    const page = await browser.newPage();
    await setFakeValueToPage(page);
    await page.goto("https://www.alternate.de");
    await page.type("#search-input-d", ARTIKEL_NAME);
    await page.waitForSelector(".input-group-text");
    await page.keyboard.press("Enter");
    await delay(2000);

    const products = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".card")).map(product => ({
            title: product.querySelector(".product-name")?.textContent?.trim() || "Kein Titel",
            price: product.querySelector(".price")?.textContent?.trim() || "0",
            availability: !!product.querySelector("[style*='--availability-GREEN']"),
            link: product.querySelector("a")?.href || "Kein Link",
        }));
    });

    await page.close();
    return products.map(item => ({ ...item, price: parsePrice(item.price) }));
}

async function scrapeCaseking(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        await page.goto("https://www.caseking.de");
        await page.waitForSelector("input[name='q']");
        await page.type("input[name='q']", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".product-tiles")).map(product => ({
                title: product.querySelector(".product-tile-product-name")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".js-unit-price")?.textContent?.trim() || "0",
                availability: product.querySelector(".product-availability")?.textContent?.includes("Auf Lager") || false,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeCaseking \n" + e);
    }
}

async function scrapeGalaxus(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await setFakeValueToPage(page);
        await page.goto("https://www.galaxus.de/de");
        await page.waitForSelector("#q");
        await page.type("#q", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".verticalProductTileStyles_StyledVerticalTile__oGRzz verticalProductTileStyles_StyledVerticalTile__not__isLoading-and-not__isSoldOut__T_S2q")).map(product => ({
                title: product.querySelector(".getProductTitleStyled_SpanStyled__ml3jp")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".price_VisuallyHiddenCurrency__TmKxM")?.textContent?.trim() || "0",
                availability: true,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeGalaxus \n" + e);
    }
}

    async function scrapeComputeruniverse(browser: Browser): Promise<Product[]> {
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
            await page.goto("https://www.computeruniverse.net/de");
            await page.waitForSelector("#search-input");
            await page.type("#search-input", ARTIKEL_NAME);
            await page.keyboard.press("Enter");
            await page.waitForSelector("#consent-accept");
            await page.click("#consent-accept");
            await delay(4000);
            await page.waitForSelector(".price-box__current-price__price__price");

            const products = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(".ProductListItemRow_product__4pA_F")).map(product => ({
                    title: product.querySelector("a")?.getAttribute("title")?.trim() || "Kein Titel",
                    price: product.querySelector(".price-box__current-price")?.textContent?.trim() || product.querySelector(".price-box__current-price__price span")?.textContent?.trim() || "0",
                    availability: product.querySelector(".product-stock__delivery-text")?.textContent?.includes("auf Lager") || false,
                    link: product.querySelector("a")?.href || "Kein Link",
                }));
            });
            await page.close();
            return products.map(item => ({ ...item, price: parsePrice(item.price) }));
        }catch (e) {
            console.log("Something went wrong with scrapeComputeruniverse \n" + e);
        }
    }

async function scrapeReichelt(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await setFakeValueToPage(page);
        await page.goto("https://www.reichelt.de/de/de");
        await page.waitForSelector("#quicksearch");
        await page.type("#quicksearch", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".al_gallery_article")).map(product => ({
                title: product.querySelector(".al_artinfo_link")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".productPrice")?.textContent?.trim() || "0",
                availability: product.querySelector(".availability")?.textContent?.includes("begrenzte Stückzahl") || false,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeReichelt \n" + e);
    }
}

let coockie = true;
async function scrapeCyberport(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        await page.goto("https://www.cyberport.de/");
        if(coockie){
            await page.waitForSelector("#consent-accept-all");
            await page.click("#consent-accept-all");
            coockie = false;
        }
        await delay(1000);
        await page.waitForSelector("input");
        await page.type("input", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);
        await page.waitForSelector(".items-start");

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".items-start")).map(product => ({
                title: product.querySelector(".bullet-list-item")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".text-h4")?.textContent?.trim() || "0",
                availability: product.querySelector(".ml-2xs")?.textContent?.includes("Sofort verfügbar") || false,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeCyberport \n" + e);
    }
}

async function scrapeOfficePartner(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
        await page.goto("https://www.office-partner.de/");
        await page.waitForSelector(".main-search--field", {timeout: 4000});
        await page.type(".main-search--field", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".epoq_list")).map(product => ({
                title: product.querySelector(".product--title")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".price--default")?.textContent?.trim() || "0",
                availability: product.querySelector(".delivery--information")?.textContent?.includes("AUF LAGER") || false,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeOfficePartner \n" + e);
    }
}

async function scrapeNotebook(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await setFakeValueToPage(page);
        await page.goto("https://www.notebooksbilliger.de/");
        await page.waitForSelector("#search-input");
        await page.type("#search-input", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".product-listing__row")).map(product => ({
                title: product.querySelector(".product-card__product-heading-title")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".js-product-price")?.textContent?.trim() || "0",
                availability: product.querySelector(".product-detail__availability")?.textContent?.includes("Sofort ab Lager") || false,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeNotebook \n" + e);
    }
}

async function scrapeAmazon(browser: Browser): Promise<Product[]> {
    try {
        const page = await browser.newPage();
        await setFakeValueToPage(page);
        await page.goto("https://www.amazon.de/");
        await page.waitForSelector("#twotabsearchtextbox");
        await page.type("#twotabsearchtextbox", ARTIKEL_NAME);
        await page.keyboard.press("Enter");
        await delay(2000);

        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".s-result-item")).map(product => ({
                title: product.querySelector("h2 aria-label")?.textContent?.trim() || "Kein Titel",
                price: product.querySelector(".js-product-price")?.textContent?.trim() || "0",
                availability: product.querySelector(".product-detail__availability")?.textContent?.includes("Sofort ab Lager") || false,
                link: product.querySelector("a")?.href || "Kein Link",
            }));
        });

        await page.close();
        return products.map(item => ({ ...item, price: parsePrice(item.price) }));
    }catch (e) {
        console.log("Something went wrong with scrapeNotebook \n" + e);
    }
}

scrapeSite();