import { assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { CrawlOptions, Crawler, ResourceCollection, ResourceInfo } from "../crawler.ts";

const htmlType = "text/html";
const otherType = "application/octet-stream";
const fileURLPrefix = "file:///";
function toFileURL(pathOrURL: string): URL {
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

function toMap(o: { [path: string]: string[] | true | false | undefined }): ResourceCollection {
    const collection: ResourceCollection = new Map();
    for (const [key, value] of Object.entries(o)) {
        const url = toFileURL(key);
        const info: Partial<ResourceInfo> = {};
        if (value === true) {
            info.contentType = otherType;
        } else if (value === false) {
            info.contentType = undefined;
        } else if (Array.isArray(value)) {
            info.contentType = htmlType;
            info.links = new Set(value.map(path => toFileURL(path).href));
        } else {
            info.contentType = htmlType;
        }

        collection.set(url.href, info);
    }
    return collection;
}

async function crawl(files: { [path: string]: string }, options?: CrawlOptions, entry = "index.html"): Promise<ResourceCollection> {
    const crawler = new Crawler({
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
        }
    });

    return await crawler.crawlAsync(toFileURL(entry), options);
}

Deno.test("No links", async () => {
    const actual = await crawl({
        "index.html": "<html></html>",
    });

    const expected = toMap({
        "index.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("One link", async () => {
    const actual = await crawl({
        "index.html": `<html><head><link rel="stylesheet" href="style.css"></head></html>`,
        "style.css": ``,
    });

    const expected = toMap({
        "index.html": ["style.css"],
        "style.css": true,
    });

    assertEquals(actual, expected);
});

Deno.test("One link between directories", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="./sub/dir/one/a.html">link</a></body></html>`,
        "sub/dir/one/a.html": `<html><body><a href="../../dir/../../index.html">link</a></body></html>`,
    });

    const expected = toMap({
        "index.html": ["sub/dir/one/a.html"],
        "sub/dir/one/a.html": ["index.html"],
    });

    assertEquals(actual, expected);
});

Deno.test("Valid links", async () => {
    const actual = await crawl({
        "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><a href="image.png"><img src="image.png"></a></body></html>`,
        "other.html": `<html></html>`,
        "style.css": ``,
        "image.png": ``,
    });

    const expected = toMap({
        "index.html": ["style.css", "other.html", "image.png"],
        "other.html": [],
        "style.css": true,
        "image.png": true,
    });

    assertEquals(actual, expected);
});

Deno.test("Mutual links", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="other.html">link</a></body></html>`,
        "other.html": `<html><body><a href="index.html">link</a></body></html>`,
    });

    const expected = toMap({
        "index.html": ["other.html"],
        "other.html": ["index.html"],
    });

    assertEquals(actual, expected);
});

Deno.test("Broken CSS link", async () => {
    const actual = await crawl({
        "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><a href="image.png"><img src="image.png"></a></body></html>`,
        "other.html": `<html></html>`,
        "image.png": ``,
    });

    const expected = toMap({
        "index.html": ["style.css", "other.html", "image.png"],
        "other.html": [],
        "style.css": false,
        "image.png": true,
    });

    assertEquals(actual, expected);
});

Deno.test("External links should be ignored by default", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="http://www.schemescape.com/">link</a></body></html>`,
    });

    const expected = toMap({
        "index.html": ["http://www.schemescape.com/"],
    });

    assertEquals(actual, expected);
});

Deno.test("Parent directory links are considered external by default", async () => {
    const actual = await crawl({
        "base/index.html": `<html><body><a href="../index.html">link</a></body></html>`,
    }, {}, "base/index.html");

    const expected = toMap({
        "base/index.html": ["index.html"],
    });

    assertEquals(actual, expected);
});

Deno.test("Base override can cause parent directory to be considered internal", async () => {
    const actual = await crawl({
        "index.html": `<html></html>`,
        "base/index.html": `<html><body><a href="../index.html">link</a></body></html>`,
    }, { base: toFileURL(".") }, "base/index.html");

    const expected = toMap({
        "base/index.html": ["index.html"],
        "index.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("External links can be checked", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`,
        "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
    }, { checkExternalLinks: true });

    const expected = toMap({
        "index.html": [
            "http://www.schemescape.com/deep.html",
            "http://www.schemescape.com/broken.html",
        ],
        "http://www.schemescape.com/deep.html": undefined,
        "http://www.schemescape.com/broken.html": false,
    });

    assertEquals(actual, expected);
});
