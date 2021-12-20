import { ContentTypeParserCollection, getResourceIdentityFromURL } from "./shared.ts";
import { TaskQueue } from "./task_queue.ts";

export type { ContentTypeParserCollection };

export interface CrawlHandlers {
    getContentTypeAsync: (url: URL) => Promise<string>;
    readTextAsync: (url: URL) => Promise<string>;
    contentTypeParsers: ContentTypeParserCollection;
}

export interface CrawlOptions {
    base?: URL;
    externalLinks?: "ignore" | "check" | "follow";
    recordsIds?: boolean;
    maxConcurrency?: number;
    depth?: number;
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
    depth: number;
    contentType?: string;
    internal: boolean;
    links?: ResourceLink[];
    ids?: Set<string>;
}

interface WorkItem {
    href: string;
}

interface Context {
    handlers: CrawlHandlers;
    base: string;
    checkExternalLinks: boolean;
    followExternalLinks: boolean;
    recordIds: boolean;
    maxDepth: number;
    resources: Map<string, Resource>;
    taskQueue: TaskQueue<WorkItem>;
    parseErrors: Map<string, string>;
}

// deno-lint-ignore no-explicit-any
function assert(condition: any, message: string): asserts condition {
    if (!condition) {
        throw new CrawlError(`Internal error: ${message}`);
    }
}

function enqueueURLIfNeeded(urlWithFragment: URL, context: Context, depth: number): void {
    if (depth <= context.maxDepth) {
        const url = getResourceIdentityFromURL(urlWithFragment);
        const { resources } = context;
        const { href } = url;
        const internal = url.href.startsWith(context.base);
        const shouldCheck = internal || context.checkExternalLinks;
    
        if (shouldCheck && !resources.has(href)) {
            resources.set(href, {
                internal,
                url,
                depth,
            });
    
            context.taskQueue.enqueue({ href });
        }
    }
}

const allowedProtocols = new Set([
    "file:",
    "http:",
    "https:",
]);

const contentTypeShortPattern = /^([^;]*?)(;.*)?$/;
async function processWorkItemAsync(item: WorkItem, context: Context): Promise<void> {
    const resource = context.resources.get(item.href);
    assert(resource, "Attempted to process unknown href");
    assert(resource.url, "Attempted to process undefined URL")

    try {
        // Ensure the item exists and check its content type
        const { handlers, recordIds } = context;
        const source = resource.url;
        let contentTypeShort: string | undefined = undefined;
        try {
            resource.contentType = await handlers.getContentTypeAsync(source);

            const matches = contentTypeShortPattern.exec(resource.contentType);
            assert(matches, "Invalid content type");
            contentTypeShort = matches[1];
        } catch (error) {
            if (error instanceof Deno.errors.PermissionDenied) {
                // Fail on permission errors
                throw error;
            }

            resource.contentType = undefined; // Failed to get or parse content type; treat the resource as missing
        }

        const parse = contentTypeShort ? handlers.contentTypeParsers[contentTypeShort] : undefined;

        // For parsable files, follow links for internal resource (or external, if requested), up to the maximum depth
        const shouldParse = parse && (resource.internal || context.followExternalLinks) && (resource.depth < context.maxDepth);
        if (shouldParse) {
            let content;
            try {
                content = await handlers.readTextAsync(source);
            } catch (error) {
                if (error instanceof Deno.errors.PermissionDenied) {
                    // Fail on permission errors
                    throw error;
                }

                resource.contentType = undefined; // Failed to read the resource; treat it as missing
            }

            if (content !== undefined) {
                const base = resource.url;
                const { hrefs, ids } = await parse({ content, recordIds });

                resource.links = [];
                const links = resource.links;
                for (const href of hrefs) {
                    const url = new URL(href, base);
                    if (allowedProtocols.has(url.protocol)) {
                        links.push({
                            canonicalURL: url,
                            originalHrefString: href,
                        });
    
                        enqueueURLIfNeeded(url, context, resource.depth + 1);
                    }
                }

                if (recordIds) {
                    resource.ids = ids;
                }
            }
        }
    } catch (error) {
        if (error instanceof Deno.errors.PermissionDenied) {
            // Fail on permission errors
            throw error;
        }

        // Note parsing errors, but continue processing
        context.parseErrors.set(resource.url.href, error.toString());
    }
}

function getBaseFromURL(url: URL): string {
    const urlString = url.href;
    return urlString.substring(0, urlString.lastIndexOf("/") + 1)
}

export class CrawlerCore {
    constructor(private handlers: CrawlHandlers) {
    }

    async crawlAsync(urlOrURLs: URL | URL[], options?: CrawlOptions): Promise<ResourceCollection> {
        // Parse options and create context
        const urls = Array.isArray(urlOrURLs) ? urlOrURLs : [urlOrURLs];
        if (urls.length <= 0) {
            return new Map();
        }

        const base = options?.base?.href ?? getBaseFromURL(urls[0]);

        // If there are multiple entry points and no base URL is provided, only proceed if all entry points have the same base
        if (urls.length > 1 && !options?.base) {
            for (const url of urls) {
                const b = getBaseFromURL(url);
                if (b !== base) {
                    throw new CrawlError(`Base URL (options.base) must be specified when starting a crawl from multiple entry points that have different bases. Provided entry points:\n${urls.map(u => u.href).join("\n")}`);
                }
            }
        }

        // Entry points must be under base
        if (options?.base) {
            for (const url of urls) {
                if (!url.href.startsWith(base)) {
                    throw new CrawlError(`All entry points must be under base ("${base}"). Provided entry points:\n${urls.map(u => u.href).join("\n")}`);
                }
            }
        }

        const externalLinks = options?.externalLinks ?? "ignore";
        const context: Context = {
            handlers: this.handlers,

            // Options
            base,
            checkExternalLinks: (externalLinks === "check" || externalLinks === "follow"),
            followExternalLinks: externalLinks === "follow",
            recordIds: (options?.recordsIds === true),
            maxDepth: (options?.depth !== undefined) ? options.depth : Infinity,

            // State
            resources: new Map(),
            taskQueue: new TaskQueue((workItem) => processWorkItemAsync(workItem, context), options?.maxConcurrency),
            parseErrors: new Map(),
        };

        // Process resources
        for (const url of urls) {
            enqueueURLIfNeeded(url, context, 0);
        }

        await context.taskQueue.drain();

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
