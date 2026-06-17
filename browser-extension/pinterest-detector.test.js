import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const detectorPath = path.resolve("browser-extension/pinterest-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.id = "";
    this.textContent = "";
    this.title = "";
    this.type = "";
    this.className = "";
    this.style = {
      removeProperty() {},
    };
    this.classList = {
      add: (name) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.add(name);
        this.className = Array.from(classes).join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentElement) {
      return;
    }

    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  insertAdjacentElement(position, element) {
    if (position !== "afterend" || !this.parentElement) {
      this.appendChild(element);
      return element;
    }

    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    element.parentElement = this.parentElement;
    siblings.splice(index + 1, 0, element);
    return element;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "title") {
      this.title = String(value);
    }
  }

  getAttribute(name) {
    if (name === "id") {
      return this.id || null;
    }
    if (name === "title") {
      return this.title || null;
    }
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    this.eventListeners.set(type, listener);
  }

  click() {
    const listener = this.eventListeners.get("click");
    listener?.({
      preventDefault() {},
      stopPropagation() {},
    });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const descendants = [];
    const visit = (node) => {
      for (const child of node.children) {
        descendants.push(child);
        visit(child);
      }
    };
    visit(this);

    if (selector === "video") {
      return descendants.filter((node) => node.tagName === "VIDEO");
    }

    if (selector === "button, a, div[role='button']") {
      return descendants.filter((node) => node.tagName === "BUTTON" || node.tagName === "A");
    }

    if (selector.startsWith("#")) {
      return descendants.filter((node) => node.id === selector.slice(1));
    }

    if (selector === "[aria-label]" || selector === "[data-test-id]" || selector === "[data-test-id=\"reactions-count\"]") {
      return [];
    }

    return [];
  }

  getBoundingClientRect() {
    return {
      width: 240,
      height: 48,
      top: 0,
      left: 0,
      right: 240,
      bottom: 48,
    };
  }

  cloneNode() {
    const clone = new this.constructor(this.tagName);
    clone.id = this.id;
    clone.title = this.title;
    clone.type = this.type;
    clone.className = this.className;
    clone.textContent = this.textContent;
    for (const [name, value] of this.attributes) {
      clone.attributes.set(name, value);
    }
    this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
    return clone;
  }
}

class FakeButtonElement extends FakeElement {
  constructor() {
    super("button");
  }
}

class FakeVideoElement extends FakeElement {
  constructor() {
    super("video");
    this.currentSrc = "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4";
    this.src = this.currentSrc;
  }
}

class FakeDocument {
  constructor(body, actionBar) {
    this.readyState = "complete";
    this.title = "Example Pin | Pinterest";
    this.body = body;
    this.actionBar = actionBar;
  }

  addEventListener() {}

  getElementById(id) {
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector) {
    if (selector === "[data-test-id=\"closeupActionBar\"]") {
      return this.actionBar;
    }
    if (selector === "[data-test-id=\"closeup-share-button\"]") {
      return null;
    }
    if (selector === "meta[property=\"og:title\"]") {
      return null;
    }
    if (selector.includes("closeup")) {
      return this.body;
    }
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  createElement(tagName) {
    if (tagName === "button") {
      return new FakeButtonElement();
    }
    return new FakeElement(tagName);
  }
}

function loadDetector() {
  let messageListener = null;
  const body = new FakeElement("body");
  const video = new FakeVideoElement();
  body.appendChild(video);

  const actionBar = new FakeElement("div");
  const saveButton = new FakeButtonElement();
  saveButton.textContent = "Save";
  saveButton.setAttribute("aria-label", "Save");
  actionBar.appendChild(saveButton);
  body.appendChild(actionBar);

  const sentMessages = [];
  const document = new FakeDocument(body, actionBar);
  const window = {
    location: {
      href: "https://www.pinterest.com/pin/403705554121341216/",
      origin: "https://www.pinterest.com",
      pathname: "/pin/403705554121341216/",
    },
    innerWidth: 1440,
    innerHeight: 900,
    setTimeout(callback) {
      callback();
      return 1;
    },
    setInterval() {},
    addEventListener() {},
    AmeowInjectedCatIcon: {
      createCatIconElement() {
        const icon = new FakeElement("span");
        icon.className = "ameow-injected-cat-icon";
        return icon;
      },
    },
  };

  const context = {
    window,
    document,
    console,
    URL,
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    Document: FakeDocument,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLButtonElement: FakeButtonElement,
    HTMLAnchorElement: class HTMLAnchorElement extends FakeElement {},
    SVGElement: class SVGElement extends FakeElement {},
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
        sendMessage(message) {
          sentMessages.push(message);
        },
      },
    },
    performance: {
      getEntriesByType() {
        return [];
      },
    },
  };

  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return {
    actionBar,
    messageListener,
    sentMessages,
  };
}

describe("pinterest detector", () => {
  it("injects the detail page download button and sends a current pin selection", () => {
    const { actionBar, sentMessages } = loadDetector();
    const button = actionBar.querySelector("#ameow-pinterest-download-btn");

    expect(button).toBeTruthy();
    expect(actionBar.children[1]).toBe(button);

    button.click();

    expect(sentMessages).toEqual([
      expect.objectContaining({
        type: "video_selection",
        url: "https://www.pinterest.com/pin/403705554121341216/",
        pageUrl: "https://www.pinterest.com/pin/403705554121341216/",
        videoUrl: "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4",
        selectionScope: "current_item",
      }),
    ]);
  });

  it("responds to generic current-video resolution with a Pinterest current pin payload", () => {
    const { messageListener } = loadDetector();
    let response = null;

    const handled = messageListener(
      { type: "ameow_resolve_video_selection" },
      {},
      (payload) => {
        response = payload;
      },
    );

    expect(handled).toBe(true);
    expect(response).toEqual({
      success: true,
      payload: expect.objectContaining({
        type: "video_selection",
        url: "https://www.pinterest.com/pin/403705554121341216/",
        pageUrl: "https://www.pinterest.com/pin/403705554121341216/",
        videoUrl: "https://v1.pinimg.com/videos/iht/expmp4/example-video.mp4",
        selectionScope: "current_item",
      }),
    });
  });
});
