/**
 * QA Data Access Layer.
 *
 * NOTE: The frontend "QARun/QAVerification" shape is richer than the current
 * Supabase schema. For shared read-only rendering, we persist each
 * node verification as JSON in `qa_run_payloads.expected_json`.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import { assertEnumValuesForQaRunPayloads } from '../lib/eventPayloadEnumValidation';
import { DatabaseError, NotFoundError } from '../errors';

type QAStatusUi = 'Pending' | 'Passed' | 'Failed';
type QAProofUi = {
  id: string;
  name: string;
  type: 'image' | 'text' | 'json';
  content: string; // public URL for images, raw content for text/json
  createdAt: string;
  validation_status?: 'pass' | 'fail' | 'unknown';
  validation_issues?: string[];
};

type QAVerificationUi = {
  nodeId: string;
  status: QAStatusUi;
  notes?: string;
  proofText?: string;
  proofs?: QAProofUi[];
  testingProfileIds?: string[];
  extraTestingProfiles?: unknown[];
};

const RUN_META_NODE_ID = '__run_meta__';
const RUN_NODES_NODE_ID = '__run_nodes__';
const RUN_EDGES_NODE_ID = '__run_edges__';

function logMalformedPayload(context: string, details: Record<string, unknown>, err?: unknown): void {
  if (err instanceof Error) {
    console.warn(`[qa.dal] ${context}`, { ...details, error: err.message });
    return;
  }
  console.warn(`[qa.dal] ${context}`, details);
}

function safeParseJson(
  jsonText: string,
  context: string,
  details: Record<string, unknown>,
): unknown | null {
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    logMalformedPayload(context, details, err);
    return null;
  }
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item));
}

function toQaStatus(value: unknown): QAStatusUi {
  return value === 'Passed' || value === 'Failed' || value === 'Pending' ? value : 'Pending';
}

function normalizeVerificationPayload(
  parsed: unknown,
  nodeId: string,
  runId: string,
  routeScope: 'shared' | 'workspace' | 'latest',
): QAVerificationUi {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logMalformedPayload('Verification payload is not an object; using safe defaults', {
      routeScope,
      runId,
      nodeId,
      parsedType: parsed === null ? 'null' : typeof parsed,
    });
    return { nodeId, status: 'Pending' };
  }

  const raw = parsed as Record<string, unknown>;
  const proofs = Array.isArray(raw.proofs) ? (raw.proofs as QAProofUi[]) : undefined;
  return {
    nodeId,
    status: toQaStatus(raw.status),
    notes: toOptionalString(raw.notes),
    proofText: toOptionalString(raw.proofText),
    proofs,
    testingProfileIds: toOptionalStringArray(raw.testingProfileIds),
    extraTestingProfiles: Array.isArray(raw.extraTestingProfiles)
      ? (raw.extraTestingProfiles as unknown[])
      : undefined,
  };
}

type QARunPayloadInput = {
  id: string;
  name?: string;
  createdAt?: string;
  testerName?: string;
  environment?: string;
  overallNotes?: string;
  testingProfiles?: Array<{ id: string; label: string; url: string; note?: string }>;
  nodes?: any[];
  edges?: any[];
  endedAt?: string | null;
  verifications?: Record<string, QAVerificationUi>;
};

function mapUiStatusToDbRunStatus(hasFailed: boolean): 'pass' | 'fail' {
  return hasFailed ? 'fail' : 'pass';
}

/**
 * Upserts QA runs for a journey and persists per-node verifications.
 *
 * - `qa_runs` stores overall run status (pass/fail) derived from node statuses.
 * - `qa_run_payloads` stores the full per-node verification JSON in `expected_json`
 *   (and writes `{}` into `actual_json` as a placeholder).
 */
export async function upsertJourneyQARuns(
  workspaceId: string,
  journeyId: string,
  qaRuns: QARunPayloadInput[],
): Promise<void> {
  const supabase = getSupabaseOrThrow();

  // Ensure the journey exists in this workspace before writing.
  const { data: journey, error: journeyErr } = await supabase
    .from('journeys')
    .select('id')
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (journeyErr) {
    throw new DatabaseError(`Failed to fetch journey: ${journeyErr.message}`, journeyErr);
  }
  if (!journey) {
    throw new NotFoundError('Journey not found or does not belong to this workspace.', 'journey');
  }

  // Invalid payload = QA failure.
  // Payload must match event_property_definitions (effective enum_values).
  // Hard validation gate, not advisory — runs before any qa_runs / qa_run_payloads writes.
  await assertEnumValuesForQaRunPayloads(workspaceId, qaRuns ?? []);

  const runIds = (qaRuns ?? [])
    .map((r) => r?.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

  if (runIds.length === 0) return;

  const now = new Date().toISOString();

  // Upsert qa_runs rows.
  for (const run of qaRuns) {
    if (!run?.id) continue;
    const verifications = run.verifications ?? {};
    const hasFailed = Object.values(verifications).some((v) => v?.status === 'Failed');
    const dbStatus = mapUiStatusToDbRunStatus(hasFailed);

    const { error: upErr } = await supabase.from('qa_runs').upsert(
      {
        id: run.id,
        journey_id: journeyId,
        status: dbStatus,
        updated_at: now,
      },
      { onConflict: 'id' },
    );

    if (upErr) {
      throw new DatabaseError(`Failed to upsert qa_run ${run.id}: ${upErr.message}`, upErr);
    }
  }

  // Replace all persisted payloads for the provided run ids.
  const { error: delErr } = await supabase
    .from('qa_run_payloads')
    .delete()
    .in('qa_run_id', runIds);

  if (delErr) {
    throw new DatabaseError(`Failed to clear qa_run_payloads: ${delErr.message}`, delErr);
  }

  const payloadRows: Array<{
    qa_run_id: string;
    node_id: string;
    expected_json: string;
    actual_json: string;
  }> = [];

  for (const run of qaRuns) {
    if (!run?.id) continue;

    const verifications = run.verifications ?? {};

    // 1) Persist per-node verifications.
    for (const [nodeId, verification] of Object.entries(verifications)) {
      if (!nodeId) continue;
      const nodeVerification: QAVerificationUi = {
        ...(verification ?? { nodeId, status: 'Pending' }),
        nodeId,
      };

      payloadRows.push({
        qa_run_id: run.id,
        node_id: nodeId,
        expected_json: JSON.stringify(nodeVerification),
        // Placeholder column; the UI doesn't currently use expected/actual separately.
        actual_json: '{}',
      });
    }

    // 2) Persist run metadata + snapshot (used by the in-app QA selector and QA mode).
    const meta = {
      name: run.name ?? run.id,
      createdAt: run.createdAt ?? now,
      testerName: run.testerName,
      environment: run.environment,
      overallNotes: run.overallNotes ?? '',
      testingProfiles: run.testingProfiles ?? [],
      endedAt: run.endedAt ?? null,
    };
    payloadRows.push({
      qa_run_id: run.id,
      node_id: RUN_META_NODE_ID,
      expected_json: JSON.stringify(meta),
      actual_json: '{}',
    });

    payloadRows.push({
      qa_run_id: run.id,
      node_id: RUN_NODES_NODE_ID,
      expected_json: JSON.stringify(run.nodes ?? []),
      actual_json: '{}',
    });

    payloadRows.push({
      qa_run_id: run.id,
      node_id: RUN_EDGES_NODE_ID,
      expected_json: JSON.stringify(run.edges ?? []),
      actual_json: '{}',
    });
  }

  if (payloadRows.length === 0) return;

  const { error: insErr } = await supabase.from('qa_run_payloads').insert(payloadRows);
  if (insErr) {
    throw new DatabaseError(`Failed to insert qa_run_payloads: ${insErr.message}`, insErr);
  }
}

/**
 * Loads QA runs for shared read-only rendering.
 *
 * Reconstructs frontend `QARun` objects with per-node verifications parsed
 * from `qa_run_payloads.expected_json`.
 */
export async function getSharedJourneyQARuns(
  journeyId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    createdAt: string;
    verifications: Record<string, QAVerificationUi>;
    testingProfiles: unknown[];
    testerName?: string;
    environment?: string;
    overallNotes?: string;
    endedAt?: string | null;
    nodes?: any[];
    edges?: any[];
  }>
> {
  const supabase = getSupabaseOrThrow();

  const { data: runs, error: runErr } = await supabase
    .from('qa_runs')
    .select('id, created_at')
    .eq('journey_id', journeyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (runErr) {
    throw new DatabaseError(`Failed to fetch qa_runs: ${runErr.message}`, runErr);
  }

  const outRuns = (runs ?? []).map((r) => ({
    id: r.id as string,
    name: r.id as string,
    createdAt: r.created_at as string,
    verifications: {} as Record<string, QAVerificationUi>,
    testingProfiles: [],
    testerName: undefined as string | undefined,
    environment: undefined as string | undefined,
    overallNotes: undefined as string | undefined,
    endedAt: null as string | null,
    nodes: undefined as any[] | undefined,
    edges: undefined as any[] | undefined,
  }));

  const runIdList = outRuns.map((r) => r.id);
  if (runIdList.length === 0) return [];

  const { data: payloadRows, error: payloadErr } = await supabase
    .from('qa_run_payloads')
    .select('qa_run_id, node_id, expected_json')
    .in('qa_run_id', runIdList);

  if (payloadErr) {
    throw new DatabaseError(`Failed to fetch qa_run_payloads: ${payloadErr.message}`, payloadErr);
  }

  const payloadByRun = new Map<string, Array<any>>();
  for (const row of payloadRows ?? []) {
    const runId = row.qa_run_id as string;
    if (!payloadByRun.has(runId)) payloadByRun.set(runId, []);
    payloadByRun.get(runId)!.push(row);
  }

  for (const run of outRuns) {
    const rows = payloadByRun.get(run.id) ?? [];
  for (const row of rows) {
      const nodeId = row.node_id as string;
      if (!nodeId) continue;
      const expectedJson = row.expected_json as string | null;
      if (typeof expectedJson !== 'string') continue;
      if (nodeId === RUN_META_NODE_ID) {
        const parsed = safeParseJson(expectedJson, 'Failed to parse run meta payload', {
          routeScope: 'shared',
          runId: run.id,
          nodeId,
        });
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          continue;
        }
        const meta = parsed as Record<string, unknown>;
          run.name = typeof meta?.name === 'string' ? meta.name : run.name;
          run.createdAt = typeof meta?.createdAt === 'string' ? meta.createdAt : run.createdAt;
          run.testerName = typeof meta?.testerName === 'string' ? meta.testerName : undefined;
          run.environment = typeof meta?.environment === 'string' ? meta.environment : undefined;
          run.overallNotes = typeof meta?.overallNotes === 'string' ? meta.overallNotes : undefined;
          run.testingProfiles = Array.isArray(meta?.testingProfiles) ? meta.testingProfiles : [];
          run.endedAt = typeof meta?.endedAt === 'string' || meta?.endedAt === null ? meta.endedAt : null;
        continue;
      }

      if (nodeId === RUN_NODES_NODE_ID) {
        const ns = safeParseJson(expectedJson, 'Failed to parse run nodes payload', {
          routeScope: 'shared',
          runId: run.id,
          nodeId,
        });
        run.nodes = Array.isArray(ns) ? ns : [];
        continue;
      }

      if (nodeId === RUN_EDGES_NODE_ID) {
        const es = safeParseJson(expectedJson, 'Failed to parse run edges payload', {
          routeScope: 'shared',
          runId: run.id,
          nodeId,
        });
        run.edges = Array.isArray(es) ? es : [];
        continue;
      }

      const parsedVerification = safeParseJson(expectedJson, 'Failed to parse node verification payload', {
        routeScope: 'shared',
        runId: run.id,
        nodeId,
      });
      run.verifications[nodeId] = normalizeVerificationPayload(
        parsedVerification,
        nodeId,
        run.id,
        'shared',
      );
    }
  }

  return outRuns;
}

/**
 * Loads QA runs for an internal authenticated view (workspace isolated).
 * Returns full run meta + snapshot + per-node verifications.
 */
export async function getJourneyQARuns(
  workspaceId: string,
  journeyId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    createdAt: string;
    testerName?: string;
    environment?: string;
    overallNotes?: string;
    testingProfiles?: Array<any>;
    nodes?: any[];
    edges?: any[];
    endedAt?: string | null;
    verifications: Record<string, QAVerificationUi>;
  }>
> {
  const supabase = getSupabaseOrThrow();

  // Ensure journey belongs to workspace.
  const { data: j, error: jErr } = await supabase
    .from('journeys')
    .select('id')
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (jErr) {
    throw new DatabaseError(`Failed to fetch journey: ${jErr.message}`, jErr);
  }
  if (!j) {
    throw new NotFoundError('Journey not found or does not belong to this workspace.', 'journey');
  }

  const { data: runs, error: runErr } = await supabase
    .from('qa_runs')
    .select('id, created_at')
    .eq('journey_id', journeyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (runErr) {
    throw new DatabaseError(`Failed to fetch qa_runs: ${runErr.message}`, runErr);
  }

  const outRuns =
    (runs ?? []).map((r) => ({
      id: r.id as string,
      name: r.id as string,
      createdAt: r.created_at as string,
      verifications: {} as Record<string, QAVerificationUi>,
      testingProfiles: [],
      testerName: undefined as string | undefined,
      environment: undefined as string | undefined,
      overallNotes: undefined as string | undefined,
      endedAt: null as string | null,
      nodes: undefined as any[] | undefined,
      edges: undefined as any[] | undefined,
    }));

  const runIdList = outRuns.map((r) => r.id);
  if (runIdList.length === 0) return [];

  const { data: payloadRows, error: payloadErr } = await supabase
    .from('qa_run_payloads')
    .select('qa_run_id, node_id, expected_json')
    .in('qa_run_id', runIdList);

  if (payloadErr) {
    throw new DatabaseError(`Failed to fetch qa_run_payloads: ${payloadErr.message}`, payloadErr);
  }

  const payloadByRun = new Map<string, Array<any>>();
  for (const row of payloadRows ?? []) {
    const runId = row.qa_run_id as string;
    if (!payloadByRun.has(runId)) payloadByRun.set(runId, []);
    payloadByRun.get(runId)!.push(row);
  }

  for (const run of outRuns) {
    const rows = payloadByRun.get(run.id) ?? [];
    for (const row of rows) {
      const nodeId = row.node_id as string;
      if (!nodeId) continue;
      const expectedJson = row.expected_json as string | null;
      if (typeof expectedJson !== 'string') continue;

      if (nodeId === RUN_META_NODE_ID) {
        const parsed = safeParseJson(expectedJson, 'Failed to parse run meta payload', {
          routeScope: 'workspace',
          workspaceId,
          runId: run.id,
          nodeId,
        });
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          continue;
        }
        const meta = parsed as Record<string, unknown>;
          run.name = typeof meta?.name === 'string' ? meta.name : run.name;
          run.createdAt = typeof meta?.createdAt === 'string' ? meta.createdAt : run.createdAt;
          run.testerName = typeof meta?.testerName === 'string' ? meta.testerName : undefined;
          run.environment = typeof meta?.environment === 'string' ? meta.environment : undefined;
          run.overallNotes = typeof meta?.overallNotes === 'string' ? meta.overallNotes : undefined;
          run.testingProfiles = Array.isArray(meta?.testingProfiles) ? meta.testingProfiles : [];
          run.endedAt = typeof meta?.endedAt === 'string' || meta?.endedAt === null ? meta.endedAt : null;
        continue;
      }

      if (nodeId === RUN_NODES_NODE_ID) {
        const ns = safeParseJson(expectedJson, 'Failed to parse run nodes payload', {
          routeScope: 'workspace',
          workspaceId,
          runId: run.id,
          nodeId,
        });
        run.nodes = Array.isArray(ns) ? ns : [];
        continue;
      }

      if (nodeId === RUN_EDGES_NODE_ID) {
        const es = safeParseJson(expectedJson, 'Failed to parse run edges payload', {
          routeScope: 'workspace',
          workspaceId,
          runId: run.id,
          nodeId,
        });
        run.edges = Array.isArray(es) ? es : [];
        continue;
      }

      const parsedVerification = safeParseJson(expectedJson, 'Failed to parse node verification payload', {
        routeScope: 'workspace',
        workspaceId,
        runId: run.id,
        nodeId,
      });
      run.verifications[nodeId] = normalizeVerificationPayload(
        parsedVerification,
        nodeId,
        run.id,
        'workspace',
      );
    }
  }

  return outRuns;
}

/**
 * Lightweight summary for journeys homepage:
 * - `qaRunsCount`: number of runs
 * - `latestQARun`: reconstructed full QARun object for the most recent run
 *
 * This avoids loading/verifying all QA runs on the homepage.
 */
export async function getJourneyQARunsCountAndLatest(
  workspaceId: string,
  journeyId: string,
): Promise<{
  qaRunsCount: number;
  latestQARun: {
    id: string;
    name: string;
    createdAt: string;
    testerName?: string;
    environment?: string;
    overallNotes?: string;
    testingProfiles?: unknown[];
    nodes?: any[];
    edges?: any[];
    endedAt?: string | null;
    verifications: Record<string, QAVerificationUi>;
  } | null;
}> {
  const supabase = getSupabaseOrThrow();

  // Ensure journey belongs to workspace.
  const { data: j, error: jErr } = await supabase
    .from('journeys')
    .select('id')
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (jErr) {
    throw new DatabaseError(`Failed to fetch journey: ${jErr.message}`, jErr);
  }
  if (!j) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  const { data: runs, error: runErr } = await supabase
    .from('qa_runs')
    .select('id, created_at')
    .eq('journey_id', journeyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (runErr) {
    throw new DatabaseError(`Failed to fetch qa_runs: ${runErr.message}`, runErr);
  }

  const qaRunsCount = Array.isArray(runs) ? runs.length : 0;
  if (qaRunsCount === 0) {
    return { qaRunsCount: 0, latestQARun: null };
  }

  const latest = (runs as Array<{ id: string; created_at: string }>)[0];
  const latestRunId = latest?.id;
  if (!latestRunId) return { qaRunsCount, latestQARun: null };

  const outRun = {
    id: latestRunId,
    name: latestRunId,
    createdAt: latest.created_at,
    verifications: {} as Record<string, QAVerificationUi>,
    testingProfiles: [],
    testerName: undefined as string | undefined,
    environment: undefined as string | undefined,
    overallNotes: undefined as string | undefined,
    endedAt: null as string | null,
    nodes: undefined as any[] | undefined,
    edges: undefined as any[] | undefined,
  };

  const { data: payloadRows, error: payloadErr } = await supabase
    .from('qa_run_payloads')
    .select('node_id, expected_json')
    .eq('qa_run_id', latestRunId);

  if (payloadErr) {
    throw new DatabaseError(
      `Failed to fetch qa_run_payloads: ${payloadErr.message}`,
      payloadErr
    );
  }

  for (const row of payloadRows ?? []) {
    const nodeId = row?.node_id as string | undefined;
    if (!nodeId) continue;

    const expectedJson = row.expected_json as string | null;
    if (typeof expectedJson !== 'string') continue;

    if (nodeId === RUN_META_NODE_ID) {
      const parsed = safeParseJson(expectedJson, 'Failed to parse run meta payload', {
        routeScope: 'latest',
        workspaceId,
        runId: latestRunId,
        nodeId,
      });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }
      const meta = parsed as Record<string, unknown>;
        outRun.name = typeof meta?.name === 'string' ? meta.name : outRun.name;
        outRun.createdAt =
          typeof meta?.createdAt === 'string' ? meta.createdAt : outRun.createdAt;
        outRun.testerName = typeof meta?.testerName === 'string' ? meta.testerName : undefined;
        outRun.environment =
          typeof meta?.environment === 'string' ? meta.environment : undefined;
        outRun.overallNotes =
          typeof meta?.overallNotes === 'string' ? meta.overallNotes : undefined;
        outRun.testingProfiles = Array.isArray(meta?.testingProfiles)
          ? meta.testingProfiles
          : [];
        outRun.endedAt =
          typeof meta?.endedAt === 'string' || meta?.endedAt === null ? meta.endedAt : null;
      continue;
    }

    if (nodeId === RUN_NODES_NODE_ID) {
      const ns = safeParseJson(expectedJson, 'Failed to parse run nodes payload', {
        routeScope: 'latest',
        workspaceId,
        runId: latestRunId,
        nodeId,
      });
      outRun.nodes = Array.isArray(ns) ? ns : [];
      continue;
    }

    if (nodeId === RUN_EDGES_NODE_ID) {
      const es = safeParseJson(expectedJson, 'Failed to parse run edges payload', {
        routeScope: 'latest',
        workspaceId,
        runId: latestRunId,
        nodeId,
      });
      outRun.edges = Array.isArray(es) ? es : [];
      continue;
    }

    const parsedVerification = safeParseJson(expectedJson, 'Failed to parse node verification payload', {
      routeScope: 'latest',
      workspaceId,
      runId: latestRunId,
      nodeId,
    });
    outRun.verifications[nodeId] = normalizeVerificationPayload(
      parsedVerification,
      nodeId,
      latestRunId,
      'latest',
    );
  }

  return { qaRunsCount, latestQARun: outRun };
}

