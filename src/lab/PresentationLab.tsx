/** Development-only Lab shell. Ripple is the sole Full experiment. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { getPanelShellStyle } from "../components/ui/shared-styles";
import { useTheme } from "../contexts/ThemeContext";
import { CompactPreviewStage } from "./CompactPreviewStage";
import { LabOverlayStage, type WebglReadbackResult } from "./LabOverlayStage";
import { LabSegmentedControl, type LabSegmentedOption } from "./LabSegmentedControl";
import { OneWorksMascotInspector } from "./OneWorksMascotInspector";
import { PreviewEnvironmentPicker } from "./PreviewEnvironmentPicker";
import { capturePreviewPng, downloadCapturedPng, ExportLayerFailure } from "./exportPng";
import { getLabChipStyle, getLabGroupLabelStyle } from "./labControls";
import { projectLabOverlayFixture, projectLabQueueRow, type LabOverlayProjection } from "./overlayProjection";
import {
  LAB_DISPLAY_SCALES,
  LAB_DISPLAY_SCALE_DEFAULT,
  LAB_PREVIEW_TARGETS,
  resolveLabAutoDisplayScale,
  resolveLabPreviewScaledSize,
  type LabDisplayScale,
  type LabPreviewTarget,
} from "./previewTargets";
import {
  LAB_PREVIEW_ENVIRONMENT_DEFAULT,
  resolveLabPreviewEnvironmentStyle,
  type LabPreviewEnvironment,
} from "./previewEnvironment";
import { RippleLab } from "./ripple/RippleLab";
import { LAB_COMPACT_SCENARIOS, resolveLabCompactScenario, type LabCompactScenario } from "./scenarios";
import { resolveLabOverlayFixture, type LabOverlayFixture } from "./stateFixtures";

type FullLane = "ripple" | "download" | "transcode" | "mixed";
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const PAGE_STYLE: CSSProperties = { minHeight: "100vh", display: "flex", gap: 16, padding: 16, boxSizing: "border-box", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", overflowX: "auto" };
const WORKSPACE_STYLE: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 14, boxSizing: "border-box", minHeight: 0 };
const DEVTOOLS_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 10, padding: 14, width: "clamp(280px, 24vw, 400px)", flexShrink: 0, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxSizing: "border-box" };
const STRIP_STYLE: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", width: "100%", maxWidth: 800, padding: "2px 0 8px" };
const STAGE_STYLE: CSSProperties = { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", flex: 1, minHeight: 0, overflow: "hidden", borderRadius: 12, border: "1px solid #302c3a" };
const ROW_STYLE: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" };

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fixtureOfLane = (lane: FullLane): LabOverlayFixture | null => {
  if (lane === "ripple") return null;
  return resolveLabOverlayFixture(`${lane}-active`) ?? (lane === "mixed" ? resolveLabOverlayFixture("mixed-busy") : null);
};

export function PresentationLab() {
  const { t } = useTranslation("lab");
  const { colors } = useTheme();
  const [fullLane, setFullLane] = useState<FullLane>("ripple");
  const [target, setTarget] = useState<LabPreviewTarget>("full");
  const [compactScenarioId, setCompactScenarioId] = useState(LAB_COMPACT_SCENARIOS[0].id);
  const [displayScale, setDisplayScale] = useState<LabDisplayScale>(LAB_DISPLAY_SCALE_DEFAULT);
  const [previewBackground, setPreviewBackground] = useState<LabPreviewEnvironment>(LAB_PREVIEW_ENVIRONMENT_DEFAULT);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [queueOpen, setQueueOpen] = useState(false);
  const [runtimeHovered, setRuntimeHovered] = useState(false);
  const [oneWorksInspectorOpen, setOneWorksInspectorOpen] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [captureScale, setCaptureScale] = useState<number | undefined>();
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "success" | "failure">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const webglReadbackRef = useRef<((result: WebglReadbackResult | null) => void) | null>(null);
  const exportTimerRef = useRef<number | null>(null);
  const fixture = fixtureOfLane(fullLane);
  const overlayProjection = useMemo<LabOverlayProjection | null>(() => fixture ? projectLabOverlayFixture(fixture, t) : null, [fixture, t]);
  const activeCompactScenario = resolveLabCompactScenario(compactScenarioId);
  const previewReducedMotion = reducedMotion || (target === "compact" && activeCompactScenario?.forcedReducedMotion === true);

  useEffect(() => {
    const node = stageRef.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => { if (exportTimerRef.current !== null) window.clearTimeout(exportTimerRef.current); }, []);

  const targetMeta = LAB_PREVIEW_TARGETS[target];
  const autoScale = stageSize === null ? 1 : resolveLabAutoDisplayScale(stageSize.width, stageSize.height, targetMeta.logicalSize);
  const effectiveScale = displayScale === "auto" ? autoScale : displayScale;
  const scaledSize = resolveLabPreviewScaledSize(target, effectiveScale);
  const scaleLabel = displayScale === "auto" ? t("workspace.auto", { scale: autoScale }) : `${displayScale}×`;
  const targetOptions: readonly LabSegmentedOption<LabPreviewTarget>[] = [{ id: "full", label: t("previewTarget.full") }, { id: "compact", label: t("previewTarget.compact") }];
  const scaleOptions: readonly LabSegmentedOption<string>[] = LAB_DISPLAY_SCALES.map((scale) => ({ id: String(scale), label: scale === "auto" ? t("workspace.autoLabel") : `${scale}×` }));
  const reset = () => { setFullLane("ripple"); setCompactScenarioId(LAB_COMPACT_SCENARIOS[0].id); setReducedMotion(prefersReducedMotion()); setQueueOpen(false); };
  const onWebglReadback = useCallback((result: WebglReadbackResult | null) => { const resolve = webglReadbackRef.current; webglReadbackRef.current = null; resolve?.(result); }, []);
  const requestWebglReadback = useCallback((scale: number) => new Promise<WebglReadbackResult | null>((resolve) => {
    webglReadbackRef.current = resolve;
    setCaptureScale(scale);
    setCaptureEpoch((epoch) => epoch + 1);
    window.setTimeout(() => { if (webglReadbackRef.current === resolve) { webglReadbackRef.current = null; resolve(null); } }, 2000);
  }), []);
  const handleExport = useCallback(async () => {
    if (exportState === "exporting" || fullLane === "ripple") return;
    const frameElement = document.querySelector<HTMLElement>("[data-lab-preview-frame]");
    if (frameElement === null) return;
    setExportState("exporting"); setExportError(null);
    try {
      const result = await capturePreviewPng({ frameElement, chromeElements: [], scale: 4, shadowCss: colors.panelShadow, webglReadback: requestWebglReadback(4) });
      downloadCapturedPng(result.dataUrl, `ameow-lab-${fullLane}-4x.png`);
      setExportState("success");
    } catch (error) {
      setExportError(error instanceof ExportLayerFailure ? t("preview.exportErrorWebgl") : error instanceof Error ? error.message : null);
      setExportState("failure");
    } finally { setCaptureScale(undefined); exportTimerRef.current = window.setTimeout(() => { setExportState("idle"); setExportError(null); }, 2000); }
  }, [colors.panelShadow, exportState, fullLane, requestWebglReadback, t]);

  if (oneWorksInspectorOpen) return <OneWorksMascotInspector onExit={() => setOneWorksInspectorOpen(false)} />;
  return (
    <div style={{ ...PAGE_STYLE, background: `linear-gradient(180deg, ${colors.bgGradientStart}, ${colors.bgGradientEnd})`, color: colors.textPrimary }}>
      <main aria-label={t("workspace.title")} style={{ ...getPanelShellStyle(colors, { radius: 12, boxShadow: colors.panelShadow }), ...WORKSPACE_STYLE }} data-lab-workspace="">
        <div style={STRIP_STYLE} data-lab-workspace-header="" data-lab-scenario-strip="" role="group" aria-label={t("nav.scenarioNavigation")}>
          {target === "full" ? (["ripple", "download", "transcode", "mixed"] as const).map((lane) => <LabStripChip key={lane} label={t(`presets.${lane}.label`)} selected={fullLane === lane} onClick={() => setFullLane(lane)} dataAttributes={{ "data-lab-preset": lane }} title={t(`presets.${lane}.description`)} />) : LAB_COMPACT_SCENARIOS.map((scenario) => <LabStripChip key={scenario.id} label={t(`presets.${scenario.id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}.label`)} selected={compactScenarioId === scenario.id} onClick={() => setCompactScenarioId(scenario.id)} dataAttributes={{ "data-lab-compact-preset": scenario.id }} />)}
        </div>
        <div ref={stageRef} style={{ ...STAGE_STYLE, borderColor: colors.fieldBorder }} data-lab-workspace-body="" data-lab-stage-viewport="">
          <div data-lab-env={previewBackground} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", ...resolveLabPreviewEnvironmentStyle(previewBackground) }} />
          <div style={{ width: scaledSize, height: scaledSize, position: "relative" }}><div style={{ position: "absolute", transform: `scale(${effectiveScale})`, transformOrigin: "top left" }}>
            {target === "compact" ? <CompactPreviewStage reducedMotion={previewReducedMotion} pointerMode={activeCompactScenario?.pointerMode ?? "neutral"} previewPose={activeCompactScenario?.previewPose ?? "neutral"} /> : fullLane === "ripple" ? <RippleLab reducedMotion={previewReducedMotion} /> : <LabOverlayStage target={overlayProjection?.expandedTarget ?? { kind: "idle" }} reducedMotion={previewReducedMotion} overlayProjection={overlayProjection} showQueueOverlay={fullLane === "download" || fullLane === "mixed" || fullLane === "transcode"} queueOpen={queueOpen} onQueueOpenChange={setQueueOpen} showRuntimeOverlay={false} runtimeHovered={runtimeHovered} onRuntimeHoverChange={setRuntimeHovered} onCancelPrimaryTask={() => undefined} onCopyDiagnostic={() => undefined} onRecheck={() => undefined} captureScale={captureScale} captureEpoch={captureEpoch} onWebglReadback={onWebglReadback} />}
          </div></div>
          <div data-lab-preview-controls="" style={{ position: "absolute", left: 12, bottom: 12, zIndex: 40, display: "flex", gap: 6 }}>
            <PreviewEnvironmentPicker value={previewBackground} onChange={setPreviewBackground} t={t} />
            <button type="button" data-lab-reset="" onClick={reset} title={t("workspace.resetHint")} aria-label={t("workspace.reset")} className="lab-control" style={getLabChipStyle(colors)}>↺</button>
          </div>
        </div>
        <div style={{ width: "100%", maxWidth: 760, display: "grid", gap: 8 }} data-lab-workspace-footer="">
          <div style={{ ...ROW_STYLE, color: colors.textSecondary }} data-lab-control-group="target"><span>{t("controls.displayMode")}</span><LabSegmentedControl options={targetOptions} value={target} onChange={setTarget} ariaLabel={t("workspace.targetLabel")} /></div>
          <div style={{ ...ROW_STYLE, color: colors.textSecondary }} data-lab-control-group="scale"><span>{t("controls.zoom")}</span><LabSegmentedControl options={scaleOptions} value={String(displayScale)} onChange={(id) => setDisplayScale(id === "auto" ? "auto" : Number(id) as LabDisplayScale)} ariaLabel={t("workspace.displayScale")} /><span>{scaleLabel}</span></div>
          {target === "full" && fullLane !== "ripple" ? <div style={{ ...ROW_STYLE, color: colors.textSecondary }} data-lab-control-group="actions"><span>{t("controls.actions")}</span><button type="button" data-lab-export="" className="lab-control" onClick={() => void handleExport()} disabled={exportState === "exporting"} style={getLabChipStyle(colors, { disabled: exportState === "exporting" })}>{exportState === "exporting" ? t("preview.exporting") : t("preview.export")}</button>{exportError !== null ? <span role="alert">{exportError}</span> : null}</div> : null}
          <p style={{ margin: 0, fontSize: 11, color: colors.textSecondary, textAlign: "center" }}>{target === "full" && fullLane === "ripple" ? t("ripple.caption") : target === "compact" ? t("compact.caption") : t("preview.caption")}</p>
        </div>
      </main>
      <aside aria-label={t("devTools.title")} style={{ ...getPanelShellStyle(colors, { radius: 12, boxShadow: colors.panelShadow }), ...DEVTOOLS_STYLE }} data-lab-devtools="">
        <h2 style={{ margin: 0, fontSize: 15 }}>{t("devTools.title")}</h2>
        <button type="button" className="lab-control" data-lab-oneworks-inspector-open="" onClick={() => setOneWorksInspectorOpen(true)} style={getLabChipStyle(colors)}>OneWorks Mascot Inspector</button>
        <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.target")}</h3><div style={{ ...ROW_STYLE, color: colors.textSecondary }}><span>{t(LAB_PREVIEW_TARGETS[target].labelKey)}</span><span>{scaleLabel}</span><span>{t(`environment.${previewBackground}`)}</span></div></section>
        <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.rmSection")}</h3><label style={{ ...ROW_STYLE, color: colors.textSecondary }}><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />{t("inspector.reducedMotion")}</label></section>
        {target === "compact" ? <CompactFacts activeScenario={activeCompactScenario} t={t} /> : overlayProjection !== null ? <ScenarioFacts projection={overlayProjection} t={t} queueOpen={queueOpen} onQueueOpenChange={setQueueOpen} /> : <p style={{ margin: 0, fontSize: 12 }}>{t("ripple.inspectorHint")}</p>}
      </aside>
    </div>
  );
}

function LabStripChip({ label, selected, onClick, title, dataAttributes }: { label: string; selected: boolean; onClick: () => void; title?: string; dataAttributes?: { "data-lab-preset"?: string; "data-lab-compact-preset"?: string } }) {
  const { colors } = useTheme();
  return <button type="button" className="lab-control" {...dataAttributes} aria-pressed={selected} onClick={onClick} title={title} style={{ ...getLabChipStyle(colors, { selected }), minHeight: 36, padding: "8px 16px", fontSize: 12.5 }}>{label}</button>;
}

function CompactFacts({ activeScenario, t }: { activeScenario: LabCompactScenario | null; t: TranslateFn }) {
  const { colors } = useTheme();
  return <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.compact.scenario")}</h3><p>{activeScenario?.id ?? ""}</p></section>;
}

function ScenarioFacts({ projection, t, queueOpen, onQueueOpenChange }: { projection: LabOverlayProjection; t: TranslateFn; queueOpen: boolean; onQueueOpenChange: (open: boolean) => void }) {
  const { colors } = useTheme();
  return <section><h3 style={getLabGroupLabelStyle(colors)}>{t("inspector.scenario")}</h3><p>{projection.raw.fixtureKind}</p>{projection.downloadQueueTasks.map((task) => <div key={task.traceId}>{projectLabQueueRow(projection.downloadState, task, t).progressText}</div>)}{projection.totalTaskCount > 0 ? <button type="button" className="lab-control" onClick={() => onQueueOpenChange(!queueOpen)} style={getLabChipStyle(colors)}>{t(queueOpen ? "inspector.queue.close" : "inspector.queue.open")}</button> : null}</section>;
}
