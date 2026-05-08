import type { CSSProperties } from "react";

export const CENTER_OVERLAY_PRESENCE_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
} as const;

export const CENTER_OVERLAY_CONTENT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  pointerEvents: "none",
  userSelect: "none",
};
