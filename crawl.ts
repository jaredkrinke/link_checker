import { toFileUrl, resolve } from "https://deno.land/std@0.115.1/path/mod.ts";
import { dirname, join } from "https://deno.land/std@0.115.1/path/win32.ts";
import { logUsage, processFlags } from "https://deno.land/x/flags_usage@2.0.0/mod.ts";
import { getBaseFromURL } from "./crawler.ts";
import { CrawlerCore, createCrawlHandlers, version } from "./mod.ts";

const flagInfo = {
    preamble: "Usage: deno run [--allow-read] [--allow-net] crawl.ts <entry point (path or URL)> [options]",
    alias: {
        "external-links": "x",
        "concurrency": "c",
        "depth": "d",
        "base-url": "b",
        "output": "o",
    },
    description: {
        "external-links": "Strategy for external links: ignore, check, follow",
        "concurrency": "Maximum concurrency",
        "depth": "Maximum crawl depth",
        "base-url": "Base URL for the site (default: entry point parent)",
        "index-name": "Index name for file system directories",
        "output": "Directory in which to save internal resources",
        "version": "Display module version",
    },
    argument: {
        "external-links": "strategy",
        "base-url": "URL",
        "index-name": "name",
        "output": "directory",
    },
    default: {
        "external-links": "ignore",
        "concurrency": 1,
        "depth": Infinity,
        "index-name": "index.html",
    },
    boolean: [
        "version",
    ],
    string: [
        "external-links",
        "base-url",
        "index-name",
        "output",
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
    const base = new URL(getBaseFromURL(entryPoint));

    // Saving/output/capturing resources
    const outputDirectory = flags.output;

    // Index
    const indexPath = flags["index-name"];

    // Crawl
    console.log(`Starting crawl from: ${entryPoint.href}
    External link handling: ${externalLinks}
    Max concurrency: ${maxConcurrency}
    Max depth: ${depth}
    Base URL: ${base}
    Index path for file system URLs: ${indexPath}
    Output directory: ${outputDirectory ?? "(none)"}
    `);

    let errorCount = 0;
    let queryCount = 0;
    let downloadCount = 0;
    let saveCount = 0;
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

        writeTextAsync: outputDirectory ? async (url: URL, content: string): Promise<void> => {
            const href = url.href;
            if (href.startsWith(base.href)) {
                const tail = href.substring(base.href.length);
                let path = join(outputDirectory, tail);

                // Append index path for directories
                if (href[href.length - 1] === "/") {
                    path += indexPath;
                }

                console.log(`Saving ${url.href} to ${path}`);

                // First, ensure directory exists
                const dir = dirname(path);
                await Deno.mkdir(dir, { recursive: true });

                await Deno.writeTextFile(path, content, { create: true });
                saveCount++;
            }
        } : undefined,
        
        contentTypeParsers: baseCrawlHandlers.contentTypeParsers,
    });
    
    await crawler.crawlAsync(entryPoint, {
        externalLinks,
        maxConcurrency,
        depth,
        base,
        content: outputDirectory ? "saveInternal" : "discard",
    });

    console.log(`\nCrawl completed:
    Resources successfully queried: ${queryCount}
    Resources successfully retrieved: ${downloadCount}
    Resources saved: ${saveCount}
    Error count: ${errorCount}
    
    Host names queried: ${Array.from(hostNames.values()).sort().join(", ")}
    ${urlToError.size > 0 ? `
    Errors: ${Array.from(urlToError.keys()).map(url => `\n    ${url}: ${urlToError.get(url)}`).join("")}
    ` : ""}
    `);
} catch (error) {
    console.log(`Error: ${error}`);
    if (typeof(error) === "string") {
        logUsage(flagInfo);
    }
    Deno.exit(-1);
}
