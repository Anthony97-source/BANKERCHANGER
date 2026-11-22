import { cancelMarket, flagDispute, investigateDispute, resolveDispute, listDisputes } from '../../src/api/controllers/AdminController';
import { setDbAdapter } from '../../src/services/MarketService';
import { invokeContract } from '../../src/services/StellarService';
import { adminOverrideResult } from '../../src/oracle/OracleService';
import { verifyToken } from '../../src/services/totp.service';
import { decrypt } from '../../src/services/crypto.service';
import { AppError } from '../../src/utils/AppError';
import type { Market } from '../../src/models/Market';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../src/services/StellarService', () => ({
  invokeContract: jest.fn().mockResolvedValue('mock-tx-hash'),
}));

jest.mock('../../src/oracle/OracleService', () => ({
  adminOverrideResult: jest.fn().mockResolvedValue('mock-dispute-tx-hash'),
  raiseDispute: jest.fn().mockResolvedValue('mock-dispute-tx-hash'),
  FightOutcome: {} as any,
}));

jest.mock('../../src/services/totp.service', () => ({
  verifyToken: jest.fn().mockReturnValue(true),
}));

jest.mock('../../src/services/crypto.service', () => ({
  decrypt: jest.fn((secret: string) => `decrypted:${secret}`),
}));

jest.mock('../../src/services/webhookDelivery.service', () => ({
  enqueueWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@stellar/stellar-sdk', () => {
  const mockSign = jest.fn().mockReturnValue(Buffer.from('mock-signature'));
  const mockKeypair = {
    fromSecret: jest.fn().mockReturnValue({
      sign: mockSign,
    }),
  };
  const mockAddress = {
    fromString: jest.fn((address: string) => ({
      toScVal: jest.fn(() => `address:${address}`),
    })),
  };
  return {
    Address: mockAddress,
    Keypair: mockKeypair,
    nativeToScVal: jest.fn((val: any) => val),
  };
});

jest.mock('../../src/services/cache.service', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
  cacheDeletePattern: jest.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 1,
    market_id: 'mkt-dispute-1',
    contract_address: 'C...',
    match_id: 'fight-1',
    fighter_a: 'Ali',
    fighter_b: 'Frazier',
    weight_class: 'heavyweight',
    title_fight: false,
    venue: 'MSG',
    scheduled_at: new Date('2026-06-01T00:00:00Z'),
    status: 'resolved',
    outcome: 'fighter_a',
    pool_a: '5000',
    pool_b: '3000',
    pool_draw: '0',
    total_pool: '8000',
    fee_bps: 200,
    lock_before_secs: 3600,
    resolved_at: new Date(),
    oracle_used: 'primary',
    created_at: new Date(),
    updated_at: new Date(),
    ledger_sequence: 1000,
    ...overrides,
  };
}

// ── Mock pool.query ──────────────────────────────────────────────────────────
let mockPoolQuery: jest.Mock;
let mockUpdateMarketStatus: jest.Mock;
const originalAdminAddress = process.env.ADMIN_ADDRESS;
const originalAdminTotpSecret = process.env.ADMIN_TOTP_SECRET;

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

import { pool } from '../../src/config/db';
import { Request, Response } from 'express';

function mockReqRes(overrides: Partial<Request> = {}): { req: Request; res: Response } {
  const req = {
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

describe('AdminController — Two-Phase Dispute Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (pool.query as jest.Mock).mockReset();
    (pool.connect as jest.Mock).mockReset();
    (verifyToken as jest.Mock).mockReturnValue(true);
    process.env.ADMIN_ADDRESS = 'GADMIN';
    process.env.ADMIN_TOTP_SECRET = 'MFRGGZDFMZTWQ2LK';
    mockUpdateMarketStatus = jest.fn();

    setDbAdapter({
      findMarkets: jest.fn(),
      findMarketById: jest.fn().mockResolvedValue(makeMarket()),
      findBetsByAddress: jest.fn().mockResolvedValue([]),
      findBetsByMarket: jest.fn().mockResolvedValue([]),
      updateMarketStatus: mockUpdateMarketStatus,
    });
  });

  afterEach(() => {
    if (originalAdminAddress === undefined) {
      delete process.env.ADMIN_ADDRESS;
    } else {
      process.env.ADMIN_ADDRESS = originalAdminAddress;
    }
    if (originalAdminTotpSecret === undefined) {
      delete process.env.ADMIN_TOTP_SECRET;
    } else {
      process.env.ADMIN_TOTP_SECRET = originalAdminTotpSecret;
    }
  });

  describe('Phase 1: flagDispute', () => {
    it('flags a resolved market as disputed and inserts dispute record', async () => {
      (pool.query as jest.Mock)
        // No existing dispute
        .mockResolvedValueOnce({ rows: [] })
        // Insert dispute
        .mockResolvedValueOnce({
          rows: [{ id: 1, market_id: 'mkt-dispute-1', reason: 'Suspicious result', status: 'open' }],
        });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Suspicious result' },
      });

      await flagDispute(req, res);

      expect(mockUpdateMarketStatus).toHaveBeenCalledWith('mkt-dispute-1', 'disputed');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tx_hash: 'mock-tx-hash' });
    });

    it('throws 400 if reason is missing', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: {},
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 if market not found', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(null),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'unknown' },
        body: { reason: 'Suspicious result' },
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 400 if market is not resolved', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'open' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Suspicious result' },
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 409 if active dispute already exists', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 1 }], // existing dispute
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Another reason' },
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('Market cancellation', () => {
    it('submits the reason, updates market status, and returns the confirmed transaction hash', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'locked' })),
        findBetsByAddress: jest.fn().mockResolvedValue([]),
        findBetsByMarket: jest.fn().mockResolvedValue([]),
        updateMarketStatus: mockUpdateMarketStatus,
      });
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Event postponed' },
      });

      await cancelMarket(req, res);

      expect(invokeContract).toHaveBeenCalledWith(
        'C...',
        'cancel_market',
        ['address:GADMIN', 'Event postponed'],
      );
      expect(mockUpdateMarketStatus).toHaveBeenCalledWith('mkt-dispute-1', 'cancelled');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tx_hash: 'mock-tx-hash' });
    });

    it('rejects an already-cancelled market', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'cancelled' })),
        findBetsByAddress: jest.fn().mockResolvedValue([]),
        findBetsByMarket: jest.fn().mockResolvedValue([]),
        updateMarketStatus: mockUpdateMarketStatus,
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Event postponed' },
      });

      await expect(cancelMarket(req, res)).rejects.toMatchObject({ statusCode: 400 });
      expect(invokeContract).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2: investigateDispute', () => {
    it('moves dispute from open to reviewing with admin_notes', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'disputed' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 1,
          market_id: 'mkt-dispute-1',
          status: 'reviewing',
          admin_notes: 'Reviewed the footage, result stands.',
          reviewed_at: new Date().toISOString(),
        }],
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { admin_notes: 'Reviewed the footage, result stands.' },
      });

      await investigateDispute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        dispute: expect.objectContaining({
          status: 'reviewing',
          admin_notes: 'Reviewed the footage, result stands.',
        }),
      });
    });

    it('throws 400 if admin_notes is missing', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: {},
      });

      await expect(investigateDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if market is not in disputed status', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'open' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { admin_notes: 'Looks fine.' },
      });

      await expect(investigateDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 if no open dispute found', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'disputed' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { admin_notes: 'Investigation complete.' },
      });

      await expect(investigateDispute(req, res)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('Phase 3: resolveDispute', () => {
    beforeEach(() => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'disputed' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });
    });

    it('verifies TOTP, submits the override, resolves the market, and logs the admin action', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'reviewing' }] })
        .mockResolvedValue({ rows: [] });

      const clientQuery = jest.fn(async (query: string) => {
        if (query.includes('UPDATE disputes')) {
          return {
            rowCount: 1,
            rows: [{ id: 1, market_id: 'mkt-dispute-1', status: 'resolved', final_outcome: 'fighter_b' }],
          };
        }
        if (query.includes('UPDATE markets')) {
          return { rows: [{ resolved_at: new Date() }] };
        }
        return { rows: [] };
      });
      (pool.connect as jest.Mock).mockResolvedValue({
        query: clientQuery,
        release: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { totp_code: '123456', outcome: 'fighter_b' },
      });
      (req as unknown as Record<string, unknown>).userId = 'admin-1';

      process.env.ADMIN_PRIVATE_KEY = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      await resolveDispute(req, res);

      expect(verifyToken).toHaveBeenCalledWith('MFRGGZDFMZTWQ2LK', '123456');
      expect(adminOverrideResult).toHaveBeenCalledWith('fight-1', 'fighter_b', expect.any(String));
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET outcome = $1, status = 'resolved'"),
        ['fighter_b', 'mkt-dispute-1'],
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO admin_audit_log'),
        ['admin-1', 'market_force_resolve', 'mkt-dispute-1', expect.any(Object), expect.any(Object)],
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ tx_hash: 'mock-dispute-tx-hash' });
    });

    it('returns 401 when the TOTP code is invalid', async () => {
      (verifyToken as jest.Mock).mockReturnValue(false);
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { totp_code: '000000', outcome: 'fighter_b' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 401 });
      expect(adminOverrideResult).not.toHaveBeenCalled();
    });

    it('loads the enabled admin TOTP secret from the database when no environment secret is set', async () => {
      delete process.env.ADMIN_TOTP_SECRET;
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ two_factor_enabled: true, two_factor_secret: 'encrypted-secret' }],
      });
      (verifyToken as jest.Mock).mockReturnValue(false);
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { totp_code: '000000', outcome: 'fighter_b' },
      });
      (req as unknown as Record<string, unknown>).userId = 'admin-1';

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 401 });
      expect(decrypt).toHaveBeenCalledWith('encrypted-secret');
      expect(verifyToken).toHaveBeenCalledWith('decrypted:encrypted-secret', '000000');
    });

    it('throws 400 if the TOTP code is missing', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { outcome: 'fighter_b' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if the outcome is invalid', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { totp_code: '123456', outcome: 'invalid_outcome' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if market is not in disputed status', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'open' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { totp_code: '123456', outcome: 'fighter_a' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if dispute is not in reviewing state', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 1, status: 'open' }], // not reviewing
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { totp_code: '123456', outcome: 'fighter_a' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
