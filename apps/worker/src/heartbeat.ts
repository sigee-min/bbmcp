import type { BackendAvailability } from '@ashfox/backend-core';
import type { BackendPort } from '@ashfox/backend-core';
import type { Logger } from '@ashfox/runtime/logging';

export const runHeartbeat = async (backend: BackendPort, logger: Logger): Promise<void> => {
  const health = await backend.getHealth();
  const availability: BackendAvailability = health.availability;
  logger.info('ashfox worker heartbeat', {
    kind: health.kind,
    availability,
    version: health.version,
    details: health.details
  });
};
