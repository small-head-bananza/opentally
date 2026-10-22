// SelectionStore backed by the browser's extension storage. The storage area is
// injected (chrome.storage.local in the extension, a fake in tests), so this file
// never touches a real browser API on its own.

import type { SelectionStore } from "../lib/selection";

/** The slice of chrome.storage.StorageArea this module needs. */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class ExtensionStore implements SelectionStore {
  constructor(private readonly area: StorageArea) {}

  async get(key: string): Promise<string | undefined> {
    const items = await this.area.get(key);
    const value = items[key];
    return typeof value === "string" ? value : undefined;
  }

  async set(key: string, value: string): Promise<void> {
    await this.area.set({ [key]: value });
  }
}
