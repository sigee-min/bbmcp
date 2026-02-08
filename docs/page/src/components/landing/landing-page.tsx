import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { LandingCopy } from '@/lib/content/landing';
import type { Locale } from '@/lib/i18n';

type LandingPageProps = {
  locale: Locale;
  copy: LandingCopy;
};

const landingDetailsByLocale: Record<
  Locale,
  {
    checklistTitle: string;
    checklist: string[];
    statusBadge: string;
    workflowHint: string;
    featureLead: string;
  }
> = {
  en: {
    checklistTitle: 'Core MCP capabilities',
    checklist: [
      'Modeling, texture, and animation operations through MCP endpoints.',
      'Validation gates before export and runtime integration.',
      'Deterministic command execution for CI and reproducible builds.',
    ],
    statusBadge: 'Release Ready',
    workflowHint: 'Each stage defines command boundaries and quality gates for safe team scaling.',
    featureLead:
      'Build reliable production habits with MCP tools designed for repeatable and auditable operations.',
  },
  ko: {
    checklistTitle: 'MCP 핵심 기능',
    checklist: [
      '모델링, 텍스처, 애니메이션 작업을 MCP 엔드포인트로 통합합니다.',
      '내보내기 전 검증 게이트로 핸드오프 리스크를 줄입니다.',
      '결정적 명령 실행으로 CI 재현성과 품질 추적성을 확보합니다.',
    ],
    statusBadge: '출시 준비 완료',
    workflowHint: '각 단계에서 실행 범위와 검증 기준을 고정해 팀 확장 시에도 품질을 유지합니다.',
    featureLead: '실제 에셋 제작 현장에 맞춘 MCP 작업 흐름으로 반복 가능하고 감사 가능한 운영을 구축하세요.',
  },
};

export function LandingPage({ locale, copy }: LandingPageProps) {
  const details = landingDetailsByLocale[locale];

  return (
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      <div className="bb-landing-bg" aria-hidden>
        <div className="bb-landing-grid" />
        <div className="bb-landing-noise" />
        <div className="bb-landing-beam" />
        <div className="bb-landing-orb bb-landing-orb-a" />
        <div className="bb-landing-orb bb-landing-orb-b" />
        <div className="bb-landing-orb bb-landing-orb-c" />
      </div>
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-16 sm:px-10 lg:gap-16">
        <section className="space-y-8 bb-reveal">
          <p className="inline-flex rounded-full border border-fd-primary/40 bg-fd-primary/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-fd-primary">
            {copy.badge}
          </p>
          <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
            {copy.title}
          </h1>
          <p className="max-w-3xl text-pretty text-base leading-relaxed text-fd-muted-foreground sm:text-lg">
            {copy.description}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/${locale}/docs`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-all hover:bg-fd-primary/90 hover:shadow-[var(--bb-cta-shadow)]"
            >
              {copy.primaryCta}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href={`/${locale}/docs/getting-started`}
              className="inline-flex items-center justify-center rounded-lg border border-fd-border/90 bg-fd-card/75 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              {copy.secondaryCta}
            </Link>
          </div>
        </section>

        <section className="bb-surface-card rounded-2xl border border-fd-border/70 p-6 backdrop-blur-md bb-reveal bb-reveal-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-fd-muted-foreground">{copy.workflowTitle}</p>
            <span className="inline-flex rounded-full border border-fd-primary/35 bg-fd-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-fd-primary">
              {details.statusBadge}
            </span>
          </div>

          <ol className="mt-5 space-y-4">
            {copy.workflowSteps.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 pl-1">
                {index < copy.workflowSteps.length - 1 ? (
                  <span className="absolute left-[14px] top-7 h-[calc(100%-3px)] w-px bg-fd-border/90" />
                ) : null}
                <span className="relative z-10 mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-fd-primary/20 bg-fd-primary/10 text-xs font-semibold text-fd-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm text-fd-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border border-fd-border/70 bg-fd-background/75 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fd-primary">{details.checklistTitle}</p>
            <ul className="mt-3 space-y-2">
              {details.checklist.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-fd-primary" />
                  <span className="text-sm text-fd-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-6 bb-reveal bb-reveal-delay-3">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.featureTitle}</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-fd-muted-foreground sm:text-base">{details.featureLead}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-fd-muted-foreground">{details.workflowHint}</p>
          </div>
          <div className="space-y-4">
            {copy.features.map((feature) => (
              <article
                key={feature.title}
                className="bb-surface-card rounded-xl border border-fd-border/70 p-5 transition-all hover:-translate-y-0.5 hover:border-fd-primary/25 hover:shadow-[var(--bb-feature-hover-shadow)]"
              >
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bb-surface-card rounded-3xl border border-fd-border/75 p-8 text-center bb-reveal bb-reveal-delay-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.closingTitle}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-fd-muted-foreground sm:text-base">
            {copy.closingDescription}
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href={`/${locale}/docs`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-fd-border bg-fd-background/80 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              {copy.primaryCta}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
