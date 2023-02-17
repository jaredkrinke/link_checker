import { assertEquals, assertRejects } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { CrawlOptions, CrawlerCore, ResourceCollection, ResourceInfo } from "../crawler.ts";
import type { ContentTypeParserCollection } from "../shared.ts";
import { createHandlers, htmlType, otherType, toURL } from "./shared.ts";

type ExtendedResourceInfo = ResourceInfo & { content?: string };
type ExtendedResourceCollection = Map<string, ExtendedResourceInfo>;

function toMap(o: { [path: string]: string[] | true | false | undefined | ExtendedResourceInfo }): ResourceCollection {
    const collection: ResourceCollection = new Map();
    for (const [key, value] of Object.entries(o)) {
        const url = toURL(key);
        const info: Partial<ExtendedResourceInfo> = {};
        if (value === true) {
            info.contentType = otherType;
        } else if (value === false) {
            info.contentType = undefined;
        } else if (Array.isArray(value)) {
            info.contentType = htmlType;
            info.links = value.map(path => ({
                canonicalURL: toURL(path),
                originalHrefString: path,
            }));
        } else if (typeof(value) === "object") {
            Object.assign(info, value);
        } else {
            info.contentType = htmlType;
        }

        collection.set(url.href, info);
    }
    return collection;
}

async function crawl(files: { [path: string]: string }, options?: CrawlOptions, entry: string | string[] = "index.html", contentTypeParsers?: ContentTypeParserCollection): Promise<ExtendedResourceCollection> {
    const handlers = createHandlers(files);
    const writes: { [href: string]: string } = {};
    handlers.writeTextAsync = (url: URL, content: string) => {
        writes[url.href] = content;
        return Promise.resolve();
    };

    if (contentTypeParsers) {
        handlers.contentTypeParsers = contentTypeParsers;
    }
    
    const crawler = new CrawlerCore(handlers);
    const result = (await crawler.crawlAsync(typeof(entry) === "string" ? toURL(entry) : entry.map(e => toURL(e)), options)) as ExtendedResourceCollection;
    // TODO: Map file to URL

    for (const [href, content] of Object.entries(writes)) {
        result.set(href, { content, ...result.get(href) });
    }

    return result;
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

Deno.test("Ignore unknown protocols", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="mailto:jeff@notamzn.com">link</a><a href="ftp://ftp.archive.org/">link</a><a href="data:,Hello%2C%20World%21">link</a></body></html>`,
    });

    const expected = toMap({
        "index.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("Multiple entry points", async () => {
    const actual = await crawl({
        "index.html": "<html></html>",
        "other.html": "<html></html>",
    }, {}, ["index.html", "other.html"]);

    const expected = toMap({
        "index.html": [],
        "other.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("Multiple entry points with different bases requires explicit base", async () => {
    await assertRejects(() => crawl({
        "index.html": "<html></html>",
        "sub/other.html": "<html></html>",
    }, {}, ["index.html", "sub/other.html"]));
});

Deno.test("Multiple entry points with different bases", async () => {
    const actual = await crawl({
        "index.html": "<html></html>",
        "sub/other.html": "<html></html>",
    }, { base: toURL(".") }, ["index.html", "sub/other.html"]);

    const expected = toMap({
        "index.html": [],
        "sub/other.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("Entry points must be under base", async () => {
    await assertRejects(() => crawl({
        "index.html": "<html></html>",
        "sub/other.html": "<html></html>",
    }, { base: toURL("sub/") }, ["index.html", "sub/other.html"]));
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
        "index.html": ["./sub/dir/one/a.html"],
        "sub/dir/one/a.html": ["../../dir/../../index.html"],
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
        "index.html": ["style.css", "other.html", "image.png", "image.png"],
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
        "index.html": ["style.css", "other.html", "image.png", "image.png"],
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
        "base/index.html": ["../index.html"],
    });

    assertEquals(actual, expected);
});

Deno.test("Base override can cause parent directory to be considered internal", async () => {
    const actual = await crawl({
        "index.html": `<html></html>`,
        "base/index.html": `<html><body><a href="../index.html">link</a></body></html>`,
    }, { base: toURL(".") }, "base/index.html");

    const expected = toMap({
        "base/index.html": ["../index.html"],
        "index.html": [],
    });

    assertEquals(actual, expected);
});

Deno.test("External links can be checked", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`,
        "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
    }, { externalLinks: "check" });

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

Deno.test("External links can be followed", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`,
        "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
    }, { externalLinks: "follow" });

    const expected = toMap({
        "index.html": [
            "http://www.schemescape.com/deep.html",
            "http://www.schemescape.com/broken.html",
        ],
        "http://www.schemescape.com/deep.html": {
            contentType: htmlType,
            links: [
                {
                    canonicalURL: new URL("http://www.schemescape.com/other.html"),
                    originalHrefString: "other.html",
                }
            ],
        },
        "http://www.schemescape.com/other.html": false,
        "http://www.schemescape.com/broken.html": false,
    });

    assertEquals(actual, expected);
});

Deno.test("Ids can be recorded", async () => {
    const actual = await crawl({
        "index.html": `<html><body><h1 id="topic1">Topic 1</ht></body></html>`,
    }, { recordsIds: true });

    const expected = new Map(Object.entries({
        "file:///index.html": {
            contentType: "text/html",
            links: [],
            ids: new Set([
                "topic1",
            ]),
        },
    }));

    assertEquals(actual, expected);
});

Deno.test("Links to ids can be recorded", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="#heading">heading</a><a href="other.html#something">link</a><h1 id="heading">heading</h1></body></html>`,
        "other.html": `<html><body><h1 id="something">heading</h1></body></html>`,
    }, { recordsIds: true });

    const expected = new Map(Object.entries({
        "file:///index.html": {
            contentType: "text/html",
            links: [
                {
                    canonicalURL: new URL("file:///index.html#heading"),
                    originalHrefString: "#heading",
                },
                {
                    canonicalURL: new URL("file:///other.html#something"),
                    originalHrefString: "other.html#something",
                },
            ],
            ids: new Set([
                "heading",
            ]),
        },
        "file:///other.html": {
            contentType: "text/html",
            links: [],
            ids: new Set([
                "something",
            ]),
        },
    }));

    assertEquals(actual, expected);
});

Deno.test("HTML parser can be overridden", async () => {
    const actual = await crawl({
        "index.html": ``,
    }, { recordsIds: true }, "index.html",{
        "text/html": () => Promise.resolve({
            hrefs: ["#heading", "other.html#something"],
            ids: new Set(["heading"]),
        })
    });

    const expected = new Map(Object.entries({
        "file:///index.html": {
            contentType: "text/html",
            links: [
                {
                    canonicalURL: new URL("file:///index.html#heading"),
                    originalHrefString: "#heading",
                },
                {
                    canonicalURL: new URL("file:///other.html#something"),
                    originalHrefString: "other.html#something",
                },
            ],
            ids: new Set([
                "heading",
            ]),
        },
        "file:///other.html": {
            contentType: undefined,
        },
    }));

    assertEquals(actual, expected);
});

Deno.test("Crawl depth -1", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="d2.html">link</a></body></html>`,
        "d2.html": `<html><body><a href="d3.html">link</a></body></html>`,
        "d3.html": `<html><body><a href="d4.html">link</a></body></html>`,
        "d4.html": `<html><body><a href="d5.html">link</a></body></html>`,
        "d5.html": `<html></html>`,
    }, { depth: -1 });

    const expected = toMap({
    });

    assertEquals(actual, expected);
});

Deno.test("Crawl depth 0", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="d2.html">link</a></body></html>`,
        "d2.html": `<html><body><a href="d3.html">link</a></body></html>`,
        "d3.html": `<html><body><a href="d4.html">link</a></body></html>`,
        "d4.html": `<html><body><a href="d5.html">link</a></body></html>`,
        "d5.html": `<html></html>`,
    }, { depth: 0 });

    const expected = toMap({
        "index.html": undefined,
    });

    assertEquals(actual, expected);
});

Deno.test("Crawl depth 1", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="d2.html">link</a></body></html>`,
        "d2.html": `<html><body><a href="d3.html">link</a></body></html>`,
        "d3.html": `<html><body><a href="d4.html">link</a></body></html>`,
        "d4.html": `<html><body><a href="d5.html">link</a></body></html>`,
        "d5.html": `<html></html>`,
    }, { depth: 1 });

    const expected = toMap({
        "index.html": ["d2.html"],
        "d2.html": undefined,
    });

    assertEquals(actual, expected);
});

Deno.test("Crawl depth 2", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="d2.html">link</a></body></html>`,
        "d2.html": `<html><body><a href="d3.html">link</a></body></html>`,
        "d3.html": `<html><body><a href="d4.html">link</a></body></html>`,
        "d4.html": `<html><body><a href="d5.html">link</a></body></html>`,
        "d5.html": `<html></html>`,
    }, { depth: 2 });

    const expected = toMap({
        "index.html": ["d2.html"],
        "d2.html": ["d3.html"],
        "d3.html": undefined,
    });

    assertEquals(actual, expected);
});

Deno.test("Crawl depth 3", async () => {
    const actual = await crawl({
        "index.html": `<html><body><a href="d2.html">link</a></body></html>`,
        "d2.html": `<html><body><a href="d3.html">link</a></body></html>`,
        "d3.html": `<html><body><a href="d4.html">link</a></body></html>`,
        "d4.html": `<html><body><a href="d5.html">link</a></body></html>`,
        "d5.html": `<html></html>`,
    }, { depth: 3 });

    const expected = toMap({
        "index.html": ["d2.html"],
        "d2.html": ["d3.html"],
        "d3.html": ["d4.html"],
        "d4.html": undefined,
    });

    assertEquals(actual, expected);
});

Deno.test("Internal resources can be captured", async () => {
    const indexContent = `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`;
    const actual = await crawl({
        "index.html": indexContent,
        "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
    }, { content: "saveInternal", externalLinks: "ignore" });

    const expected = toMap({
        "index.html": {
            content: indexContent,
            contentType: htmlType,
            links: [
                {
                    canonicalURL: new URL("http://www.schemescape.com/deep.html"),
                    originalHrefString: "http://www.schemescape.com/deep.html",
                },
                {
                    canonicalURL: new URL("http://www.schemescape.com/broken.html"),
                    originalHrefString: "http://www.schemescape.com/broken.html",
                },
            ],
        },
    });

    assertEquals(actual, expected);
});

Deno.test("External resources can be captured", async () => {
    const indexContent = `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`;
    const deepContent = `<html><body><a href="other.html">link</a></body></html>`;
    const actual = await crawl({
        "index.html": indexContent,
        "http://www.schemescape.com/deep.html": deepContent,
    }, { content: "save", externalLinks: "follow" });

    const expected = toMap({
        "index.html": {
            content: indexContent,
            contentType: htmlType,
            links: [
                {
                    canonicalURL: new URL("http://www.schemescape.com/deep.html"),
                    originalHrefString: "http://www.schemescape.com/deep.html",
                },
                {
                    canonicalURL: new URL("http://www.schemescape.com/broken.html"),
                    originalHrefString: "http://www.schemescape.com/broken.html",
                },
            ],
        },
        "http://www.schemescape.com/deep.html": {
            content: deepContent,
            contentType: htmlType,
            links: [
                {
                    canonicalURL: new URL("http://www.schemescape.com/other.html"),
                    originalHrefString: "other.html",
                },
            ],
        },
        "http://www.schemescape.com/broken.html": false,
        "http://www.schemescape.com/other.html": false,
    });

    assertEquals(actual, expected);
});
