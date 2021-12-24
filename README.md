# link_checker
Link checker and web crawler for Deno.

Note: this module is currently functional but mostly undocumented.

# Link checker
## Usage
```text
$ deno run --allow-read --allow-net https://deno.land/x/link_checker/check.ts --help

Usage: deno run [--allow-read] [--allow-net] check.ts <entry point (path or URL)> [options]

Options:
  -x, --check-external-links  Check external links; note: consider using "-c N" to speed this up (default: false)
  -f, --check-fragments       Check URL fragment/hash for internal links (default: true)
  -c, --concurrency <num>     Maximum concurrency (default: 1)
  -b, --base-url <URL>        Base URL for the site (default: entry point parent)
  --index-name <name>         Index name for file system directories (default: "index.html")
  -v, --verbose               Enable verbose logging
  --version                   Display module version
  -h, -?, --help              Display usage information
```

# Web crawler
## Usage
```text
$ deno run --allow-read --allow-net https://deno.land/x/link_checker/crawl.ts --help 

Usage: deno run [--allow-read] [--allow-net] crawl.ts <entry point (path or URL)> [options]

Options:
  -x, --external-links <strategy>  Strategy for external links: ignore, check, follow (default: "ignore")
  -c, --concurrency <num>          Maximum concurrency (default: 1)
  -d, --depth <num>                Maximum crawl depth (default: Infinity)
  -b, --base-url <URL>             Base URL for the site (default: entry point parent)
  --index-name <name>              Index name for file system directories (default: "index.html")
  --version                        Display module version
  -h, -?, --help                   Display usage information
```
