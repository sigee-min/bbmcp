export type PipelineStepsResult<TSteps, TExtra extends Record<string, unknown> = Record<string, never>> = {
  steps: TSteps;
} & TExtra;

export const buildPipelineResult = <
  TSteps,
  TExtra extends Record<string, unknown> = Record<string, never>
>(
  steps: TSteps,
  extras?: TExtra
): PipelineStepsResult<TSteps, TExtra> => ({
  steps,
  ...(extras ?? ({} as TExtra))
});
