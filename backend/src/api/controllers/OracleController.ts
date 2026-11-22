import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { validate } from '../../middleware/validation.middleware';
import * as OracleService from '../../oracle/OracleService';
import { z } from 'zod';
import { pool } from '../../config/db';

// ---------------------------------------------------------------------------
// Zod schema for POST /api/oracle/submit body
// ---------------------------------------------------------------------------
const ORACLE_OUTCOMES = ['fighter_a', 'fighter_b', 'draw', 'no_contest'] as const;

const submitOracleResultSchema = z.object({
  match_id: z.string().min(1, 'match_id is required'),
  outcome: z.enum(ORACLE_OUTCOMES, {
    errorMap: () => ({ message: 'outcome must be one of: fighter_a, fighter_b, draw, no_contest' }),
  }),
  reported_at: z
    .string()
    .datetime({ message: 'reported_at must be a valid ISO 8601 datetime string' }),
  signature: z
    .string()
    .min(1, 'signature is required'),
  oracle_address: z
    .string()
    .min(1, 'oracle_address is required'),
});

export const validateSubmitOracleResult = validate(submitOracleResultSchema, 'body');

/**
 * POST /api/oracle/submit
 * Verify the signed report before submitting the fight result.
 */
export async function submitOracleResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { match_id, outcome, reported_at, signature, oracle_address } =
      req.body as z.infer<typeof submitOracleResultSchema>;

    const report = {
      id: 0,
      match_id,
      outcome,
      reported_at: new Date(reported_at),
      signature,
      oracle_address,
      accepted: false,
      tx_hash: null,
      created_at: new Date(),
    };

    if (!(await OracleService.verifyOracleReport(report))) {
      return next(new AppError(401, 'Invalid oracle report signature'));
    }

    const submittedReport = await OracleService.submitFightResult(match_id, outcome);
    if (!submittedReport.tx_hash) {
      throw new AppError(500, 'Oracle report submission did not return a transaction hash');
    }

    res.status(200).json({
      tx_hash: submittedReport.tx_hash,
      report_id: submittedReport.id,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oracle/reports/:match_id
 * Returns all oracle reports for a fight.
 */
export async function getOracleReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT reported_at AS timestamp, oracle_address, outcome, signature
       FROM oracle_reports WHERE match_id = $1 ORDER BY reported_at ASC`,
      [req.params.match_id],
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: { message: 'No oracle reports found for this match' } });
      return;
    }
    res.status(200).json({ match_id: req.params.match_id, reports: rows });
  } catch (error) {
    next(error);
  }
}
