import { Parser } from "https://deno.land/x/event_driven_html_parser@4.0.2/parser.ts";
import type { ContentTypeParser } from "./shared.ts";

const tagToLinkAttributeName: { [tagName:string]: string } = {
    a: "href",
    link: "href",
    img: "src",
};

export const parse: ContentTypeParser = (context) => {
    const { content, recordIds } = context;
    const hrefs: string[] = [];
    const ids: Set<string> = new Set();

    for (const token of Parser.parse(content)) {
        switch (token.type) {
            case 'open': {
                if (recordIds) {
                    const id = token.attributes.id;
                    if (id) {
                        ids!.add(id);
                    }
                }

                const linkAttributeName = tagToLinkAttributeName[token.name];
                if (linkAttributeName) {
                    const href = token.attributes[linkAttributeName];
                    hrefs.push(href);
                }
            }
            break;
        }
    }

    return Promise.resolve({ hrefs, ids });
};
