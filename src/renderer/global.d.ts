import type { Api, BootstrapGlobal } from './types';

declare global {
  interface Window {
    /** API segura exposta pelo preload (contextBridge). */
    api: Api;
    /** Bundle local do Bootstrap 5 (Toast e Modal). */
    bootstrap: BootstrapGlobal;
  }
}

export {};
