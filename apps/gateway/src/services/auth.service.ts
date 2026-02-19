import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  toAutoProvisionedWorkspaceId,
  toAutoProvisionedWorkspaceName,
  type AccountRecord,
  type PersistencePorts
} from '@ashfox/backend-core';
import type { FastifyRequest } from 'fastify';
import { GatewayConfigService } from './gateway-config.service';
import { GATEWAY_LOGGER, GATEWAY_PERSISTENCE_PORTS } from '../tokens';
import { DEFAULT_TENANT_ID, type GatewaySystemRole } from '../gatewayDashboardHelpers';
import type { ConsoleLogger } from '@ashfox/runtime/logging';

const ADMIN_ACCOUNT_ID = 'admin';
const ADMIN_DEFAULT_PASSWORD = 'admin';
const DEFAULT_ADMIN_ROLE_ID = 'role_workspace_admin';
const DEFAULT_USER_ROLE_ID = 'role_user';
const DEFAULT_WORKSPACE_ID = 'ws_default';
const JWT_ALGORITHM = 'HS256';
const GITHUB_STATE_TTL_SEC = 600;
const PASSWORD_HASH_SCHEME = 'scrypt-v1';
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

type SessionTokenPayload = {
  sub: string;
  roles: GatewaySystemRole[];
  iat: number;
  exp: number;
};

type GithubStatePayload = {
  nonce: string;
  redirectPath: string;
  exp: number;
};

type GitHubAccessTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id?: number;
  login?: string;
  name?: string;
  email?: string | null;
};

type GitHubEmailResponse = Array<{
  email?: string;
  primary?: boolean;
  verified?: boolean;
}>;

export class AuthServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type SessionUser = {
  accountId: string;
  displayName: string;
  email: string;
  systemRoles: GatewaySystemRole[];
  localLoginId: string | null;
  githubLogin: string | null;
  hasPassword: boolean;
  canSetPassword: boolean;
};

export type UpdateLocalCredentialInput = {
  loginId?: string;
  password?: string;
  passwordConfirm?: string;
};

const encodeBase64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const decodeBase64Url = (value: string): string | null => {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

const parseJson = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const toSystemRoles = (roles: readonly string[] | undefined): GatewaySystemRole[] => {
  const deduped = new Set<GatewaySystemRole>();
  for (const role of roles ?? []) {
    if (role === 'system_admin' || role === 'cs_admin') {
      deduped.add(role);
    }
  }
  return [...deduped];
};

const hasSystemRole = (roles: readonly string[] | undefined): boolean => {
  const normalizedRoles = toSystemRoles(roles);
  return normalizedRoles.includes('system_admin') || normalizedRoles.includes('cs_admin');
};

const readHeaderValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return readHeaderValue(value[0]);
  }
  return '';
};

const parseCookieHeader = (value: string): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const segment of value.split(';')) {
    const [name, ...rest] = segment.split('=');
    const normalizedName = name?.trim();
    if (!normalizedName) {
      continue;
    }
    output[normalizedName] = decodeURIComponent(rest.join('=').trim());
  }
  return output;
};

const normalizeLoginId = (value: string): string => value.trim().toLowerCase();

const sanitizeRedirectPath = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }
  return trimmed;
};

const toSessionUser = (account: AccountRecord): SessionUser => ({
  accountId: account.accountId,
  displayName: account.displayName,
  email: account.email,
  systemRoles: toSystemRoles(account.systemRoles),
  localLoginId: account.localLoginId ?? null,
  githubLogin: account.githubLogin ?? null,
  hasPassword: Boolean(account.passwordHash),
  canSetPassword: Boolean(account.githubUserId)
});

const getPrimaryGithubEmail = (emails: GitHubEmailResponse): string | null => {
  const primaryVerified = emails.find((entry) => entry.primary === true && entry.verified !== false && typeof entry.email === 'string');
  if (primaryVerified?.email) {
    return primaryVerified.email;
  }
  const anyVerified = emails.find((entry) => entry.verified !== false && typeof entry.email === 'string');
  if (anyVerified?.email) {
    return anyVerified.email;
  }
  return null;
};

const safeEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: GatewayConfigService,
    @Inject(GATEWAY_PERSISTENCE_PORTS) private readonly persistence: PersistencePorts,
    @Inject(GATEWAY_LOGGER) private readonly logger: ConsoleLogger
  ) {}

  isGithubEnabled(): boolean {
    return Boolean(this.config.runtime.auth.githubClientId && this.config.runtime.auth.githubClientSecret);
  }

  getDefaultPostLoginRedirectPath(): string {
    return this.config.runtime.auth.postLoginRedirectPath;
  }

  async ensureBootstrapAdmin(): Promise<void> {
    const repository = this.persistence.workspaceRepository;
    const now = new Date().toISOString();
    const existing = await repository.getAccount(ADMIN_ACCOUNT_ID);
    const ensuredRoles = toSystemRoles(existing?.systemRoles ?? ['system_admin']);
    const nextAccount: AccountRecord = {
      accountId: ADMIN_ACCOUNT_ID,
      email: existing?.email?.trim() || 'admin@ashfox.local',
      displayName: existing?.displayName?.trim() || 'Administrator',
      systemRoles: ensuredRoles.includes('system_admin') ? ensuredRoles : ['system_admin', ...ensuredRoles],
      localLoginId: normalizeLoginId(existing?.localLoginId ?? ADMIN_ACCOUNT_ID),
      passwordHash: existing?.passwordHash ?? this.hashPassword(ADMIN_DEFAULT_PASSWORD),
      githubUserId: existing?.githubUserId ?? null,
      githubLogin: existing?.githubLogin ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await repository.upsertAccount(nextAccount);

    const workspace = await repository.getWorkspace(DEFAULT_WORKSPACE_ID);
    if (workspace) {
      await repository.upsertWorkspaceMember({
        workspaceId: DEFAULT_WORKSPACE_ID,
        accountId: ADMIN_ACCOUNT_ID,
        roleIds: [DEFAULT_ADMIN_ROLE_ID],
        joinedAt: now
      });
    }
    await this.ensureAutoProvisionedWorkspace(nextAccount, now);
  }

  serializeSessionCookie(token: string): string {
    return this.serializeCookie(this.config.runtime.auth.cookieName, token, {
      maxAgeSec: this.config.runtime.auth.tokenTtlSec
    });
  }

  serializeLogoutCookie(): string {
    return this.serializeCookie(this.config.runtime.auth.cookieName, '', { maxAgeSec: 0 });
  }

  applyActorHeaders(headers: Record<string, unknown>, user: SessionUser): void {
    headers['x-ashfox-account-id'] = user.accountId;
    headers['x-ashfox-system-roles'] = user.systemRoles.join(',');
  }

  async authenticateFromHeaders(headers: Record<string, unknown>): Promise<SessionUser | null> {
    const token = this.extractTokenFromHeaders(headers);
    if (!token) {
      return null;
    }
    const payload = this.verifyToken(token);
    if (!payload) {
      return null;
    }
    const account = await this.persistence.workspaceRepository.getAccount(payload.sub);
    if (!account) {
      return null;
    }
    await this.ensureAutoProvisionedWorkspace(account, new Date().toISOString());
    return toSessionUser(account);
  }

  async loginWithPassword(loginId: string, password: string): Promise<{ token: string; user: SessionUser }> {
    const normalizedLoginId = normalizeLoginId(loginId);
    this.assertValidLoginId(normalizedLoginId);
    if (password.length === 0) {
      throw new AuthServiceError('invalid_credentials', '비밀번호를 입력해주세요.', 400);
    }

    const account = await this.persistence.workspaceRepository.getAccountByLocalLoginId(normalizedLoginId);
    if (!account || !account.passwordHash) {
      throw new AuthServiceError('invalid_credentials', '아이디 또는 비밀번호가 올바르지 않습니다.', 401);
    }
    if (!this.verifyPassword(password, account.passwordHash)) {
      throw new AuthServiceError('invalid_credentials', '아이디 또는 비밀번호가 올바르지 않습니다.', 401);
    }

    const now = new Date().toISOString();
    const updated: AccountRecord = {
      ...account,
      localLoginId: normalizedLoginId,
      updatedAt: now
    };
    await this.persistence.workspaceRepository.upsertAccount(updated);
    await this.ensureAutoProvisionedWorkspace(updated, now);

    const token = this.issueToken(updated);
    return {
      token,
      user: toSessionUser(updated)
    };
  }

  async registerLocalCredential(
    accountId: string,
    loginId: string,
    password: string
  ): Promise<{ token: string; user: SessionUser }> {
    return this.updateLocalCredential(accountId, {
      loginId,
      password,
      passwordConfirm: password
    });
  }

  async updateLocalCredential(
    accountId: string,
    input: UpdateLocalCredentialInput
  ): Promise<{ token: string; user: SessionUser }> {
    const repository = this.persistence.workspaceRepository;
    const account = await repository.getAccount(accountId);
    if (!account) {
      throw new AuthServiceError('account_not_found', '사용자 계정을 찾을 수 없습니다.', 404);
    }

    const hasLoginIdInput = typeof input.loginId === 'string';
    const hasPasswordInput = typeof input.password === 'string';
    if (!hasLoginIdInput && !hasPasswordInput) {
      throw new AuthServiceError('no_changes', '변경할 로그인 정보가 없습니다.', 400);
    }

    let nextLoginId = account.localLoginId ?? null;
    if (hasLoginIdInput) {
      const normalizedLoginId = normalizeLoginId(input.loginId ?? '');
      this.assertValidLoginId(normalizedLoginId);

      const loginOwner = await repository.getAccountByLocalLoginId(normalizedLoginId);
      if (loginOwner && loginOwner.accountId !== account.accountId) {
        throw new AuthServiceError('login_id_conflict', '이미 사용 중인 로그인 아이디입니다.', 409);
      }
      nextLoginId = normalizedLoginId;
    }

    let nextPasswordHash = account.passwordHash ?? null;
    if (hasPasswordInput) {
      const nextPassword = input.password ?? '';
      const passwordConfirm = input.passwordConfirm;
      if (typeof passwordConfirm !== 'string' || nextPassword !== passwordConfirm) {
        throw new AuthServiceError('password_mismatch', '비밀번호 확인이 일치하지 않습니다.', 400);
      }
      this.assertValidPassword(nextPassword);
      nextPasswordHash = this.hashPassword(nextPassword);
    }

    const loginUnchanged = nextLoginId === (account.localLoginId ?? null);
    const passwordUnchanged = nextPasswordHash === (account.passwordHash ?? null);
    if (loginUnchanged && passwordUnchanged) {
      await this.ensureAutoProvisionedWorkspace(account, new Date().toISOString());
      return {
        token: this.issueToken(account),
        user: toSessionUser(account)
      };
    }

    const next: AccountRecord = {
      ...account,
      localLoginId: nextLoginId,
      passwordHash: nextPasswordHash,
      updatedAt: new Date().toISOString()
    };
    await repository.upsertAccount(next);
    await this.ensureAutoProvisionedWorkspace(next, new Date().toISOString());

    return {
      token: this.issueToken(next),
      user: toSessionUser(next)
    };
  }

  async buildGithubAuthorizeUrl(request: FastifyRequest, redirectPath: unknown): Promise<string> {
    const githubClientId = this.config.runtime.auth.githubClientId;
    const githubClientSecret = this.config.runtime.auth.githubClientSecret;
    if (!githubClientId || !githubClientSecret) {
      throw new AuthServiceError('github_not_configured', 'GitHub 로그인이 설정되지 않았습니다.', 503);
    }

    const normalizedRedirectPath = sanitizeRedirectPath(redirectPath, this.config.runtime.auth.postLoginRedirectPath);
    const callbackUrl = this.resolveGithubCallbackUrl(request);
    const state = this.issueGithubStateToken({
      nonce: randomUUID(),
      redirectPath: normalizedRedirectPath,
      exp: Math.floor(Date.now() / 1000) + GITHUB_STATE_TTL_SEC
    });
    const query = new URLSearchParams({
      client_id: githubClientId,
      redirect_uri: callbackUrl,
      scope: this.config.runtime.auth.githubScopes,
      state
    });
    return `https://github.com/login/oauth/authorize?${query.toString()}`;
  }

  async completeGithubCallback(
    request: FastifyRequest,
    code: string,
    stateToken: string
  ): Promise<{ token: string; user: SessionUser; redirectPath: string }> {
    const githubClientId = this.config.runtime.auth.githubClientId;
    const githubClientSecret = this.config.runtime.auth.githubClientSecret;
    if (!githubClientId || !githubClientSecret) {
      throw new AuthServiceError('github_not_configured', 'GitHub 로그인이 설정되지 않았습니다.', 503);
    }
    const state = this.verifyGithubStateToken(stateToken);
    if (!state) {
      throw new AuthServiceError('invalid_state', 'GitHub 인증 상태가 만료되었거나 유효하지 않습니다.', 400);
    }
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new AuthServiceError('invalid_code', 'GitHub 인증 코드가 없습니다.', 400);
    }

    const callbackUrl = this.resolveGithubCallbackUrl(request);
    const accessToken = await this.exchangeGithubCode({
      code: code.trim(),
      callbackUrl,
      githubClientId,
      githubClientSecret,
      stateToken
    });
    const githubUser = await this.readGithubUser(accessToken);

    const githubUserId = typeof githubUser.id === 'number' ? String(githubUser.id) : '';
    if (!githubUserId) {
      throw new AuthServiceError('github_profile_invalid', 'GitHub 사용자 정보를 확인할 수 없습니다.', 502);
    }

    const repository = this.persistence.workspaceRepository;
    const existing = await repository.getAccountByGithubUserId(githubUserId);
    const now = new Date().toISOString();
    const email = (githubUser.email ?? '').trim() || (await this.readGithubEmail(accessToken)) || `${githubUserId}@users.noreply.github.com`;
    const displayName = (githubUser.name ?? '').trim() || (githubUser.login ?? '').trim() || `GitHub User ${githubUserId}`;
    const githubLogin = (githubUser.login ?? '').trim() || null;

    const account: AccountRecord = existing
      ? {
          ...existing,
          email,
          displayName,
          githubUserId,
          githubLogin,
          updatedAt: now
        }
      : {
          accountId: `gh_${githubUserId}`,
          email,
          displayName,
          systemRoles: [],
          localLoginId: null,
          passwordHash: null,
          githubUserId,
          githubLogin,
          createdAt: now,
          updatedAt: now
        };

    await repository.upsertAccount(account);
    await this.ensureAutoProvisionedWorkspace(account, now);

    return {
      token: this.issueToken(account),
      user: toSessionUser(account),
      redirectPath: state.redirectPath
    };
  }

  private async ensureAutoProvisionedWorkspace(account: AccountRecord, now: string): Promise<void> {
    const repository = this.persistence.workspaceRepository;
    const workspaceId = toAutoProvisionedWorkspaceId(account.accountId);
    const workspace = await repository.getWorkspace(workspaceId);
    if (!workspace) {
      await repository.upsertWorkspace({
        workspaceId,
        tenantId: DEFAULT_TENANT_ID,
        name: toAutoProvisionedWorkspaceName(account.displayName),
        mode: 'all_open',
        createdBy: account.accountId,
        createdAt: now,
        updatedAt: now
      });
    }

    await repository.upsertWorkspaceRole({
      workspaceId,
      roleId: DEFAULT_ADMIN_ROLE_ID,
      name: 'Workspace Admin',
      builtin: 'workspace_admin',
      permissions: [
        'workspace.read',
        'workspace.settings.manage',
        'workspace.members.manage',
        'workspace.roles.manage',
        'folder.read',
        'folder.write',
        'project.read',
        'project.write'
      ],
      createdAt: now,
      updatedAt: now
    });
    await repository.upsertWorkspaceRole({
      workspaceId,
      roleId: DEFAULT_USER_ROLE_ID,
      name: 'User',
      builtin: 'user',
      permissions: ['workspace.read', 'folder.read', 'folder.write', 'project.read', 'project.write'],
      createdAt: now,
      updatedAt: now
    });

    const members = await repository.listWorkspaceMembers(workspaceId);
    const member = members.find((entry) => entry.accountId === account.accountId);
    const expectedRoleIds = hasSystemRole(account.systemRoles) ? [DEFAULT_ADMIN_ROLE_ID] : [DEFAULT_USER_ROLE_ID];
    if (!member || member.roleIds.join(',') !== expectedRoleIds.join(',')) {
      await repository.upsertWorkspaceMember({
        workspaceId,
        accountId: account.accountId,
        roleIds: expectedRoleIds,
        joinedAt: member?.joinedAt ?? now
      });
    }
  }

  private serializeCookie(
    name: string,
    value: string,
    options: {
      maxAgeSec: number;
    }
  ): string {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (this.config.runtime.auth.cookieSecure) {
      parts.push('Secure');
    }
    parts.push(`Max-Age=${Math.max(0, Math.trunc(options.maxAgeSec))}`);
    return parts.join('; ');
  }

  private issueToken(account: AccountRecord): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionTokenPayload = {
      sub: account.accountId,
      roles: toSystemRoles(account.systemRoles),
      iat: now,
      exp: now + this.config.runtime.auth.tokenTtlSec
    };
    return this.signJwt(payload);
  }

  private extractTokenFromHeaders(headers: Record<string, unknown>): string | null {
    const authorization = readHeaderValue(headers.authorization);
    if (authorization.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim();
      if (token) {
        return token;
      }
    }
    const cookieRaw = readHeaderValue(headers.cookie);
    if (!cookieRaw) {
      return null;
    }
    const cookies = parseCookieHeader(cookieRaw);
    const token = cookies[this.config.runtime.auth.cookieName];
    return token && token.trim().length > 0 ? token.trim() : null;
  }

  private signJwt(payload: SessionTokenPayload): string {
    const encodedHeader = encodeBase64Url(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' }));
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', this.config.runtime.auth.jwtSecret).update(unsignedToken).digest('base64url');
    return `${unsignedToken}.${signature}`;
  }

  private verifyToken(token: string): SessionTokenPayload | null {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', this.config.runtime.auth.jwtSecret).update(unsignedToken).digest('base64url');
    if (!safeEquals(expectedSignature, signature)) {
      return null;
    }

    const header = parseJson<{ alg?: string; typ?: string }>(decodeBase64Url(encodedHeader));
    if (!header || header.alg !== JWT_ALGORITHM || header.typ !== 'JWT') {
      return null;
    }
    const payload = parseJson<SessionTokenPayload>(decodeBase64Url(encodedPayload));
    if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }
    return payload;
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('base64url');
    const digest = scryptSync(password, salt, 64).toString('base64url');
    return `${PASSWORD_HASH_SCHEME}$${salt}$${digest}`;
  }

  private verifyPassword(password: string, passwordHash: string): boolean {
    const [scheme, salt, digest] = passwordHash.split('$');
    if (scheme !== PASSWORD_HASH_SCHEME || !salt || !digest) {
      return false;
    }
    const candidate = scryptSync(password, salt, 64).toString('base64url');
    return safeEquals(candidate, digest);
  }

  private assertValidLoginId(loginId: string): void {
    if (!LOGIN_ID_PATTERN.test(loginId)) {
      throw new AuthServiceError('invalid_login_id', '로그인 아이디는 3~32자의 영문 소문자/숫자/._- 만 사용할 수 있습니다.', 400);
    }
  }

  private assertValidPassword(password: string): void {
    if (password.length < 8) {
      throw new AuthServiceError('invalid_password', '비밀번호는 8자 이상이어야 합니다.', 400);
    }
  }

  private signValue(value: string): string {
    return createHmac('sha256', this.config.runtime.auth.jwtSecret).update(value).digest('base64url');
  }

  private issueGithubStateToken(payload: GithubStatePayload): string {
    const body = encodeBase64Url(JSON.stringify(payload));
    const signature = this.signValue(body);
    return `${body}.${signature}`;
  }

  private verifyGithubStateToken(token: string): GithubStatePayload | null {
    const [body, signature] = token.split('.');
    if (!body || !signature) {
      return null;
    }
    if (!safeEquals(this.signValue(body), signature)) {
      return null;
    }
    const payload = parseJson<GithubStatePayload>(decodeBase64Url(body));
    if (!payload || typeof payload.redirectPath !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  }

  private resolveGithubCallbackUrl(request: FastifyRequest): string {
    const configured = this.config.runtime.auth.githubCallbackUrl;
    if (configured) {
      return configured;
    }
    const host = readHeaderValue(request.headers.host) || this.config.runtime.host;
    const forwardedProto = readHeaderValue(request.headers['x-forwarded-proto']);
    const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${protocol}://${host}/api/auth/github/callback`;
  }

  private async exchangeGithubCode(input: {
    code: string;
    callbackUrl: string;
    githubClientId: string;
    githubClientSecret: string;
    stateToken: string;
  }): Promise<string> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ashfox-gateway'
      },
      body: JSON.stringify({
        client_id: input.githubClientId,
        client_secret: input.githubClientSecret,
        code: input.code,
        redirect_uri: input.callbackUrl,
        state: input.stateToken
      })
    });
    if (!response.ok) {
      throw new AuthServiceError('github_exchange_failed', 'GitHub 토큰 교환에 실패했습니다.', 502);
    }
    const payload = (await response.json()) as GitHubAccessTokenResponse;
    if (!payload.access_token) {
      this.logger.warn('github access token missing', {
        error: payload.error,
        errorDescription: payload.error_description
      });
      throw new AuthServiceError('github_exchange_failed', 'GitHub 토큰 교환에 실패했습니다.', 502);
    }
    return payload.access_token;
  }

  private async readGithubUser(accessToken: string): Promise<GitHubUserResponse> {
    const response = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': 'ashfox-gateway'
      }
    });
    if (!response.ok) {
      throw new AuthServiceError('github_profile_failed', 'GitHub 사용자 정보를 불러오지 못했습니다.', 502);
    }
    return (await response.json()) as GitHubUserResponse;
  }

  private async readGithubEmail(accessToken: string): Promise<string | null> {
    const response = await fetch('https://api.github.com/user/emails', {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': 'ashfox-gateway'
      }
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as GitHubEmailResponse;
    if (!Array.isArray(payload)) {
      return null;
    }
    return getPrimaryGithubEmail(payload);
  }
}
