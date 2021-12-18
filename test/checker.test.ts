import { assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { LinkChecker, CheckLinksOptions, CheckLinksResult } from "../checker.ts";
import { createLoader, toURL } from "./shared.ts";
import { parse } from "../parse_html.ts";

interface TestLink {
    source: string;
    target: string;
}

function toList(a: TestLink[]): CheckLinksResult {
    return {
        brokenLinks: a.map(({ source, target }) => ({
            source: toURL(source).href,
            target: (new URL(target, toURL(source))).href,
            href: target,
        })),
    };
}

async function check(files: { [path: string]: string }, options?: CheckLinksOptions, entry = "index.html"): Promise<CheckLinksResult> {
    const linkChecker = new LinkChecker(createLoader(files), { "text/html": parse });
    return await linkChecker.checkLinksAsync(toURL(entry), options);
}

Deno.test("No links", async () => {
    const actual = await check({
        "index.html": "<html></html>",
    });

    const expected = toList([]);

    assertEquals(actual, expected);
});

Deno.test("Valid links", async () => {
    const actual = await check({
        "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><a href="image.png"><img src="image.png"></a></body></html>`,
        "other.html": `<html></html>`,
        "style.css": ``,
        "image.png": ``,
    });

    const expected = toList([]);

    assertEquals(actual, expected);
});

Deno.test("Broken CSS link", async () => {
    const actual = await check({
        "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><a href="image.png"><img src="image.png"></a></body></html>`,
        "other.html": `<html></html>`,
        "image.png": ``,
    });

    const expected = toList([
        { source: "index.html", target: "style.css" },
    ]);

    assertEquals(actual, expected);
});

Deno.test("External links should be ignored by default", async () => {
    const actual = await check({
        "index.html": `<html><body><a href="http://www.schemescape.com/">link</a></body></html>`,
    });

    const expected = toList([]);

    assertEquals(actual, expected);
});

Deno.test("External links can be checked", async () => {
    const actual = await check({
        "index.html": `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`,
        "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
    }, { checkExternalLinks: true });

    const expected = toList([
        { source: "index.html", target: "http://www.schemescape.com/broken.html" },
    ]);

    assertEquals(actual, expected);
});

Deno.test("Valid link anchors can be checked", async () => {
    const actual = await check({
        "index.html": `<html><body><a href="#heading">heading</a><a href="other.html#something">link</a><a href="https://www.schemescape.com/deep.html#anchor">anchor</a><h1 id="heading">heading</h1></body></html>`,
        "other.html": `<html><body><h1 id="something">heading</h1></body></html>`,
        "http://www.schemescape.com/deep.html": `<html><body>Not checked</body></html>`,
    }, { checkFragments: true });

    const expected = toList([]);

    assertEquals(actual, expected);
});

Deno.test("Invalid link anchors can be checked", async () => {
    const actual = await check({
        "index.html": `<html><body><a href="#heading">heading</a><a href="other.html#something">link</a><a href="https://www.schemescape.com/deep.html#anchor">anchor</a><h1 id="something-else">heading</h1></body></html>`,
        "other.html": `<html><body><h1 id="heading">heading</h1></body></html>`,
        "http://www.schemescape.com/deep.html": `<html><body>Still not checked</body></html>`,
    }, { checkFragments: true });

    const expected = toList([
        { source: "index.html", target: "#heading" },
        { source: "index.html", target: "other.html#something" },
    ]);

    assertEquals(actual, expected);
});
