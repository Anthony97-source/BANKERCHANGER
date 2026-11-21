export const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
};

// Ensure child() returns the same mock surface so tests can assert
// request_id-bearing structured calls without breaking.
logger.child.mockImplementation(() => logger);