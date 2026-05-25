import type { AmeowBounds, AmeowDisplay } from "../types/electronBridge";

export type ResolveMainWindowCompactVisibilityBoundsOptions = {
  currentBounds: AmeowBounds;
  compactFrameSize: number;
  edgePadding: number;
  monitor: AmeowDisplay | null;
};

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), Math.max(min, max))
);

export const resolveMainWindowCompactVisibilityBounds = ({
  currentBounds,
  compactFrameSize,
  edgePadding,
  monitor,
}: ResolveMainWindowCompactVisibilityBoundsOptions): AmeowBounds => {
  const normalizedBounds = {
    x: Math.round(currentBounds.x),
    y: Math.round(currentBounds.y),
    width: Math.max(1, Math.round(currentBounds.width)),
    height: Math.max(1, Math.round(currentBounds.height)),
  };

  if (!monitor) {
    return normalizedBounds;
  }

  const frameSize = Math.max(1, Math.round(compactFrameSize));
  const padding = Math.max(0, Math.round(edgePadding));
  const minX = monitor.position.x + padding;
  const minY = monitor.position.y + padding;
  const maxX = monitor.position.x + monitor.size.width - frameSize - padding;
  const maxY = monitor.position.y + monitor.size.height - frameSize - padding;

  return {
    ...normalizedBounds,
    x: clamp(normalizedBounds.x, minX, maxX),
    y: clamp(normalizedBounds.y, minY, maxY),
  };
};
