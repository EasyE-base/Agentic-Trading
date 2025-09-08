let killSwitch = false;
const frozenAgents = new Set<string>();

export const SafetySwitch = {
  isKilled: (): boolean => killSwitch,
  killAll: (): void => {
    console.warn("⚠️ MCP KILL SWITCH ACTIVATED");
    killSwitch = true;
  },
  freezeAgent: (id: string): void => {
    frozenAgents.add(id);
    console.warn(`🚫 Agent ${id} is FROZEN`);
  },
  isFrozen: (id: string): boolean => frozenAgents.has(id),
};


