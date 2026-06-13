export type MainWindowEdgeGlowPoint = {
  x: number;
  y: number;
};

export type MainWindowEdgeGlowRect = MainWindowEdgeGlowPoint & {
  width: number;
  height: number;
};

export type ResolveMainWindowEdgeGlowPointOptions = {
  cursorScreenPoint: MainWindowEdgeGlowPoint;
  windowScreenPoint: MainWindowEdgeGlowPoint;
  panelRect: MainWindowEdgeGlowRect;
  panelSize: number;
};

const isFiniteNumber = (value: number): boolean => (
  Number.isFinite(value)
);

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

export const resolveMainWindowEdgeGlowPoint = ({
  cursorScreenPoint,
  windowScreenPoint,
  panelRect,
  panelSize,
}: ResolveMainWindowEdgeGlowPointOptions): MainWindowEdgeGlowPoint | null => {
  const values = [
    cursorScreenPoint.x,
    cursorScreenPoint.y,
    windowScreenPoint.x,
    windowScreenPoint.y,
    panelRect.x,
    panelRect.y,
    panelRect.width,
    panelRect.height,
    panelSize,
  ];
  if (!values.every(isFiniteNumber) || panelSize <= 0 || panelRect.width <= 0 || panelRect.height <= 0) {
    return null;
  }

  const clientX = cursorScreenPoint.x - windowScreenPoint.x;
  const clientY = cursorScreenPoint.y - windowScreenPoint.y;
  const panelX = clientX - panelRect.x;
  const panelY = clientY - panelRect.y;

  return {
    x: clamp(panelX, 0, panelSize),
    y: clamp(panelY, 0, panelSize),
  };
};
