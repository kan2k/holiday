import cron from 'node-cron';

/**
 * Trigger System
 * Manages scheduled tasks like research runs
 */
export class TriggerSystem {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Add a cron-based trigger
   */
  addCronTrigger(name, cronExpression, callback) {
    if (this.jobs.has(name)) {
      console.warn(`[Trigger] Job ${name} already exists, replacing`);
      this.jobs.get(name).stop();
    }

    const job = cron.schedule(cronExpression, async () => {
      console.log(`[Trigger] Running ${name} at ${new Date().toISOString()}`);
      try {
        await callback();
      } catch (error) {
        console.error(`[Trigger] ${name} failed: ${error.message}`);
      }
    }, {
      scheduled: false
    });

    this.jobs.set(name, { job, cron: cronExpression, callback });
    console.log(`[Trigger] Added ${name} with schedule: ${cronExpression}`);
    
    return this;
  }

  /**
   * Add a research trigger (every 12 hours by default)
   */
  addResearchTrigger(researchEngine, cronExpression = '0 */12 * * *') {
    return this.addCronTrigger('research', cronExpression, async () => {
      await researchEngine.runResearch('Macro Market Today');
    });
  }

  /**
   * Start all triggers
   */
  start() {
    for (const [name, { job }] of this.jobs) {
      job.start();
      console.log(`[Trigger] Started ${name}`);
    }
    return this;
  }

  /**
   * Stop all triggers
   */
  stop() {
    for (const [name, { job }] of this.jobs) {
      job.stop();
      console.log(`[Trigger] Stopped ${name}`);
    }
    return this;
  }

  /**
   * Get status of all triggers
   */
  getStatus() {
    const status = {};
    for (const [name, { cron }] of this.jobs) {
      status[name] = { cron, active: true };
    }
    return status;
  }

  /**
   * Manually trigger a job
   */
  async trigger(name) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job ${name} not found`);
    }
    
    console.log(`[Trigger] Manual trigger: ${name}`);
    await job.callback();
  }
}

/**
 * Create preset triggers for trading agent
 */
export function createTradingTriggers(researchEngine) {
  const triggers = new TriggerSystem();
  
  // Research every 12 hours (at 00:00 and 12:00)
  triggers.addResearchTrigger(researchEngine, '0 0,12 * * *');
  
  return triggers;
}

export default TriggerSystem;
