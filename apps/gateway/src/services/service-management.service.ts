import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  normalizeSystemRoles,
  type AccountRecord,
  type ServiceApiKeyRecord,
  type ServiceGithubAuthSettingsRecord,
  type ServiceSearchMatchMode,
  type ServiceSettingsRecord,
  type ServiceSmtpSettingsRecord,
  type ServiceUsersSearchField,
  type ServiceWorkspacesSearchField,
  type WorkspaceMemberRecord,
  type SystemRole,
  type WorkspaceRecord
} from '@ashfox/backend-core';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import { DEFAULT_AUTH_GITHUB_SCOPES } from '../constants';
import type { CreateServiceApiKeyDto } from '../dto/create-service-api-key.dto';
import type { RevokeServiceApiKeyDto } from '../dto/revoke-service-api-key.dto';
import type { SetServiceAccountRolesDto } from '../dto/set-service-account-roles.dto';
import type { ServiceUsersQueryDto } from '../dto/service-users-query.dto';
import type { ServiceWorkspacesQueryDto } from '../dto/service-workspaces-query.dto';
import type { UpsertServiceGithubAuthSettingsDto } from '../dto/upsert-service-github-auth-settings.dto';
import type { UpsertServiceSmtpSettingsDto } from '../dto/upsert-service-smtp-settings.dto';
import { forbiddenPlan, jsonPlan, resolveActorContext } from '../gatewayDashboardHelpers';
import { WorkspacePolicyService } from '../security/workspace-policy.service';
import { hashApiKeySecret } from '../security/apiKeySecrets';
import { GatewayConfigService } from './gateway-config.service';
import { GatewayRuntimeService } from './gateway-runtime.service';

const MIN_SYSTEM_ADMIN_COUNT = 1;
const SECRET_ENCRYPTION_VERSION = 'v1';
const SECRET_ALGORITHM = 'aes-256-gcm';
const MAX_SERVICE_API_KEYS_PER_ACCOUNT = 10;

type ServiceActor = {
  accountId: string;
  systemRoles: Array<'system_admin' | 'cs_admin'>;
};
export type ServiceManagementActor = ServiceActor;

const toNullable = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toServiceActor = (request: FastifyRequest): ServiceActor => resolveActorContext(request.headers as Record<string, unknown>);

const normalizeServiceActor = (actor: ServiceManagementActor): ServiceActor => {
  const accountId = actor.accountId.trim();
  const systemRoles = normalizeSystemRoles(actor.systemRoles).filter(
    (role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin'
  );
  return {
    accountId,
    systemRoles
  };
};

const hasSystemAdminRole = (roles: readonly string[]): boolean => roles.includes('system_admin');
const DEFAULT_SERVICE_LIST_LIMIT = 100;

const toOptionalQuery = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeServiceApiKeyExpiresAt = (value: unknown): string | null | 'invalid' => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return 'invalid';
  }
  return parsed.toISOString();
};

const normalizeServiceListLimit = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 25;
  }
  return Math.min(Math.max(Math.trunc(value), 1), DEFAULT_SERVICE_LIST_LIMIT);
};

const normalizeServiceSearchMatch = (value: unknown): ServiceSearchMatchMode => {
  if (value === 'exact' || value === 'prefix' || value === 'contains') {
    return value;
  }
  return 'contains';
};

@Injectable()
export class ServiceManagementService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly workspacePolicy: WorkspacePolicyService,
    private readonly config: GatewayConfigService
  ) {}

  private createDefaultServiceSettings(updatedBy: string, now = new Date().toISOString()): ServiceSettingsRecord {
    const normalizedUpdatedBy = updatedBy.trim() || 'system';
    const smtp: ServiceSmtpSettingsRecord = {
      enabled: false,
      host: null,
      port: null,
      secure: false,
      username: null,
      passwordEncrypted: null,
      fromEmail: null,
      fromName: null,
      updatedBy: normalizedUpdatedBy,
      updatedAt: now
    };
    const githubAuth: ServiceGithubAuthSettingsRecord = {
      enabled: false,
      clientId: null,
      clientSecretEncrypted: null,
      callbackUrl: null,
      scopes: DEFAULT_AUTH_GITHUB_SCOPES,
      updatedBy: normalizedUpdatedBy,
      updatedAt: now
    };
    return {
      smtp,
      githubAuth,
      createdAt: now,
      updatedAt: now
    };
  }

  private resolveEncryptionKey(): Buffer {
    const auth = this.config.getAuthConfig();
    return createHash('sha256').update(`ashfox-service-settings:${auth.jwtSecret}`).digest();
  }

  private encryptSecret(value: string): string {
    const key = this.resolveEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(SECRET_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${SECRET_ENCRYPTION_VERSION}.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decryptSecret(value: string | null | undefined): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    const [version, ivEncoded, tagEncoded, payloadEncoded] = value.split('.');
    if (version !== SECRET_ENCRYPTION_VERSION || !ivEncoded || !tagEncoded || !payloadEncoded) {
      return null;
    }
    try {
      const key = this.resolveEncryptionKey();
      const decipher = createDecipheriv(SECRET_ALGORITHM, key, Buffer.from(ivEncoded, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(payloadEncoded, 'base64url')), decipher.final()]);
      const normalized = decrypted.toString('utf8').trim();
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }

  private ensureServiceAccess(actor: ServiceActor): ResponsePlan | null {
    if (this.workspacePolicy.isSystemManager(actor)) {
      return null;
    }
    return forbiddenPlan('서비스 관리는 시스템 관리자 또는 CS 관리자만 접근할 수 있습니다.', 'forbidden_service_management');
  }

  private ensureSystemAdmin(actor: ServiceActor): ResponsePlan | null {
    if (hasSystemAdminRole(actor.systemRoles)) {
      return null;
    }
    return forbiddenPlan('해당 작업은 시스템 관리자 권한이 필요합니다.', 'forbidden_system_admin_required');
  }

  private async readServiceSettings(accountId: string): Promise<ServiceSettingsRecord> {
    const existing = await this.runtime.persistence.workspaceRepository.getServiceSettings();
    if (existing) {
      return existing;
    }
    return this.createDefaultServiceSettings(accountId);
  }

  private toServiceUserPayload(account: AccountRecord) {
    return {
      accountId: account.accountId,
      displayName: account.displayName,
      email: account.email,
      localLoginId: account.localLoginId ?? null,
      githubLogin: account.githubLogin ?? null,
      systemRoles: normalizeSystemRoles(account.systemRoles),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  }

  private toServiceWorkspacePayload(workspace: WorkspaceRecord) {
    return {
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      defaultMemberRoleId: workspace.defaultMemberRoleId,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    };
  }

  private toServiceConfigPayload(settings: ServiceSettingsRecord) {
    return {
      smtp: {
        enabled: settings.smtp.enabled,
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        username: settings.smtp.username,
        fromEmail: settings.smtp.fromEmail,
        fromName: settings.smtp.fromName,
        hasPassword: Boolean(settings.smtp.passwordEncrypted),
        updatedBy: settings.smtp.updatedBy,
        updatedAt: settings.smtp.updatedAt
      },
      githubAuth: {
        enabled: settings.githubAuth.enabled,
        clientId: settings.githubAuth.clientId,
        callbackUrl: settings.githubAuth.callbackUrl,
        scopes: settings.githubAuth.scopes,
        hasClientSecret: Boolean(settings.githubAuth.clientSecretEncrypted),
        updatedBy: settings.githubAuth.updatedBy,
        updatedAt: settings.githubAuth.updatedAt
      },
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt
    };
  }

  private toServiceApiKeyPayload(record: ServiceApiKeyRecord) {
    return {
      keyId: record.keyId,
      name: record.name,
      keyPrefix: record.keyPrefix,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastUsedAt: record.lastUsedAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt
    };
  }

  private applyGithubRuntimeSettings(settings: ServiceSettingsRecord): void {
    const secret = this.decryptSecret(settings.githubAuth.clientSecretEncrypted);
    this.config.applyAuthConfigOverrides({
      githubEnabled: settings.githubAuth.enabled,
      githubClientId: settings.githubAuth.clientId ?? undefined,
      githubClientSecret: secret ?? undefined,
      githubCallbackUrl: settings.githubAuth.callbackUrl ?? undefined,
      githubScopes: settings.githubAuth.scopes || DEFAULT_AUTH_GITHUB_SCOPES
    });
  }

  private normalizeSystemRoleInput(input: readonly string[] | undefined): SystemRole[] {
    return normalizeSystemRoles(input);
  }

  async bootstrapRuntimeSettings(): Promise<void> {
    const repository = this.runtime.persistence.workspaceRepository;
    const existing = await repository.getServiceSettings();
    if (existing) {
      this.applyGithubRuntimeSettings(existing);
      return;
    }

    const auth = this.config.getAuthConfig();
    const now = new Date().toISOString();
    const seeded = this.createDefaultServiceSettings('system', now);
    seeded.githubAuth.enabled = Boolean(auth.githubEnabled !== false && auth.githubClientId && auth.githubClientSecret);
    seeded.githubAuth.clientId = auth.githubClientId ?? null;
    seeded.githubAuth.clientSecretEncrypted = auth.githubClientSecret ? this.encryptSecret(auth.githubClientSecret) : null;
    seeded.githubAuth.callbackUrl = auth.githubCallbackUrl ?? null;
    seeded.githubAuth.scopes = auth.githubScopes || DEFAULT_AUTH_GITHUB_SCOPES;
    seeded.githubAuth.updatedBy = 'system';
    seeded.githubAuth.updatedAt = now;
    seeded.updatedAt = now;

    await repository.upsertServiceSettings(seeded);
    this.applyGithubRuntimeSettings(seeded);
  }

  async listServiceWorkspaces(request: FastifyRequest, query?: ServiceWorkspacesQueryDto): Promise<ResponsePlan> {
    return this.listServiceWorkspacesByActor(toServiceActor(request), query);
  }

  async listServiceWorkspacesByActor(
    actorInput: ServiceManagementActor,
    query?: ServiceWorkspacesQueryDto
  ): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const denyPlan = this.ensureServiceAccess(actor);
    if (denyPlan) {
      return denyPlan;
    }
    const normalizedLimit = normalizeServiceListLimit(query?.limit);
    const normalizedQuery = toOptionalQuery(query?.q);
    const normalizedField: ServiceWorkspacesSearchField = query?.field ?? 'any';
    const normalizedMatch = normalizeServiceSearchMatch(query?.match);
    const normalizedCursor = toOptionalQuery(query?.cursor);
    const normalizedMemberAccountId = toOptionalQuery(query?.memberAccountId);

    const repository = this.runtime.persistence.workspaceRepository;
    const searchResult = await repository.searchServiceWorkspaces({
      q: normalizedQuery ?? undefined,
      field: normalizedField,
      match: normalizedMatch,
      memberAccountId: normalizedMemberAccountId ?? undefined,
      limit: normalizedLimit,
      cursor: normalizedCursor
    });

    return jsonPlan(200, {
      ok: true,
      actor,
      workspaces: searchResult.workspaces.map((workspace: WorkspaceRecord) => this.toServiceWorkspacePayload(workspace)),
      search: {
        q: normalizedQuery,
        field: normalizedField,
        match: normalizedMatch,
        limit: normalizedLimit,
        cursor: normalizedCursor,
        nextCursor: searchResult.nextCursor,
        total: searchResult.total,
        memberAccountId: normalizedMemberAccountId
      }
    });
  }

  async listServiceUsers(request: FastifyRequest, query?: ServiceUsersQueryDto): Promise<ResponsePlan> {
    return this.listServiceUsersByActor(toServiceActor(request), query);
  }

  async listServiceUsersByActor(
    actorInput: ServiceManagementActor,
    query?: ServiceUsersQueryDto
  ): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const denyPlan = this.ensureServiceAccess(actor);
    if (denyPlan) {
      return denyPlan;
    }
    const normalizedLimit = normalizeServiceListLimit(query?.limit);
    const normalizedQuery = toOptionalQuery(query?.q);
    const normalizedField: ServiceUsersSearchField = query?.field ?? 'any';
    const normalizedMatch = normalizeServiceSearchMatch(query?.match);
    const normalizedCursor = toOptionalQuery(query?.cursor);
    const normalizedWorkspaceId = toOptionalQuery(query?.workspaceId);

    const repository = this.runtime.persistence.workspaceRepository;
    const [searchResult, currentSystemAdminCount] = await Promise.all([
      repository.searchServiceUsers({
        q: normalizedQuery ?? undefined,
        field: normalizedField,
        match: normalizedMatch,
        workspaceId: normalizedWorkspaceId ?? undefined,
        limit: normalizedLimit,
        cursor: normalizedCursor
      }),
      repository.countAccountsBySystemRole('system_admin')
    ]);
    return jsonPlan(200, {
      ok: true,
      actor,
      users: searchResult.users.map((account) => this.toServiceUserPayload(account)),
      search: {
        q: normalizedQuery,
        field: normalizedField,
        match: normalizedMatch,
        limit: normalizedLimit,
        cursor: normalizedCursor,
        nextCursor: searchResult.nextCursor,
        total: searchResult.total,
        workspaceId: normalizedWorkspaceId
      },
      guards: {
        minimumSystemAdminCount: MIN_SYSTEM_ADMIN_COUNT,
        currentSystemAdminCount
      }
    });
  }

  async listServiceUserWorkspaces(request: FastifyRequest, accountId: string): Promise<ResponsePlan> {
    return this.listServiceUserWorkspacesByActor(toServiceActor(request), accountId);
  }

  async listServiceUserWorkspacesByActor(
    actorInput: ServiceManagementActor,
    accountId: string
  ): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const denyPlan = this.ensureServiceAccess(actor);
    if (denyPlan) {
      return denyPlan;
    }

    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'accountId is required.'
      });
    }

    const repository = this.runtime.persistence.workspaceRepository;
    const account = await repository.getAccount(normalizedAccountId);
    if (!account) {
      return jsonPlan(404, {
        ok: false,
        code: 'service_user_not_found',
        message: '대상 사용자 계정을 찾을 수 없습니다.'
      });
    }

    const workspaces = await repository.listAccountWorkspaces(normalizedAccountId);
    const membershipsByWorkspaceId = new Map<string, WorkspaceMemberRecord>();
    await Promise.all(
      workspaces.map(async (workspace) => {
        const member = (await repository.listWorkspaceMembers(workspace.workspaceId)).find(
          (candidate) => candidate.accountId === normalizedAccountId
        );
        if (member) {
          membershipsByWorkspaceId.set(workspace.workspaceId, member);
        }
      })
    );

    return jsonPlan(200, {
      ok: true,
      actor,
      account: this.toServiceUserPayload(account),
      workspaces: workspaces.map((workspace) => ({
        ...this.toServiceWorkspacePayload(workspace),
        membership: (() => {
          const membership = membershipsByWorkspaceId.get(workspace.workspaceId);
          if (!membership) {
            return null;
          }
          return {
            accountId: membership.accountId,
            workspaceId: membership.workspaceId,
            roleIds: [...membership.roleIds],
            joinedAt: membership.joinedAt
          };
        })()
      }))
    });
  }

  async listServiceApiKeys(request: FastifyRequest): Promise<ResponsePlan> {
    const actor = toServiceActor(request);
    const denyPlan = this.ensureServiceAccess(actor);
    if (denyPlan) {
      return denyPlan;
    }
    const repository = this.runtime.persistence.workspaceRepository;
    const keys = await repository.listServiceApiKeys(actor.accountId);
    return jsonPlan(200, {
      ok: true,
      actor,
      apiKeys: keys.map((record) => this.toServiceApiKeyPayload(record))
    });
  }

  async createServiceApiKey(request: FastifyRequest, body: CreateServiceApiKeyDto): Promise<ResponsePlan> {
    const actor = toServiceActor(request);
    const accessPlan = this.ensureServiceAccess(actor);
    if (accessPlan) {
      return accessPlan;
    }
    const adminPlan = this.ensureSystemAdmin(actor);
    if (adminPlan) {
      return adminPlan;
    }

    const normalizedName = toNullable(body.name);
    if (!normalizedName) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'name is required.'
      });
    }

    const normalizedExpiresAt = normalizeServiceApiKeyExpiresAt(body.expiresAt);
    if (normalizedExpiresAt === 'invalid') {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'expiresAt must be an ISO-8601 datetime string.'
      });
    }

    const repository = this.runtime.persistence.workspaceRepository;
    const existing = await repository.listServiceApiKeys(actor.accountId);
    const activeCount = existing.filter((record) => !record.revokedAt).length;
    if (activeCount >= MAX_SERVICE_API_KEYS_PER_ACCOUNT) {
      return jsonPlan(409, {
        ok: false,
        code: 'service_api_key_limit_exceeded',
        message: `계정당 서비스 API 키는 최대 ${MAX_SERVICE_API_KEYS_PER_ACCOUNT}개까지 발급할 수 있습니다.`
      });
    }

    const now = new Date().toISOString();
    const secret = `sk_${randomBytes(24).toString('base64url')}`;
    const keyPrefix = secret.slice(0, Math.min(secret.length, 12));
    const keyHash = hashApiKeySecret(secret);
    const keyId = `skey_${randomBytes(8).toString('hex')}`;

    const record: ServiceApiKeyRecord = {
      keyId,
      name: normalizedName,
      keyPrefix,
      keyHash,
      createdBy: actor.accountId,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: normalizedExpiresAt,
      revokedAt: null
    };
    await repository.createServiceApiKey(record);

    return jsonPlan(201, {
      ok: true,
      apiKey: this.toServiceApiKeyPayload(record),
      secret
    });
  }

  async revokeServiceApiKey(request: FastifyRequest, body: RevokeServiceApiKeyDto): Promise<ResponsePlan> {
    const actor = toServiceActor(request);
    const accessPlan = this.ensureServiceAccess(actor);
    if (accessPlan) {
      return accessPlan;
    }
    const adminPlan = this.ensureSystemAdmin(actor);
    if (adminPlan) {
      return adminPlan;
    }

    const normalizedKeyId = toNullable(body.keyId);
    if (!normalizedKeyId) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'keyId is required.'
      });
    }

    const repository = this.runtime.persistence.workspaceRepository;
    const existing = await repository.listServiceApiKeys(actor.accountId);
    const target = existing.find((record) => record.keyId === normalizedKeyId);
    if (!target) {
      return jsonPlan(404, {
        ok: false,
        code: 'service_api_key_not_found',
        message: 'API 키를 찾을 수 없습니다.'
      });
    }
    if (!target.revokedAt) {
      const now = new Date().toISOString();
      await repository.revokeServiceApiKey(actor.accountId, normalizedKeyId, now);
    }
    const next = await repository.listServiceApiKeys(actor.accountId);
    return jsonPlan(200, {
      ok: true,
      apiKeys: next.map((record) => this.toServiceApiKeyPayload(record))
    });
  }

  async setServiceUserRoles(
    request: FastifyRequest,
    accountId: string,
    body: SetServiceAccountRolesDto
  ): Promise<ResponsePlan> {
    return this.setServiceUserRolesByActor(toServiceActor(request), accountId, body);
  }

  async setServiceUserRolesByActor(
    actorInput: ServiceManagementActor,
    accountId: string,
    body: SetServiceAccountRolesDto
  ): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const accessPlan = this.ensureServiceAccess(actor);
    if (accessPlan) {
      return accessPlan;
    }
    const adminPlan = this.ensureSystemAdmin(actor);
    if (adminPlan) {
      return adminPlan;
    }

    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return jsonPlan(400, {
        ok: false,
        code: 'invalid_payload',
        message: 'accountId is required.'
      });
    }

    const repository = this.runtime.persistence.workspaceRepository;
    const target = await repository.getAccount(normalizedAccountId);
    if (!target) {
      return jsonPlan(404, {
        ok: false,
        code: 'service_user_not_found',
        message: '대상 사용자 계정을 찾을 수 없습니다.'
      });
    }

    const nextSystemRoles = this.normalizeSystemRoleInput(body.systemRoles);
    const currentlySystemAdmin = target.systemRoles.includes('system_admin');
    const nextSystemAdmin = nextSystemRoles.includes('system_admin');
    if (currentlySystemAdmin && !nextSystemAdmin) {
      const systemAdminCount = await repository.countAccountsBySystemRole('system_admin');
      if (systemAdminCount <= MIN_SYSTEM_ADMIN_COUNT) {
        return jsonPlan(400, {
          ok: false,
          code: 'system_admin_last_guard',
          message: '시스템 어드민은 최소 1명 이상 존재해야 합니다.'
        });
      }
    }

    const updatedAt = new Date().toISOString();
    const updated = await repository.updateAccountSystemRoles(normalizedAccountId, nextSystemRoles, updatedAt);
    if (!updated) {
      return jsonPlan(404, {
        ok: false,
        code: 'service_user_not_found',
        message: '대상 사용자 계정을 찾을 수 없습니다.'
      });
    }

    return jsonPlan(200, {
      ok: true,
      user: this.toServiceUserPayload(updated)
    });
  }

  async getServiceConfig(request: FastifyRequest): Promise<ResponsePlan> {
    return this.getServiceConfigByActor(toServiceActor(request));
  }

  async getServiceConfigByActor(actorInput: ServiceManagementActor): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const denyPlan = this.ensureServiceAccess(actor);
    if (denyPlan) {
      return denyPlan;
    }
    const settings = await this.readServiceSettings(actor.accountId);
    this.applyGithubRuntimeSettings(settings);
    return jsonPlan(200, {
      ok: true,
      actor,
      permissions: {
        canEdit: hasSystemAdminRole(actor.systemRoles)
      },
      settings: this.toServiceConfigPayload(settings)
    });
  }

  async upsertServiceSmtpSettings(
    request: FastifyRequest,
    body: UpsertServiceSmtpSettingsDto
  ): Promise<ResponsePlan> {
    return this.upsertServiceSmtpSettingsByActor(toServiceActor(request), body);
  }

  async upsertServiceSmtpSettingsByActor(
    actorInput: ServiceManagementActor,
    body: UpsertServiceSmtpSettingsDto
  ): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const accessPlan = this.ensureServiceAccess(actor);
    if (accessPlan) {
      return accessPlan;
    }
    const adminPlan = this.ensureSystemAdmin(actor);
    if (adminPlan) {
      return adminPlan;
    }

    const repository = this.runtime.persistence.workspaceRepository;
    const current = await this.readServiceSettings(actor.accountId);
    const now = new Date().toISOString();
    const next: ServiceSettingsRecord = {
      ...current,
      smtp: {
        ...current.smtp,
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
        ...(body.host !== undefined ? { host: toNullable(body.host) } : {}),
        ...(body.port !== undefined ? { port: Number.isFinite(body.port) ? Math.trunc(body.port) : null } : {}),
        ...(typeof body.secure === 'boolean' ? { secure: body.secure } : {}),
        ...(body.username !== undefined ? { username: toNullable(body.username) } : {}),
        ...(body.fromEmail !== undefined ? { fromEmail: toNullable(body.fromEmail) } : {}),
        ...(body.fromName !== undefined ? { fromName: toNullable(body.fromName) } : {}),
        updatedBy: actor.accountId,
        updatedAt: now
      },
      updatedAt: now
    };
    if (body.password !== undefined) {
      const normalizedPassword = toNullable(body.password);
      next.smtp.passwordEncrypted = normalizedPassword ? this.encryptSecret(normalizedPassword) : null;
    }

    await repository.upsertServiceSettings(next);

    return jsonPlan(200, {
      ok: true,
      settings: this.toServiceConfigPayload(next)
    });
  }

  async upsertServiceGithubAuthSettings(
    request: FastifyRequest,
    body: UpsertServiceGithubAuthSettingsDto
  ): Promise<ResponsePlan> {
    return this.upsertServiceGithubAuthSettingsByActor(toServiceActor(request), body);
  }

  async upsertServiceGithubAuthSettingsByActor(
    actorInput: ServiceManagementActor,
    body: UpsertServiceGithubAuthSettingsDto
  ): Promise<ResponsePlan> {
    const actor = normalizeServiceActor(actorInput);
    const accessPlan = this.ensureServiceAccess(actor);
    if (accessPlan) {
      return accessPlan;
    }
    const adminPlan = this.ensureSystemAdmin(actor);
    if (adminPlan) {
      return adminPlan;
    }

    const repository = this.runtime.persistence.workspaceRepository;
    const current = await this.readServiceSettings(actor.accountId);
    const now = new Date().toISOString();
    const next: ServiceSettingsRecord = {
      ...current,
      githubAuth: {
        ...current.githubAuth,
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
        ...(body.clientId !== undefined ? { clientId: toNullable(body.clientId) } : {}),
        ...(body.callbackUrl !== undefined ? { callbackUrl: toNullable(body.callbackUrl) } : {}),
        ...(body.scopes !== undefined
          ? { scopes: toNullable(body.scopes) ?? DEFAULT_AUTH_GITHUB_SCOPES }
          : {}),
        updatedBy: actor.accountId,
        updatedAt: now
      },
      updatedAt: now
    };
    if (body.clientSecret !== undefined) {
      const normalizedSecret = toNullable(body.clientSecret);
      next.githubAuth.clientSecretEncrypted = normalizedSecret ? this.encryptSecret(normalizedSecret) : null;
    }

    await repository.upsertServiceSettings(next);
    this.applyGithubRuntimeSettings(next);

    return jsonPlan(200, {
      ok: true,
      settings: this.toServiceConfigPayload(next)
    });
  }
}
