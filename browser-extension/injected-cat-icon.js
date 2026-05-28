(function initAmeowInjectedCatIcon() {
  "use strict";

  const CAT_ICON_CLASS = "ameow-injected-cat-icon";
  const CAT_ICON_URL_PROPERTY = "--ameow-injected-cat-icon-url";
  const FALLBACK_ICON_SIZE_PX = 20;

  function releaseFallbackSizing(icon) {
    icon.style.removeProperty("width");
    icon.style.removeProperty("height");
    icon.style.removeProperty("flex");
  }

  function scheduleFallbackSizingRelease(icon) {
    if (typeof window.requestAnimationFrame !== "function") {
      window.setTimeout(() => releaseFallbackSizing(icon), 0);
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => releaseFallbackSizing(icon));
    });
  }

  function createCatIconElement(options = {}) {
    const icon = document.createElement("span");
    const fallbackSize = Number.isFinite(options.fallbackSizePx)
      ? Math.max(1, Math.round(options.fallbackSizePx))
      : FALLBACK_ICON_SIZE_PX;
    const fallbackSizeValue = `${fallbackSize}px`;

    icon.setAttribute("aria-hidden", "true");
    icon.className = CAT_ICON_CLASS;
    icon.style.setProperty(CAT_ICON_URL_PROPERTY, `url("${chrome.runtime.getURL("injected-cat-icon.svg")}")`);
    icon.style.display = "block";
    icon.style.width = fallbackSizeValue;
    icon.style.height = fallbackSizeValue;
    icon.style.flex = "0 0 auto";
    icon.style.pointerEvents = "none";
    scheduleFallbackSizingRelease(icon);

    return icon;
  }

  window.AmeowInjectedCatIcon = {
    createCatIconElement,
  };
})();
