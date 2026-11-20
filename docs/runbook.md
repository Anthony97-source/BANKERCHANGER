# BANKERCHANGER Operational Runbook

## Overview

This runbook provides step-by-step procedures for responding to common production incidents in the BANKERCHANGER platform. Each incident type includes observable symptoms, diagnostic procedures, resolution steps, and escalation protocols.

**Table of Contents:**
1. [Database Backup & Disaster Recovery](#database-backup--disaster-recovery)
2. [Oracle Failures & Unresolved Markets](#oracle-failures--unresolved-markets)
3. [Oracle Resolution Failure (Sustained) — User Funds Locked](#oracle-resolution-failure-sustained--user-funds-locked)
4. [Treasury Withdrawal Limits Exceeded](#treasury-withdrawal-limits-exceeded)
5. [Contract Pause Events](#contract-pause-events)
6. [High Dispute Volumes](#high-dispute-volumes)
7. [RPC Node Outages](#rpc-node-outages)
8. [Indexer Lag](#indexer-lag)
9. [High Error Rate](#high-error-rate)
10. [Database Connection Pool Exhausted](#database-connection-pool-exhausted)
11. [API Slowdown](#api-slowdown)
12. [Log Aggregation & Request Tracing](#log-aggregation--request-tracing)
13. [Escalation & On-Call Path](#escalation--on-call-path)
14. [Load Testing Guidelines](#load-testing-guidelines)
15. [Quick Reference: CLI Commands](#quick-reference-cli-commands)

---

## Database Backup & Disaster Recovery

### Overview

BANKERCHANGER maintains automated daily backups of the PostgreSQL database with encryption and redundant storage in AWS S3. This section covers backup operations, restore procedures, and disaster recovery scenarios.

**Backup Strategy:**
- **Frequency:** Daily automated backups at 2:00 AM UTC
- **Retention:** 30-day rolling window (configurable)
- **Encryption:** AES-256 at rest using OpenSSL
- **Integrity:** SHA-256 checksum sidecar generated with every backup and verified before every restore
- **Storage:** AWS S3 with versioning and lifecycle policies
- **Verification:** Weekly integrity checks (Sundays 3:00 AM UTC)
- **Cleanup:** Monthly retention enforcement (1st of month 4:00 AM UTC)

### Backup Status & Monitoring

#### Check Last Backup

```bash
# List all available backups
cd /app && ./backend/scripts/manage-backups.sh --list

# Show storage statistics
cd /app && ./backend/scripts/manage-backups.sh --stats

# Generate full backup report
cd /app && ./backend/scripts/manage-backups.sh --report
```

#### Verify Backup Integrity

Run weekly to ensure all backups are accessible and not corrupted:

```bash
# Verify all backups
cd /app && ./backend/scripts/manage-backups.sh --verify-integrity

# Expected output: ✓ VALID for each backup
```

#### Monitor Backup Logs

```bash
# Daily backup log
tail -f /var/log/backups/cron-backup.log

# Verification log
tail -f /var/log/backups/cron-verify.log

# Cleanup log
tail -f /var/log/backups/cron-cleanup.log
```

### Disaster Recovery Procedures

#### Scenario 1: Restore Most Recent Backup

Use this procedure to restore from the latest available backup (typical recovery scenario).

**Prerequisites:**
- Access to AWS account with S3 access
- PostgreSQL client tools installed
- Encryption key available (`$BACKUP_ENCRYPTION_KEY_FILE`)

**Steps:**

1. **List available backups:**
   ```bash
   cd /app && ./backend/scripts/manage-backups.sh --list
   ```

2. **Restore latest backup to temporary database:**
   ```bash
   # Restore to test database first (non-destructive)
   cd /app && ./backend/scripts/restore-db.sh \
     --latest \
     --target-db bankerchanger_restore_test
   ```

3. **Verify restored database:**
   ```bash
   # Connect to restored database
   psql postgresql://bankerchanger:password@localhost:5432/bankerchanger_restore_test

   # Run validation queries
   SELECT COUNT(*) FROM markets;
   SELECT COUNT(*) FROM bets;
   SELECT COUNT(*) FROM users;
   ```

4. **Swap databases (if validation passes):**
   ```bash
   # Create backup of current production database
   pg_dump postgresql://bankerchanger:password@localhost:5432/bankerchanger \
     > /backups/prod_backup_$(date +%Y%m%d_%H%M%S).sql

   # Drop current database
   psql postgresql://bankerchanger:password@localhost:5432 \
     -c "DROP DATABASE bankerchanger;"

   # Rename restored database
   psql postgresql://bankerchanger:password@localhost:5432 \
     -c "ALTER DATABASE bankerchanger_restore_test RENAME TO bankerchanger;"

   # Restart application
   systemctl restart bankerchanger-backend
   ```

#### Scenario 2: Restore Specific Backup by Timestamp

Use this to restore from a known point in time.

1. **Find backup timestamp:**
   ```bash
   # View all backups with timestamps
   cd /app && ./backend/scripts/manage-backups.sh --list

   # Example output:
   # 20240115_020000  123.5MB  bankerchanger  2024-01-15 02:00:00
   # 20240114_020000  122.8MB  bankerchanger  2024-01-14 02:00:00
   ```

2. **Restore specific backup:**
   ```bash
   cd /app && ./backend/scripts/restore-db.sh \
     --backup-timestamp 20240115_020000 \
     --target-db bankerchanger_restore_test
   ```

3. **Follow verification and swap steps from Scenario 1**

#### Scenario 3: Full Database Loss (Critical Recovery)

Perform complete database restoration from backup in case of data corruption or total failure.

1. **Stop application immediately:**
   ```bash
   systemctl stop bankerchanger-backend
   systemctl stop bankerchanger-indexer
   ```

2. **Verify PostgreSQL is running:**
   ```bash
   systemctl status postgresql
   # If not running, start it:
   systemctl start postgresql
   ```

3. **Drop corrupted database (if exists):**
   ```bash
   psql postgresql://postgres:password@localhost:5432 \
     -c "DROP DATABASE IF EXISTS bankerchanger;"
   ```

4. **Restore from latest backup:**
   ```bash
   cd /app && ./backend/scripts/restore-db.sh --latest

   # This will restore to default database: bankerchanger
   ```

5. **Verify database integrity:**
   ```bash
   # Connect and run schema validation
   psql postgresql://bankerchanger:password@localhost:5432/bankerchanger \
     -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';"

   # Should return table count > 10
   ```

6. **Restart application:**
   ```bash
   systemctl start bankerchanger-backend
   systemctl start bankerchanger-indexer

   # Monitor startup
   journalctl -u bankerchanger-backend -f
   ```

7. **Verify connectivity:**
   ```bash
   # Health check
   curl -s http://localhost:3001/api/health | jq '.'

   # Check recent data
   curl -s http://localhost:3001/api/markets?limit=5 | jq '.markets[].title'
   ```

### Health Check Monitoring

- Configure an external uptime check for the public `GET /health` endpoint. It returns only a health status and timestamp; treat non-2xx responses, including `503`, and request timeouts as unhealthy.
- Keep `/health/detailed` internal to operational tooling and require an admin access token when querying it. Do not make it publicly reachable through a proxy or monitoring dashboard.
- Alert on sustained health-check failures and investigate application/database/Redis logs before using the authenticated detailed endpoint to diagnose dependencies.
- Avoid logging or sharing authorization headers or detailed health responses, which include internal dependency and connection-pool information.

### Backup Encryption & Key Management

#### Initialize Encryption Key

Generate a new AES-256 encryption key (do this once, then secure the key):

```bash
# Generate and store locally
cd /app && ./backend/scripts/generate-backup-key.sh \
  --key-file /secure/backups/encryption.key

# Or store in AWS Secrets Manager
cd /app && ./backend/scripts/generate-backup-key.sh --to-secrets-manager
```

#### Encryption Key Location

Configure where backup scripts find the encryption key:

```bash
# Option 1: Local file (secure, restricted permissions)
export BACKUP_ENCRYPTION_KEY_FILE=/secure/backups/encryption.key

# Option 2: AWS Secrets Manager (recommended for production)
# Script automatically fetches from Secrets Manager if key file not found
export BACKUP_KEY_SECRET_NAME=bankerchanger/db-backup-key
```

#### Key Rotation

To rotate encryption keys (every 90 days recommended):

```bash
# 1. Generate new key
cd /app && ./backend/scripts/generate-backup-key.sh --key-file /secure/backups/encryption.key.new

# 2. Update environment variable
export BACKUP_ENCRYPTION_KEY_FILE=/secure/backups/encryption.key.new

# 3. Verify next backup uses new key
# 4. Securely destroy old key after verification period
# shred -vfz /secure/backups/encryption.key
```

### Manual Backup Operations

#### Create On-Demand Backup

Trigger a backup manually outside the scheduled cron job:

```bash
# Ensure environment variables are set
export DATABASE_URL=postgresql://bankerchanger:password@localhost:5432/bankerchanger
export AWS_S3_BACKUP_BUCKET=my-backups-bucket
export AWS_REGION=us-east-1
export BACKUP_ENCRYPTION_KEY_FILE=/secure/backups/encryption.key

# Run backup
cd /app && ./backend/scripts/backup-db.sh

# Monitor progress in log
tail -f /var/log/backups/backup-$(date +%Y%m).log
```

#### Cleanup Old Backups Manually

Force cleanup of backups older than retention period:

```bash
# Run cleanup (respects BACKUP_RETENTION_DAYS)
cd /app && ./backend/scripts/manage-backups.sh --cleanup

# Show what would be deleted (verify retention date)
export RETENTION_DAYS=30
cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
echo "Will delete backups before: $cutoff_date"
```

### Cron Job Setup & Configuration

#### Install Automated Cron Jobs

Set up daily backups, weekly verification, and monthly cleanup:

```bash
# Install cron jobs (requires sudo)
sudo ./backend/scripts/backup-cron-setup.sh \
  --user backup \
  --app-dir /app

# Verify installation
crontab -u backup -l | grep BANKERCHANGER_DB_BACKUP
```

#### Cron Schedule

| Job | Schedule | Time (UTC) | Purpose |
|-----|----------|-----------|---------|
| Daily Backup | 0 2 * * * | 2:00 AM | Create encrypted backup |
| Weekly Verify | 0 3 * * 0 | 3:00 AM Sunday | Integrity check all backups |
| Monthly Cleanup | 0 4 1 * * | 4:00 AM 1st | Delete backups >30 days old |

#### Remove Cron Jobs

If decommissioning backups:

```bash
# Remove all backup cron jobs
sudo ./backend/scripts/backup-cron-setup.sh --remove
```

### Troubleshooting

#### Backup Failed

```bash
# Check error in logs
tail -100 /var/log/backups/backup-$(date +%Y%m).log

# Common issues:
# 1. Missing AWS credentials
aws sts get-caller-identity

# 2. S3 bucket not accessible
aws s3 ls s3://$AWS_S3_BACKUP_BUCKET --region $AWS_REGION

# 3. Database connection failed
psql $DATABASE_URL -c "SELECT 1"

# 4. Encryption key missing
ls -la $BACKUP_ENCRYPTION_KEY_FILE
```

#### Restore Failed

```bash
# Check restore log
tail -100 /var/log/backups/restore-*.log

# Verify S3 backup and checksum sidecar exist
aws s3 ls "s3://$AWS_S3_BACKUP_BUCKET/db-backups/" --region $AWS_REGION --recursive

# Verify the backup checksum manually (exit code 7 means integrity failure)
aws s3 cp "s3://$AWS_S3_BACKUP_BUCKET/db-backups/<backup>.sql.gz.enc.sha256" /tmp/
aws s3 cp "s3://$AWS_S3_BACKUP_BUCKET/db-backups/<backup>.sql.gz.enc" /tmp/
(cd /tmp && sha256sum -c --strict "<backup>.sql.gz.enc.sha256")

# Verify encryption key
cat $BACKUP_ENCRYPTION_KEY_FILE

# Test decryption manually
openssl enc -aes-256-cbc -d -in backup.sql.gz.enc -pass file:$BACKUP_ENCRYPTION_KEY_FILE | gunzip > test.sql
```

#### S3 Upload Fails

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check S3 bucket policy allows uploads
aws s3api get-bucket-policy --bucket $AWS_S3_BACKUP_BUCKET

# Verify S3 bucket exists and is in correct region
aws s3api head-bucket --bucket $AWS_S3_BACKUP_BUCKET --region $AWS_REGION
```

### Escalation Protocol

| Level | Timeframe | Symptoms | Action |
|-------|-----------|----------|--------|
| **Level 1** | - | Backup missed | Check cron logs; verify S3/encryption access; re-run manually |
| **Level 2** | 6 hours | Multiple backups failed | Notify ops; verify database connectivity; check AWS service status |
| **Level 3** | 24 hours | Total backup failure + data access needed | Activate disaster recovery; consider point-in-time restore; notify users if needed |

### Prevention & Best Practices

- **Test restores monthly:** Verify restore procedures work before crisis
- **Key escrow:** Store backup keys in separate secure location
- **Monitor backup age:** Alert if latest backup >24 hours old
- **Verify integrity:** Run weekly verification to catch corruption early
- **Document RTO/RPO:** Backup strategy supports <1 hour RPO, <4 hour RTO
- **Encrypt keys:** Never commit encryption keys to version control
- **Audit access:** Log all restore operations for compliance

---

## Oracle Failures & Unresolved Markets

### Observable Symptoms

- Markets stuck in "locked" state beyond expected resolution time
- Oracle provider reports failed submission
- Blockchain explorer shows no resolution transaction for market
- User complaints about inability to claim or receive payouts
- Zero or null `outcome` field in market records after scheduled_at has passed

### Diagnostic Procedures

**Step 1: Verify Market Status**
```bash
# Check market state in database
curl -s http://localhost:3001/api/markets/{market_id} | jq '.status, .outcome, .scheduled_at'

# Expected output should show: status: "locked", outcome: null (if in past)
```

**Step 2: Check Oracle Submission Logs**
```bash
# Query backend logs for resolution attempt
grep "oracle.*submit\|resolution.*failed" backend.log

# Check Horizon for pending transactions
curl -s "https://horizon-testnet.stellar.org/accounts/{oracle_address}/transactions" | jq '.records[0:5]'
```

**Step 3: Verify Contract State**
```bash
# Get market factory state
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network testnet \
    -- query_market \
    --market-id {market_id}
```

### Resolution Steps

**For Recent Oracle Failures (within 1 hour):**

1. **Contact Oracle Provider** - Verify service status and resubmission ETA
2. **Trigger Manual Resolution** (if authorized):
   ```bash
   # Force resolve market to draw (no contest)
   stellar contract invoke \
       --id {MARKET_FACTORY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- admin_force_resolve \
       --market-id {market_id} \
       --outcome no_contest
   ```

3. **Notify Users** - Inform affected bettors of forced resolution and payout timing

**For Extended Oracle Downtime (>1 hour):**

1. **Escalate to Oracle Service Provider** - Request emergency support
2. **Prepare Market Cancellation** - See [cancellation CLI commands](#force-cancel-market) below
3. **Refund Treasury Preparation** - Ensure sufficient liquidity for refunds

### Escalation Protocol

- **Level 1 (0-30 min):** Monitor and contact oracle provider support
- **Level 2 (30-60 min):** Notify platform administrators, prepare market force-resolution
- **Level 3 (>1 hour):** Invoke emergency pause, initiate user communications, request oracle emergency support

---

## Oracle Resolution Failure (Sustained) — User Funds Locked

### Observable Symptoms

- Multiple markets remain in "locked" state for >24 hours past `scheduled_at`
- Oracle repeatedly returns errors on submission (`/api/oracle` 5xx or timeout on every attempt)
- User funds are locked in unresolved markets — users cannot claim winnings
- Backend cron logs show repeated failures: `autoResolution cron: oracle submit failed for market {id}`
- Dispute count spikes as users flag unresolved markets
- Monitoring alerts fire for `locked_markets_past_due > 0` for extended period

### Detection

**Step 1: Identify stuck markets**
```bash
# Database query: markets past resolution time still locked
psql $DATABASE_URL <<SQL
SELECT id, title, scheduled_at, status, outcome,
       EXTRACT(EPOCH FROM (NOW() - scheduled_at)) / 3600 AS hours_past_due
FROM markets
WHERE status = 'locked'
  AND scheduled_at < NOW() - INTERVAL '1 hour'
ORDER BY scheduled_at ASC;
SQL
```

**Step 2: Confirm oracle is unreachable**
```bash
# Test oracle health endpoint
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/oracle/health

# Check Horizon for recent oracle account activity
curl -s "https://horizon-testnet.stellar.org/accounts/{ORACLE_ADDRESS}/operations?limit=5&order=desc" | jq '.records[].type'
```

**Step 3: Estimate locked fund impact**
```bash
# Total user funds locked in unresolved markets
psql $DATABASE_URL <<SQL
SELECT COUNT(DISTINCT user_id) AS affected_users,
       SUM(amount) / 10000000.0 AS total_locked_xlm
FROM bets
WHERE market_id IN (
  SELECT id FROM markets
  WHERE status = 'locked' AND scheduled_at < NOW() - INTERVAL '1 hour'
);
SQL
```

### Manual Resolution Steps

**Option A: Admin Force Resolution (Recommended — when outcome is known)**

Use when the boxing match result is publicly available but oracle failed to submit.

```bash
# 1. Verify the correct outcome from an authoritative source
#    (official boxing commission, major sports sites, event promoter)

# 2. Force resolve the market on-chain
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_force_resolve \
    --market-id {market_id} \
    --outcome {fighter_a|fighter_b|draw|no_contest}

# 3. Verify resolution on-chain
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- query_market \
    --market-id {market_id} | jq '.outcome'

# 4. Verify payouts are enabled (status changes from "locked" to "resolved")
curl -s http://localhost:3001/api/markets/{market_id} | jq '.status'
```

**Option B: Market Cancellation (Fallback — when outcome cannot be verified)**

Use when the event was cancelled, postponed indefinitely, or outcome is disputed beyond resolution.

```bash
# 1. Cancel the market and refund all bettors
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_cancel_market \
    --market-id {market_id} \
    --reason "oracle_unavailable"

# 2. Verify cancellation
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- query_market \
    --market-id {market_id} | jq '.status'
# Expected: "cancelled"

# 3. Confirm treasury has sufficient balance for refunds
stellar contract invoke \
    --id {TREASURY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- get_treasury_state | jq '.balance_stroops'
```

**Option C: Batch Resolution Script (for many stuck markets)**

```bash
# Run the batch resolution helper (if available)
node scripts/batch-resolve-markets.js \
    --network mainnet \
    --outcome-source manual \
    --markets-file /tmp/stuck_markets.json

# Or manually iterate:
psql $DATABASE_URL -t -A -c \
  "SELECT id FROM markets WHERE status = 'locked' AND scheduled_at < NOW() - INTERVAL '24 hours';" \
  | while read -r market_id; do
    echo "Resolving market: $market_id"
    # Force resolve or cancel each market
  done
```

### Admin Override Commands

| Command | Purpose | Risk Level |
|---------|---------|-----------|
| `admin_force_resolve` | Resolve a single market to a specific outcome | Medium — verify outcome first |
| `admin_cancel_market` | Cancel market and trigger refunds | High — funds returned but user trust impacted |
| `admin_pause` | Halt all new bets and market creation | Critical — freezes entire platform |
| `admin_unpause` | Resume platform operations after fix | Critical — unpause only after verifying oracle recovery |

**Before using any admin override:**
1. Document the reason in the admin audit log
2. Take a database snapshot of affected markets and bets
3. Notify the team in the incident channel
4. Prepare a user communication draft

### Oracle Recovery & Failover

**Step 1: Attempt oracle recovery**
```bash
# Restart oracle service if self-hosted
ssh user@oracle-host "systemctl restart boxmeout-oracle"

# Check oracle logs
ssh user@oracle-host "journalctl -u boxmeout-oracle -n 100 --no-pager"
```

**Step 2: Switch to backup oracle (if configured)**
```bash
# Update oracle address in environment
export ORACLE_ADDRESS={BACKUP_ORACLE_ADDRESS}

# Restart backend to pick up new oracle config
systemctl restart boxmeout-backend
```

**Step 3: Verify oracle is submitting**
```bash
# Watch for new oracle submissions
watch -n 30 "curl -s http://localhost:3001/api/markets?status=resolved&limit=5 | jq '.markets[].resolvedAt'"
```

### Escalation Protocol

| Level | Timeframe | Action |
|-------|-----------|--------|
| **Level 1** | 0-2 hours | Monitor oracle health; check if issue is transient RPC/node related |
| **Level 2** | 2-6 hours | Notify platform administrators; begin manual resolution for time-critical markets; draft user notification |
| **Level 3** | 6-24 hours | Pause new market creation via `admin_pause`; resolve all overdue markets manually; publish incident post to users |
| **Level 4** | >24 hours | Executive escalation; consider switching oracle provider; publish post-mortem; assess user compensation if needed |

### User Communication Template

```
Subject: [BoxMeOut] Market Resolution Delay — {market_title}

We are experiencing a delay in resolving the market for "{market_title}".

What happened: The oracle service responsible for submitting event results
has encountered an issue.

What we're doing:
- [If known outcome] We are manually resolving this market with the verified result.
- [If unknown] We are working to obtain the verified result and will resolve shortly.

Your funds remain safe on-chain. Payouts will be processed as soon as the
market is resolved. No action is required from you.

We will provide an update within {timeframe}.

— BoxMeOut Team
```

### Prevention

- **Oracle redundancy:** Configure at least 2 oracle addresses in `ORACLE_ADDRESSES`
- **Health monitoring:** Set up uptime checks on oracle endpoint with alerting
- **Auto-resolution cron:** Ensure `autoResolution.cron.ts` is running and logs are monitored
- **Scheduled market lock:** Verify markets are locked before `scheduled_at` via `autoLockCron`
- **Runbook drills:** Practice oracle failure scenarios quarterly

---

## Treasury Withdrawal Limits Exceeded

### Observable Symptoms

- Withdrawal transactions fail with "limit exceeded" error
- Error logs show: `withdrawal_limit_exceeded` or `daily_limit_exceeded`
- Users unable to claim winnings or withdraw funds
- Database shows total_withdrawn > WITHDRAWAL_LIMIT for current day

### Diagnostic Procedures

**Step 1: Check Current Treasury State**
```bash
# Query treasury contract
stellar contract invoke \
    --id {TREASURY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network testnet \
    -- get_treasury_state

# Check: current_day_withdrawn vs withdrawal_limit_stroops
```

**Step 2: Verify Daily Limit Configuration**
```bash
# Check configured withdrawal limit in deployments.json
jq '.contracts.treasury.withdrawalLimitStroops' contracts/deployments.json

# Convert stroops to XLM (divide by 10,000,000)
echo "scale=7; $(jq '.contracts.treasury.withdrawalLimitStroops' contracts/deployments.json) / 10000000" | bc
```

**Step 3: Analyze Withdrawal Patterns**
```bash
# Query recent withdrawals from backend
curl -s "http://localhost:3001/api/treasury/withdrawals?limit=50&sort=latest" | \
    jq '.withdrawals | group_by(.date) | map({date: .[0].date, total: map(.amount | tonumber) | add})'
```

### Resolution Steps

**Option A: Increase Daily Withdrawal Limit (Recommended)**

1. **Update Treasury Contract:**
   ```bash
   # Invoke update_withdrawal_limit on treasury
   stellar contract invoke \
       --id {TREASURY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- update_withdrawal_limit \
       --new-limit-stroops {NEW_LIMIT}
   
   # Example: 2 billion stroops (200 XLM)
   # stellar contract invoke ... --new-limit-stroops 2000000000
   ```

2. **Verify Update:**
   ```bash
   stellar contract invoke \
       --id {TREASURY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- get_treasury_state | jq '.withdrawal_limit_stroops'
   ```

3. **Notify Users** - Inform waiting users that withdrawals are now available

**Option B: Wait for Daily Reset**

1. If the spike is temporary, daily limits reset at UTC midnight
2. Provide ETA to users: "Withdrawals available at 00:00 UTC tomorrow"
3. Monitor for continued issues

**Option C: Temporary Emergency Pause (if security concern)**

See [Contract Pause Events](#contract-pause-events) section.

### Escalation Protocol

- **Level 1:** Analyze withdrawal patterns, increase limit if stable
- **Level 2 (Repeated in 24h):** Notify analytics team, review fee structure impact
- **Level 3 (Pattern suggests fraud):** Pause treasury, investigate, escalate to security team

---

## Contract Pause Events

### Observable Symptoms

- Market creation returns "contract paused" error
- Bet placement fails with pause/freeze status
- All contract invocations fail or are blocked
- User-facing UI shows maintenance message

### Diagnostic Procedures

**Step 1: Check Pause Status**
```bash
# Query market factory pause state
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network testnet \
    -- is_paused

# Returns: true/false
```

**Step 2: Identify Pause Reason**
```bash
# Check recent contract logs
grep "pause\|frozen\|emergency" backend.log | tail -20

# Check for recent admin operations
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network testnet \
    -- get_pause_reason
```

**Step 3: Estimate Impact**
```bash
# Count locked markets
curl -s http://localhost:3001/api/markets?status=locked | jq '.total'

# Check pending withdrawals
curl -s http://localhost:3001/api/treasury/pending_withdrawals | jq '.total_pending_stroops'
```

### Resolution Steps

**For Intentional Pause (maintenance/security):**

1. **Verify Admin Authorization:**
   ```bash
   # Check transaction history for pause event
   stellar transaction {PAUSE_TX_HASH} --network mainnet
   ```

2. **Communicate Timeline:**
   - Notify users via all channels
   - Provide estimated resume time
   - Monitor for support requests

3. **Resume Operations:**
   ```bash
   # Unpause market factory
   stellar contract invoke \
       --id {MARKET_FACTORY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- admin_unpause
   ```

4. **Verify Resumption:**
   ```bash
   stellar contract invoke \
       --id {MARKET_FACTORY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- is_paused

   # Should return: false
   ```

**For Unintended Pause:**

1. **Identify cause** - Check logs for error triggers
2. **Assess risk** - Is there active fraud or exploit?
3. **Unpause immediately** if false alarm using command above
4. **Post-mortem** - Review what triggered pause

### Escalation Protocol

- **Level 1:** Confirm pause reason, communicate ETA
- **Level 2:** Notify platform leads, analyze impact
- **Level 3:** Executive notification if >1 hour outage

---

## High Dispute Volumes

### Observable Symptoms

- Dispute count exceeds normal volume (>10% of markets daily)
- Backend dispute handling queue backing up
- User reports of delays in dispute resolution
- Database shows `status: "disputed"` for many recent markets

### Diagnostic Procedures

**Step 1: Check Dispute Metrics**
```bash
# Query recent disputes
curl -s "http://localhost:3001/api/markets?status=disputed&limit=100" | jq '.total'

# Compare to historical baseline (usually <1% of markets)
# If >5%, investigate further
```

**Step 2: Analyze Dispute Patterns**
```bash
# Group disputes by market/oracle
curl -s "http://localhost:3001/api/disputes?limit=500" | jq '
  group_by(.market_id) | 
  map({
    market_id: .[0].market_id,
    count: length,
    disputants: map(.disputer) | unique | length
  }) | 
  sort_by(.count) | reverse | .[0:10]
'

# Check if concentrated on few markets or widespread
```

**Step 3: Review Oracle Submissions**
```bash
# Check for conflicting oracle data
curl -s "http://localhost:3001/api/oracle/submissions?sort=latest&limit=50" | jq '
  group_by(.market_id) | 
  map(select(length > 1)) |
  map({market_id: .[0].market_id, outcomes: map(.outcome) | unique})
'
```

### Resolution Steps

**For Oracle Conflicts:**

1. **Verify Facts:**
   - Check official event results from multiple sources
   - Obtain video/photographic evidence if available
   - Consult domain experts (sports analysts, judges)

2. **Manual Resolution:**
   ```bash
   # Resolve market to correct outcome with evidence
   stellar contract invoke \
       --id {MARKET_FACTORY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- admin_resolve_dispute \
       --market-id {market_id} \
       --correct-outcome {fighter_a|fighter_b|draw}
   ```

3. **Communicate Resolution:**
   - Post explanation in dispute thread
   - Link to evidence/sources
   - Notify affected users

**For Frivolous Disputes:**

1. **Reject with evidence:**
   ```bash
   stellar contract invoke \
       --id {MARKET_FACTORY_ADDRESS} \
       --source {ADMIN_SECRET_KEY} \
       --network mainnet \
       -- admin_reject_dispute \
       --market-id {market_id} \
       --reason "Oracle submission verified against official results"
   ```

2. **Document pattern** - If same user files many frivolous disputes, flag for review

**For Systemic Oracle Issues:**

- See [Oracle Failures](#oracle-failures--unresolved-markets) section
- Consider adding additional trusted oracles
- Review oracle selection criteria

### Escalation Protocol

- **Level 1 (1-2% disputes):** Route to dispute review team
- **Level 2 (2-5% disputes):** Daily standups, investigate oracle reliability
- **Level 3 (>5% disputes):** Pause new market creation pending investigation

---

## RPC Node Outages

### Observable Symptoms

- All contract operations timeout or fail with connection errors
- Error logs show: `SOROBAN_RPC connection refused` or `timeout`
- Frontend shows "Unable to connect to blockchain" message
- Stellar CLI commands fail with network errors

### Diagnostic Procedures

**Step 1: Check RPC Connectivity**
```bash
# Test Soroban RPC endpoint
curl -s -X POST "$STELLAR_RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "getNetwork", "params": []}' | jq '.result.network'

# Expected: returns network identifier (e.g., "Test SDF Network")
```

**Step 2: Verify Horizon API**
```bash
# Check Horizon connectivity
curl -s "$HORIZON_URL/health" | jq '.status'

# Expected: returns "healthy"
```

**Step 3: Check Fallback Nodes**
```bash
# If using custom RPC, test public fallback
STELLAR_RPC_URL=https://soroban-testnet.stellar.org curl -s -X POST "$STELLAR_RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "getNetwork", "params": []}'
```

### Resolution Steps

**For Private RPC Node Outage:**

1. **Check Node Status:**
   ```bash
   # SSH to RPC node
   ssh user@rpc-node-host
   
   # Check service status
   systemctl status soroban-rpc
   
   # View recent logs
   journalctl -u soroban-rpc -n 50 --no-pager
   ```

2. **Restart Service:**
   ```bash
   systemctl restart soroban-rpc
   
   # Verify startup (wait 30-60 seconds for sync)
   sleep 60
   curl -s http://localhost:8000/health | jq '.ledgerCloseTime'
   ```

3. **If Restart Fails:**
   - Check disk space: `df -h`
   - Check memory: `free -h`
   - Check logs for specific errors
   - Consider snapshot restore or re-sync

**For Public RPC Outage (Stellar-hosted):**

1. **Switch to Fallback:**
   ```bash
   # Temporarily use different RPC provider
   export STELLAR_RPC_URL="https://soroban-mainnet.stellar.org"  # or alternative
   
   # Restart application servers
   systemctl restart frontend
   systemctl restart indexer
   ```

2. **Monitor Status:**
   - Check Stellar status page: https://status.stellar.org
   - Wait for official announcement of restoration
   - Monitor fallback node performance

3. **Update Configuration:**
   - If switching permanently, update deploy.sh and environment files
   - Notify team of new RPC endpoint
   - Test thoroughly before production traffic

**For Network Sync Lag:**

```bash
# Check if node is catching up to current ledger
curl -s http://localhost:8000/health | jq '{
  ledger_close_time: .ledgerCloseTime,
  current_time: (now * 1000)
}'

# If difference > 60 seconds, node is lagging
# Wait for sync to complete (can take 10-30 minutes for full catch-up)
```

### Escalation Protocol

- **Level 1 (0-5 min):** Check RPC health, verify connectivity
- **Level 2 (5-30 min):** Restart services, consider failover
- **Level 3 (>30 min):** Executive notification, activate disaster recovery plan

---

## Indexer Lag

### Observable Symptoms

- Indexer health check returns non-ready (`503`) or reports ledger lag above threshold
- `GET /healthz/ready` on the indexer reports `ledgerLag` growing over time
- Markets/bets created on-chain do not appear in the API within the expected window
- Logs show repeated `getLatestLedger` / `getEvents` errors or RPC timeouts
- Monitoring alert for `indexer_ledger_lag > N` (default threshold: 30 ledgers)

### Diagnostic Procedures

**Step 1: Check indexer readiness and ledger lag**

```bash
# Readiness probe (returns 200 when caught up, 503 when lagging)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/healthz/ready

# Full readiness payload, including current vs. chain ledger
curl -s http://localhost:3002/healthz/ready | jq '{status, ledgerLag, lastIndexedLedger, latestChainLedger}'
```

**Step 2: Verify RPC connectivity and chain head**

```bash
# Confirm the RPC endpoint is reachable and returning a ledger
curl -s -X POST "$STELLAR_RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger","params":[]}' | jq '.result.sequence'

# Compare with the indexer's last indexed ledger
curl -s http://localhost:3002/healthz/ready | jq '.lastIndexedLedger'
```

**Step 3: Inspect indexer logs**

```bash
# Recent indexer logs
journalctl -u bankerchanger-indexer -n 200 --no-pager

# Filter for RPC / event-fetch errors
journalctl -u bankerchanger-indexer -n 500 --no-pager | grep -Ei "rpc|getEvents|timeout|error"
```

### Resolution Steps

1. **If RPC is degraded:** follow [RPC Node Outages](#rpc-node-outages) first — the indexer cannot catch up without a healthy RPC.
2. **Restart the indexer** to clear a stuck cursor or wedged event loop:
   ```bash
   systemctl restart bankerchanger-indexer
   # Watch it catch up
   watch -n 5 "curl -s http://localhost:3002/healthz/ready | jq '{status, ledgerLag}'"
   ```
3. **If lag persists after restart:** check disk space (`df -h`), DB write latency, and whether the indexer is being throttled by the connection pool (see [Database Connection Pool Exhausted](#database-connection-pool-exhausted)).
4. **If the cursor is corrupted:** restore the last known-good cursor from the DB and restart (see indexer README for the cursor table).

### Escalation Protocol

- **Level 1 (lag < 100 ledgers):** restart indexer, verify RPC health
- **Level 2 (lag > 100 ledgers or > 15 min):** notify on-call backend engineer, check RPC provider status
- **Level 3 (indexer down > 30 min):** page platform lead; post user-facing status update if data is visibly stale

---

## High Error Rate

### Observable Symptoms

- 5xx rate on `/api/*` exceeds threshold (alert at >1% over 5 min)
- Users report failed bets, claims, or market loads
- Logs show spikes in `error` level entries or unhandled exceptions

### Diagnostic Procedures

**Step 1: Confirm the error rate**

```bash
# Quick health check
curl -s http://localhost:3001/api/health | jq '.'

# Detailed health (admin token required) — includes dependency status
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/health/detailed | jq '.'
```

**Step 2: Find the failing requests by `request_id`**

Every request is logged with a `request_id` (via `pino-http`). Use it to trace a single request across services.

```bash
# Loki / LogQL: all log lines for a specific request
logcli query '{app="bankerchanger-backend"} | json | request_id="<REQUEST_ID>"'

# Loki: error-level lines in the last 15 minutes
logcli query '{app="bankerchanger-backend"} | json | level="error"' --since=15m

# Kibana / Elasticsearch: search by request_id
#   index: bankerchanger-*   query: request_id:"<REQUEST_ID>"
```

**Step 3: Identify the failing endpoint**

```bash
# Aggregate recent errors by route
logcli query '{app="bankerchanger-backend"} | json | level="error"' --since=30m \
  | jq -r '.route' | sort | uniq -c | sort -rn | head
```

### Resolution Steps

1. **If a single endpoint is failing:** inspect the stack trace for that `request_id`, fix or roll back the offending deploy.
2. **If load-related:** scale the service horizontally:
   ```bash
   # Docker Compose
   docker compose up -d --scale backend=3

   # Kubernetes
   kubectl scale deployment bankerchanger-backend --replicas=4
   ```
3. **If a dependency is down:** follow the relevant section (RPC, DB pool, Oracle).
4. **If errors are from a bad deploy:** roll back to the previous image and confirm error rate drops.

### Escalation Protocol

- **Level 1 (<5% errors):** investigate logs, identify endpoint
- **Level 2 (5–20% errors or >10 min):** notify on-call backend engineer, consider rollback
- **Level 3 (>20% errors or user-facing outage):** page platform lead, post status update

---

## Database Connection Pool Exhausted

### Observable Symptoms

- Requests hang or time out with `timeout exceeded when trying to connect`
- Logs show `pool` errors or `remaining connection slots are reserved`
- `/health/detailed` reports `pool.waitingCount > 0` sustained
- API latency climbs sharply under moderate load

### Diagnostic Procedures

**Step 1: Inspect the pool via the detailed health endpoint**

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/health/detailed \
  | jq '.dependencies.database.pool'
# Expect: { totalCount, idleCount, waitingCount }
# Healthy: waitingCount == 0 and idleCount > 0
```

**Step 2: Check Postgres connection usage**

```bash
# Total connections vs. max_connections
psql "$DATABASE_URL" -c "SELECT count(*) AS used, current_setting('max_connections')::int AS max FROM pg_stat_activity;"

# Connections grouped by state and application
psql "$DATABASE_URL" -c "SELECT state, application_name, count(*) FROM pg_stat_activity GROUP BY 1,2 ORDER BY 3 DESC;"

# Long-running / idle-in-transaction queries holding connections
psql "$DATABASE_URL" -c "SELECT pid, state, now()-state_change AS age, left(query,80) FROM pg_stat_activity WHERE state <> 'idle' ORDER BY age DESC LIMIT 20;"
```

**Step 3: Correlate with request logs**

```bash
logcli query '{app="bankerchanger-backend"} | json | level="error" |~ "pool|timeout"' --since=15m
```

### Resolution Steps

1. **Terminate idle-in-transaction sessions** that are leaking connections:
   ```bash
   psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now()-state_change > interval '5 minutes';"
   ```
2. **Tune the pool size** via `DB_POOL_MAX` (and `DB_POOL_IDLE_TIMEOUT_MS`). Keep `replicas × DB_POOL_MAX` below Postgres `max_connections` minus headroom:
   ```bash
   # Example: 4 replicas × 20 = 80, leaving headroom under max_connections=100
   export DB_POOL_MAX=20
   systemctl restart bankerchanger-backend
   ```
3. **Scale horizontally** if the workload is genuinely concurrent (see High Error Rate scaling commands).
4. **Add a PgBouncer** in front of Postgres if the connection count is structurally too high.

### Escalation Protocol

- **Level 1 (waitingCount > 0 briefly):** inspect slow queries, terminate leaked sessions
- **Level 2 (sustained exhaustion):** raise `DB_POOL_MAX` within `max_connections` budget, notify on-call
- **Level 3 (Postgres refusing connections):** page DBA/platform lead, consider read replica offload

---

## API Slowdown

### Observable Symptoms

- p95/p99 latency on `/api/*` exceeds SLO (e.g., p95 > 500ms)
- Users report slow page loads or timeouts
- `pino-http` response-time logs show elevated `responseTime`

### Diagnostic Procedures

**Step 1: Check health and dependency latency**

```bash
curl -s http://localhost:3001/api/health | jq '.'
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/health/detailed | jq '.dependencies'
```

**Step 2: Find the slowest routes from logs**

`pino-http` logs each request with `responseTime` (ms) and `request_id`:

```bash
# Loki: slowest requests in the last 15 minutes
logcli query '{app="bankerchanger-backend"} | json | responseTime > 500' --since=15m \
  | jq -r '"\(.responseTime)ms \(.method) \(.url) req=\(.request_id)"' | sort -rn | head -20

# Kibana: filter responseTime > 500, sort descending
#   index: bankerchanger-*   query: responseTime:>500
```

**Step 3: Check DB and Redis latency**

```bash
# Slow queries
psql "$DATABASE_URL" -c "SELECT pid, now()-query_start AS dur, left(query,80) FROM pg_stat_activity WHERE state='active' ORDER BY dur DESC LIMIT 10;"

# Redis latency
redis-cli --latency
```

### Resolution Steps

1. **If a specific route is slow:** inspect its query plan (`EXPLAIN ANALYZE`), add an index, or cache the result.
2. **If DB-bound:** check the connection pool (see [Database Connection Pool Exhausted](#database-connection-pool-exhausted)).
3. **If CPU-bound:** scale horizontally (see High Error Rate scaling commands) and check event-loop delay.
4. **If external (RPC/Oracle):** follow the relevant section.

### Escalation Protocol

- **Level 1 (p95 500ms–1s):** profile slow routes, check DB/Redis
- **Level 2 (p95 > 1s or sustained):** notify on-call backend engineer, scale service
- **Level 3 (timeouts / user-facing outage):** page platform lead, post status update

---

## Log Aggregation & Request Tracing

### Overview

All services emit structured JSON logs via `pino`. Logs are shipped from containers to a centralized system (Loki or the ELK stack) and indexed by `request_id` so a single request can be traced end-to-end.

### Shipping & Parsing

- **Loki (recommended):** run Promtail (or the Grafana Agent) as a sidecar/DaemonSet; it tails container stdout, parses the JSON, and labels by `app`, `level`, and `request_id`.
- **ELK:** run Filebeat as a DaemonSet; it ships container logs to Logstash/Elasticsearch with a JSON codec. The `bankerchanger-*` index template maps `request_id` as a `keyword` for exact-match search.
- **Parsing:** logs are already JSON — configure the shipper with a JSON parser so fields (`level`, `request_id`, `responseTime`, `route`) become queryable.

### Searching by `request_id`

```bash
# Loki / LogQL
logcli query '{app="bankerchanger-backend"} | json | request_id="<REQUEST_ID>"'

# Elasticsearch / Kibana
#   index: bankerchanger-*   query: request_id:"<REQUEST_ID>"
```

### Retention Policy

- **Loki:** configure `limits_config.retention_period` (e.g., `30d`) and per-stream `retention_stream` overrides; enable the compactor with `retention_enabled: true`.
- **Elasticsearch:** use ILM — hot (7d) → warm (30d) → delete (90d). Set `index.lifecycle.name` on the `bankerchanger-*` template.
- Keep error-level logs longer than debug/info; never retain secrets or auth headers.

---

## Escalation & On-Call Path

| Severity | Definition | Response | Who |
|----------|-----------|----------|-----|
| **SEV-1** | Full outage, funds at risk, data loss | Page immediately | On-call engineer → Platform lead → Exec |
| **SEV-2** | Major degradation (errors >20%, indexer down >30 min) | Page within 15 min | On-call engineer → Platform lead |
| **SEV-3** | Partial degradation (elevated latency/errors) | Notify in incident channel | On-call engineer |
| **SEV-4** | Minor / cosmetic | Next business day | Owning team |

**On-call path:**
1. **Primary on-call engineer** — acknowledges page, opens incident channel (`#incident-<date>`), starts triage.
2. **Secondary / backend lead** — engaged if unresolved in 15 min (SEV-1/2) or 30 min (SEV-3).
3. **Platform lead** — engaged for SEV-1/2; owns user communications and go/no-go on rollback/pause.
4. **Executive** — notified for SEV-1 or any incident >1 hour.

**During an incident:** assign an Incident Commander, keep a running timeline in the incident channel, and capture `request_id`s and log queries used. **After:** write a post-mortem within 48 hours for SEV-1/2.

---

## Load Testing Guidelines

### Overview

BANKERCHANGER uses [k6](https://k6.io/) to conduct automated load testing on backend real-time services. Specifically, WebSocket endpoints handling real-time activity feeds and market subscription events must maintain low latency and zero message loss under peak concurrent client loads.

### Running Load Tests

To run the load test locally or in staging environments:

```bash
# Navigate to the backend directory
cd backend

# Execute load test against local backend (default port 3001)
k6 run tests/load/activity-feed.loadtest.js -e WS_URL=ws://localhost:3001

# Execute against staging environment with custom virtual user count
k6 run tests/load/activity-feed.loadtest.js -e WS_URL=wss://staging.bankerchanger.com/ws
```

### Targets and Profile

The load test simulates 100 concurrent WebSocket connections (100 VUs) subscribing to activity feeds across active markets:
- **Ramp-up:** 0 to 100 VUs over 10 seconds.
- **Sustained Load:** 100 concurrent VUs sustained for 30 seconds.
- **Ramp-down:** 100 down to 0 VUs over 10 seconds.
- **Graceful Shutdown:** 5 seconds.

Each virtual user subscribes to 5 randomly chosen active markets and listens for broadcast activity updates.

### Thresholds & Quality Gates

The test defines explicit thresholds that must pass in local runs and GitHub Actions CI:
- **`ws_connecting: p(95) < 200`**: 95% of WebSocket handshakes must complete within 200ms.
- **`checks: rate > 0.99`**: At least 99% of WebSocket connection checks (HTTP 101 Switching Protocols) must succeed.
- **`ws_sessions: count > 0`**: Ensures WebSocket sessions were actively established during the run.
- **`errors: rate == 0`**: Zero protocol or socket errors permitted under load.

### Interpreting WebSocket Metrics

| Metric | Description | Health Indicator |
|--------|-------------|------------------|
| `ws_connecting` | Time elapsed establishing WebSocket handshake | Should stay consistently below 100ms; p95 < 200ms |
| `ws_sessions` | Total count of WebSocket sessions initiated | Should match or exceed planned VU iterations |
| `ws_msgs_received` | Count of activity feed messages received from server | Should be non-zero when events are broadcast |
| `ws_msgs_sent` | Count of subscription requests sent by clients | 5 subscriptions per connected client |
| `checks` | Percentage of validation assertions passed | Must be 100% (or >99% in high-contention test runs) |
| `errors` | Unhandled connection drops or socket errors | Must be 0 |

### Troubleshooting Failures

1. **`ws_connecting` threshold exceeded (>200ms):**
   - Check Node.js event loop delay using APM or performance metrics.
   - Verify Redis Pub/Sub latency (`redis-cli --latency`).
   - Increase available file descriptors (`ulimit -n 65535`).
2. **WebSocket connection failures (checks < 99% or errors > 0):**
   - Verify the backend server is running and accessible on the specified `WS_URL`.
   - Inspect server logs for WebSocket upgrade rejection or uncaught exceptions: `tail -f backend.log`.
   - Ensure reverse proxy or load balancer (e.g., NGINX) is configured with `Upgrade $http_upgrade` and `Connection "upgrade"` headers.

---

## Quick Reference: CLI Commands

### Force Cancel Market

Cancel a market and refund all bettors. Use when market cannot be resolved normally (e.g., event cancelled, oracle failure).

```bash
# Cancel market and trigger refunds
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_cancel_market \
    --market-id {market_id} \
    --reason "event_cancelled"  # or oracle_failure, technical_issue, etc.

# Verify cancellation
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- query_market \
    --market-id {market_id} | jq '.status'

# Expected output: "cancelled"
```

### Emergency Pause

Pause all market operations (freeze all contracts).

```bash
# Pause market factory
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_pause

# Pause treasury
stellar contract invoke \
    --id {TREASURY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_pause

# Verify pause
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- is_paused

# Expected output: true
```

### Treasury Drainage

Emergency withdrawal of all funds from treasury (for critical financial incidents).

```bash
# Get current treasury balance
stellar contract invoke \
    --id {TREASURY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- get_treasury_state | jq '.balance_stroops'

# Drain treasury to admin account
stellar contract invoke \
    --id {TREASURY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_drain \
    --target-address {ADMIN_ADDRESS} \
    --amount {AMOUNT_STROOPS}

# Verify drain
stellar account info --source {ADMIN_ADDRESS} --network mainnet | jq '.balances'
```

### Market Force Resolution

Manually resolve a stuck market.

```bash
# Force resolve to specific outcome
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- admin_force_resolve \
    --market-id {market_id} \
    --outcome fighter_a  # or fighter_b, draw, no_contest

# Verify resolution
stellar contract invoke \
    --id {MARKET_FACTORY_ADDRESS} \
    --source {ADMIN_SECRET_KEY} \
    --network mainnet \
    -- query_market \
    --market-id {market_id} | jq '.outcome'

# Expected output: "fighter_a"
```

---

## Environment Variables Reference

Key environment variables for production operations:

```bash
# Blockchain Configuration
STELLAR_RPC_URL=https://soroban-mainnet.stellar.org
HORIZON_URL=https://horizon.stellar.org
NETWORK=mainnet

# Contract Addresses (from deployments.json)
TREASURY_ADDRESS=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
MARKET_FACTORY_ADDRESS=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Admin Keys (secure storage only)
ADMIN_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## Further Documentation

- Refer to [README.md](../README.md) for general setup and architecture
- See [contributing.md](contributing.md) for development and deployment practices
- Check [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for contract details
