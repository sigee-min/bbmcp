export type ViewportEnvironmentTemplateId = 'none' | 'forest' | 'swamp' | 'hill' | 'farm';

export interface ViewportEnvironmentTemplate {
  id: ViewportEnvironmentTemplateId;
  label: string;
  description: string;
}

export const DEFAULT_VIEWPORT_ENVIRONMENT_TEMPLATE_ID: ViewportEnvironmentTemplateId = 'none';

export const VIEWPORT_ENVIRONMENT_TEMPLATES: readonly ViewportEnvironmentTemplate[] = [
  {
    id: 'none',
    label: '기본',
    description: '배경 오브젝트 없이 모델만 표시합니다.'
  },
  {
    id: 'forest',
    label: '숲',
    description: '완만한 지형과 나무가 있는 숲 배경입니다.'
  },
  {
    id: 'swamp',
    label: '늪지',
    description: '물웅덩이와 습지 식생이 있는 늪지 배경입니다.'
  },
  {
    id: 'hill',
    label: '산언덕',
    description: '완만한 능선과 바위 지형의 산언덕 배경입니다.'
  },
  {
    id: 'farm',
    label: '농장',
    description: '밭 고랑과 울타리가 있는 농장 배경입니다.'
  }
] as const;

const VIEWPORT_ENVIRONMENT_TEMPLATE_IDS = new Set<ViewportEnvironmentTemplateId>(
  VIEWPORT_ENVIRONMENT_TEMPLATES.map((template) => template.id)
);

export const isViewportEnvironmentTemplateId = (value: string): value is ViewportEnvironmentTemplateId =>
  VIEWPORT_ENVIRONMENT_TEMPLATE_IDS.has(value as ViewportEnvironmentTemplateId);

export const resolveViewportEnvironmentTemplateId = (
  value: string | null | undefined
): ViewportEnvironmentTemplateId => {
  if (!value) {
    return DEFAULT_VIEWPORT_ENVIRONMENT_TEMPLATE_ID;
  }
  return isViewportEnvironmentTemplateId(value) ? value : DEFAULT_VIEWPORT_ENVIRONMENT_TEMPLATE_ID;
};

export const findViewportEnvironmentTemplate = (
  templateId: ViewportEnvironmentTemplateId
): ViewportEnvironmentTemplate =>
  VIEWPORT_ENVIRONMENT_TEMPLATES.find((template) => template.id === templateId) ??
  VIEWPORT_ENVIRONMENT_TEMPLATES[0];
