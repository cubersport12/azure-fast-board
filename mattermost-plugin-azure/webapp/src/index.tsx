import Plugin from './plugin';
import { PLUGIN_ID } from './manifest';

declare global {
  interface Window {
    registerPlugin: (id: string, plugin: Plugin) => void;
  }
}

window.registerPlugin(PLUGIN_ID, new Plugin());
