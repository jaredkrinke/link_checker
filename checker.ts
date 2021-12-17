import { Loader, Crawler } from "./crawler.ts";
export type { Loader };

export interface Link {
    source: string;
    target: string;
}

export interface CheckLinksResult {
    brokenLinks: Link[];
}

export interface CheckLinksOptions {
    checkExternalLinks?: boolean;
}

export class LinkChecker {
    private crawler: Crawler;

    constructor(loader: Loader) {
        this.crawler = new Crawler(loader);
    }

    async checkLinksAsync(url: URL, options?: CheckLinksOptions): Promise<CheckLinksResult> {
        const collection = await this.crawler.crawlAsync(url, {
            externalLinks: options?.checkExternalLinks ? "check" : "ignore",
        });

        const brokenLinks: Link[] = [];
        for (const [source, info] of collection.entries()) {
            if (info.links) {
                for (const target of info.links.values()) {
                    const targetInfo = collection.get(target);
                    if (targetInfo && !targetInfo.contentType) {
                        // Broken link
                        brokenLinks.push({ source, target });
                    }
                }
            }
        }
        return { brokenLinks };
    }
}
