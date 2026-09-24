const paths: Record<string, string> = {
  undo: '<path d="M9 10H3V4"/><path d="M3 10a9 9 0 1 1 2 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/>',
  arrow: '<path d="M5 19 19 5M7 5h12v12"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  share: '<path d="M12 16V3m-4 4 4-4 4 4M5 13v7h14v-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.heart}</svg>`;
