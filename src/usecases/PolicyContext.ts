import type { FormatOverrides } from '../services/format';
import { DEFAULT_UV_POLICY } from '../domain/uvPolicy';
import type { UvPolicyConfig } from '../domain/uvPolicy';
import type { ExportPolicy, SnapshotPolicy, ToolPolicies } from './policies';
import type { PolicyContextLike } from './contextTypes';

export class PolicyContext implements PolicyContextLike {
  private readonly policies: ToolPolicies;

  constructor(policies: ToolPolicies) {
    this.policies = policies;
  }

  getSnapshotPolicy(): SnapshotPolicy {
    return this.policies.snapshotPolicy ?? 'hybrid';
  }

  getFormatOverrides(): FormatOverrides | undefined {
    return this.policies.formatOverrides;
  }

  getExportPolicy(): ExportPolicy | undefined {
    return this.policies.exportPolicy;
  }

  getAutoDiscardUnsaved(): boolean | undefined {
    return this.policies.autoDiscardUnsaved;
  }

  getAutoAttachActiveProject(): boolean | undefined {
    return this.policies.autoAttachActiveProject;
  }

  isRevisionRequired(): boolean {
    return Boolean(this.policies.requireRevision);
  }

  isAutoRetryRevisionEnabled(): boolean {
    return Boolean(this.policies.autoRetryRevision);
  }

  getUvPolicyConfig(): UvPolicyConfig {
    const policy = this.policies.uvPolicy;
    return {
      modelUnitsPerBlock: policy?.modelUnitsPerBlock ?? DEFAULT_UV_POLICY.modelUnitsPerBlock,
      scaleTolerance: policy?.scaleTolerance ?? DEFAULT_UV_POLICY.scaleTolerance,
      tinyThreshold: policy?.tinyThreshold ?? DEFAULT_UV_POLICY.tinyThreshold
    };
  }
}
