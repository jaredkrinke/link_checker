import { assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { Crawler, ResourceCollection, ResourceInfo } from "../crawler.ts";

const htmlType = "text/html";
const otherType = "application/octet-stream";
const fileURLPrefix = "file:///";
function toFileURL(path: string): URL {
    return new URL(fileURLPrefix + path);
}

function fromFileURL(url: URL): string {
    return url.pathname.substring(1);
}

function toMap(o: { [path: string]: string[] | true | false }): ResourceCollection {
    const collection: ResourceCollection = new Map();
    for (const [key, value] of Object.entries(o)) {
        const url = toFileURL(key);
        const info: Partial<ResourceInfo> = {};
        if (value === true) {
            info.contentType = otherType;
        } else if (value === false) {
            info.contentType = undefined;
        } else {
            info.contentType = htmlType;
            info.links = new Set(value.map(path => toFileURL(path).href));
        }

        collection.set(url.href, info);
    }
    return collection;
}

async function crawl(files: { [path: string]: string }, entry = "index.html"): Promise<ResourceCollection> {
    const crawler = new Crawler({
        getContentTypeAsync: (url: URL) => {
            const path = fromFileURL(url);
            if (files[path] !== undefined) {
                return Promise.resolve(path.endsWith(".html") ? htmlType : otherType);
            } else {
                throw new Deno.errors.NotFound();
            }
        },
        
        readTextAsync: (url: URL) => Promise.resolve(files[fromFileURL(url)]),
    });

    return await crawler.crawlAsync(toFileURL(entry));
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
