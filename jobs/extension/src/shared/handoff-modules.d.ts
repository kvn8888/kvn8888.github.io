declare module "*.mjs" {
  export function runFrames(
    tab: chrome.tabs.Tab,
    action: string,
    packet?: any,
  ): Promise<any>;
  export function parsePacket(input: unknown): any;
}
