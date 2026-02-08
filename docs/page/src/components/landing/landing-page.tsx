import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CheckCircle2, Github } from 'lucide-react';
import type { LandingCopy } from '@/lib/content/landing';
import type { Locale } from '@/lib/i18n';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

type LandingPageProps = {
  locale: Locale;
  copy: LandingCopy;
};

type ShowcaseItem = {
  src: string;
  type: 'gif' | 'image';
  alt: string;
  caption: string;
};

function splitHeroTitle(title: string): [string, string] {
  const raw = title.trim();
  if (!raw) return ['', ''];

  const explicitLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (explicitLines.length >= 2) {
    return [explicitLines[0], explicitLines.slice(1).join(' ')];
  }

  const normalized = raw.replace(/\s+/g, ' ');
  const words = normalized.split(' ');
  if (words.length < 2) return [normalized, ''];

  // Bias to a shorter first line and a longer second line.
  const targetChars = Math.round(normalized.length * 0.44);
  let splitIndex = 1;
  let charCount = 0;

  for (let index = 0; index < words.length - 1; index += 1) {
    charCount += words[index].length + 1;
    if (charCount >= targetChars) {
      splitIndex = index + 1;
      break;
    }
  }

  const firstLine = words.slice(0, splitIndex).join(' ');
  const secondLine = words.slice(splitIndex).join(' ');
  return [firstLine, secondLine];
}

const landingDetailsByLocale: Record<
  Locale,
  {
    checklistTitle: string;
    checklist: string[];
    statusBadge: string;
    workflowHint: string;
    featureLead: string;
    showcaseTitle: string;
    showcaseDescription: string;
    showcaseActionLabel: string;
    showcaseItems: ShowcaseItem[];
  }
> = {
  en: {
    checklistTitle: 'Practical Open Source Values',
    checklist: [
      'Tool contracts are visible through schemas and documented request/response behavior.',
      'Quality checks are built into the workflow before export and integration steps.',
      'Roadmap and quality improve through issues, discussions, and pull requests.',
    ],
    statusBadge: 'Community Driven',
    workflowHint:
      'Use docs and examples as a baseline, adapt the commands to your stack, then share improvements back.',
    featureLead:
      'ashfox is designed for transparent operation, so teams can reason about tool behavior instead of treating automation as a black box.',
    showcaseTitle: 'Reference Outputs',
    showcaseDescription:
      'Examples generated with ashfox tools. These samples help you compare output shape and quality against your own pipeline.',
    showcaseActionLabel: 'Open',
    showcaseItems: [
      {
        src: '/assets/images/ashfox-animation.gif',
        type: 'gif',
        alt: 'Animated preview output generated with ashfox',
        caption: 'Animated preview (GIF)',
      },
      {
        src: '/assets/images/ashfox.png',
        type: 'image',
        alt: 'Rendered model output generated with ashfox',
        caption: 'Rendered model output',
      },
      {
        src: '/assets/images/ashfox-texture.png',
        type: 'image',
        alt: 'Texture sheet output generated with ashfox',
        caption: 'Texture sheet output',
      },
    ],
  },
  ko: {
    checklistTitle: '실용적인 오픈소스 기준',
    checklist: [
      '요청/응답 스키마와 문서로 도구 계약을 확인하고 실행 전에 동작을 검토할 수 있습니다.',
      '내보내기와 연동 전 단계에 품질 점검이 포함되어 오류 전파를 줄일 수 있습니다.',
      '이슈, 토론, PR을 통해 로드맵과 품질 개선에 직접 참여할 수 있습니다.',
    ],
    statusBadge: 'Community Driven',
    workflowHint:
      '문서와 예제를 기준으로 팀 환경에 맞게 명령을 조정하고, 개선 사항을 다시 커뮤니티에 공유할 수 있습니다.',
    featureLead:
      'ashfox는 자동화를 블랙박스로 감추기보다 도구 동작을 투명하게 공개해 팀이 판단 가능한 워크플로를 만들도록 돕습니다.',
    showcaseTitle: '참고 결과물',
    showcaseDescription:
      'ashfox 도구로 생성한 결과 예시입니다. 팀 파이프라인의 결과 형태와 품질을 비교할 때 기준으로 활용할 수 있습니다.',
    showcaseActionLabel: '열기',
    showcaseItems: [
      {
        src: '/assets/images/ashfox-animation.gif',
        type: 'gif',
        alt: 'ashfox로 생성한 애니메이션 프리뷰 결과',
        caption: '애니메이션 프리뷰 (GIF)',
      },
      {
        src: '/assets/images/ashfox.png',
        type: 'image',
        alt: 'ashfox로 생성한 모델 렌더 결과',
        caption: '모델 렌더 결과',
      },
      {
        src: '/assets/images/ashfox-texture.png',
        type: 'image',
        alt: 'ashfox로 생성한 텍스처 시트 결과',
        caption: '텍스처 시트 결과',
      },
    ],
  },
};

export function LandingPage({ locale, copy }: LandingPageProps) {
  const details = landingDetailsByLocale[locale];
  const showcaseHero = details.showcaseItems.find((item) => item.type === 'gif') ?? details.showcaseItems[0];
  const showcaseGridItems = details.showcaseItems.filter((item) => item !== showcaseHero);
  const [heroTitleFirstLine, heroTitleSecondLine] = splitHeroTitle(copy.title);
  const githubCtaLabel = locale === 'ko' ? 'GitHub 보기' : 'GitHub';

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
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 pt-16 pb-14 sm:px-10 lg:gap-16">
        <section className="space-y-8">
          <p className="inline-flex rounded-full border border-fd-primary/40 bg-fd-primary/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-fd-primary">
            {copy.badge}
          </p>
          <h1 className="max-w-4xl break-keep text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
            <span className="block whitespace-nowrap max-sm:whitespace-normal">{heroTitleFirstLine}</span>
            {heroTitleSecondLine ? (
              <span className="mt-1 block whitespace-nowrap max-sm:whitespace-normal">{heroTitleSecondLine}</span>
            ) : null}
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
              href={`/${locale}/docs/installation`}
              className="inline-flex items-center justify-center rounded-lg border border-fd-border/90 bg-fd-card/75 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              {copy.secondaryCta}
            </Link>
            <a
              href="https://github.com/sigee-min/ashfox"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-fd-border/90 bg-fd-background/70 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              <Github className="size-4" />
              <span>{githubCtaLabel}</span>
            </a>
          </div>
        </section>

        <section className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{details.showcaseTitle}</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-fd-muted-foreground sm:text-base">
              {details.showcaseDescription}
            </p>
          </div>
          <ScrollReveal delayMs={60}>
            <div className="space-y-4">
              {showcaseHero ? (
                <article className="group overflow-hidden rounded-2xl border border-fd-border/70 bg-fd-card/75">
                  <div className="relative aspect-[16/11] md:aspect-[21/9]">
                    <Image
                      src={showcaseHero.src}
                      alt={showcaseHero.alt}
                      fill
                      sizes="(min-width: 768px) 90vw, 100vw"
                      unoptimized={showcaseHero.type === 'gif'}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute left-3 top-3 inline-flex items-center rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                      {showcaseHero.type === 'gif' ? 'GIF' : 'Image'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-fd-border/60 px-4 py-3">
                    <p className="text-sm font-medium">{showcaseHero.caption}</p>
                    <a
                      href={showcaseHero.src}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold uppercase tracking-[0.08em] text-fd-primary hover:underline"
                    >
                      {details.showcaseActionLabel}
                    </a>
                  </div>
                </article>
              ) : null}

              {showcaseGridItems.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {showcaseGridItems.map((item) => (
                    <article key={item.src} className="group overflow-hidden rounded-2xl border border-fd-border/70 bg-fd-card/75">
                      <div className="relative aspect-[16/10]">
                        <Image
                          src={item.src}
                          alt={item.alt}
                          fill
                          sizes="(min-width: 768px) 45vw, 100vw"
                          unoptimized={item.type === 'gif'}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                        <div className="absolute left-3 top-3 inline-flex items-center rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                          {item.type === 'gif' ? 'GIF' : 'Image'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-fd-border/60 px-4 py-3">
                        <p className="text-sm font-medium">{item.caption}</p>
                        <a
                          href={item.src}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold uppercase tracking-[0.08em] text-fd-primary hover:underline"
                        >
                          {details.showcaseActionLabel}
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </ScrollReveal>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-fd-muted-foreground">{copy.workflowTitle}</p>
            <span className="inline-flex rounded-full border border-fd-primary/35 bg-fd-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-fd-primary">
              {details.statusBadge}
            </span>
          </div>
          <ScrollReveal delayMs={80}>
            <div className="bb-surface-card rounded-2xl border border-fd-border/70 p-6 backdrop-blur-md">
              <ol className="space-y-4">
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
            </div>
          </ScrollReveal>
        </section>

        <section className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.featureTitle}</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-fd-muted-foreground sm:text-base">{details.featureLead}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-fd-muted-foreground">{details.workflowHint}</p>
          </div>
          <ScrollReveal delayMs={100}>
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
          </ScrollReveal>
        </section>

        <section className="space-y-3 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.closingTitle}</h2>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-fd-muted-foreground sm:text-base">
            {copy.closingDescription}
          </p>
          <div className="flex justify-center pt-1">
            <Link
              href={`/${locale}/docs`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-fd-primary px-6 py-3 text-sm font-semibold text-fd-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-fd-primary/90 hover:shadow-[var(--bb-cta-shadow)]"
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

