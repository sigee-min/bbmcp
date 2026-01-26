import { Dispatcher } from '../types';
import { ProxyRouter } from '../proxy';
import { errorMessage, Logger } from '../logging';
import { SidecarHost } from './transport/SidecarHost';
import { SidecarLaunchConfig } from './types';
import { PLUGIN_ID } from '../config';
import { resolveRegisteredPluginPath } from '../adapters/blockbench/pluginRegistry';
import { DEFAULT_TOOL_PROFILE } from '../mcp/tools';

type NativeModuleLoader = (name: string, options?: { message?: string; optional?: boolean }) => unknown;
declare const requireNativeModule: NativeModuleLoader | undefined;

type PathModule = {
  basename?: (path: string) => string;
  dirname?: (path: string) => string;
  join?: (...parts: string[]) => string;
};

type ChildProcessModule = {
  spawn: (
    command: string,
    args: string[],
    options: { stdio: ['pipe', 'pipe', 'pipe']; windowsHide: boolean }
  ) => ChildProcessHandle;
  spawnSync?: (command: string, args: string[], options: { windowsHide: boolean }) => { status?: number | null };
};

type StdioReadable = {
  on(event: 'data', handler: (chunk: string | Uint8Array) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  on(event: 'end', handler: () => void): void;
};

type StdioWritable = {
  write: (data: string) => void;
};

type ChildProcessHandle = {
  stdin?: StdioWritable;
  stdout?: StdioReadable;
  stderr?: { on(event: 'data', handler: (chunk: string | Uint8Array) => void): void };
  pid?: number;
  kill?: () => void;
  on(event: 'exit', handler: (code: number | null, signal: string | null) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
};

const RESTART_INITIAL_DELAY_MS = 500;
const RESTART_MAX_DELAY_MS = 30_000;

export class SidecarProcess {
  private readonly config: SidecarLaunchConfig;
  private readonly dispatcher: Dispatcher;
  private readonly proxy: ProxyRouter;
  private readonly log: Logger;
  private child: ChildProcessHandle | null = null;
  private host: SidecarHost | null = null;
  private stopRequested = false;
  private restartDelayMs = RESTART_INITIAL_DELAY_MS;
  private disableRunAsNode = false;

  constructor(config: SidecarLaunchConfig, dispatcher: Dispatcher, proxy: ProxyRouter, log: Logger) {
    this.config = config;
    this.dispatcher = dispatcher;
    this.proxy = proxy;
    this.log = log;
  }

  start(): boolean {
    if (this.child) return true;
    this.stopRequested = false;
    this.restartDelayMs = RESTART_INITIAL_DELAY_MS;
    const validation = this.validateConfig();
    if (!validation.ok) {
      this.log.error('sidecar config invalid', { message: validation.message });
      return false;
    }

    const childProcess = requireNativeModule?.('child_process', {
      message: 'bbmcp needs permission to run a local MCP sidecar process.',
      optional: true
    });
    if (!isChildProcessModule(childProcess)) {
      this.log.warn('child_process not available; sidecar not started');
      return false;
    }

    const pathModule = requireNativeModule?.('path');
    if (!isPathModule(pathModule)) {
      this.log.warn('path module not available; sidecar not started');
      return false;
    }

    const sidecarPath = this.resolveSidecarPath(pathModule);
    if (!sidecarPath) {
      this.log.error('sidecar entry not found; expected bbmcp-sidecar.js near plugin');
      return false;
    }
    const execPath = this.resolveExecPath(childProcess);
    if (!execPath) {
      this.log.error('execPath unavailable; sidecar not started');
      return false;
    }

    const execBase = pathModule.basename?.(execPath)?.toLowerCase?.() ?? '';
    const useRunAsNode = !this.disableRunAsNode && execBase !== 'node' && execBase !== 'node.exe';
    const args = [
      ...(useRunAsNode ? ['--run-as-node'] : []),
      sidecarPath,
      '--host',
      this.config.host,
      '--port',
      String(this.config.port),
      '--path',
      this.config.path,
      '--tool-profile',
      this.config.toolProfile ?? DEFAULT_TOOL_PROFILE
    ];

    let child: ChildProcessHandle;
    try {
      child = childProcess.spawn(execPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error('sidecar spawn failed', { message });
      return false;
    }

    if (!child?.stdin || !child?.stdout) {
      this.log.error('sidecar stdio unavailable');
      child?.kill?.();
      return false;
    }

    this.child = child;
    this.host = new SidecarHost(child.stdout, child.stdin, this.dispatcher, this.proxy, this.log);
    const current = child;

    child.stderr?.on('data', (chunk: string | Uint8Array) => {
      const message = String(chunk).trim();
      if (message.length > 0) {
        if (message.includes('--run-as-node') && message.toLowerCase().includes('bad option')) {
          this.disableRunAsNode = true;
          this.log.warn('sidecar runtime rejected --run-as-node; retry without it');
        }
        this.log.warn('sidecar stderr', { message });
      }
    });
    child.on('exit', (code: number | null, signal: string | null) => {
      if (this.child !== current) return;
      this.cleanup();
      this.log.warn('sidecar exited', { code, signal });
      if (!this.stopRequested) {
        this.scheduleRestart();
      }
    });
    child.on('error', (err: Error) => {
      this.log.error('sidecar process error', { message: errorMessage(err) });
    });

    this.log.info('sidecar process spawned', { pid: child.pid });
    return true;
  }

  stop() {
    this.stopRequested = true;
    if (this.child?.kill) {
      this.child.kill();
    }
    this.cleanup();
  }

  private cleanup() {
    this.host?.dispose();
    this.host = null;
    this.child = null;
  }

  private scheduleRestart() {
    const delay = this.restartDelayMs;
    this.restartDelayMs = Math.min(this.restartDelayMs * 2, RESTART_MAX_DELAY_MS);
    const jitter = Math.round(delay * 0.2 * Math.random());
    const nextDelay = delay + jitter;
    setTimeout(() => {
      if (!this.stopRequested) {
        this.start();
      }
    }, nextDelay);
  }

  private validateConfig(): { ok: true } | { ok: false; message: string } {
    if (!this.config.host || typeof this.config.host !== 'string') {
      return { ok: false, message: 'host is required' };
    }
    const port = Number(this.config.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return { ok: false, message: 'port must be between 1 and 65535' };
    }
    if (!this.config.path || typeof this.config.path !== 'string') {
      return { ok: false, message: 'path is required' };
    }
    if (!this.config.path.startsWith('/')) {
      return { ok: false, message: 'path must start with /' };
    }
    return { ok: true };
  }

  private resolveSidecarPath(pathModule: PathModule): string | null {
    const pluginPath = resolveRegisteredPluginPath(PLUGIN_ID);
    if (!pluginPath || !pathModule?.dirname || !pathModule?.join) return null;
    return pathModule.join(pathModule.dirname(pluginPath), 'bbmcp-sidecar.js');
  }

  private resolveExecPath(childProcess: ChildProcessModule): string | null {
    const override = this.config.execPath?.trim();
    if (override) return override;
    try {
      if (typeof process !== 'undefined' && process?.execPath) {
        return process.execPath as string;
      }
    } catch (err) {
      /* ignore */
    }
    if (childProcess?.spawnSync) {
      const probe = childProcess.spawnSync('node', ['-v'], { windowsHide: true });
      if (probe?.status === 0) {
        return 'node';
      }
    }
    return null;
  }
}

function isChildProcessModule(value: unknown): value is ChildProcessModule {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { spawn?: unknown }).spawn === 'function';
}

function isPathModule(value: unknown): value is PathModule {
  if (!value || typeof value !== 'object') return false;
  const mod = value as { join?: unknown; dirname?: unknown };
  return typeof mod.join === 'function' && typeof mod.dirname === 'function';
}
