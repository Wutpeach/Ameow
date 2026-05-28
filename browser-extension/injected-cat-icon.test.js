import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/injected-cat-icon.js");
const helperSource = readFileSync(helperPath, "utf8");

class FakeElement {
  constructor() {
    this.attributes = new Map();
    const styleValues = new Map();
    this.style = {
      values: styleValues,
      setProperty: (name, value) => {
        this.style.values.set(name, value);
      },
      removeProperty: (name) => {
        this.style.values.delete(name);
        delete this.style[name];
      },
    };
    this.className = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function loadHelper() {
  const animationFrameCallbacks = [];
  const window = {
    requestAnimationFrame(callback) {
      animationFrameCallbacks.push(callback);
    },
  };
  const context = {
    window,
    document: {
      createElement() {
        return new FakeElement();
      },
    },
    chrome: {
      runtime: {
        getURL(pathname) {
          return `chrome-extension://ameow/${pathname}`;
        },
      },
    },
    Number,
    Math,
  };

  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return {
    animationFrameCallbacks,
    helper: window.AmeowInjectedCatIcon,
  };
}

describe("injected cat icon helper", () => {
  it("bounds the first rendered frame and then releases dimensions to site CSS", () => {
    const { animationFrameCallbacks, helper } = loadHelper();
    const icon = helper.createCatIconElement({ fallbackSizePx: 24 });

    expect(icon.className).toBe("ameow-injected-cat-icon");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.style.values.get("--ameow-injected-cat-icon-url"))
      .toBe('url("chrome-extension://ameow/injected-cat-icon.svg")');
    expect(icon.style.display).toBe("block");
    expect(icon.style.width).toBe("24px");
    expect(icon.style.height).toBe("24px");
    expect(icon.style.flex).toBe("0 0 auto");
    expect(icon.style.pointerEvents).toBe("none");

    expect(animationFrameCallbacks).toHaveLength(1);
    animationFrameCallbacks.shift()();
    expect(icon.style.width).toBe("24px");

    expect(animationFrameCallbacks).toHaveLength(1);
    animationFrameCallbacks.shift()();
    expect(icon.style.values.has("width")).toBe(false);
    expect(icon.style.values.has("height")).toBe(false);
    expect(icon.style.values.has("flex")).toBe(false);
    expect(icon.style.display).toBe("block");
  });
});
