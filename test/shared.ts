import { CrawlHandlers } from "../crawler.ts";
import { parse } from "../parse_html.ts";

export const htmlType = "text/html";
export const otherType = "application/octet-stream";
const fileURLPrefix = "file:///";

export function toURL(pathOrURL: string): URL {
    if (pathOrURL.indexOf(":") >= 0) {
        return new URL(pathOrURL);
    } else {
        return new URL(fileURLPrefix + pathOrURL);
    }
}

function fromFileURL(url: URL): string {
    return url.pathname.substring(1);
}

function getPathOrURLString(url: URL): string {
    return (url.protocol === "file:") ? fromFileURL(url) : url.href;
}


export function createHandlers(files: { [path: string]: string }): CrawlHandlers {
    return {
        getContentTypeAsync: (url: URL) => {
            const pathOrURL = getPathOrURLString(url);
            if (files[pathOrURL] !== undefined) {
                return Promise.resolve(pathOrURL.endsWith(".html") ? htmlType : otherType);
            } else {
                throw new Deno.errors.NotFound();
            }
        },
        
        readTextAsync: (url: URL) => {
            return Promise.resolve(files[getPathOrURLString(url)]);
        },

        contentTypeParsers: {
            "text/html": parse,
        },
    };
}
