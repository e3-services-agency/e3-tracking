/**
 * Public shared routes. No workspace middleware — token is the only auth.
 *
 * Mount in your Express app: app.use('/api/shared', sharedRouter);
 * Example: import sharedRouter from './routes/shared.js';
 */
import { Router, type Request, type Response } from 'express';
import { getJourneyByShareToken } from '../dal/journey.dal';
import { DatabaseError, NotFoundError } from '../errors';

const router = Router();

/**
 * GET /api/shared/journeys/:token
 * Returns journey canvas data for read-only view. Public (no x-workspace-id).
 * Response: { id, name, description, testing_instructions_markdown, nodes, edges }.
 */
router.get(
  '/journeys/:token',
  async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({
        error: 'Share token is required.',
        code: 'TOKEN_REQUIRED',
      });
      return;
    }
    try {
      const journey = await getJourneyByShareToken(token);
      res.status(200).json(journey);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({
          error: err.message,
          code: err.code,
          resource: err.resource,
        });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to load shared journey.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

export default router;
