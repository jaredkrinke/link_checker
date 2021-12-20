import { ContentTypeParserCollection, CrawlHandlers, Crawler as CrawlerCore } from "./crawler.ts";
import { LinkChecker as LinkCheckerCore } from "./checker.ts";
import { parse } from "./parse_html.ts";


const htmlType = "text/html";
const otherType = "application/octet-stream";
const htmlPattern = /\.x?html?$/;
const indexName = "index.html"; // TODO: Make customizable?

async function resolveFileURLAsync(url: URL): Promise<URL> {
    let resolvedURL = url;
    let fileInfo = await Deno.stat(resolvedURL);
    if (fileInfo.isDirectory) {
        // This is a directory; redirect to index.html
        resolvedURL = new URL(resolvedURL.href + indexName);
        fileInfo = await Deno.stat(resolvedURL);
    }

    if (fileInfo.isFile) {
        return resolvedURL;
    } else {
        throw new Deno.errors.NotFound(url.href);
    }
}

async function defaultGetFileContentTypeAsync(url: URL): Promise<string> {
    // Infer content type from file extension (.htm/.html/.xhtml are the only ones that are relevant here)
    const resolvedURL = await resolveFileURLAsync(url);
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

function defaultGetContentTypeAsync(url: URL): Promise<string> {
    switch (url.protocol) {
        case "file:": return defaultGetFileContentTypeAsync(url);
        default: return defaultGetHTTPContentTypeAsync(url);
    }
}

async function defaultReadFileTextAsync(url: URL): Promise<string> {
    return await Deno.readTextFile(await resolveFileURLAsync(url));
}

async function defaultReadHTTPTextAsync(url: URL): Promise<string> {
    const response = await fetch(url, { headers: requestHeaders });
    if (!response.ok) {
        throw new Deno.errors.NotFound(url.href);
    }
    return await response.text();
}

function defaultReadTextAsync(url: URL): Promise<string> {
    switch (url.protocol) {
        case "file:": return defaultReadFileTextAsync(url);
        default: return defaultReadHTTPTextAsync(url);
    }
}

const defaultContentTypeParsers: ContentTypeParserCollection = {
    [htmlType]: parse,
    "application/xhtml+xml": parse,
    "application/xml": parse,
};

const defaultCrawlHandlers: CrawlHandlers = {
    getContentTypeAsync: defaultGetContentTypeAsync,
    readTextAsync: defaultReadTextAsync,
    contentTypeParsers: defaultContentTypeParsers,
};

export class Crawler extends CrawlerCore {
    constructor() {
        super(defaultCrawlHandlers);
    }
}

export class LinkChecker extends LinkCheckerCore {
    constructor() {
        super(defaultCrawlHandlers);
    }
}
