import { getResourceIdentityFromURL } from "./shared.ts";
import { CrawlHandlers, Crawler } from "./crawler.ts";
export type { CrawlHandlers };

export interface Link {
    source: string;
    target: string;
    href: string;
}

export interface CheckLinksResult {
    brokenLinks: Link[];
}

export interface CheckLinksOptions {
    base?: URL;
    checkExternalLinks?: boolean;
    checkFragments?: boolean;
    maxConcurrency?: number;
}

export class LinkChecker {
    private crawler: Crawler;

    constructor(handlers: CrawlHandlers) {
        this.crawler = new Crawler(handlers);
    }

    async checkLinksAsync(urlOrURLs: URL | URL[], options?: CheckLinksOptions): Promise<CheckLinksResult> {
        const checkFragments = options?.checkFragments;
        const collection = await this.crawler.crawlAsync(urlOrURLs, {
            externalLinks: options?.checkExternalLinks ? "check" : "ignore",
            recordsIds: checkFragments,
            base: options?.base,
            maxConcurrency: options?.maxConcurrency,
        });

        // TODO: Only process each unique link once?
        const brokenLinks: Link[] = [];
        for (const [source, info] of collection.entries()) {
            if (info.links) {
                for (const link of info.links) {
                    const { canonicalURL, originalHrefString: href } = link;
                    const targetResource = getResourceIdentityFromURL(canonicalURL).href;
                    const targetResourceInfo = collection.get(targetResource);

                    // Broken links are links that have been tested (so they're in the collection), but that have an undefined content type
                    let broken = false;
                    if (targetResourceInfo) {
                        broken = !targetResourceInfo.contentType;

                        // Check fragment/hash as well, if requested
                        if (checkFragments && !broken && canonicalURL.hash && targetResourceInfo.ids) {
                            const fragment = canonicalURL.hash.substring(1); // Remove "#" prefix
                            broken = !targetResourceInfo.ids.has(fragment);
                        }
                    }

                    if (broken) {
                        brokenLinks.push({
                            source,
                            target: canonicalURL.href,
                            href,
                        });
                    }
                }
            }
        }
        return { brokenLinks };
    }
}
