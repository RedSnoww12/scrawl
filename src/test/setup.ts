// Tests run in Node. scene.ts measures text with a canvas when it loads, so give it a stand-in
// that measures every character as 10px wide.
const ctx = { font: '', measureText: (s: string) => ({ width: s.length * 10 }) };
globalThis.document ??= { createElement: () => ({ getContext: () => ctx }) } as unknown as Document;
