import type { Locale } from '@/lib/i18n';

export type LandingCopy = {
  badge: string;
  title: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
  featureTitle: string;
  features: Array<{
    title: string;
    description: string;
  }>;
  workflowTitle: string;
  workflowSteps: Array<{
    title: string;
    description: string;
  }>;
  closingTitle: string;
  closingDescription: string;
};

const contentByLocale: Record<Locale, LandingCopy> = {
  en: {
    badge: 'Blockbench MCP Tools',
    title: 'Standardize Blockbench production with bbmcp MCP tools.',
    description:
      'bbmcp provides deterministic MCP tools for modeling, texturing, animation, and validation so teams can ship assets with predictable quality.',
    primaryCta: 'Explore MCP Tools',
    secondaryCta: 'Get Started',
    featureTitle: 'Why teams run bbmcp in production',
    features: [
      {
        title: 'Deterministic Tool Execution',
        description: 'Run consistent MCP commands with explicit inputs, constraints, and expected outputs.',
      },
      {
        title: 'Operational Safety',
        description: 'Guard asset mutations with controlled operations and reversible workflow checkpoints.',
      },
      {
        title: 'Validation by Default',
        description: 'Check texture usage, structure, and export compatibility before assets reach runtime.',
      },
      {
        title: 'Automation Native',
        description: 'Compose scripted pipelines for CI and repeatable asset generation across environments.',
      },
    ],
    workflowTitle: 'MCP delivery workflow',
    workflowSteps: [
      {
        title: 'Configure',
        description: 'Define format capabilities, runtime constraints, and project-level safety rules.',
      },
      {
        title: 'Create',
        description: 'Generate structures, textures, and edits through deterministic MCP operations.',
      },
      {
        title: 'Validate',
        description: 'Run compatibility and structural checks before handoff.',
      },
      {
        title: 'Ship',
        description: 'Export validated outputs and ship repeatable release artifacts.',
      },
    ],
    closingTitle: 'Built for strict pipelines and fast delivery.',
    closingDescription: 'Adopt bbmcp MCP tools to standardize creation flows and reduce production regressions.',
  },
  ko: {
    badge: 'Blockbench MCP 도구',
    title: 'bbmcp MCP 도구로 모델 제작 파이프라인을 표준화하세요.',
    description:
      'bbmcp는 모델링, 텍스처링, 애니메이션, 검증을 결정적인 MCP 작업 흐름으로 연결해 안정적인 제작 품질을 제공합니다.',
    primaryCta: 'MCP 도구 보기',
    secondaryCta: '빠른 시작',
    featureTitle: '팀이 bbmcp를 선택하는 이유',
    features: [
      {
        title: '결정적 도구 실행',
        description: '명시적 입력과 제약을 기반으로 예측 가능한 MCP 명령 결과를 유지합니다.',
      },
      {
        title: '운영 안정성',
        description: '통제 가능한 변경 단계와 체크포인트로 에셋 변형 리스크를 줄입니다.',
      },
      {
        title: '품질 게이트',
        description: '출시 전 텍스처 사용, 구조 무결성, 런타임 호환성 검사를 수행합니다.',
      },
      {
        title: '자동화 친화',
        description: 'CI와 결합되는 스크립트 파이프라인으로 반복 제작을 자동화합니다.',
      },
    ],
    workflowTitle: 'MCP 운영 흐름',
    workflowSteps: [
      {
        title: '설정',
        description: '타깃 런타임 제약, 포맷 기능, 프로젝트 안전 규칙을 정의합니다.',
      },
      {
        title: '제작',
        description: 'MCP 도구로 모델/텍스처 작업을 일관된 방식으로 생성하고 수정합니다.',
      },
      {
        title: '검증',
        description: '핸드오프 전에 구조/호환성 게이트를 통과시킵니다.',
      },
      {
        title: '출시',
        description: '검증된 산출물을 내보내고 릴리스 가능한 형태로 정리합니다.',
      },
    ],
    closingTitle: '빠른 팀과 엄격한 기준을 위한 MCP 워크플로우.',
    closingDescription: 'bbmcp MCP 도구로 제작, 검증, 내보내기 과정을 표준화하세요.',
  },
};

export function getLandingCopy(locale: Locale): LandingCopy {
  return contentByLocale[locale];
}
