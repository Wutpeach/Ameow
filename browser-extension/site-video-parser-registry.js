(function initAmeowSiteVideoParserRegistry(root) {
  "use strict";

  function availableParsers() {
    return [
      root.AmeowWeiboVariantParser,
    ].filter((parser) => parser && typeof parser.collectCandidates === "function");
  }

  function collectSiteVideoCandidates(options = {}) {
    const pageUrl = options.pageUrl || root.location?.href || "";
    const candidates = [];
    availableParsers().forEach((parser) => {
      try {
        if (typeof parser.matches === "function" && !parser.matches(pageUrl)) {
          return;
        }
        const parsed = parser.collectCandidates({
          ...options,
          pageUrl,
          document: options.document || root.document,
        });
        if (Array.isArray(parsed)) {
          candidates.push(...parsed.filter(Boolean));
        }
      } catch (error) {
        console.warn("[Ameow] Site video parser failed:", parser.id || "unknown", error);
      }
    });
    return candidates;
  }

  root.AmeowSiteVideoParserRegistry = {
    collectSiteVideoCandidates,
  };
})(typeof window !== "undefined" ? window : globalThis);
