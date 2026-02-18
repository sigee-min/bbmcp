import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type LocalRuntime = 'docker' | 'container';
export type RuntimeSource = 'explicit' | 'auto';
export type ResultCode =
  | 'ok'
  | 'local_env_missing'
  | 'local_runtime_unavailable'
  | 'local_stack_start_failed'
  | 'local_service_unhealthy'
  | 'local_smoke_failed';

export type SmokeCheck = {
  id: string;
  url: string;
  validate?: (response: HttpResult) => boolean;
};

export type RuntimeProbeResult = {
  ok: boolean;
  reason?: string;
};

export type RuntimeProbeMap = Partial<Record<LocalRuntime, RuntimeProbeResult>>;

export type CommandSpec = {
  command: string;
  args: string[];
};

export type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type ServiceStatus = {
  required: string[];
  running: string[];
  failed: string[];
};

export type SmokeResult = {
  id: string;
  url: string;
  ok: boolean;
  status?: number;
  detail?: string;
};

export type SmokeSummary = {
  checks: SmokeResult[];
  failed: string[];
};

export type OrchestrationSummary = {
  envPath: string;
  runtime: LocalRuntime | null;
  runtimeSource: RuntimeSource | null;
  runtimesTried: LocalRuntime[];
  command: CommandSpec | null;
  services: ServiceStatus | null;
  smoke: SmokeSummary | null;
  resultCode: ResultCode;
  requestedRuntime?: string;
  runtimeProbe?: RuntimeProbeMap;
  session?: OrchestrationSession;
};

export type OrchestrationSession = {
  runtime: LocalRuntime;
  runtimeSource: RuntimeSource;
  runtimesTried: LocalRuntime[];
  envPath: string;
  composePath: string;
};

export type LocalStartConfig = {
  envPath: string;
  composePath: string;
  runtime?: LocalRuntime | string | null;
  requiredServices?: string[];
  smokeChecks?: SmokeCheck[];
};

export type LocalDownConfig = {
  envPath: string;
  composePath: string;
  runtime?: LocalRuntime | string | null;
  requiredServices?: string[];
  session?: OrchestrationSession | null;
};

export type FileSystem = {
  exists: (filePath: string) => boolean;
  readFile: (filePath: string) => string;
};

export type CommandRunner = {
  run: (command: string, args: string[]) => Promise<CommandResult>;
};

export type HttpResult = {
  status: number;
  body: string;
};

export type HttpClient = {
  get: (url: string) => Promise<HttpResult>;
};

export type OrchestrationDeps = {
  fs: FileSystem;
  runner: CommandRunner;
  http: HttpClient;
  probeRuntime?: (runtime: LocalRuntime, runner: CommandRunner) => Promise<RuntimeProbeResult>;
  listRunningServices?: (
    runtime: LocalRuntime,
    composePath: string,
    envPath: string,
    runner: CommandRunner,
    requiredServices: string[]
  ) => Promise<ServiceStatus>;
  smokeChecksRunner?: (checks: SmokeCheck[], http: HttpClient) => Promise<SmokeSummary>;
};

const REQUIRED_ENV_KEYS = [
  'ASHFOX_PERSISTENCE_PRESET',
  'ASHFOX_PERSISTENCE_FAIL_FAST',
  'ASHFOX_GATEWAY_BACKEND',
  'ASHFOX_HOST',
  'ASHFOX_PORT',
  'ASHFOX_PATH',
  'ASHFOX_WORKER_HEARTBEAT_MS'
];

const REQUIRED_SERVICES = ['gateway', 'worker', 'postgres'];

const DEFAULT_SMOKE_CHECKS: SmokeCheck[] = [
  {
    id: 'gateway_root',
    url: 'http://127.0.0.1:8787/',
    validate: (res) => res.status >= 200 && res.status < 400
  },
  {
    id: 'gateway_metrics',
    url: 'http://127.0.0.1:8787/metrics',
    validate: (res) => res.status === 200 && res.body.includes('ashfox_mcp_requests_total')
  }
];

export const createDefaultDeps = (): OrchestrationDeps => ({
  fs: {
    exists: (filePath) => fs.existsSync(filePath),
    readFile: (filePath) => fs.readFileSync(filePath, 'utf8')
  },
  runner: createNodeRunner(),
  http: createNodeHttpClient()
});

export const createNodeRunner = (): CommandRunner => ({
  run: (command, args) =>
    new Promise((resolve) => {
      const child = spawn(command, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk ?? '');
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk ?? '');
      });
      child.on('error', (err) => {
        resolve({ exitCode: 1, stdout, stderr: `${stderr}${err?.message ? String(err.message) : ''}`.trim() });
      });
      child.on('close', (code) => {
        resolve({ exitCode: code ?? 0, stdout, stderr });
      });
    })
});

export const createNodeHttpClient = (): HttpClient => ({
  get: async (url) => {
    const res = await fetch(url);
    const body = await res.text();
    return { status: res.status, body };
  }
});

const parseEnvFile = (text: string): Record<string, string> => {
  const lines = text.split(/\r?\n/);
  const env: Record<string, string> = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sepIndex = line.indexOf('=');
    if (sepIndex <= 0) continue;
    const key = line.slice(0, sepIndex).trim();
    const value = line.slice(sepIndex + 1).trim();
    if (!key) continue;
    env[key] = value.replace(/^"|"$/g, '');
  }
  return env;
};

const validateEnvFile = (envPath: string, deps: OrchestrationDeps): { ok: boolean; missing?: string[] } => {
  if (!envPath || !deps.fs.exists(envPath)) return { ok: false, missing: REQUIRED_ENV_KEYS };
  const content = deps.fs.readFile(envPath);
  const parsed = parseEnvFile(content);
  const missing = REQUIRED_ENV_KEYS.filter((key) => !parsed[key] || parsed[key].trim() === '');
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
};

const resolveRuntimeValue = (value?: LocalRuntime | string | null): LocalRuntime | null => {
  if (!value) return null;
  if (value === 'docker' || value === 'container') return value;
  return null;
};

const defaultProbeRuntime = async (runtime: LocalRuntime, runner: CommandRunner): Promise<RuntimeProbeResult> => {
  const command = runtime === 'docker' ? 'docker' : 'container-compose';
  const args = runtime === 'docker' ? ['compose', 'version'] : ['version'];
  const res = await runner.run(command, args);
  if (res.exitCode === 0) return { ok: true };
  const reason = res.stderr.trim() || res.stdout.trim() || 'probe_failed';
  return { ok: false, reason };
};

const listRunningServicesDefault = async (
  runtime: LocalRuntime,
  composePath: string,
  envPath: string,
  runner: CommandRunner,
  requiredServices: string[]
): Promise<ServiceStatus> => {
  const command = runtime === 'docker' ? 'docker' : 'container-compose';
  const args =
    runtime === 'docker'
      ? ['compose', '-f', composePath, '--env-file', envPath, 'ps', '--services', '--filter', 'status=running']
      : ['-f', composePath, '--env-file', envPath, 'ps', '--services'];
  const res = await runner.run(command, args);
  const running = res.exitCode === 0 ? res.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean) : [];
  const required = [...requiredServices];
  const failed = required.filter((service) => !running.includes(service));
  return { required, running, failed };
};

const runSmokeChecksDefault = async (checks: SmokeCheck[], http: HttpClient): Promise<SmokeSummary> => {
  const results: SmokeResult[] = [];
  for (const check of checks) {
    try {
      const res = await http.get(check.url);
      const ok = check.validate ? check.validate(res) : res.status >= 200 && res.status < 400;
      results.push({ id: check.id, url: check.url, ok, status: res.status });
    } catch (err) {
      results.push({
        id: check.id,
        url: check.url,
        ok: false,
        detail: err instanceof Error ? err.message : 'request_failed'
      });
    }
  }
  const failed = results.filter((item) => !item.ok).map((item) => item.id);
  return { checks: results, failed };
};

const buildSummary = (partial: Partial<OrchestrationSummary>): OrchestrationSummary => ({
  envPath: partial.envPath ?? '',
  runtime: partial.runtime ?? null,
  runtimeSource: partial.runtimeSource ?? null,
  runtimesTried: partial.runtimesTried ?? [],
  command: partial.command ?? null,
  services: partial.services ?? null,
  smoke: partial.smoke ?? null,
  resultCode: partial.resultCode ?? 'local_stack_start_failed',
  requestedRuntime: partial.requestedRuntime,
  runtimeProbe: partial.runtimeProbe,
  session: partial.session
});

const selectRuntime = async (
  requested: LocalRuntime | null,
  deps: OrchestrationDeps,
  runtimesTried: LocalRuntime[]
): Promise<{
  runtime: LocalRuntime | null;
  runtimeSource: RuntimeSource | null;
  runtimeProbe: RuntimeProbeMap;
}> => {
  const probeRuntime = deps.probeRuntime ?? defaultProbeRuntime;
  const runtimeProbe: RuntimeProbeMap = {};
  const tryProbe = async (runtime: LocalRuntime) => {
    runtimesTried.push(runtime);
    const res = await probeRuntime(runtime, deps.runner);
    runtimeProbe[runtime] = res;
    return res;
  };

  if (requested) {
    const probe = await tryProbe(requested);
    return probe.ok
      ? { runtime: requested, runtimeSource: 'explicit', runtimeProbe }
      : { runtime: null, runtimeSource: 'explicit', runtimeProbe };
  }

  const dockerProbe = await tryProbe('docker');
  if (dockerProbe.ok) return { runtime: 'docker', runtimeSource: 'auto', runtimeProbe };

  const containerProbe = await tryProbe('container');
  if (containerProbe.ok) return { runtime: 'container', runtimeSource: 'auto', runtimeProbe };

  return { runtime: null, runtimeSource: 'auto', runtimeProbe };
};

const buildComposeCommand = (
  runtime: LocalRuntime,
  composePath: string,
  envPath: string,
  action: 'up' | 'down'
): CommandSpec => {
  if (runtime === 'docker') {
    const args = ['compose', '-f', composePath, '--env-file', envPath, action];
    if (action === 'up') args.push('-d', '--build');
    return { command: 'docker', args };
  }
  const args = ['-f', composePath, '--env-file', envPath, action];
  if (action === 'up') args.push('-d', '--build');
  return { command: 'container-compose', args };
};

const normalizePath = (value: string) => path.resolve(value);

export const runLocalStart = async (
  config: LocalStartConfig,
  deps: OrchestrationDeps = createDefaultDeps()
): Promise<OrchestrationSummary> => {
  const envPath = normalizePath(config.envPath);
  const composePath = normalizePath(config.composePath);
  const requestedRuntimeValue = config.runtime ?? null;
  const requestedRuntime = resolveRuntimeValue(requestedRuntimeValue);
  const requiredServices = config.requiredServices ?? REQUIRED_SERVICES;

  if (requestedRuntimeValue && !requestedRuntime) {
    return buildSummary({
      envPath,
      runtime: null,
      runtimeSource: 'explicit',
      runtimesTried: [],
      command: null,
      services: null,
      smoke: null,
      resultCode: 'local_runtime_unavailable',
      requestedRuntime: String(requestedRuntimeValue)
    });
  }

  const envCheck = validateEnvFile(envPath, deps);
  if (!envCheck.ok) {
    return buildSummary({
      envPath,
      runtime: null,
      runtimeSource: requestedRuntime ? 'explicit' : 'auto',
      runtimesTried: [],
      command: null,
      services: null,
      smoke: null,
      resultCode: 'local_env_missing'
    });
  }

  const runtimesTried: LocalRuntime[] = [];
  const selection = await selectRuntime(requestedRuntime, deps, runtimesTried);

  if (!selection.runtime) {
    return buildSummary({
      envPath,
      runtime: null,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command: null,
      services: null,
      smoke: null,
      resultCode: 'local_runtime_unavailable',
      requestedRuntime: requestedRuntimeValue ? String(requestedRuntimeValue) : undefined,
      runtimeProbe: selection.runtimeProbe
    });
  }

  const command = buildComposeCommand(selection.runtime, composePath, envPath, 'up');
  const startRes = await deps.runner.run(command.command, command.args);
  if (startRes.exitCode !== 0) {
    return buildSummary({
      envPath,
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command,
      services: null,
      smoke: null,
      resultCode: 'local_stack_start_failed',
      runtimeProbe: selection.runtimeProbe
    });
  }

  const listServices = deps.listRunningServices ?? listRunningServicesDefault;
  const services = await listServices(selection.runtime, composePath, envPath, deps.runner, requiredServices);
  if (services.failed.length > 0) {
    return buildSummary({
      envPath,
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command,
      services,
      smoke: null,
      resultCode: 'local_service_unhealthy',
      runtimeProbe: selection.runtimeProbe
    });
  }

  const smokeChecks = config.smokeChecks ?? DEFAULT_SMOKE_CHECKS;
  const smokeRunner = deps.smokeChecksRunner ?? runSmokeChecksDefault;
  const smoke = await smokeRunner(smokeChecks, deps.http);
  if (smoke.failed.length > 0) {
    return buildSummary({
      envPath,
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command,
      services,
      smoke,
      resultCode: 'local_smoke_failed',
      runtimeProbe: selection.runtimeProbe
    });
  }

  return buildSummary({
    envPath,
    runtime: selection.runtime,
    runtimeSource: selection.runtimeSource,
    runtimesTried,
    command,
    services,
    smoke,
    resultCode: 'ok',
    runtimeProbe: selection.runtimeProbe,
    session: {
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource ?? 'auto',
      runtimesTried: [...runtimesTried],
      envPath,
      composePath
    }
  });
};

export const runLocalDown = async (
  config: LocalDownConfig,
  deps: OrchestrationDeps = createDefaultDeps()
): Promise<OrchestrationSummary> => {
  const envPath = normalizePath(config.envPath);
  const composePath = normalizePath(config.composePath);
  const session = config.session ?? null;
  const requestedRuntimeValue = config.runtime ?? null;
  const requestedRuntime = resolveRuntimeValue(requestedRuntimeValue);
  const requiredServices = config.requiredServices ?? REQUIRED_SERVICES;

  if (session) {
    const sessionEnvPath = normalizePath(session.envPath);
    const sessionComposePath = normalizePath(session.composePath);
    if (sessionEnvPath !== envPath || sessionComposePath !== composePath) {
      return buildSummary({
        envPath,
        runtime: null,
        runtimeSource: 'explicit',
        runtimesTried: [],
        command: null,
        services: null,
        smoke: null,
        resultCode: 'local_runtime_unavailable',
        requestedRuntime: session.runtime
      });
    }
  }

  if (requestedRuntimeValue && !requestedRuntime) {
    return buildSummary({
      envPath,
      runtime: null,
      runtimeSource: 'explicit',
      runtimesTried: [],
      command: null,
      services: null,
      smoke: null,
      resultCode: 'local_runtime_unavailable',
      requestedRuntime: String(requestedRuntimeValue)
    });
  }

  const envCheck = validateEnvFile(envPath, deps);
  if (!envCheck.ok) {
    return buildSummary({
      envPath,
      runtime: null,
      runtimeSource: requestedRuntime ? 'explicit' : 'auto',
      runtimesTried: [],
      command: null,
      services: null,
      smoke: null,
      resultCode: 'local_env_missing'
    });
  }

  const runtimesTried: LocalRuntime[] = [];
  const selection = session
    ? {
        runtime: session.runtime,
        runtimeSource: session.runtimeSource,
        runtimeProbe: {} as RuntimeProbeMap
      }
    : await selectRuntime(requestedRuntime, deps, runtimesTried);

  if (session) {
    runtimesTried.push(...session.runtimesTried);
  }

  if (!selection.runtime) {
    return buildSummary({
      envPath,
      runtime: null,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command: null,
      services: null,
      smoke: null,
      resultCode: 'local_runtime_unavailable',
      requestedRuntime: requestedRuntimeValue ? String(requestedRuntimeValue) : undefined,
      runtimeProbe: selection.runtimeProbe
    });
  }

  const command = buildComposeCommand(selection.runtime, composePath, envPath, 'down');
  const downRes = await deps.runner.run(command.command, command.args);
  if (downRes.exitCode !== 0) {
    return buildSummary({
      envPath,
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command,
      services: null,
      smoke: null,
      resultCode: 'local_stack_start_failed',
      runtimeProbe: selection.runtimeProbe
    });
  }

  const listServices = deps.listRunningServices ?? listRunningServicesDefault;
  const services = await listServices(selection.runtime, composePath, envPath, deps.runner, requiredServices);
  if (services.running.length > 0) {
    return buildSummary({
      envPath,
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource,
      runtimesTried,
      command,
      services,
      smoke: null,
      resultCode: 'local_service_unhealthy',
      runtimeProbe: selection.runtimeProbe
    });
  }

  return buildSummary({
    envPath,
    runtime: selection.runtime,
    runtimeSource: selection.runtimeSource,
    runtimesTried,
    command,
    services,
    smoke: null,
    resultCode: 'ok',
    runtimeProbe: selection.runtimeProbe,
    session: session ?? {
      runtime: selection.runtime,
      runtimeSource: selection.runtimeSource ?? 'auto',
      runtimesTried: [...runtimesTried],
      envPath,
      composePath
    }
  });
};

export const serializeSummary = (summary: OrchestrationSummary): string => JSON.stringify(summary);
