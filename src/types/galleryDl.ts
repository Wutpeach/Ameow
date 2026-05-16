export type GalleryDlInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source: "managed" | "missing";
  path: string | null;
  updateChannel: "managed_release" | "unavailable";
};
