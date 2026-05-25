import mascotUrl from "../assets/mascot.svg";

type CatIconProps = {
  size?: number;
  glow?: boolean;
};

export function CatIcon({ size = 40, glow = true }: CatIconProps) {
  return (
    <img
      src={mascotUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        display: "block",
        opacity: glow ? 1 : 0.96,
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}
