import { ContentTypeParserCollection, CrawlHandlers, CrawlerCore } from "./crawler.ts";
import { LinkCheckerCore } from "./checker.ts";
import { parse } from "./parse_html.ts";

const htmlType = "text/html";
const otherType = "application/octet-stream";
const htmlPattern = /\.x?html?$/;
const defaultIndexPath = "index.html";

async function resolveFileURLAsync(url: URL, indexPath: string): Promise<URL> {
    let resolvedURL = url;
    let fileInfo = await Deno.stat(resolvedURL);
    if (fileInfo.isDirectory && indexPath) {
        // This is a directory; redirect to index.html
        resolvedURL = new URL(resolvedURL.href + indexPath);
        fileInfo = await Deno.stat(resolvedURL);
    }

    if (fileInfo.isFile) {
        return resolvedURL;
    } else {
        throw new Deno.errors.NotFound(url.href);
    }
}

export async function baseGetFileContentTypeAsync(url: URL, indexPath: string): Promise<string> {
    // Infer content type from file extension (.htm/.html/.xhtml are the only ones that are relevant here)
    const resolvedURL = await resolveFileURLAsync(url, indexPath);
    return htmlPattern.test(resolvedURL.pathname) ? htmlType : otherType;
}

export function defaultGetFileContentTypeAsync(url: URL): Promise<string> {
    return baseGetFileContentTypeAsync(url, defaultIndexPath);
}

const requestHeaders = { "Accept": "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8" };

export async function defaultGetHTTPContentTypeAsync(url: URL): Promise<string> {
    const response = await fetch(url, { method: "HEAD", headers: requestHeaders });
    if (!response.ok) {
        throw new Deno.errors.NotFound(url.href);
    }
    return response.headers.get("content-type") || "";
}

export function baseGetContentTypeAsync(url: URL, indexPath: string): Promise<string> {
    switch (url.protocol) {
        case "file:": return baseGetFileContentTypeAsync(url, indexPath);
        default: return defaultGetHTTPContentTypeAsync(url);
    }
}

export function defaultGetContentTypeAsync(url: URL): Promise<string> {
    return baseGetContentTypeAsync(url, defaultIndexPath);
}

export async function baseReadFileTextAsync(url: URL, indexPath: string): Promise<string> {
    return await Deno.readTextFile(await resolveFileURLAsync(url, indexPath));
}

export function defaultReadFileTextAsync(url: URL): Promise<string> {
    return baseReadFileTextAsync(url, defaultIndexPath);
}

export async function defaultReadHTTPTextAsync(url: URL): Promise<string> {
    const response = await fetch(url, { headers: requestHeaders });
    if (!response.ok) {
        throw new Deno.errors.NotFound(url.href);
    }
    return await response.text();
}

export function baseReadTextAsync(url: URL, indexPath: string): Promise<string> {
    switch (url.protocol) {
        case "file:": return baseReadFileTextAsync(url, indexPath);
        default: return defaultReadHTTPTextAsync(url);
    }
}

export function defaultReadTextAsync(url: URL): Promise<string> {
    return baseReadTextAsync(url, defaultIndexPath);
}

export const defaultContentTypeParsers: ContentTypeParserCollection = {
    [htmlType]: parse,
    "application/xhtml+xml": parse,
    "application/xml": parse,
};

export const defaultCrawlHandlers: CrawlHandlers = {
    getContentTypeAsync: defaultGetContentTypeAsync,
    readTextAsync: defaultReadTextAsync,
    contentTypeParsers: defaultContentTypeParsers,
};

export function createCrawlHandlers(indexPath?: string): CrawlHandlers {
    return (indexPath === undefined) ? defaultCrawlHandlers : {
        getContentTypeAsync: (url) => baseGetContentTypeAsync(url, indexPath),
        readTextAsync: (url) => baseReadTextAsync(url, indexPath),
        contentTypeParsers: defaultContentTypeParsers,
    };
}

export class Crawler extends CrawlerCore {
    constructor(indexPath?: string) {
        super(createCrawlHandlers(indexPath));
    }
}

export class LinkChecker extends LinkCheckerCore {
    constructor(indexPath?: string) {
        super(createCrawlHandlers(indexPath));
    }
}
