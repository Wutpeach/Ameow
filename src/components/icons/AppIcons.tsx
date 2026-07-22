import type { SVGProps } from "react";

type AppIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function BaseIcon({
  size = 16,
  strokeWidth = 2,
  children,
  ...props
}: AppIconProps & { children: NonNullable<SVGProps<SVGSVGElement>["children"]> }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </BaseIcon>
  );
}

export function CloseIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </BaseIcon>
  );
}

export function CopyIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="8" y="8" width="14" height="14" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </BaseIcon>
  );
}

export function ArrowLeftIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </BaseIcon>
  );
}

export function EyeIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.1 12a11 11 0 0 1 19.8 0 11 11 0 0 1-19.8 0Z" />
      <circle cx="12" cy="12" r="3" />
    </BaseIcon>
  );
}

export function FolderOpenIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 18h11a2 2 0 0 0 1.9-1.4l1.2-4A2 2 0 0 0 18.2 10H11l-2-2H5.8A2 2 0 0 0 4 10l-1 4.6A2.8 2.8 0 0 0 5.7 18Z" />
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h6.5A2.5 2.5 0 0 1 20 9.5" />
    </BaseIcon>
  );
}

export function FolderCheckIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="m9 13 2 2 4-4" />
    </BaseIcon>
  );
}

export function KeyboardIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M6.5 9.5h.01" />
      <path d="M9.5 9.5h.01" />
      <path d="M12.5 9.5h.01" />
      <path d="M15.5 9.5h.01" />
      <path d="M6.5 12.5h.01" />
      <path d="M9.5 12.5h.01" />
      <path d="M12.5 12.5h.01" />
      <path d="M17.5 12.5h.01" />
      <path d="M7 15.5h10" />
    </BaseIcon>
  );
}

export function RotateCcwIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 2.5v5h5" />
      <path d="M3.8 11A8 8 0 1 0 6 6.5L3 9.5" />
    </BaseIcon>
  );
}

export function SearchIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </BaseIcon>
  );
}
