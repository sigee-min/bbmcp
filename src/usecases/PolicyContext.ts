import type { FormatOverrides } from '../services/format';
import type { RigMergeStrategy } from '../domain/rig';
import { DEFAULT_UV_POLICY, UvPolicyConfig } from '../domain/uvPolicy';
import type { ExportPolicy, SnapshotPolicy, ToolPolicies } from './policies';

export class PolicyContext {
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

  getRigMergeStrategy(): RigMergeStrategy | undefined {
    return this.policies.rigMergeStrategy;
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
