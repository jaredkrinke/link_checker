import { ContentTypeParserCollection, CrawlHandlers, CrawlerCore, CrawlOptions, ResourceCollection, ResourceInfo } from "./crawler.ts";
import { LinkCheckerCore, CheckLinksOptions, CheckLinksResult } from "./checker.ts";
import { parse } from "./parse_html.ts";
export { version } from "./version.ts";

export { CrawlerCore, LinkCheckerCore };
export type { ContentTypeParserCollection, CrawlHandlers, CrawlOptions, CheckLinksOptions, CheckLinksResult, ResourceCollection, ResourceInfo };

const htmlType = "text/html";
const otherType = "application/octet-stream";
const htmlPattern = /\.x?html?$/;
const defaultIndexPath = "index.html";

interface CrawlHandlerSettings {
    indexPath: string;
}

interface CrawlHandlerOptions {
    indexPath?: string;
}

async function resolveFileURLAsync(url: URL, settings: CrawlHandlerSettings): Promise<URL> {
    let resolvedURL = url;
    let fileInfo = await Deno.stat(resolvedURL);
    if (fileInfo.isDirectory && settings.indexPath) {
        // This is a directory; redirect to index.html
        resolvedURL = new URL(resolvedURL.href + settings.indexPath);
        fileInfo = await Deno.stat(resolvedURL);
    }

    if (fileInfo.isFile) {
        return resolvedURL;
    } else {
        throw new Deno.errors.NotFound(url.href);
    }
}

async function baseGetFileContentTypeAsync(url: URL, settings: CrawlHandlerSettings): Promise<string> {
    // Infer content type from file extension (.htm/.html/.xhtml are the only ones that are relevant here)
    const resolvedURL = await resolveFileURLAsync(url, settings);
    return htmlPattern.test(resolvedURL.pathname) ? htmlType : otherType;
}

const requestHeaders = { "Accept": "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8" };

async function defaultGetHTTPContentTypeAsync(url: URL): Promise<string> {
    const response = await fetch(url, { method: "HEAD", headers: requestHeaders });
    if (!response.ok) {
        throw new Deno.errors.NotFound(url.href);
    }
    return response.headers.get("content-type") || "";
}

function baseGetContentTypeAsync(url: URL, settings: CrawlHandlerSettings): Promise<string> {
    switch (url.protocol) {
        case "file:": return baseGetFileContentTypeAsync(url, settings);
        default: return defaultGetHTTPContentTypeAsync(url);
    }
}

async function baseReadFileTextAsync(url: URL, settings: CrawlHandlerSettings): Promise<string> {
    return await Deno.readTextFile(await resolveFileURLAsync(url, settings));
}

async function defaultReadHTTPTextAsync(url: URL): Promise<string> {
    const response = await fetch(url, { headers: requestHeaders });
    if (!response.ok) {
        throw new Deno.errors.NotFound(url.href);
    }
    return await response.text();
}

function baseReadTextAsync(url: URL, settings: CrawlHandlerSettings): Promise<string> {
    switch (url.protocol) {
        case "file:": return baseReadFileTextAsync(url, settings);
        default: return defaultReadHTTPTextAsync(url);
    }
}

const defaultContentTypeParsers: ContentTypeParserCollection = {
    [htmlType]: parse,
    "application/xhtml+xml": parse,
    "application/xml": parse,
};

export function createCrawlHandlers(options?: CrawlHandlerOptions): CrawlHandlers {
    const settings: CrawlHandlerSettings = {
        indexPath: options?.indexPath ?? defaultIndexPath,
    };

    return {
        getContentTypeAsync: (url) => baseGetContentTypeAsync(url, settings),
        readTextAsync: (url) => baseReadTextAsync(url, settings),
        contentTypeParsers: defaultContentTypeParsers,
    };
}

export const defaultCrawlHandlers = createCrawlHandlers({ indexPath: defaultIndexPath });

export class Crawler extends CrawlerCore {
    constructor(options?: CrawlHandlerOptions) {
        super(createCrawlHandlers(options));
    }
}

export class LinkChecker extends LinkCheckerCore {
    constructor(options?: CrawlHandlerOptions) {
        super(createCrawlHandlers(options));
    }
}
