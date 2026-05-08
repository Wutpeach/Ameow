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
