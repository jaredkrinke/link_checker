import { assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { Crawler, SiteGraph } from "../crawler.ts";

const fileURLPrefix = "file:///";
function toFileURL(path: string): URL {
    return new URL(fileURLPrefix + path);
}

function toMap(o: { [path: string]: string[] }): SiteGraph {
    return new Map(Object
        .entries(o)
        .map(([k, v]) => [
            toFileURL(k).href,
            new Set(v.map(a => toFileURL(a).href)),
        ]));
}

async function crawl(files: { [path: string]: string }, entry = "index.html"): Promise<SiteGraph> {
    const crawler = new Crawler({
        getContentTypeAsync: (url: URL) => Promise.resolve(url.href.endsWith(".html") ? "text/html" : "application/octet-stream"),
        readTextAsync: (url: URL) => Promise.resolve(files[url.pathname.substring(1)]),
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
    });

    assertEquals(actual, expected);
});

Deno.test("Valid links", async () => {
    const actual = await crawl({
        "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><a href="image.png"><img src="image.png"></a></body></html>`,
        "style.css": ``,
        "other.html": `<html></html>`,
        "image.png": ``,
    });

    const expected = toMap({
        "index.html": ["style.css", "other.html", "image.png"],
        "other.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("Mututal links", async () => {
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