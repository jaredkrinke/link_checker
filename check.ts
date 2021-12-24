import { toFileUrl, resolve } from "https://deno.land/std@0.115.1/path/mod.ts";
import { logUsage, processFlags } from "https://deno.land/x/flags_usage@2.0.0/mod.ts";
import { LinkCheckerCore, createCrawlHandlers, version } from "./mod.ts";

const flagInfo = {
    preamble: "Usage: deno run [--allow-read] [--allow-net] check.ts <entry point (path or URL)> [options]",
    alias: {
        "check-external-links": "x",
        "check-fragments": "f",
        "concurrency": "c",
        "base-url": "b",
        "verbose": "v",
    },
    description: {
        "check-external-links": "Check external links; note: consider using \"-c N\" to speed this up",
        "check-fragments": "Check URL fragment/hash for internal links",
        "concurrency": "Maximum concurrency",
        "base-url": "Base URL for the site (default: entry point parent)",
        "index-name": "Index name for file system directories",
        "verbose": "Enable verbose logging",
        "version": "Display module version",
    },
    argument: {
        "base-url": "URL",
        "index-name": "name",
    },
    default: {
        "check-external-links": false,
        "check-fragments": true,
        "concurrency": 1,
        "index-name": "index.html",
    },
    boolean: [
        "check-external-links",
        "verbose",
    ],
    string: [
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
    // --version
    if (flags.version) {
        console.log(version);
        Deno.exit(0);
    }

    // Entry point
    if (flags._.length <= 0) {
        throw "No crawl entry point provided";
    }

    const entryPoint = toURL("" + flags._[0]);
    if (entryPoint.protocol === "file:" && !(await Deno.stat(entryPoint)).isFile) {
        throw `File system entry point must be a file`
    }

    // External link, fragment checking
    const checkExternalLinks = flags["check-external-links"];
    const checkFragments = flags["check-fragments"];

    // Max concurrency
    const maxConcurrency = flags.concurrency;

    // Base URL
    let base: URL | undefined;
    if (flags["base-url"]) {
        base = toURL(flags["base-url"]);
    }

    // Index
    const indexPath = flags["index-name"];

    // Verbosity
    const verbose = flags["verbose"];

    // Crawl
    if (verbose) {
        console.log(`Starting crawl from: ${entryPoint.href}
    Check external links: ${checkExternalLinks}
    Max concurrency: ${maxConcurrency}
    Base URL: ${base ? base.href : "(parent)"}
    Index path for file system URLs: ${indexPath}
    `);
    }

    let errorCount = 0;
    const urlToError = new Map<string, string>();

    const baseCrawlHandlers = createCrawlHandlers({ indexPath });
    const crawler = new LinkCheckerCore({
        getContentTypeAsync: async (url) => {
            try {
                const result = await baseCrawlHandlers.getContentTypeAsync(url);
                if (verbose) {
                    console.log(`Query result: ${url.href} (${result})`);
                }
                return result;
            } catch (error) {
                if (verbose) {
                    console.log(`Query error: ${url.href} (${error.toString()})`);
                    ++errorCount;
                    urlToError.set(url.href, error.toString());
                }
                throw error;
            }
        },
    
        readTextAsync: async (url) => {
            try {
                const result = await baseCrawlHandlers.readTextAsync(url);
                if (verbose) {
                    console.log(`Download result: ${url.href} (length: ${result.length})`);
                }
                return result;
            } catch (error) {
                if (verbose) {
                    console.log(`Download error: ${url.href} (${error.toString()})`);
                    ++errorCount;
                    urlToError.set(url.href, error.toString());
                }
                throw error;
            }
        },
        
        contentTypeParsers: baseCrawlHandlers.contentTypeParsers,
    });
    
    const { brokenLinks } = await crawler.checkLinksAsync(entryPoint, {
        checkExternalLinks,
        checkFragments,
        maxConcurrency,
        base,
    });

    if (verbose) {
        console.log(`\nCrawl completed:
    Error count: ${errorCount}

    ${urlToError.size > 0 ? `
    Errors: ${Array.from(urlToError.keys()).map(url => `\n    ${url}: ${urlToError.get(url)}`).join("")}
    ` : ""}
    `);
    }

    if (brokenLinks.length > 0) {
        console.log(`Broken links:
${brokenLinks.map(l => `\n    ${l.source} -> ${l.href}${l.href !== l.target ? ` (${l.target})` : ""}`).join("")}
    `);
    } else {
        console.log("No broken links detected");
    }
} catch (error) {
    console.log(`Error: ${error}`);
    logUsage(flagInfo);
    Deno.exit(-1);
}
