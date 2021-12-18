import { ContentTypeParser, getResourceIdentityFromURL } from "./shared.ts";

export interface Loader {
    getContentTypeAsync: (url: URL) => Promise<string>;
    readTextAsync: (url: URL) => Promise<string>;
}

export interface ContentTypeParserCollection {
    [contentType: string]: ContentTypeParser;
}

export interface CrawlOptions {
    base?: URL;
    externalLinks?: "ignore" | "check" | "follow";
    recordsIds?: boolean;
}

export interface ResourceLink {
    canonicalURL: URL;
    originalHrefString: string;
}

export interface ResourceInfo {
    contentType?: string;
    links?: ResourceLink[];
    ids?: Set<string>;
}

export type ResourceCollection = Map<string, ResourceInfo>;

export class CrawlError extends Error {
    constructor(message: string) {
        super(message);
    }
}

interface Resource {
    url: URL;
    contentType?: string;
    internal: boolean;
    links?: ResourceLink[];
    ids?: Set<string>;
}

interface WorkItem {
    href: string;
}

interface Context {
    loader: Loader;
    base: string;
    checkExternalLinks: boolean;
    followExternalLinks: boolean;
    recordIds: boolean;
    contentTypeParsers: Map<string, ContentTypeParser>;
    resources: Map<string, Resource>;
    workItems: WorkItem[];
    parseErrors: Map<string, string>;
}

// deno-lint-ignore no-explicit-any
function assert(condition: any, message: string): asserts condition {
    if (!condition) {
        throw new CrawlError(`Internal error: ${message}`);
    }
}

function enqueueURLIfNeeded(urlWithFragment: URL, context: Context): void {
    const url = getResourceIdentityFromURL(urlWithFragment);
    const { resources } = context;
    const { href } = url;
    const internal = url.href.startsWith(context.base);
    const shouldCheck = internal || context.checkExternalLinks;

    if (shouldCheck && !resources.has(href)) {
        resources.set(href, {
            internal,
            url,
        });

        context.workItems.push({ href });
    }
}

const contentTypeShortPattern = /^([^;]*?)(;.*)?$/;
async function processWorkItemAsync(item: WorkItem, context: Context): Promise<void> {
    const resource = context.resources.get(item.href);
    assert(resource, "Attempted to process unknown href");
    assert(resource.url, "Attempted to process undefined URL")

    try {
        // Ensure the item exists and check its content type
        const { loader, recordIds } = context;
        const source = resource.url;
        let contentTypeShort: string | undefined = undefined;
        try {
            resource.contentType = await loader.getContentTypeAsync(source);

            const matches = contentTypeShortPattern.exec(resource.contentType);
            assert(matches, "Invalid content type");
            contentTypeShort = matches[1];
        } catch (_error) {
            resource.contentType = undefined; // Failed to get or parse content type; treat the resource as missing
        }

        const parse = contentTypeShort ? context.contentTypeParsers.get(contentTypeShort) : undefined;

        // For parsable files, follow links for internal resource (or external, if requested)
        const shouldParse = parse && (resource.internal || context.followExternalLinks);
        if (shouldParse) {
            let content;
            try {
                content = await context.loader.readTextAsync(source);
            } catch (_error) {
                resource.contentType = undefined; // Failed to read the resource; treat it as missing
            }

            if (content !== undefined) {
                const base = resource.url;
                const { hrefs, ids } = await parse({ content, recordIds });

                resource.links = [];
                const links = resource.links;
                for (const href of hrefs) {
                    const url = new URL(href, base);
                    links.push({
                        canonicalURL: url,
                        originalHrefString: href,
                    });

                    enqueueURLIfNeeded(url, context);
                }

                if (recordIds) {
                    resource.ids = ids;
                }
            }
        }
    } catch (error) {
        // Note parsing errors, but continue processing
        context.parseErrors.set(resource.url.href, error.toString());
    }
}

export class Crawler {
    constructor(private loader: Loader, private contentTypeParsers: ContentTypeParserCollection) {
    }

    async crawlAsync(url: URL, options?: CrawlOptions): Promise<ResourceCollection> {
        // Parse options and create context
        const urlString = url.href;
        const externalLinks = options?.externalLinks ?? "ignore";
        const context: Context = {
            loader: this.loader,

            // Options
            base: options?.base?.href ?? urlString.substring(0, urlString.lastIndexOf("/") + 1),
            checkExternalLinks: (externalLinks === "check" || externalLinks === "follow"),
            followExternalLinks: externalLinks === "follow",
            recordIds: (options?.recordsIds === true),
            contentTypeParsers: new Map(Object.entries(this.contentTypeParsers)),

            // State
            resources: new Map(),
            workItems: [],
            parseErrors: new Map(),
        };

        // Process resources
        enqueueURLIfNeeded(url, context);
        for (const item of context.workItems) {
            await processWorkItemAsync(item, context);
        }

        // Map to output format
        const collection: ResourceCollection = new Map();
        for (const [key, value] of context.resources.entries()) {
            const { contentType, links, ids } = value;
            collection.set(key, {
                contentType,
                ...links ? { links } : {},
                ...ids ? { ids } : {},
            });
        }
        return collection;
    }
}
