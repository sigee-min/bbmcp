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
    badge: 'Open Source Blockbench MCP Toolkit',
    title: 'Open source MCP tools for Blockbench\nthat teams can inspect and extend.',
    description:
      'greyfox provides schema-based tools for modeling, texturing, animation, and validation, with docs and examples you can run locally or in CI.',
    primaryCta: 'Read the Docs',
    secondaryCta: 'Installation',
    featureTitle: 'Why teams use greyfox',
    features: [
      {
        title: 'Schema-Based Tools',
        description: 'Each tool exposes explicit inputs and outputs, so behavior is clear before execution.',
      },
      {
        title: 'Consistent Execution',
        description: 'Run the same MCP commands in local and CI environments with stable, repeatable results.',
      },
      {
        title: 'Built-in Checks',
        description: 'Validate structure and export readiness before assets move into downstream pipelines.',
      },
      {
        title: 'Open Contribution Path',
        description: 'Review source code, open issues, and submit pull requests to improve the toolkit.',
      },
    ],
    workflowTitle: 'From setup to export',
    workflowSteps: [
      {
        title: 'Configure',
        description: 'Define format assumptions, project constraints, and runtime targets for your pipeline.',
      },
      {
        title: 'Run Tools',
        description: 'Apply MCP tools for modeling, texturing, and animation with deterministic commands.',
      },
      {
        title: 'Check',
        description: 'Use validation checkpoints to detect structural and compatibility issues early.',
      },
      {
        title: 'Export',
        description: 'Generate outputs that are traceable, reviewable, and reusable across environments.',
      },
    ],
    closingTitle: 'Use it in your pipeline, improve it in public.',
    closingDescription: 'Start with installation and docs, then contribute issues or pull requests on GitHub.',
  },
  ko: {
    badge: '오픈소스 Blockbench MCP 툴킷',
    title: '검토하고 확장할 수 있는\nBlockbench 오픈소스 MCP 도구',
    description:
      'greyfox는 모델링, 텍스처링, 애니메이션, 검증 도구를 스키마 기반으로 제공하며, 로컬과 CI에서 실행 가능한 문서와 예제를 함께 제공합니다.',
    primaryCta: '문서 보기',
    secondaryCta: '설치하기',
    featureTitle: 'greyfox를 사용하는 이유',
    features: [
      {
        title: '스키마 기반 도구',
        description: '각 도구의 입력과 출력이 명시되어 실행 전 동작을 예측하고 검토할 수 있습니다.',
      },
      {
        title: '일관된 실행 결과',
        description: '로컬과 CI 환경에서 동일한 MCP 명령을 동일한 결과로 반복 실행할 수 있습니다.',
      },
      {
        title: '내장 품질 점검',
        description: '내보내기 전에 구조와 호환성을 확인해 파이프라인 전파 전에 문제를 줄입니다.',
      },
      {
        title: '열린 기여 구조',
        description: '소스 코드를 확인하고 이슈와 PR로 개선 사항을 직접 제안할 수 있습니다.',
      },
    ],
    workflowTitle: '설정부터 내보내기까지',
    workflowSteps: [
      {
        title: '설정',
        description: '포맷 가정, 프로젝트 제약, 런타임 대상을 먼저 정의합니다.',
      },
      {
        title: '실행',
        description: '모델링, 텍스처, 애니메이션 작업을 MCP 도구로 단계적으로 수행합니다.',
      },
      {
        title: '점검',
        description: '검증 체크포인트로 구조 및 호환성 이슈를 조기에 확인합니다.',
      },
      {
        title: '내보내기',
        description: '검토 가능하고 재사용 가능한 형태로 결과물을 생성합니다.',
      },
    ],
    closingTitle: '파이프라인에서 사용하고, 공개적으로 함께 개선하세요.',
    closingDescription: '설치 문서와 가이드로 시작한 뒤 GitHub 이슈와 PR로 프로젝트 발전에 참여할 수 있습니다.',
  },
};

export function getLandingCopy(locale: Locale): LandingCopy {
  return contentByLocale[locale];
}

