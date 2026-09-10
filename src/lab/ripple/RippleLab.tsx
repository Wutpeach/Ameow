import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { getLabChipStyle } from "../labControls";
import { RippleCanvas, type RippleCanvasHandle } from "./RippleCanvas";
import { createRippleController, type RippleController, type RippleOrigin } from "./rippleController";

const RIPPLE_SIZE = 200;

const CONTROL_STYLE: CSSProperties = {
  display: "grid",
  gap: 8,
  width: RIPPLE_SIZE,
  marginTop: 10,
};

export function RippleLab({
  reducedMotion,
  onCapturableFrame,
}: Readonly<{
  reducedMotion: boolean;
  onCapturableFrame?: () => void;
}>) {
  const { t } = useTranslation("lab");
  const { colors } = useTheme();
  const canvasRef = useRef<RippleCanvasHandle | null>(null);
  const [origin, setOrigin] = useState<RippleOrigin>({ x: 0.5, y: 0.5 });
  const [pinchEnabled, setPinchEnabled] = useState(true);
  const [settlement, setSettlement] = useState("ready");
  const [status, setStatus] = useState<"ready" | "recovering" | "unavailable">("ready");
  const controllerRef = useRef<RippleController | null>(null);

  useEffect(() => {
    const controller = createRippleController({
      reducedMotion,
      onFrame: (frame) => canvasRef.current?.renderFrame(frame),
      onSettled: (frame) => setSettlement(frame.rawPhase === 1 ? "target" : "start"),
    });
    controllerRef.current = controller;
    controller.renderNow();
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [reducedMotion]);

  const captureOrigin = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
    setRippleOrigin(next);
  };

  const setRippleOrigin = (next: RippleOrigin) => {
    const clamped = {
      x: Number.isFinite(next.x) ? Math.min(Math.max(next.x, 0), 1) : 0.5,
      y: Number.isFinite(next.y) ? Math.min(Math.max(next.y, 0), 1) : 0.5,
    };
    setOrigin(clamped);
    setSettlement("replacement");
    controllerRef.current?.replace(clamped);
  };

  const setPinch = (enabled: boolean) => {
    setPinchEnabled(enabled);
    controllerRef.current?.setPinchEnabled(enabled);
  };

  const buttonStyle = getLabChipStyle(colors);
  return (
    <section aria-label={t("ripple.title")} style={{ display: "grid", justifyItems: "center" }}>
      <div
        data-ripple-canvas-host=""
        onClick={captureOrigin}
        style={{ width: RIPPLE_SIZE, height: RIPPLE_SIZE, overflow: "hidden", borderRadius: 16, boxShadow: colors.panelShadow, cursor: "crosshair" }}
      >
        <RippleCanvas ref={canvasRef} onStatusChange={setStatus} onCapturableFrame={onCapturableFrame} />
      </div>
      <p role="status" style={{ margin: "8px 0 0", fontSize: 11, color: colors.textSecondary }}>
        {t("ripple.origin", { x: origin.x.toFixed(2), y: origin.y.toFixed(2) })} · {t(`ripple.status.${status}`)} · {t(`ripple.settlement.${settlement}`)}
      </p>
      {status === "unavailable" ? <p role="alert">{t("ripple.unavailable")}</p> : null}
      <div aria-label={t("ripple.controls")} style={CONTROL_STYLE}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" className="lab-control" onClick={() => { setSettlement("forward"); controllerRef.current?.start(origin); }} style={buttonStyle}>{t("ripple.forward")}</button>
          <button type="button" className="lab-control" onClick={() => { setSettlement("reverse"); controllerRef.current?.reverse(); }} style={buttonStyle}>{t("ripple.reverse")}</button>
          <button type="button" className="lab-control" onClick={() => controllerRef.current?.cancel("from")} style={buttonStyle}>{t("ripple.cancelStart")}</button>
          <button type="button" className="lab-control" onClick={() => controllerRef.current?.cancel("target")} style={buttonStyle}>{t("ripple.cancelTarget")}</button>
        </div>
        <label style={{ fontSize: 12 }}>
          {t("ripple.phase")}
          <input aria-label={t("ripple.phase")} type="range" min="0" max="1" step="0.01" defaultValue="0" onInput={(event) => controllerRef.current?.scrub(Number(event.currentTarget.value))} style={{ marginLeft: 8, width: 116 }} />
        </label>
        <div role="group" aria-label={t("ripple.originGroup")} style={{ display: "flex", gap: 6, fontSize: 12 }}>
          <label>{t("ripple.originX")} <input type="number" min="0" max="1" step="0.01" value={origin.x} onChange={(event) => setRippleOrigin({ x: Number(event.target.value), y: origin.y })} /></label>
          <label>{t("ripple.originY")} <input type="number" min="0" max="1" step="0.01" value={origin.y} onChange={(event) => setRippleOrigin({ x: origin.x, y: Number(event.target.value) })} /></label>
        </div>
        <div role="group" aria-label={t("ripple.pinch")} style={{ display: "flex", gap: 6 }}>
          <button type="button" className="lab-control" aria-pressed={pinchEnabled} onClick={() => setPinch(true)} style={getLabChipStyle(colors, { selected: pinchEnabled })}>{t("ripple.pinchOn")}</button>
          <button type="button" className="lab-control" aria-pressed={!pinchEnabled} onClick={() => setPinch(false)} style={getLabChipStyle(colors, { selected: !pinchEnabled })}>{t("ripple.pinchOff")}</button>
        </div>
      </div>
    </section>
  );
}
