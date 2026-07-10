import { create } from "zustand";
import { featureFlagService, FeatureFlags } from "@/services/featureFlagService";

interface FeatureFlagState {
  flags: FeatureFlags | null;
  isLoaded: boolean;

  /** Fetches the current company's flags once; safe to call repeatedly. */
  loadFlags: () => Promise<void>;
  /** True only once flags are loaded AND the given feature is enabled. Unknown/unloaded = locked (fail closed) to avoid a flash of unlocked UI. */
  hasFeature: (key: keyof FeatureFlags) => boolean;
}

let inFlight: Promise<void> | null = null;

export const useFeatureFlagStore = create<FeatureFlagState>()((set, get) => ({
  flags: null,
  isLoaded: false,

  loadFlags: async () => {
    if (get().isLoaded || inFlight) return inFlight ?? undefined;

    inFlight = featureFlagService
      .getMyFlags()
      .then((flags) => {
        set({ flags, isLoaded: true });
      })
      .catch((error) => {
        console.warn("[FeatureFlags] Failed to load company flags", error);
        // Fail closed: mark as loaded with no flags so gated UI stays greyed
        // out instead of retrying forever or assuming everything is enabled.
        set({ flags: null, isLoaded: true });
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  },

  hasFeature: (key) => {
    const { flags } = get();
    return !!flags?.[key];
  },
}));
