import type { CSSProperties } from "react";

export { CENTER_OVERLAY_PRESENCE_MOTION } from "./ui/motion";

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
