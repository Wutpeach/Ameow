import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";

import { CheckIcon, CloseIcon } from "./icons/AppIcons";

export type CircularProgressIndicatorProps = {
  strokeColor: string;
  trackColor: string;
  textColor: string;
  percent: number;
  indeterminate: boolean;
  centerLabel?: string;
};

export const CircularProgressIndicator = ({
  strokeColor,
  trackColor,
  textColor,
  percent,
  indeterminate,
  centerLabel = "...",
}: CircularProgressIndicatorProps) => (
  <div
    style={{
      position: "relative",
      width: 48,
      height: 48,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    }}
  >
    <div
      style={{
        width: 48,
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: indeterminate ? "spin 1s linear infinite" : "none",
        transformOrigin: "center",
        pointerEvents: "none",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        style={{
          transform: "rotate(-90deg)",
          display: "block",
          pointerEvents: "none",
        }}
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={trackColor}
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={strokeColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 20}
          strokeDashoffset={indeterminate
            ? 2 * Math.PI * 20 * 0.75
            : 2 * Math.PI * 20 * (1 - Math.max(0, Math.min(100, percent)) / 100)}
          style={{
            transition: indeterminate ? "none" : "stroke-dashoffset 0.3s ease",
            transformOrigin: "center",
          }}
        />
      </svg>
    </div>
    <span
      style={{
        position: "absolute",
        fontSize: 11,
        fontWeight: 500,
        color: textColor,
        textAlign: "center",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      {indeterminate ? centerLabel : `${Math.round(percent)}%`}
    </span>
  </div>
);

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

const FIXED_CENTER_ICON_FRAME_STYLE: CSSProperties = {
  width: 48,
  height: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

export type ForegroundOutcomeOverlayProps = {
  visible: boolean;
  outcomeVisible: boolean;
  cancelled: boolean;
  errorMessage: string | null;
  successColor: string;
  errorColor: string;
  loadingStrokeColor: string;
  loadingTrackColor: string;
  loadingTextColor: string;
};

export const ForegroundOutcomeOverlay = ({
  visible,
  outcomeVisible,
  cancelled,
  errorMessage,
  successColor,
  errorColor,
  loadingStrokeColor,
  loadingTrackColor,
  loadingTextColor,
}: ForegroundOutcomeOverlayProps) => (
  <AnimatePresence mode="sync" initial={false}>
    {visible ? (
      <motion.div
        key="foreground-outcome-overlay"
        initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
        animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
        exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
        transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
        style={CENTER_OVERLAY_CONTENT_STYLE}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: 170,
            maxWidth: "100%",
            pointerEvents: "none",
          }}
        >
          <div style={FIXED_CENTER_ICON_FRAME_STYLE}>
            {outcomeVisible ? (
              cancelled ? (
                <CloseIcon size={48} style={{ color: errorColor, pointerEvents: "none" }} strokeWidth={3} />
              ) : (
                <CheckIcon size={48} style={{ color: successColor, pointerEvents: "none" }} strokeWidth={3} />
              )
            ) : (
              <CircularProgressIndicator
                strokeColor={loadingStrokeColor}
                trackColor={loadingTrackColor}
                textColor={loadingTextColor}
                percent={0}
                indeterminate
              />
            )}
          </div>
          {outcomeVisible && cancelled && errorMessage ? (
            <span
              title={errorMessage}
              style={{
                fontSize: 9,
                lineHeight: 1.2,
                color: loadingTextColor,
                textAlign: "center",
                userSelect: "none",
                pointerEvents: "none",
                padding: "0 8px",
              }}
            >
              {errorMessage}
            </span>
          ) : null}
        </div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
