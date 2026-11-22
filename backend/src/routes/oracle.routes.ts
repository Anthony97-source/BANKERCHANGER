import { Router, Request, Response, NextFunction } from 'express';
import {
  submitOracleResult,
  validateSubmitOracleResult,
  getOracleReports,
} from '../api/controllers/OracleController';
import { AppError } from '../utils/AppError';

const router = Router();

function requireOracleApiKey(req: Request, _res: Response, next: NextFunction): void {
  const expectedKey = process.env.ORACLE_API_KEY;
  if (!expectedKey || req.get('X-Oracle-Key') !== expectedKey) {
    return next(AppError.unauthorized('Invalid or missing X-Oracle-Key header'));
  }
  next();
}

/**
 * @swagger
 * tags:
 *   name: Oracle
 *   description: Oracle result submission and transparency reports
 */

/**
 * @swagger
 * /oracle/submit:
 *   post:
 *     summary: Submit an oracle result for a match
 *     tags: [Oracle]
 *     description: Requires a valid ORACLE_API_KEY in the X-Oracle-Key header
 *     parameters:
 *       - in: header
 *         name: X-Oracle-Key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [match_id, outcome, reported_at, signature, oracle_address]
 *             properties:
 *               match_id:
 *                 type: string
 *               outcome:
 *                 type: string
 *                 enum: [fighter_a, fighter_b, draw, no_contest]
 *               reported_at:
 *                 type: string
 *                 format: date-time
 *               signature:
 *                 type: string
 *                 description: Hex-encoded Ed25519 signature
 *               oracle_address:
 *                 type: string
 *                 description: Stellar public key of the signing oracle
 *     responses:
 *       200:
 *         description: Oracle result submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [tx_hash, report_id]
 *               properties:
 *                 tx_hash:
 *                   type: string
 *                 report_id:
 *                   type: integer
 *       401:
 *         description: Invalid API key or oracle report signature
 *       422:
 *         description: Validation error
 */
router.post('/submit', requireOracleApiKey, validateSubmitOracleResult, submitOracleResult);

/**
 * @swagger
 * /oracle/reports/{match_id}:
 *   get:
 *     summary: Get oracle reports for a match (public transparency endpoint)
 *     tags: [Oracle]
 *     parameters:
 *       - in: path
 *         name: match_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of oracle reports for the match
 *       404:
 *         description: No reports found
 */
router.get('/reports/:match_id', getOracleReports);

export default router;
