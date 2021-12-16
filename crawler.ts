import { Parser } from "https://deno.land/x/event_driven_html_parser@4.0.2/parser.ts";
import { pooledMap } from "https://deno.land/std@0.115.1/async/pool.ts"
// import { toFileUrl } from "https://deno.land/std@0.115.1/path/mod.ts"

export interface Loader {
    loadAsync: (url: URL) => Promise<string>;
}

export type SiteGraph = Map<string, Set<string>>;

export class InvalidLinkError extends Error {
    constructor(link: string) {
        super(`Invalid link encountered: ${link}`);
    }
}

enum FileType {
    other,
    html,
}

enum CrawlWorkItemFlags {
    none = 0,
    crawlInternalLinks = 1 << 1,
}

interface CrawlWorkItem {
    resource: CrawlResource;
    fileType: FileType;
    flags: CrawlWorkItemFlags;
}

interface CrawlContext {
    loader: Loader;
    base: URL;
    graph: SiteGraph;
    queuedURLs: Set<string>;
    workItems: CrawlWorkItem[];
}

interface CrawlResource {
    url: URL;
    internal: boolean;
}

const tagToLinkInfo: { [tagName:string]: { attribute: string, recurse?: boolean } } = {
    a: { attribute: "href", recurse: true },
    link: { attribute: "href" },
    img: { attribute: "src" },
};

// TODO: Don't require extensions for non-file URLs (and ideally use content type)
const htmlURLPattern = /\.html?$/;

function enqueueURLIfNeeded(url: URL, context: CrawlContext): void {
    const href = url.href;
    if (!context.queuedURLs.has(href) && htmlURLPattern.test(href)) {
        context.queuedURLs.add(href);
        context.workItems.push({
            resource: {
                url,
                internal: true, // TODO: Not always!
            },
            fileType: FileType.html,
            flags: CrawlWorkItemFlags.crawlInternalLinks,
        });
    }
}

async function processWorkItem(item: CrawlWorkItem, context: CrawlContext): Promise<void> {
    const source = item.resource.url;
    const sourceHTML = await context.loader.loadAsync(source);
    const links = new Set<string>();
    for (const token of Parser.parse(sourceHTML)) {
        switch (token.type) {
            case 'open': {
                const linkInfo = tagToLinkInfo[token.name];
                if (linkInfo) {
                    const href = token.attributes[linkInfo.attribute];
                    const target = new URL(href, source);
                    links.add(target.href);
                    if (linkInfo.recurse) {
                        enqueueURLIfNeeded(target, context);
                    }
                }
            }
            break;
        }
    }

    context.graph.set(source.href, links);
}

export class Crawler {
    constructor(private loader: Loader) {
    }

    async crawlAsync(url: URL): Promise<SiteGraph> {
        const base = new URL(url.href.substring(0, url.href.lastIndexOf("/")));

        const context: CrawlContext = {
            loader: this.loader,
            base,
            graph: new Map(),
            queuedURLs: new Set(),
            workItems: [],
        };

        enqueueURLIfNeeded(url, context);

        const maxConcurrency = 1;
        const processor = pooledMap(maxConcurrency, context.workItems, (item) => processWorkItem(item, context));
        for await (const _void of processor) {
            // TODO: Events
        }

        return context.graph;
    }
}
