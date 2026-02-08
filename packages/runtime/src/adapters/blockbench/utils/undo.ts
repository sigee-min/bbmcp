import type { UnknownRecord } from '../../../types/blockbench';
import { readGlobals } from './globals';

export const normalizeEditAspects = (aspects: UnknownRecord) => {
  const normalized = { ...aspects };
  const arrayKeys = ['elements', 'outliner', 'textures', 'animations', 'keyframes'];
  arrayKeys.forEach((key) => {
    if (normalized[key] === true) normalized[key] = [];
  });
  return normalized;
};

export const withUndo = (aspects: UnknownRecord, editName: string, fn: () => void) => {
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  const undo = globals.Undo;
  const normalized = normalizeEditAspects(aspects);
  if (undo?.initEdit && undo?.finishEdit) {
    undo.initEdit(normalized);
    fn();
    undo.finishEdit(editName);
    return;
  }
  if (typeof blockbench?.edit === 'function') {
    blockbench.edit(normalized, fn);
    return;
  }
  fn();
};
