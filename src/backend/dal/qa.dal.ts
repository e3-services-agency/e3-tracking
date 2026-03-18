/**
 * QA Data Access Layer.
 *
 * NOTE: The frontend "QARun/QAVerification" shape is richer than the current
 * Supabase schema. For shared read-only rendering, we persist each
 * node verification as JSON in `qa_run_payloads.expected_json`.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import { DatabaseError, NotFoundError } from '../errors';

type QAStatusUi = 'Pending' | 'Passed' | 'Failed';
type QAProofUi = {
  id: string;
  name: string;
  type: 'image' | 'text' | 'json';
  content: string; // public URL for images, raw content for text/json
  createdAt: string;
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

type QARunPayloadInput = {
  id: string;
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

  const outRuns =
    (runs ?? []).map((r) => ({
      id: r.id as string,
      name: r.id as string, // DB doesn't store run name; fallback to id.
      createdAt: r.created_at as string,
      verifications: {} as Record<string, QAVerificationUi>,
      testingProfiles: [],
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
      try {
        const parsed = JSON.parse(expectedJson) as Partial<QAVerificationUi>;
        run.verifications[nodeId] = {
          nodeId,
          status: (parsed.status as QAStatusUi) ?? 'Pending',
          notes: parsed.notes,
          proofText: (parsed as any).proofText,
          proofs: parsed.proofs as QAProofUi[] | undefined,
          testingProfileIds: parsed.testingProfileIds,
          extraTestingProfiles: parsed.extraTestingProfiles as unknown[] | undefined,
        };
      } catch {
        // Ignore malformed JSON payload rows.
      }
    }
  }

  return outRuns;
}

