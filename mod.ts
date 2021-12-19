import { LinkChecker as LinkCheckerCore } from "./checker.ts";
import { parse } from "./parse_html.ts";

const htmlType = "text/html";
const otherType = "application/octet-stream";
const htmlPattern = /\.x?html?$/;

const requestHeaders = {
    "Accept": "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
};

// TODO: Retrieve index.html for file system directories?
export class LinkChecker extends LinkCheckerCore {
    constructor() {
        super({
            getContentTypeAsync: async (url) => {
                if (url.protocol === "file:") {
                    // Infer content type from file extension (.htm/.html/.xhtml are the only ones that are relevant here)
                    if (htmlPattern.test(url.pathname)) {
                        return htmlType;
                    }
                    return otherType;
                } else {
                    const response = await fetch(url, { method: "HEAD", headers: requestHeaders });
                    if (!response.ok) {
                        throw new Deno.errors.NotFound(url.href);
                    }
                    return response.headers.get("content-type") || "";
                }
            },

            readTextAsync: async (url) => {
                const response = await fetch(url, { headers: requestHeaders });
                if (!response.ok) {
                    throw new Deno.errors.NotFound(url.href);
                }
                return await response.text();
            },

            contentTypeParsers: {
                [htmlType]: parse,
                "application/xhtml+xml": parse,
                "application/xml": parse,
            },
        });
    }
}
