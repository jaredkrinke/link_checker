export interface ContentTypeParserContext {
    content: string;
    recordIds: boolean;
}

export interface ContentTypeParserResult {
    hrefs: string[];
    ids: Set<string>;
}

export type ContentTypeParser = (context: ContentTypeParserContext) => Promise<ContentTypeParserResult>;

export function getResourceIdentityFromURL(url: URL): URL {
    // Everything except fragment/hash
    if (url.hash) {
        const resourceURL = new URL(url.href);
        resourceURL.hash = "";
        return resourceURL;
    } else {
        return url;
    }
}
