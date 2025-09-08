export function logAction(agentId: string, message: any) {
  try {
    console.log(`[AUDIT] ${agentId}:`, JSON.stringify(message));
  } catch {
    console.log(`[AUDIT] ${agentId}:`, message);
  }
}


