import type { CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

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
}: ForegroundOutcomeOverlayProps) => {
  const shouldReduceMotion = useReducedMotion();

  const ringExitTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : {
        opacity: { duration: 0.14, ease: [0.32, 0.72, 0, 1] as const },
        scale: { duration: 0.16, ease: [0.32, 0.72, 0, 1] as const },
        filter: { duration: 0.16, ease: [0.32, 0.72, 0, 1] as const },
      };
  const outcomeEnterTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : {
        duration: 0.34,
        times: [0, 0.46, 1],
        ease: [0.22, 1, 0.36, 1] as const,
      };
  const ringAnimate = outcomeVisible
    ? { opacity: 0, scale: 0.58, filter: "blur(1px)" }
    : { opacity: 1, scale: 1, filter: "blur(0px)" };
  const outcomeAnimate = outcomeVisible
    ? shouldReduceMotion
      ? { opacity: 1, scale: 1, filter: "blur(0px)" }
      : {
          opacity: [0, 0, 1],
          scale: [0.84, 0.84, 1],
          filter: ["blur(0.8px)", "blur(0.8px)", "blur(0px)"],
        }
    : { opacity: 0, scale: 0.84, filter: "blur(0.8px)" };
  const outcomeTransition = outcomeVisible
    ? outcomeEnterTransition
    : { duration: shouldReduceMotion ? 0.08 : 0.12, ease: [0.32, 0.72, 0, 1] as const };
  const errorMessageAnimate = outcomeVisible
    ? shouldReduceMotion
      ? { opacity: 1, y: 0 }
      : { opacity: [0, 0, 1], y: [4, 4, 0] }
    : { opacity: 0, y: 4 };
  const errorMessageTransition = outcomeVisible
    ? shouldReduceMotion
      ? { duration: 0.12 }
      : { duration: 0.28, times: [0, 0.55, 1], ease: [0.22, 1, 0.36, 1] as const }
    : { duration: shouldReduceMotion ? 0.08 : 0.12, ease: [0.32, 0.72, 0, 1] as const };

  return (
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
            <div
              style={{
                ...FIXED_CENTER_ICON_FRAME_STYLE,
                position: "relative",
              }}
            >
              <motion.div
                animate={ringAnimate}
                transition={ringExitTransition}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transformOrigin: "center center",
                  pointerEvents: "none",
                }}
              >
                <CircularProgressIndicator
                  strokeColor={loadingStrokeColor}
                  trackColor={loadingTrackColor}
                  textColor={loadingTextColor}
                  percent={0}
                  indeterminate
                />
              </motion.div>
              <motion.div
                animate={outcomeAnimate}
                transition={outcomeTransition}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transformOrigin: "center center",
                  pointerEvents: "none",
                }}
              >
                {cancelled ? (
                  <CloseIcon size={48} style={{ color: errorColor, pointerEvents: "none" }} strokeWidth={3} />
                ) : (
                  <CheckIcon size={48} style={{ color: successColor, pointerEvents: "none" }} strokeWidth={3} />
                )}
              </motion.div>
            </div>
            {outcomeVisible && cancelled && errorMessage ? (
              <motion.span
                animate={errorMessageAnimate}
                transition={errorMessageTransition}
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
              </motion.span>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
