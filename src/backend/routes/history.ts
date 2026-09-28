/**
 * History routes (D-44, T-3-01), mounted at `/api/projects/:projectId/history`: list with filters
 * (`entity_type`, `entity_id`, `parent_entity_id`, `action`, `actor`, `source`, `batch_id`,
 * `since`, `before`/`before_id`, `limit`), newest first, keyset-paginated; `GET /:changeId` for one
 * row.
 *
 * Fix round (reviewer FAIL, ERROR 1/WARNING 2): the response is `{items, next_cursor}` --
 * `next_cursor` is the opaque `"<changed_at>|<id>"` composite cursor for the next page (`null`
 * once there is nothing left), passed back as `before` (or `before`/`before_id` split) on the
 * following request. `limit` and the cursor are validated strictly: a non-integer `limit` or a
 * malformed cursor is a 400 `VALIDATION_ERROR`, never a raw SQLite `datatype mismatch` 500.
 *
 * QA fix round (qa-tester FAIL 2026-09-28 01:54, S4): `action` was accepted as a query parameter
 * but silently ignored -- a caller filtering by `action=delete` got every row back, unfiltered,
 * with no error, which is worse than a 400. `action` is now a real filter, validated against
 * `CHANGE_LOG_ACTIONS`; every query parameter is now whitelisted (`KNOWN_HISTORY_PARAMS`) so a
 * typo (e.g. `?actoin=delete`) is a 400 naming the unknown parameter instead of returning
 * unfiltered results.
 *
 * T-3-02 fix round (from the T-3-01 review): Express's extended query parser turns a repeated key
 * (`?entity_type=a&entity_type=b`) into an array and a bracketed key (`?entity_type[x]=y`) into an
 * object -- either used to reach the DAL as a non-string and either got silently coerced or threw a
 * raw `datatype mismatch` 500. Every known parameter is now asserted to be a plain string (or
 * absent) before use, a 400 otherwise; and `limit=1000` (`MAX_LIMIT`) no longer reports
 * `next_cursor: null` when more rows exist -- the one-row lookahead (`limit + 1`) used to get
 * clamped straight back down to `MAX_LIMIT` by the DAL's own `Math.min(..., MAX_LIMIT)`, so a full
 * page at the max size could never detect "more rows follow". The requested limit is capped at
 * `MAX_LIMIT - 1` instead, so the lookahead row always fits under the DAL's own clamp.
 */
import { Router, type Request, type Response } from 'express';
import { listChanges, getChangeOrThrow, buildCursor, DEFAULT_LIMIT, MAX_LIMIT } from '../dal/change-log.dal';
import { CHANGE_LOG_ACTIONS } from '../../domain/enums';
import { ValidationError } from '../errors';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

/** Every query parameter `GET /history` understands; anything else is a 400 (fix round). */
const KNOWN_HISTORY_PARAMS = new Set([
  'entity_type',
  'entity_id',
  'parent_entity_id',
  'action',
  'actor',
  'source',
  'batch_id',
  'since',
  'before',
  'before_id',
  'limit',
]);

function stringParam(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Rejects an array/object query value for `key` (fix round: Express's extended query parser turns
 * `?key=a&key=b` into an array and `?key[x]=y` into an object; either used to silently reach the
 * DAL as a non-string, or throw a raw SQLite `datatype mismatch` 500 further down, instead of a
 * clean 400 naming the offending parameter).
 */
function assertStringOrAbsent(key: string, v: unknown): void {
  if (v !== undefined && typeof v !== 'string') {
    throw new ValidationError(`${key} must be a single string value.`, key);
  }
}

/**
 * `limit` is optional; when given it must parse as a plain integer (no `1.5`, no `1e2`, no
 * leading/trailing junk) -- anything else is a 400, never silently truncated or passed to SQLite
 * as-is (fix round WARNING 2: `limit=1.5` bound a REAL to `LIMIT` and raised a raw 500). A
 * non-numeric value (e.g. `abc`) is treated as "not given" (falls back to the DAL's default),
 * matching the reviewer's accepted behaviour; the DAL itself still clamps an in-range integer like
 * `0`/`-3` up to 1 and one over `MAX_LIMIT` down to it.
 */
function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined; // not numeric at all (e.g. "abc") -> "not given"
  if (!Number.isInteger(n)) {
    throw new ValidationError('limit must be an integer.', 'limit');
  }
  return n;
}

/**
 * `action`, when given, must be one of `CHANGE_LOG_ACTIONS` (fix round, qa-tester FAIL 01:54:
 * an unrecognised action used to be silently ignored, returning every row unfiltered).
 */
function parseAction(raw: unknown): string | undefined {
  const value = stringParam(raw);
  if (value === undefined) return undefined;
  if (!(CHANGE_LOG_ACTIONS as readonly string[]).includes(value)) {
    throw new ValidationError(`action must be one of: ${CHANGE_LOG_ACTIONS.join(', ')}.`, 'action');
  }
  return value;
}

export interface ParsedCursor {
  before?: string;
  beforeId?: string;
}

/**
 * Composite keyset cursor (fix round ERROR 1): accepts either a single `before=<changed_at>|<id>`
 * query param, or the pair `before=<changed_at>&before_id=<id>`. Anything else with a `before`
 * (or `before_id`) present -- no pipe and no `before_id`, an empty half, or `before_id` without
 * `before`, or an unparseable `before` timestamp -- is a 400, never silently degraded to an
 * unsafe `changed_at`-only filter that can skip same-millisecond rows.
 */
function parseCursor(beforeRaw: unknown, beforeIdRaw: unknown): ParsedCursor {
  const beforeIdParam = stringParam(beforeIdRaw);
  let before = stringParam(beforeRaw);
  let beforeId = beforeIdParam;

  if (before === undefined && beforeId === undefined) return {};

  if (beforeId === undefined) {
    // Single composite "<changed_at>|<id>" form.
    const pipeIndex = before!.lastIndexOf('|');
    if (pipeIndex <= 0 || pipeIndex === before!.length - 1) {
      throw new ValidationError(
        'before must be a "<changed_at>|<id>" cursor, or paired with before_id.',
        'before'
      );
    }
    beforeId = before!.slice(pipeIndex + 1);
    before = before!.slice(0, pipeIndex);
  } else if (before === undefined) {
    throw new ValidationError('before_id requires before.', 'before_id');
  }

  if (!before || Number.isNaN(Date.parse(before))) {
    throw new ValidationError('before must be a valid ISO timestamp.', 'before');
  }
  if (!beforeId) {
    throw new ValidationError('before_id must not be empty.', 'before_id');
  }
  return { before, beforeId };
}

/**
 * Rejects any query parameter `GET /history` does not understand (fix round: a typo like
 * `?actoin=delete` used to silently return every row, unfiltered, instead of an error).
 */
function assertKnownParams(query: Request['query']): void {
  for (const key of Object.keys(query)) {
    if (!KNOWN_HISTORY_PARAMS.has(key)) {
      throw new ValidationError(`Unknown query parameter "${key}".`, key);
    }
    assertStringOrAbsent(key, query[key]);
  }
}

router.get('/', (req: Request, res: Response) => {
  try {
    assertKnownParams(req.query);
    const limit = parseLimit(req.query.limit);
    const action = parseAction(req.query.action);
    const cursor = parseCursor(req.query.before, req.query.before_id);
    // Fetch one extra row (`limit + 1`) to know whether another page follows, without a second
    // COUNT query. `requestedLimit` is capped at `MAX_LIMIT - 1` (fix round, from the T-3-01
    // review), not `MAX_LIMIT`: the DAL's own `listChanges` clamps whatever it's asked for down to
    // `MAX_LIMIT`, so a `limit + 1` lookahead built on top of a full `MAX_LIMIT` request used to get
    // clamped straight back down, and a full page at the max size could never report `next_cursor`
    // even when more rows existed. Capping one below leaves room for the lookahead row to survive
    // the DAL's clamp intact.
    const requestedLimit = Math.max(1, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT - 1));
    const page = listChanges(req.projectId!, {
      entity_type: stringParam(req.query.entity_type),
      entity_id: stringParam(req.query.entity_id),
      parent_entity_id: stringParam(req.query.parent_entity_id),
      action,
      actor: stringParam(req.query.actor),
      source: stringParam(req.query.source),
      batch_id: stringParam(req.query.batch_id),
      since: stringParam(req.query.since),
      before: cursor.before,
      beforeId: cursor.beforeId,
      limit: requestedLimit + 1,
    });
    const hasMore = page.length > requestedLimit;
    const items = hasMore ? page.slice(0, requestedLimit) : page;
    const next_cursor = hasMore ? buildCursor(items[items.length - 1]) : null;

    res.status(200).json({ items, next_cursor });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:changeId', (req: Request, res: Response) => {
  try {
    res.status(200).json(getChangeOrThrow(req.projectId!, req.params.changeId));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
