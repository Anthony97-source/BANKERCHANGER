import express from 'express';
import request from 'supertest';
import { getOracleReports } from '../../src/api/controllers/OracleController';
import { pool } from '../../src/config/db';
import { Request, Response, NextFunction } from 'express';
import * as OracleService from '../../src/oracle/OracleService';
import oracleRouter from '../../src/routes/oracle.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/config/redis', () => ({ redis: { set: jest.fn() } }));
jest.mock('../../src/oracle/OracleService', () => ({
  submitFightResult: jest.fn(),
  verifyOracleReport: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/oracle', oracleRouter);
app.use(errorMiddleware);

describe('getOracleReports', () => {
  const req = { params: { match_id: 'match-1' } } as unknown as Request;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it('returns reports for a match', async () => {
    const reports = [{
      oracle_address: 'GABC',
      outcome: 'fighter_a',
      reported_at: new Date(),
      tx_hash: 'stellar-tx-hash',
      accepted: true,
    }];
    (pool.query as jest.Mock).mockResolvedValue({ rows: reports });
    await getOracleReports(req, res as Response, next);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT oracle_address, outcome, reported_at, tx_hash, accepted[\s\S]*ORDER BY reported_at DESC/),
      ['match-1'],
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ match_id: 'match-1', reports });
  });

  it('returns an empty report array when the match has no reports', async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
    await getOracleReports(req, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ match_id: 'match-1', reports: [] });
  });
});

describe('POST /api/oracle/submit', () => {
  const validKey = 'test-oracle-api-key';
  const report = {
    match_id: 'match-1',
    outcome: 'fighter_a',
    reported_at: '2026-01-01T12:00:00.000Z',
    signature: 'a'.repeat(128),
    oracle_address: 'GABC',
  };
  const submittedReport = { id: 17, tx_hash: 'stellar-tx-hash' };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ORACLE_API_KEY = validKey;
  });

  it('rejects a missing API key with 401', async () => {
    const response = await request(app).post('/api/oracle/submit').send(report);

    expect(response.status).toBe(401);
    expect(OracleService.verifyOracleReport).not.toHaveBeenCalled();
  });

  it('rejects a wrong API key with 401', async () => {
    const response = await request(app)
      .post('/api/oracle/submit')
      .set('X-Oracle-Key', 'wrong-key')
      .send(report);

    expect(response.status).toBe(401);
    expect(OracleService.verifyOracleReport).not.toHaveBeenCalled();
  });

  it('rejects an invalid report signature with 401', async () => {
    (OracleService.verifyOracleReport as jest.Mock).mockResolvedValue(false);

    const response = await request(app)
      .post('/api/oracle/submit')
      .set('X-Oracle-Key', validKey)
      .send({ ...report, signature: 'invalid' });

    expect(response.status).toBe(401);
    expect(OracleService.submitFightResult).not.toHaveBeenCalled();
  });

  it('submits a valid report and returns its transaction hash and report ID', async () => {
    (OracleService.verifyOracleReport as jest.Mock).mockResolvedValue(true);
    (OracleService.submitFightResult as jest.Mock).mockResolvedValue(submittedReport);

    const response = await request(app)
      .post('/api/oracle/submit')
      .set('X-Oracle-Key', validKey)
      .send(report);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tx_hash: 'stellar-tx-hash', report_id: 17 });
    expect(OracleService.verifyOracleReport).toHaveBeenCalledWith(
      expect.objectContaining({ match_id: report.match_id, signature: report.signature }),
    );
    expect(OracleService.submitFightResult).toHaveBeenCalledWith('match-1', 'fighter_a');
  });
});
