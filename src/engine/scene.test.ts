import { describe, expect, it } from 'vitest';
import { sanitizeElements } from './scene';

const rect = { id: 'r1', type: 'rectangle', x: 1, y: 2, w: 30, h: 40 };

describe('sanitizeElements', () => {
  it('returns nothing for input that is not a list', () => {
    expect(sanitizeElements(null)).toEqual([]);
    expect(sanitizeElements({ elements: [rect] })).toEqual([]);
  });

  it('keeps a valid shape and fills in default styles', () => {
    const [el] = sanitizeElements([rect]);
    expect(el).toMatchObject({ id: 'r1', type: 'rectangle', x: 1, y: 2, w: 30, h: 40, stroke: '#1f2328', fill: 'hachure' });
  });

  it('drops unknown types and anything that is not an object', () => {
    expect(sanitizeElements([{ ...rect, type: 'script' }, 'rectangle', 42, null])).toEqual([]);
  });

  it('copies only known properties', () => {
    const [el] = sanitizeElements([{ ...rect, onclick: 'alert(1)', html: '<img src=x onerror=alert(1)>' }]);
    expect(el).not.toHaveProperty('onclick');
    expect(el).not.toHaveProperty('html');
  });

  it('replaces colours that are not plain hex values', () => {
    const [el] = sanitizeElements([{ ...rect, stroke: 'url(javascript:alert(1))', bg: 'red;background:url(x)' }]);
    expect(el.stroke).toBe('#1f2328');
    expect(el.bg).toBe('transparent');
  });

  it('clamps numbers and ignores ones that are not finite', () => {
    const [el] = sanitizeElements([{ ...rect, x: Infinity, w: -30, sw: 999, opacity: -5 }]);
    expect(el).toMatchObject({ x: 0, w: 30, sw: 20, opacity: 0 });
  });

  it('gives an over-long id a fresh one', () => {
    const [el] = sanitizeElements([{ ...rect, id: 'x'.repeat(100) }]);
    expect(el.id).not.toBe('x'.repeat(100));
    expect(el.id.length).toBeLessThanOrEqual(40);
  });

  it('only accepts images embedded as data URLs', () => {
    const img = { ...rect, type: 'image' };
    expect(sanitizeElements([{ ...img, src: 'https://tracker.example/pixel.png' }])).toEqual([]);
    expect(sanitizeElements([{ ...img, src: 'javascript:alert(1)' }])).toEqual([]);
    expect(sanitizeElements([{ ...img, src: 'data:image/svg+xml;base64,PHN2Zz4=' }])).toEqual([]);
    expect(sanitizeElements([{ ...img, src: 'data:image/png;base64,iVBORw0KGgo=' }])).toHaveLength(1);
  });

  it('needs two points for lines and arrows, and keeps their bindings in range', () => {
    expect(sanitizeElements([{ ...rect, type: 'arrow', points: [[0, 0]] }])).toEqual([]);
    const [arrow] = sanitizeElements([
      { ...rect, type: 'arrow', points: [[0, 0], [10, 10]], startBind: { id: 'r1', fx: 5, fy: -5 }, endBind: { id: 7 } },
    ]);
    expect(arrow.startBind).toEqual({ id: 'r1', fx: 1, fy: -1 });
    expect(arrow).not.toHaveProperty('endBind');
  });

  it('drops empty text and measures the rest', () => {
    expect(sanitizeElements([{ ...rect, type: 'text', text: '' }])).toEqual([]);
    const [text] = sanitizeElements([{ ...rect, type: 'text', text: 'hello\nworld!', fontSize: 20 }]);
    expect(text).toMatchObject({ w: 60, h: 50 });
  });
});
