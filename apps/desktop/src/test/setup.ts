/**
 * @file Vitest 测试环境配置
 */

import '@testing-library/jest-dom';

// Mock IndexedDB for Node environment
const indexedDBMock = {
  open: () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onerror: null as ((this: IDBOpenDBRequest, ev: Event) => any) | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onsuccess: null as ((this: IDBOpenDBRequest, ev: Event) => any) | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onupgradeneeded: null as ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => any) | null,
    result: {} as IDBDatabase,
    error: null,
  }),
};

// @ts-expect-error - mock for test environment
globalThis.indexedDB = indexedDBMock;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock URL.createObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: () => 'mock-url',
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: () => {},
});
