import { randomUUID } from "crypto";
import redisClient from "../config/redis";
import { Logger } from "../utils/logger";

const LOCK_TTL_MS = 30_000;
const RENEW_INTERVAL_MS = 10_000;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

// Single-Redis-instance lock (not Redlock quorum) — matches the rest of this
// service, which already assumes one Redis backing store. Each replica must
// hold this lock for a sessionId before it's allowed to run a live Baileys
// socket for it, so two replicas can never both connect the same session.
export class SessionLockService {
  public readonly instanceId = `${process.env.RENDER_INSTANCE_ID || "local"}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private renewalTimers: Map<string, NodeJS.Timeout> = new Map();

  private lockKey(sessionId: string): string {
    return `wa:session-lock:${sessionId}`;
  }

  async acquire(sessionId: string): Promise<boolean> {
    if (!redisClient) return true; // No Redis configured — single-instance fallback.

    const key = this.lockKey(sessionId);
    const currentOwner = await redisClient.get(key).catch(() => null);

    if (currentOwner === this.instanceId) {
      await redisClient.pExpire(key, LOCK_TTL_MS).catch(() => {});
      this.startRenewal(sessionId);
      return true;
    }

    const result = await redisClient
      .set(key, this.instanceId, { NX: true, PX: LOCK_TTL_MS })
      .catch((err) => {
        Logger.error(err, `[SessionLock] Failed to acquire lock for ${sessionId}`);
        return null;
      });

    const acquired = result === "OK";
    if (acquired) this.startRenewal(sessionId);
    return acquired;
  }

  async getOwner(sessionId: string): Promise<string | null> {
    if (!redisClient) return this.instanceId;
    return redisClient.get(this.lockKey(sessionId)).catch(() => null);
  }

  async release(sessionId: string): Promise<void> {
    this.stopRenewal(sessionId);
    if (!redisClient) return;

    await redisClient
      .eval(RELEASE_SCRIPT, { keys: [this.lockKey(sessionId)], arguments: [this.instanceId] })
      .catch((err) => {
        Logger.warn(`[SessionLock] Failed to release lock for ${sessionId}: ${err.message}`);
      });
  }

  private startRenewal(sessionId: string): void {
    this.stopRenewal(sessionId);
    const timer = setInterval(async () => {
      const renewed = await redisClient!
        .eval(RENEW_SCRIPT, {
          keys: [this.lockKey(sessionId)],
          arguments: [this.instanceId, String(LOCK_TTL_MS)],
        })
        .catch((err) => {
          Logger.warn(`[SessionLock] Renewal failed for ${sessionId}: ${err.message}`);
          return 0;
        });

      if (renewed === 0) {
        Logger.warn(`[SessionLock] Lost ownership of lock for session ${sessionId}`);
        this.stopRenewal(sessionId);
      }
    }, RENEW_INTERVAL_MS);
    timer.unref();
    this.renewalTimers.set(sessionId, timer);
  }

  private stopRenewal(sessionId: string): void {
    const timer = this.renewalTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.renewalTimers.delete(sessionId);
    }
  }
}

export const sessionLockService = new SessionLockService();
export default sessionLockService;
