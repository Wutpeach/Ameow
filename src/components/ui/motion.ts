export const MOTION_EASE = {
  compact: [0.22, 1, 0.36, 1],
  exit: [0.32, 0.72, 0, 1],
} as const;

export const MOTION_DURATION = {
  micro: 0.08,
  fast: 0.14,
  base: 0.18,
  slow: 0.24,
  overlay: 0.2,
} as const;

const CSS_COMPACT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type CssTransitionOptions = {
  durationSeconds?: number;
  ease?: string;
};

export const compactCssTransition = (
  properties: string[],
  {
    durationSeconds = MOTION_DURATION.base,
    ease = CSS_COMPACT_EASE,
  }: CssTransitionOptions = {},
): string => properties
  .map((property) => `${property} ${durationSeconds}s ${ease}`)
  .join(", ");

export const COMPACT_POPOVER_PRESENCE = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -2, scale: 0.985 },
  transition: { duration: 0.16, ease: MOTION_EASE.compact },
} as const;

export const CENTER_OVERLAY_PRESENCE_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: MOTION_DURATION.overlay },
} as const;

export type SettingsNavigationDirection = "forward" | "back";

export const getSettingsPageSwitchMotion = (
  shouldReduceMotion: boolean | null,
  direction: SettingsNavigationDirection,
) => {
  const reduceMotion = shouldReduceMotion === true;
  const pageOffset = direction === "forward" ? 8 : -8;

  return {
    initial: reduceMotion
      ? { opacity: 1, x: 0 }
      : { opacity: 0, x: pageOffset },
    animate: { opacity: 1, x: 0 },
    exit: reduceMotion
      ? { opacity: 1, x: 0 }
      : { opacity: 0, x: -pageOffset },
    transition: {
      duration: reduceMotion ? 0 : 0.16,
      ease: MOTION_EASE.compact,
    },
  } as const;
};
