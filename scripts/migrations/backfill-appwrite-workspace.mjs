#!/usr/bin/env node

const LEGACY_WORKSPACE_STATE_SCOPES = [
  { tenantId: '__workspace_meta__', projectId: 'workspace-state' },
  { tenantId: '__workspace_meta__', projectId: 'workspace-state-v1' },
  { tenantId: '__workspace_meta_v2__', projectId: 'workspace-state-v2' }
];

const CANONICAL_TENANT_ID = '__workspace_meta__';
const CANONICAL_PROJECT_ID = 'workspace-state';
const CANONICAL_DOCUMENT_ID = 'workspace-state';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
};

const baseUrl =
  firstNonEmpty(
    process.env.ASHFOX_DB_APPWRITE_BASE_URL,
    process.env.ASHFOX_APPWRITE_BASE_URL,
    process.env.ASHFOX_DB_APPWRITE_URL,
    process.env.ASHFOX_APPWRITE_URL
  ) || 'https://cloud.appwrite.io/v1';
const projectId = firstNonEmpty(
  process.env.ASHFOX_DB_APPWRITE_PROJECT_ID,
  process.env.ASHFOX_APPWRITE_PROJECT_ID,
  process.env.ASHFOX_APPWRITE_PROJECT
);
const apiKey = firstNonEmpty(process.env.ASHFOX_DB_APPWRITE_API_KEY, process.env.ASHFOX_APPWRITE_API_KEY);
const databaseId = firstNonEmpty(process.env.ASHFOX_DB_APPWRITE_DATABASE_ID, process.env.ASHFOX_APPWRITE_DATABASE_ID) || 'ashfox';
const sourceCollectionId =
  firstNonEmpty(
    process.env.ASHFOX_DB_APPWRITE_COLLECTION_ID,
    process.env.ASHFOX_DB_APPWRITE_PROJECT_COLLECTION_ID,
    process.env.ASHFOX_APPWRITE_COLLECTION_ID
  ) || 'ashfox_projects';
const targetCollectionId =
  firstNonEmpty(
    process.env.ASHFOX_DB_APPWRITE_WORKSPACE_STATE_COLLECTION_ID,
    process.env.ASHFOX_APPWRITE_WORKSPACE_STATE_COLLECTION_ID,
    process.env.ASHFOX_DB_APPWRITE_WORKSPACE_V2_COLLECTION_ID,
    process.env.ASHFOX_DB_APPWRITE_WORKSPACE_COLLECTION_ID,
    process.env.ASHFOX_APPWRITE_WORKSPACE_V2_COLLECTION_ID
  ) || 'ashfox_workspace_state';

const writeLog = (message, details) => {
  if (details) {
    process.stdout.write(`${message} ${JSON.stringify(details)}\n`);
    return;
  }
  process.stdout.write(`${message}\n`);
};

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const appwriteFetch = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-appwrite-project': projectId,
      'x-appwrite-key': apiKey,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Appwrite request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const encodeQuery = (query) => encodeURIComponent(query);

const fetchWorkspaceStateForScope = async (scope) => {
  const queries = [
    `equal("tenantId",["${scope.tenantId}"])`,
    `equal("projectId",["${scope.projectId}"])`,
    'limit(1)'
  ];
  const queryString = queries.map((query) => `queries[]=${encodeQuery(query)}`).join('&');
  const path = `/databases/${databaseId}/collections/${sourceCollectionId}/documents?${queryString}`;
  const payload = await appwriteFetch(path, { method: 'GET' });
  if (!payload || !Array.isArray(payload.documents) || payload.documents.length === 0) {
    return null;
  }
  return payload.documents[0];
};

const fetchLegacyWorkspaceState = async () => {
  for (const scope of LEGACY_WORKSPACE_STATE_SCOPES) {
    const document = await fetchWorkspaceStateForScope(scope);
    if (document) {
      return { document, scope };
    }
  }
  return null;
};

const upsertWorkspaceState = async (legacyDocument) => {
  const createdAt = legacyDocument.createdAt ?? legacyDocument.$createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const revision = String(legacyDocument.revision ?? updatedAt);
  const stateJson = typeof legacyDocument.stateJson === 'string' ? legacyDocument.stateJson : JSON.stringify({});

  const payload = {
    tenantId: CANONICAL_TENANT_ID,
    projectId: CANONICAL_PROJECT_ID,
    revision,
    stateJson,
    createdAt,
    updatedAt
  };

  if (dryRun) {
    writeLog('ashfox appwrite workspace-state backfill dry-run', {
      databaseId,
      sourceCollection: sourceCollectionId,
      targetCollection: targetCollectionId,
      targetDocumentId: CANONICAL_DOCUMENT_ID,
      action: 'upsert',
      tenantId: CANONICAL_TENANT_ID,
      projectId: CANONICAL_PROJECT_ID
    });
    return;
  }

  try {
    await appwriteFetch(`/databases/${databaseId}/collections/${targetCollectionId}/documents/${CANONICAL_DOCUMENT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: payload })
    });
    writeLog('ashfox appwrite workspace-state backfill updated existing document', {
      databaseId,
      collectionId: targetCollectionId,
      documentId: CANONICAL_DOCUMENT_ID
    });
  } catch {
    await appwriteFetch(`/databases/${databaseId}/collections/${targetCollectionId}/documents`, {
      method: 'POST',
      body: JSON.stringify({
        documentId: CANONICAL_DOCUMENT_ID,
        data: payload
      })
    });
    writeLog('ashfox appwrite workspace-state backfill created document', {
      databaseId,
      collectionId: targetCollectionId,
      documentId: CANONICAL_DOCUMENT_ID
    });
  }
};

const main = async () => {
  writeLog('ashfox appwrite workspace-state backfill start', {
    dryRun,
    databaseId,
    sourceCollection: sourceCollectionId,
    targetCollection: targetCollectionId
  });

  if (!projectId || !apiKey) {
    if (dryRun) {
      writeLog('ashfox appwrite workspace-state backfill skipped: missing appwrite credentials for dry-run');
      return;
    }
    fail('Missing Appwrite credentials. Set ASHFOX_DB_APPWRITE_PROJECT_ID and ASHFOX_DB_APPWRITE_API_KEY.');
  }

  const legacy = await fetchLegacyWorkspaceState();
  if (!legacy) {
    writeLog('ashfox appwrite workspace-state backfill: no legacy workspace-state document found', {
      searchedScopes: LEGACY_WORKSPACE_STATE_SCOPES
    });
    return;
  }

  writeLog('ashfox appwrite workspace-state backfill source resolved', legacy.scope);
  await upsertWorkspaceState(legacy.document);
  writeLog('ashfox appwrite workspace-state backfill done');
};

main().catch((error) => {
  fail(`ashfox appwrite workspace-state backfill failed: ${error instanceof Error ? error.message : String(error)}`);
});
