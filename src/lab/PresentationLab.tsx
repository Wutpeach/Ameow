/** Development-only shell around existing production presentation leaves. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "../contexts/ThemeContext";
import { getPanelShellStyle } from "../components/ui/shared-styles";
import { useTheme } from "../contexts/ThemeContext";
import { CompactPreviewStage } from "./CompactPreviewStage";
import { LabOverlayStage } from "./LabOverlayStage";
import { LabSegmentedControl, type LabSegmentedOption } from "./LabSegmentedControl";
import { PreviewEnvironmentPicker } from "./PreviewEnvironmentPicker";
import { getLabChipStyle, getLabGroupLabelStyle } from "./labControls";
import { projectLabOverlayFixture, projectLabQueueRow, type LabOverlayProjection } from "./overlayProjection";
import {
  LAB_DISPLAY_SCALES,
  LAB_DISPLAY_SCALE_DEFAULT,
  LAB_PREVIEW_TARGETS,
  resolveLabAutoDisplayScale,
  resolveLabPreviewScaledSize,
  type LabDisplayScale,
} from "./previewTargets";
import {
  LAB_PREVIEW_ENVIRONMENT_DEFAULT,
  resolveLabPreviewEnvironmentStyle,
  type LabPreviewEnvironment,
} from "./previewEnvironment";
import { RippleLab } from "./ripple/RippleLab";
import {
  DEFAULT_LAB_SCENARIO_ID,
  LAB_SCENARIOS,
  resolveLabScenario,
} from "./scenarios";
import { parseLabUrlState, serializeLabUrlState, type LabUrlState } from "./scenarioUrl";
import { resolveLabOverlayFixture } from "./stateFixtures";

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

export function PresentationLab({ initialState }: Readonly<{ initialState: LabUrlState }>) {
  const { t } = useTranslation("lab");
  const { colors, theme, setTheme } = useTheme();
  const [urlState, setUrlState] = useState<LabUrlState>(initialState);
  const [displayScale, setDisplayScale] = useState<LabDisplayScale>(LAB_DISPLAY_SCALE_DEFAULT);
  const [previewBackground, setPreviewBackground] = useState<LabPreviewEnvironment>(LAB_PREVIEW_ENVIRONMENT_DEFAULT);
  const [queueOpen, setQueueOpen] = useState(false);
  const [runtimeHovered, setRuntimeHovered] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [readyToken, setReadyToken] = useState<symbol | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scenario = resolveLabScenario(urlState.scenario) ?? resolveLabScenario(DEFAULT_LAB_SCENARIO_ID)!;
  const fixture = scenario.renderer === "overlay" ? resolveLabOverlayFixture(scenario.fixtureId) : null;
  const overlayProjection: LabOverlayProjection | null = fixture ? projectLabOverlayFixture(fixture, t) : null;
  const previewReducedMotion = urlState.reducedMotion || (scenario.renderer === "compact" && scenario.forcedReducedMotion);

  const updateUrlState = useCallback((next: LabUrlState) => {
    setUrlState(next);
    window.history.pushState(null, "", `${window.location.pathname}?${serializeLabUrlState(next)}${window.location.hash}`);
  }, []);

  useEffect(() => {
    const onPopState = () => setUrlState(parseLabUrlState(new URLSearchParams(window.location.search), prefersReducedMotion()));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (theme !== urlState.theme) void setTheme(urlState.theme);
  }, [setTheme, theme, urlState.theme]);

  useEffect(() => {
    const node = stageRef.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const readinessToken = useMemo(() => Symbol(scenario.id), [scenario.id]);
  const markScenarioReady = useCallback(() => setReadyToken(readinessToken), [readinessToken]);
  const isScenarioReady = scenario.renderer === "compact" || readyToken === readinessToken;

  const targetMeta = LAB_PREVIEW_TARGETS[scenario.target];
  const autoScale = stageSize === null ? 1 : resolveLabAutoDisplayScale(stageSize.width, stageSize.height, targetMeta.logicalSize);
  const effectiveScale = urlState.capture ? 1 : displayScale === "auto" ? autoScale : displayScale;
  const scaledSize = resolveLabPreviewScaledSize(scenario.target, effectiveScale);
  const scaleLabel = displayScale === "auto" ? t("workspace.auto", { scale: autoScale }) : `${displayScale}×`;
  const scaleOptions: readonly LabSegmentedOption<string>[] = LAB_DISPLAY_SCALES.map((scale) => ({ id: String(scale), label: scale === "auto" ? t("workspace.autoLabel") : `${scale}×` }));
  const themeOptions: readonly LabSegmentedOption<Theme>[] = [
    { id: "black", label: t("theme.black") },
    { id: "white", label: t("theme.white") },
  ];
  const selectScenario = (scenarioId: typeof scenario.id) => {
    updateUrlState({ ...urlState, scenario: scenarioId });
    setQueueOpen(false);
    setRuntimeHovered(false);
  };
  const preview = (
    <div
      ref={stageRef}
      style={{
        ...STAGE_STYLE,
        borderColor: colors.fieldBorder,
        ...(urlState.capture ? { width: scaledSize, height: scaledSize, flex: "none", alignSelf: "auto", border: "none" } : {}),
      }}
      data-lab-workspace-body=""
      data-lab-stage-viewport=""
    >
      <div data-lab-env={previewBackground} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", ...resolveLabPreviewEnvironmentStyle(previewBackground) }} />
      <div style={{ width: scaledSize, height: scaledSize, position: "relative" }}>
        <div style={{ position: "absolute", transform: `scale(${effectiveScale})`, transformOrigin: "top left" }}>
          {scenario.renderer === "compact" ? (
            <CompactPreviewStage reducedMotion={previewReducedMotion} pointerMode={scenario.pointerMode} previewPose={scenario.previewPose} />
          ) : scenario.renderer === "ripple" ? (
            <RippleLab reducedMotion={previewReducedMotion} onCapturableFrame={markScenarioReady} />
          ) : (
            <LabOverlayStage
              target={overlayProjection?.expandedTarget ?? { kind: "idle" }}
              reducedMotion={previewReducedMotion}
              overlayProjection={overlayProjection}
              showQueueOverlay={(overlayProjection?.totalTaskCount ?? 0) > 0}
              queueOpen={queueOpen}
              onQueueOpenChange={setQueueOpen}
              showRuntimeOverlay={overlayProjection?.showRuntimeIndicator === true}
              runtimeHovered={runtimeHovered}
              onRuntimeHoverChange={setRuntimeHovered}
              onCancelPrimaryTask={() => undefined}
              onCopyDiagnostic={() => undefined}
              onRecheck={() => undefined}
              onCapturableFrame={markScenarioReady}
            />
          )}
        </div>
      </div>
      {!urlState.capture ? (
        <div data-lab-preview-controls="" style={{ position: "absolute", left: 12, bottom: 12, zIndex: 40, display: "flex", gap: 6 }}>
          <PreviewEnvironmentPicker value={previewBackground} onChange={setPreviewBackground} t={t} />
          <button type="button" data-lab-reset="" onClick={() => updateUrlState({ ...urlState, scenario: DEFAULT_LAB_SCENARIO_ID, reducedMotion: prefersReducedMotion() })} title={t("workspace.resetHint")} aria-label={t("workspace.reset")} className="lab-control" style={getLabChipStyle(colors)}>↺</button>
        </div>
      ) : null}
    </div>
  );

  if (urlState.capture) {
    return (
      <main
        aria-label={t("workspace.title")}
        data-lab-workspace=""
        data-lab-selected-scenario={scenario.id}
        data-lab-ready={isScenarioReady ? "" : undefined}
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: `linear-gradient(180deg, ${colors.bgGradientStart}, ${colors.bgGradientEnd})` }}
      >
        {preview}
      </main>
    );
  }

  return (
    <div style={{ ...PAGE_STYLE, background: `linear-gradient(180deg, ${colors.bgGradientStart}, ${colors.bgGradientEnd})`, color: colors.textPrimary }}>
      <main aria-label={t("workspace.title")} style={{ ...getPanelShellStyle(colors, { radius: 12, boxShadow: colors.panelShadow }), ...WORKSPACE_STYLE }} data-lab-workspace="" data-lab-selected-scenario={scenario.id} data-lab-ready={isScenarioReady ? "" : undefined}>
        <div style={STRIP_STYLE} data-lab-workspace-header="" data-lab-scenario-strip="" role="group" aria-label={t("nav.scenarioNavigation")}>
          {LAB_SCENARIOS.map((entry) => <LabStripChip key={entry.id} label={t(entry.labelKey)} selected={scenario.id === entry.id} onClick={() => selectScenario(entry.id)} title={entry.descriptionKey ? t(entry.descriptionKey) : undefined} scenarioId={entry.id} />)}
        </div>
        {preview}
        <div style={{ width: "100%", maxWidth: 760, display: "grid", gap: 8 }} data-lab-workspace-footer="">
          <div style={{ ...ROW_STYLE, color: colors.textSecondary }} data-lab-control-group="scale"><span>{t("controls.zoom")}</span><LabSegmentedControl options={scaleOptions} value={String(displayScale)} onChange={(id) => setDisplayScale(id === "auto" ? "auto" : Number(id) as LabDisplayScale)} ariaLabel={t("workspace.displayScale")} /><span>{scaleLabel}</span></div>
          <p style={{ margin: 0, fontSize: 11, color: colors.textSecondary, textAlign: "center" }}>{scenario.renderer === "ripple" ? t("ripple.caption") : scenario.renderer === "compact" ? t("compact.caption") : t("preview.caption")}</p>
        </div>
      </main>
      <aside aria-label={t("devTools.title")} style={{ ...getPanelShellStyle(colors, { radius: 12, boxShadow: colors.panelShadow }), ...DEVTOOLS_STYLE }} data-lab-devtools="">
        <h2 style={{ margin: 0, fontSize: 15 }}>{t("devTools.title")}</h2>
        <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.target")}</h3><div style={{ ...ROW_STYLE, color: colors.textSecondary }}><span>{t(targetMeta.labelKey)}</span><span>{scaleLabel}</span><span>{t(`environment.${previewBackground}`)}</span></div></section>
        <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.theme")}</h3><LabSegmentedControl options={themeOptions} value={urlState.theme} onChange={(nextTheme) => updateUrlState({ ...urlState, theme: nextTheme })} ariaLabel={t("devTools.theme")} /></section>
        <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.rmSection")}</h3><label style={{ ...ROW_STYLE, color: colors.textSecondary }}><input type="checkbox" checked={urlState.reducedMotion} onChange={(event) => updateUrlState({ ...urlState, reducedMotion: event.target.checked })} />{t("inspector.reducedMotion")}</label></section>
        {scenario.renderer === "compact" ? <CompactFacts scenarioId={scenario.id} t={t} /> : overlayProjection !== null ? <ScenarioFacts projection={overlayProjection} t={t} queueOpen={queueOpen} onQueueOpenChange={setQueueOpen} /> : <p style={{ margin: 0, fontSize: 12 }}>{t("ripple.inspectorHint")}</p>}
      </aside>
    </div>
  );
}

function LabStripChip({ label, selected, onClick, title, scenarioId }: Readonly<{ label: string; selected: boolean; onClick: () => void; title?: string; scenarioId: string }>) {
  const { colors } = useTheme();
  return <button type="button" className="lab-control" data-lab-scenario={scenarioId} aria-pressed={selected} onClick={onClick} title={title} style={{ ...getLabChipStyle(colors, { selected }), minHeight: 36, padding: "8px 16px", fontSize: 12.5 }}>{label}</button>;
}

function CompactFacts({ scenarioId, t }: Readonly<{ scenarioId: string; t: TranslateFn }>) {
  const { colors } = useTheme();
  return <section><h3 style={getLabGroupLabelStyle(colors)}>{t("devTools.compact.scenario")}</h3><p>{scenarioId}</p></section>;
}

function ScenarioFacts({ projection, t, queueOpen, onQueueOpenChange }: Readonly<{ projection: LabOverlayProjection; t: TranslateFn; queueOpen: boolean; onQueueOpenChange: (open: boolean) => void }>) {
  const { colors } = useTheme();
  return <section><h3 style={getLabGroupLabelStyle(colors)}>{t("inspector.scenario")}</h3><p>{projection.raw.fixtureKind}</p>{projection.downloadQueueTasks.map((task) => <div key={task.traceId}>{projectLabQueueRow(projection.downloadState, task, t).progressText}</div>)}{projection.totalTaskCount > 0 ? <button type="button" className="lab-control" onClick={() => onQueueOpenChange(!queueOpen)} style={getLabChipStyle(colors)}>{t(queueOpen ? "inspector.queue.close" : "inspector.queue.open")}</button> : null}</section>;
}
