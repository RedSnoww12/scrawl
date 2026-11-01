import { describe, expect, it } from 'vitest';
import type { SceneElement } from '../engine/scene';
import { mergeScenes } from './merge';

const el = (id: string, x = 0): SceneElement => ({
  id, type: 'rectangle', x, y: 0, w: 10, h: 10, stroke: '#000', bg: 'transparent', fill: 'hachure',
  sw: 2, ss: 'solid', rough: 1, round: false, opacity: 100, seed: 1, v: 0, groupIds: [],
});
const ids = (els: SceneElement[]) => els.map(e => `${e.id}@${e.x}`);

describe('mergeScenes', () => {
  it('takes the remote copy when nothing changed here', () => {
    const base = [el('a'), el('b')];
    expect(ids(mergeScenes(base, base, [el('a', 5), el('b')]))).toEqual(['a@5', 'b@0']);
  });

  it('keeps a shape this person moved, and the remote change to another', () => {
    const base = [el('a'), el('b')];
    expect(ids(mergeScenes(base, [el('a', 1), el('b')], [el('a'), el('b', 9)]))).toEqual(['a@1', 'b@9']);
  });

  it('lets a local edit win over a remote edit of the same shape', () => {
    expect(ids(mergeScenes([el('a')], [el('a', 1)], [el('a', 2)]))).toEqual(['a@1']);
  });

  it('keeps a local delete even if the other side changed the shape', () => {
    expect(ids(mergeScenes([el('a'), el('b')], [el('b')], [el('a', 3), el('b')]))).toEqual(['b@0']);
  });

  it('adds shapes drawn here on top of the remote ones', () => {
    expect(ids(mergeScenes([el('a')], [el('a'), el('new', 4)], [el('a'), el('theirs')]))).toEqual(['a@0', 'theirs@0', 'new@4']);
  });

  it('drops a shape the other side deleted when it was untouched here', () => {
    expect(ids(mergeScenes([el('a'), el('b')], [el('a'), el('b')], [el('a')]))).toEqual(['a@0']);
  });

  it('keeps a shape edited here that the other side deleted', () => {
    expect(ids(mergeScenes([el('a'), el('b')], [el('a'), el('b', 7)], [el('a')]))).toEqual(['a@0', 'b@7']);
  });
});
