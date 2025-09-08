export const Compliance = {
  isAssetAllowed(asset: string): boolean {
    const restricted = ["GME", "AMC"];
    return !restricted.includes(asset.toUpperCase());
  },

  isTradeLegal(agent: string, asset: string): boolean {
    if (agent === "sentiment-agent" && asset.toUpperCase() === "TSLA") return false;
    return true;
  }
};


