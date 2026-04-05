import { createLogger } from "../logger.js";
import type { UserConfig, ProviderOptions } from "../types.js";
import { ClawAgentProvider } from "../providers/claw-agent.js";

const log = createLogger("agent-pool");

interface AgentInstance {
  userId: string;
  provider: ClawAgentProvider;
  lastUsed: number;
}

export class AgentPool {
  private instances = new Map<string, AgentInstance>();
  private maxIdleTime = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start cleanup timer
    this.cleanupInterval = setInterval(() => this.cleanupIdleAgents(), 5 * 60 * 1000);
  }

  async getAgent(userId: string, config: UserConfig): Promise<ClawAgentProvider> {
    let instance = this.instances.get(userId);

    if (instance) {
      instance.lastUsed = Date.now();
      log.debug(`Reusing agent for user: ${userId}`);
      return instance.provider;
    }

    // Create new agent instance
    const providerConfig = config.providers[config.defaultProvider] || {
      type: "claw-agent",
    };

    const provider = new ClawAgentProvider(config.defaultProvider, providerConfig);

    instance = {
      userId,
      provider,
      lastUsed: Date.now(),
    };

    this.instances.set(userId, instance);
    log.info(`Created new agent for user: ${userId}`);

    return provider;
  }

  async query(
    userId: string,
    config: UserConfig,
    prompt: string,
    sessionId: string,
    options?: ProviderOptions
  ): Promise<string> {
    const agent = await this.getAgent(userId, config);
    return agent.query(prompt, sessionId, options);
  }

  removeAgent(userId: string): void {
    const instance = this.instances.get(userId);
    if (instance) {
      this.instances.delete(userId);
      log.info(`Removed agent for user: ${userId}`);
    }
  }

  private cleanupIdleAgents(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, instance] of this.instances) {
      if (now - instance.lastUsed > this.maxIdleTime) {
        this.instances.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info(`Cleaned up ${cleaned} idle agents`);
    }
  }

  getActiveCount(): number {
    return this.instances.size;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.instances.clear();
    log.info("Agent pool destroyed");
  }
}

// Singleton
let pool: AgentPool | null = null;

export function getAgentPool(): AgentPool {
  if (!pool) {
    pool = new AgentPool();
  }
  return pool;
}

export function destroyAgentPool(): void {
  if (pool) {
    pool.destroy();
    pool = null;
  }
}
