import { Parser } from "https://deno.land/x/event_driven_html_parser@4.0.2/parser.ts";

export interface Link {
    source: string;
    target: string;

    // TODO: Capture link inner text?
}

/** Abstraction for loading resources (to support additional environments or use mock data). */
export interface Loader {
    /** Synchronously or asynchronously loads a relative resource and returns its content as a `Uint8Array`. */
    load: (reference: string, abortSignal?: AbortSignal) => Uint8Array | Promise<Uint8Array>;

    /** Synchronously or asynchronously loads a relative resource and returns its content as a string.
     * 
     * Implementing this is optional and it is simply an optimization for loading text files, such as HTML. */
    loadText?: (reference: string, abortSignal?: AbortSignal) => string | Promise<string>;

    /** Synchronously or asynchronously checks whether a given resource exists.
     * 
     * Implementing this is optional and it is simply an optimization for checking the existence of resources without loading them. */
    exists?: (reference: string, abortSignal?: AbortSignal) => boolean | Promise<boolean>;

    /** Synchronously or asynchronously enumerates the names of all resources under a given base location.
     * 
     * Implementing this is optional when checking for broken links, but required when testing reachability of all resources. */
    enumerate?: (base?: string, abortSignal?: AbortSignal) => string[] | Promise<string[]>;
}

export interface LinkCheckerOptions {
    /** True if relative links and links nested under `base` should be checked, false otherwise (default: false). */
    checkInternalLinks?: boolean;

    // checkAnchors?: boolean;

    /** Resource loader for internal references. Required for checking internal links or reachability. */
    internalLoader?: Loader;

    // TODO: Document
    abortSignal?: AbortSignal;

    // /** Resource loader for external references. Required for checking external links. */
    // externalLoader?: Loader;

    // checkExternalLinks?: boolean;
    // checkReachable?: boolean;
    // base?: string;

    // TODO: Abort signal
    // TODO: Max concurrency
    // TODO: Meta tags, e.g. og:image?
}

export interface LinkCheckerResult {
    invalidLinks: Link[];
    brokenInternalLinks: Link[];
    errors: Error[];
    // TODO: Absolute links
    // TODO: Unreachable files
}

interface Context {
    result: LinkCheckerResult;
    workItems: Promise<void>[]; // TODO: Need to distinguish internal vs. not?
    // TODO: Set of processed files
    // TODO: Id cache for checking anchors
    // TODO: Work item pool?
}

function pathUp(path: string): string {
    const lastIndexOfSlash = path.lastIndexOf("/");
    if (lastIndexOfSlash < 0) {
        throw "Tried to go up one level from a root path!";
    }

    return path.substr(0, lastIndexOfSlash)
}

function pathRelativeResolve(from: string, to: string): string {
    let currentPath = pathUp("/" + from);
    for (const part of to.split("/")) {
        switch (part) {
            case ".":
                break;
            
            case "..":
                currentPath = pathUp(currentPath);
                break;
            
            default:
                currentPath = currentPath + "/" + part;
                break;
        }
    }
    return currentPath.slice(1);
}

// TODO: How to support links like "/style.css"? Requires a base to be set?
const relativeLinkPattern = /^[^/][^:]*$/;
const tagToLinkAttribute: { [tagName:string]: string } = {
    a: "href",
    link: "href",
    img: "src",
};

async function processWorkItem(sourcePath: string, context: Context, options: LinkCheckerOptions): Promise<void> {
    try {
        // TODO: check for internal
        // TODO: Use load, if no loadText
        const promiseOrString = options.internalLoader!.loadText!(sourcePath, options.abortSignal);
        const sourceHTML = (typeof(promiseOrString) === "string") ? promiseOrString : await promiseOrString;
        for (const token of Parser.parse(sourceHTML)) {
            switch (token.type) {
                case 'open': {
                    const attributeName = tagToLinkAttribute[token.name];
                    if (attributeName) {
                        const href = token.attributes[attributeName];
                        if (relativeLinkPattern.test(href)) {
                            const targetParts = href.split("#");
                            if (targetParts.length > 2) {
                                // TODO: Proper error type
                                throw `Invalid link: "${href}"`;
                            }
    
                            const targetPath = targetParts[0];
                            // const targetId = targetParts[1];
    
                            // Check that link target exists, if provided
                            let broken = false;
                            let targetPathFromRoot;
                            if (targetPath) {
                                // TODO: Needs try-catch for better logging
                                targetPathFromRoot = pathRelativeResolve(sourcePath, targetPath);
                                // TODO: Needs a helper for fallback implementation of exists
                                if (!(options.internalLoader!.exists!(targetPathFromRoot, options.abortSignal))) {
                                    broken = true;
                                }
                            }
    
                            // TODO
                            // Check that the id exists, if provided
                            // if (!broken && targetId) {
                            //     const targetIds = targetPathFromRoot
                            //         ? fileToIds[targetPathFromRoot]
                            //         : fileToIds[sourcePath];
    
                            //     // TODO: Validate id format first
                            //     if (!targetIds.has(targetId)) {
                            //         broken = true;
                            //     }
                            // }
    
                            if (broken) {
                                context.result.brokenInternalLinks.push({
                                    source: sourcePath,
                                    target: href,
                                });
                            }
                        }
                    }
                }
                break;
            }
        }
    } catch (error) {
        // TODO: Add file context to error?
        context.result.errors.push(error);
    }
}

export async function checkLinks(entry: string, options: LinkCheckerOptions): Promise<LinkCheckerResult> {
    const result: LinkCheckerResult = {
        invalidLinks: [],
        brokenInternalLinks: [],
        errors: [],
    };

    if (options.checkInternalLinks) {
        const workItems: Promise<void>[] = [];

        const context: Context = {
            result,
            workItems,
        };
    
        workItems.push(processWorkItem(entry, context, options));
        for await (const _void of workItems) {
            // TODO: eventing
        }
    }

    return result;
}
