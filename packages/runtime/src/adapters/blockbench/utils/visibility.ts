type VisibilityTarget = { visibility?: boolean; visible?: boolean };

export const setVisibility = (target: VisibilityTarget | null | undefined, value: boolean | undefined): void => {
  if (!target || typeof value !== 'boolean') return;
  if (typeof target.visibility === 'boolean') {
    target.visibility = value;
    return;
  }
  if (typeof target.visible === 'boolean') {
    target.visible = value;
  }
};

export const readVisibility = (target: VisibilityTarget | null | undefined): boolean | undefined => {
  if (!target) return undefined;
  if (typeof target.visibility === 'boolean') return target.visibility;
  if (typeof target.visible === 'boolean') return target.visible;
  return undefined;
};
