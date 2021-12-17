import { Parser } from "https://deno.land/x/event_driven_html_parser@4.0.2/parser.ts";

export interface Loader {
    getContentTypeAsync: (url: URL) => Promise<string>;
    readTextAsync: (url: URL) => Promise<string>;
}

export interface ResourceInfo {
    contentType?: string;
    links?: Set<string>;
}

export type ResourceCollection = Map<string, ResourceInfo>;

export class CrawlError extends Error {
    constructor(message: string) {
        super(message);
    }
}

enum ResourceType {
    unknown,    // Initial state (i.e. has not been checked yet)
    html,       // HTML (i.e. crawl-able)
    other,      // Not HTML (i.e. not crawl-able)
    invalid,    // Syntactically invalid href
    missing,    // Broken link
}

interface Resource {
    type: ResourceType;
    url?: URL;
    contentType?: string;
    links?: Set<string>;
}

interface WorkItem {
    href: string;
}

interface Context {
    loader: Loader;
    base: string;
    resources: Map<string, Resource>;
    workItems: WorkItem[];
    parseErrors: Map<string, string>;
}

const tagToLinkAttributeName: { [tagName:string]: string } = {
    a: "href",
    link: "href",
    img: "src",
};

// deno-lint-ignore no-explicit-any
function assert(condition: any, message: string): asserts condition {
    if (!condition) {
        throw new CrawlError(`Internal error: ${message}`);
    }
}

function enqueueURLIfNeeded(url: URL, context: Context): void {
    const { resources } = context;
    const { href } = url;

    if (!resources.has(href)) {
        resources.set(href, {
            type: ResourceType.unknown,
            url,
        });
        context.workItems.push({ href });
    }
}

const htmlContentTypePattern = /^text\/html(;.*)?$/
async function processWorkItem(item: WorkItem, context: Context): Promise<void> {
    const resource = context.resources.get(item.href);
    assert(resource, "Attempted to process unknown href");
    assert(resource.url, "Attempted to process undefined URL")

    try {
        // Ensure the item exists and check its content type
        const { loader } = context;
        const source = resource.url;
        try {
            resource.contentType = await loader.getContentTypeAsync(source);
            resource.type = htmlContentTypePattern.test(resource.contentType) ? ResourceType.html : ResourceType.unknown;
        } catch (_error) {
            resource.type = ResourceType.missing;
        }

        // Follow links to HTML files
        // TODO: Only follow internal links!
        if (resource.type === ResourceType.html) {
            let sourceHTML;
            try {
                sourceHTML = await context.loader.readTextAsync(source);
            } catch (_error) {
                resource.type = ResourceType.missing;
            }

            if (sourceHTML !== undefined) {
                const links = new Set<string>();
                resource.links = links;
                for (const token of Parser.parse(sourceHTML)) {
                    switch (token.type) {
                        case 'open': {
                            const linkAttributeName = tagToLinkAttributeName[token.name];
                            if (linkAttributeName) {
                                const href = token.attributes[linkAttributeName];
                                const url = new URL(href, resource.url);
                                links.add(url.href);

                                if (url.href.startsWith(context.base)) {
                                    enqueueURLIfNeeded(url, context);
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
    } catch (error) {
        context.parseErrors.set(resource.url.href, error.toString());
    }
}

export class Crawler {
    constructor(private loader: Loader) {
    }

    async crawlAsync(url: URL): Promise<ResourceCollection> {
        const urlString = url.href;
        const context: Context = {
            loader: this.loader,
            base: urlString.substring(0, urlString.lastIndexOf("/") + 1),
            resources: new Map(),
            workItems: [],
            parseErrors: new Map(),
        };

        enqueueURLIfNeeded(url, context);

        // Process resources
        for (const item of context.workItems) {
            await processWorkItem(item, context);
        }

        const collection: ResourceCollection = new Map();
        for (const [key, value] of context.resources.entries()) {
            const { contentType, links } = value;
            collection.set(key, {
                contentType,
                ...links ? { links } : {},
            });
        }

        return collection;
    }
}
