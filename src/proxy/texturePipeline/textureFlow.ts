import type { TextureUsage } from '../../domain/model';
import type { TextureSpec } from '../../spec';
import type { ToolResponse } from '../../types';
import type { MetaOptions } from '../meta';
import type { ProxyPipelineDeps } from '../types';
import { applyTextureSpecSteps, createApplyReport, type ApplyReport } from '../apply';

type ApplyTextureSpecsInput = {
  deps: ProxyPipelineDeps;
  meta: MetaOptions;
  textures: TextureSpec[];
  usage?: TextureUsage;
};

export const applyTextureSpecs = async ({
  deps,
  meta,
  textures,
  usage
}: ApplyTextureSpecsInput): Promise<ToolResponse<ApplyReport>> => {
  const report = createApplyReport();
  const result = await applyTextureSpecSteps(
    deps.service,
    deps.dom,
    deps.limits,
    textures,
    report,
    meta,
    deps.log,
    usage
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data };
};
