import { assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { Link, LinkChecker, CheckLinksOptions, CheckLinksResult } from "../checker.ts";
import { createLoader, toURL } from "./shared.ts";

function toList(a: Link[]): CheckLinksResult {
    return {
        brokenLinks: a.map(({ source, target }) => ({
            source: toURL(source).href,
            target: toURL(target).href,
        })),
    };
}

async function check(files: { [path: string]: string }, options?: CheckLinksOptions, entry = "index.html"): Promise<CheckLinksResult> {
    const linkChecker = new LinkChecker(createLoader(files));
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

// Deno.test("Parent directory links are considered external by default", async () => {
//     const actual = await check({
//         "base/index.html": `<html><body><a href="../index.html">link</a></body></html>`,
//     }, {}, "base/index.html");

//     const expected = toMap({
//         "base/index.html": ["index.html"],
//     });

//     assertEquals(actual, expected);
// });

// Deno.test("Base override can cause parent directory to be considered internal", async () => {
//     const actual = await check({
//         "index.html": `<html></html>`,
//         "base/index.html": `<html><body><a href="../index.html">link</a></body></html>`,
//     }, { base: toFileURL(".") }, "base/index.html");

//     const expected = toMap({
//         "base/index.html": ["index.html"],
//         "index.html": [],
//     });

//     assertEquals(actual, expected);
// });

// Deno.test("External links can be checked", async () => {
//     const actual = await check({
//         "index.html": `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`,
//         "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
//     }, { externalLinks: "check" });

//     const expected = toMap({
//         "index.html": [
//             "http://www.schemescape.com/deep.html",
//             "http://www.schemescape.com/broken.html",
//         ],
//         "http://www.schemescape.com/deep.html": undefined,
//         "http://www.schemescape.com/broken.html": false,
//     });

//     assertEquals(actual, expected);
// });

// Deno.test("External links can be followed", async () => {
//     const actual = await check({
//         "index.html": `<html><body><a href="http://www.schemescape.com/deep.html">link</a><a href="http://www.schemescape.com/broken.html">link</a></body></html>`,
//         "http://www.schemescape.com/deep.html": `<html><body><a href="other.html">link</a></body></html>`,
//     }, { externalLinks: "follow" });

//     const expected = toMap({
//         "index.html": [
//             "http://www.schemescape.com/deep.html",
//             "http://www.schemescape.com/broken.html",
//         ],
//         "http://www.schemescape.com/deep.html": ["http://www.schemescape.com/other.html"],
//         "http://www.schemescape.com/other.html": false,
//         "http://www.schemescape.com/broken.html": false,
//     });

//     assertEquals(actual, expected);
// });
