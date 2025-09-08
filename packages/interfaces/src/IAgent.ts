import { Observation, Action, Reward, MCPRole } from "@mcp-core";

export interface IAgent {
  id: string;
  role: MCPRole;
  init(): Promise<void>;
  onObservation(obs: Observation): Promise<void>;
  onReward?(reward: Reward): Promise<void>;
  generateAction(): Promise<Action | null>;
}
