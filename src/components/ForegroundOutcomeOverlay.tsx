import type { ComponentType, CSSProperties, SVGProps } from "react";
import { motion, useReducedMotion } from "motion/react";

import { CircularProgressIndicator } from "./CircularProgressIndicator";
import { CheckIcon, CloseIcon } from "./icons/AppIcons";
import { MOTION_EASE } from "./ui/motion";

const FIXED_CENTER_ICON_FRAME_STYLE: CSSProperties = {
  width: 48,
  height: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

type OutcomeIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export type ForegroundOutcomeOverlayProps = {
  outcomeVisible: boolean;
  cancelled: boolean;
  errorMessage: string | null;
  successColor: string;
  errorColor: string;
  loadingStrokeColor: string;
  loadingTrackColor: string;
  loadingTextColor: string;
  SuccessIcon?: ComponentType<OutcomeIconProps>;
  successIconStrokeWidth?: number;
};

export const ForegroundOutcomeOverlay = ({
  outcomeVisible,
  cancelled,
  errorMessage,
  successColor,
  errorColor,
  loadingStrokeColor,
  loadingTrackColor,
  loadingTextColor,
  SuccessIcon = CheckIcon,
  successIconStrokeWidth = 3,
}: ForegroundOutcomeOverlayProps) => {
  const shouldReduceMotion = useReducedMotion();

  const ringExitTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : {
        opacity: { duration: 0.14, ease: MOTION_EASE.exit },
        scale: { duration: 0.16, ease: MOTION_EASE.exit },
        filter: { duration: 0.16, ease: MOTION_EASE.exit },
      };
  const outcomeEnterTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : {
        duration: 0.34,
        times: [0, 0.46, 1],
        ease: MOTION_EASE.compact,
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
    : { duration: shouldReduceMotion ? 0.08 : 0.12, ease: MOTION_EASE.exit };
  const errorMessageAnimate = outcomeVisible
    ? shouldReduceMotion
      ? { opacity: 1, y: 0 }
      : { opacity: [0, 0, 1], y: [4, 4, 0] }
    : { opacity: 0, y: 4 };
  const errorMessageTransition = outcomeVisible
    ? shouldReduceMotion
      ? { duration: 0.12 }
      : { duration: 0.28, times: [0, 0.55, 1], ease: MOTION_EASE.compact }
    : { duration: shouldReduceMotion ? 0.08 : 0.12, ease: MOTION_EASE.exit };

  return (
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
            <SuccessIcon size={48} style={{ color: successColor, pointerEvents: "none" }} strokeWidth={successIconStrokeWidth} />
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
  );
};
