import type { AmeowElectronBridge } from "./types/electronBridge";

declare global {
  interface Window {
    ameow?: AmeowElectronBridge;
  }
}

export {};
