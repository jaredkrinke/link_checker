import { assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { LinkCheckerResult, Loader, checkLinks } from "../core.ts";

function createLoader(files: { [path: string]: string }): Loader {
    const textEncoder = new TextEncoder();
    return {
        load: (path) => textEncoder.encode(files[path]),
        loadText: (path) => files[path],
        exists: (path) => Object.hasOwn(files, path),
        enumerate: () => Object.keys(files),
    };
}

const emptyResult: LinkCheckerResult = {
    invalidLinks: [],
    brokenInternalLinks: [],
    errors: [],
};

Deno.test("No op", async () => {
    const actual = await checkLinks("index.html", {
    });

    assertEquals(actual, emptyResult);
});

Deno.test("No links", async () => {
    const actual = await checkLinks("index.html", {
        checkInternalLinks: true,
        internalLoader: createLoader({
            "index.html": "<html></html>",
        }),
    });

    assertEquals(actual, emptyResult);
});

Deno.test("Valid links", async () => {
    const actual = await checkLinks("index.html", {
        checkInternalLinks: true,
        internalLoader: createLoader({
            "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><a href="image.png"><img src="image.png"></a></body></html>`,
            "style.css": ``,
            "other.html": `<html></html>`,
            "image.png": ``,
        }),
    });

    assertEquals(actual, emptyResult);
});

Deno.test("Broken CSS link", async () => {
    const actual = await checkLinks("index.html", {
        checkInternalLinks: true,
        internalLoader: createLoader({
            "index.html": `<html><head><link rel="stylesheet" href="style.css" /></head></html>`,
        }),
    });

    assertEquals(actual, {
        ...emptyResult,
        brokenInternalLinks: [{
            source: "index.html",
            target: "style.css",
        }],
    });
});

Deno.test("Broken page link", async () => {
    const actual = await checkLinks("index.html", {
        checkInternalLinks: true,
        internalLoader: createLoader({
            "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><img src="image.png"></body></html>`,
            "style.css": ``,
            "image.png": ``,
        }),
    });

    assertEquals(actual, {
        ...emptyResult,
        brokenInternalLinks: [{
            source: "index.html",
            target: "other.html",
        }],
    });
});

Deno.test("Broken image link", async () => {
    const actual = await checkLinks("index.html", {
        checkInternalLinks: true,
        internalLoader: createLoader({
            "index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><a href="other.html">Other</a><img src="image.png"></body></html>`,
            "style.css": ``,
            "other.html": `<html></html>`,
        }),
    });

    assertEquals(actual, {
        ...emptyResult,
        brokenInternalLinks: [{
            source: "index.html",
            target: "image.png",
        }],
    });
});
