import { IAgent } from "./IAgent";
import { MCPRole, Observation, Action, Reward } from "@mcp-core";

export abstract class BaseAgent implements IAgent {
  public id: string;
  public role: MCPRole;
  protected lastObservation: Observation | null = null;
  protected lastReward: Reward | null = null;

  constructor(id: string, role: MCPRole) {
    this.id = id;
    this.role = role;
  }

  async init(): Promise<void> {}

  async onObservation(obs: Observation): Promise<void> {
    this.lastObservation = obs;
  }

  async onReward(reward: Reward): Promise<void> {
    this.lastReward = reward;
  }

  abstract generateAction(): Promise<Action | null>;
}


