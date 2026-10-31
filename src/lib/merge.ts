import type { SceneElement } from '../engine/scene';

/**
 * Three-way merge of a board, shape by shape. `base` is the last copy both sides agreed on,
 * `local` has this person's unsaved edits, `remote` is what someone else just saved.
 * Remote wins everywhere except the shapes this person changed, added or deleted since `base`.
 */
export function mergeScenes(base: SceneElement[], local: SceneElement[], remote: SceneElement[]): SceneElement[] {
  const key = (el: SceneElement) => JSON.stringify(el);
  const baseKeys = new Map(base.map(el => [el.id, key(el)]));
  const localById = new Map(local.map(el => [el.id, el]));
  const changed = new Set(local.filter(el => baseKeys.get(el.id) !== key(el)).map(el => el.id));
  const deleted = new Set([...baseKeys.keys()].filter(id => !localById.has(id)));

  const out: SceneElement[] = [], seen = new Set<string>();
  for (const el of remote) {
    if (deleted.has(el.id)) continue;
    out.push(changed.has(el.id) ? localById.get(el.id)! : el);
    seen.add(el.id);
  }
  // shapes drawn here (or edited here while someone else deleted them) go on top
  for (const el of local) if (changed.has(el.id) && !seen.has(el.id)) out.push(el);
  return out;
}
