import { toFileUrl, resolve } from "https://deno.land/std@0.115.1/path/mod.ts";
import { logUsage, processFlags } from "https://deno.land/x/flags_usage@2.0.0/mod.ts";
import { CrawlerCore, createCrawlHandlers } from "./mod.ts";

const flagInfo = {
    preamble: "Usage: deno run [--allow-read] [--allow-net] crawl.ts <entry point (path or URL)> [options]",
    alias: {
        "external-links": "x",
        "concurrency": "c",
        "depth": "d",
        "base-url": "b",
    },
    description: {
        "external-links": "Strategy for external links: ignore, check, follow",
        "concurrency": "Maximum concurrency",
        "depth": "Maximum crawl depth",
        "base-url": "Base URL for the site (default: entry point parent)",
        "index-name": "Index name for file system directories",
    },
    argument: {
        "external-links": "strategy",
        "base-url": "URL",
        "index-name": "name",
    },
    default: {
        "external-links": "ignore",
        "concurrency": 1,
        "depth": Infinity,
        "index-name": "index.html",
    },
    string: [
        "external-links",
        "base-url",
        "index-name",
    ],
};

function toURL(pathOrURL: string): URL {
    try {
        return new URL(pathOrURL);
    } catch (_e) {
        return toFileUrl(resolve(pathOrURL));
    }
}

const flags = processFlags(Deno.args, flagInfo);
try {
    // Entry point
    if (flags._.length <= 0) {
        throw "No crawl entry point provided";
    }

    const entryPoint = toURL("" + flags._[0]);
    if (entryPoint.protocol === "file:" && !(await Deno.stat(entryPoint)).isFile) {
        throw `File system entry point must be a file`
    }

    // External link handling
    const externalLinkFlag = flags["external-links"];
    let externalLinks: "ignore" | "check" | "follow" | undefined;
    switch (externalLinkFlag) {
        case "ignore":
        case "check":
        case "follow":
            externalLinks = externalLinkFlag;
            break;
        
        default:
            throw `Unknown external link strategy: ${externalLinkFlag}`;
    }

    // Max concurrency, depth
    const maxConcurrency = flags.concurrency;
    const { depth } = flags;

    // Base URL
    let base: URL | undefined;
    if (flags["base-url"]) {
        base = toURL(flags["base-url"]);
    }

    // Index
    const indexPath = flags["index-name"];

    // Crawl
    console.log(`Starting crawl from: ${entryPoint.href}
    External link handling: ${externalLinks}
    Max concurrency: ${maxConcurrency}
    Max depth: ${depth}
    Base URL: ${base ? base.href : "(parent)"}
    Index path for file system URLs: ${indexPath}
    `);

    let errorCount = 0;
    let queryCount = 0;
    let downloadCount = 0;
    const hostNames = new Set<string>();
    const urlToError = new Map<string, string>();

    const baseCrawlHandlers = createCrawlHandlers({ indexPath });
    const crawler = new CrawlerCore({
        getContentTypeAsync: async (url) => {
            try {
                if (url.hostname) {
                    hostNames.add(url.hostname);
                }

                const result = await baseCrawlHandlers.getContentTypeAsync(url);
                console.log(`Query result: ${url.href} (${result})`);
                ++queryCount;
                return result;
            } catch (error) {
                console.log(`Query error: ${url.href} (${error.toString()})`);
                ++errorCount;
                urlToError.set(url.href, error.toString());
                throw error;
            }
        },
    
        readTextAsync: async (url) => {
            try {
                const result = await baseCrawlHandlers.readTextAsync(url);
                console.log(`Download result: ${url.href} (length: ${result.length})`);
                ++downloadCount;
                return result;
            } catch (error) {
                console.log(`Download error: ${url.href} (${error.toString()})`);
                ++errorCount;
                urlToError.set(url.href, error.toString());
                throw error;
            }
        },
        
        contentTypeParsers: baseCrawlHandlers.contentTypeParsers,
    });
    
    await crawler.crawlAsync(entryPoint, {
        externalLinks: externalLinks,
        maxConcurrency,
        depth,
        base,
    });

    console.log(`\nCrawl completed:
    Resources successfully queried: ${queryCount}
    Resources successfully retrieved: ${downloadCount}
    Error count: ${errorCount}
    
    Host names queried: ${Array.from(hostNames.values()).sort().join(", ")}
    ${urlToError.size > 0 ? `
    Errors: ${Array.from(urlToError.keys()).map(url => `\n    ${url}: ${urlToError.get(url)}`).join("")}
    ` : ""}
    `);
} catch (error) {
    console.log(`Error: ${error}`);
    logUsage(flagInfo);
    Deno.exit(-1);
}
