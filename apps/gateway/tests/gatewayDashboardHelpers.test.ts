import assert from 'node:assert/strict';
import { latestCompletedGltfJob, latestCompletedGltfJobForRevision } from '../src/gatewayDashboardHelpers';
import { registerAsync } from './helpers';

type MockJobInput = {
  id: string;
  projectRevision?: number;
  selectedFormat?: string;
  requestedCodecId?: string;
};

const createCompletedGltfJob = ({
  id,
  projectRevision,
  selectedFormat = 'gltf',
  requestedCodecId = 'gltf'
}: MockJobInput) =>
  ({
    id,
    projectId: 'project-1',
    status: 'completed',
    attemptCount: 1,
    maxAttempts: 3,
    leaseMs: 30000,
    createdAt: '2026-02-21T00:00:00.000Z',
    kind: 'gltf.convert',
    result: {
      kind: 'gltf.convert',
      output: {
        exportPath: `native-jobs/project-1/${id}.gltf`,
        selectedFormat,
        requestedCodecId,
        ...(typeof projectRevision === 'number' ? { projectRevision } : {})
      }
    }
  }) as const;

registerAsync(
  (async () => {
    const jobs = [
      createCompletedGltfJob({ id: 'job-legacy' }),
      createCompletedGltfJob({ id: 'job-r4', projectRevision: 4 }),
      createCompletedGltfJob({ id: 'job-r5', projectRevision: 5 })
    ];

    const latest = latestCompletedGltfJob(jobs);
    assert.equal(latest?.id, 'job-r5');

    const revisionMatched = latestCompletedGltfJobForRevision(jobs, 5);
    assert.equal(revisionMatched?.id, 'job-r5');

    const revisionSkippedLegacy = latestCompletedGltfJobForRevision([createCompletedGltfJob({ id: 'job-legacy' })], 2);
    assert.equal(revisionSkippedLegacy?.id, 'job-legacy');

    const revisionMetadataWins = latestCompletedGltfJobForRevision(
      [createCompletedGltfJob({ id: 'job-legacy' }), createCompletedGltfJob({ id: 'job-r3', projectRevision: 3 })],
      5
    );
    assert.equal(revisionMetadataWins, null);

    const incompatible = latestCompletedGltfJob([
      createCompletedGltfJob({ id: 'job-compatible', projectRevision: 3 }),
      createCompletedGltfJob({ id: 'job-native-codec', projectRevision: 4, requestedCodecId: 'draco' }),
      createCompletedGltfJob({ id: 'job-native-format', projectRevision: 5, selectedFormat: 'native_codec' })
    ]);
    assert.equal(incompatible?.id, 'job-compatible');
  })()
);
