export type DriftMonitor = {
  lastWindow: number[];
  threshold: number;
  windowSize: number;
  drifted: boolean;
};

export function createDriftMonitor(threshold = 0.15, windowSize = 20): DriftMonitor {
  return { lastWindow: [], threshold, windowSize, drifted: false };
}

export function updateDrift(m: DriftMonitor, value: number): boolean {
  m.lastWindow.push(value);
  if (m.lastWindow.length > m.windowSize) m.lastWindow.shift();
  const mean = m.lastWindow.reduce((a, b) => a + b, 0) / m.lastWindow.length;
  const deviation = Math.abs(value - mean) / (mean || 1);
  m.drifted = deviation > m.threshold;
  return m.drifted;
}


