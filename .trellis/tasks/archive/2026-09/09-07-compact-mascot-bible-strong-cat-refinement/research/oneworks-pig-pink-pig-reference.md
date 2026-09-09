# OneWorks `pig--pink-pig` reference identification

Date: 2026-09-08 (Asia/Shanghai)

## Result

The exact official identifier is **species `pig`, breed `pink-pig`**. It is the generated built-in breed snapshot at:

`src/avatarPresetSnapshots/breeds/pig--pink-pig.svg`

This is not an inference from a generic `pig` entity or a pink color palette: the official snapshot registry constructs breed keys as `${species}--${breed}`, and the repository contains this exact key/file.

## Reproducible official evidence

### Exact asset and source revision

- GitHub source view (inspectable SVG, no download/copy required):
  <https://github.com/oneworks-ai/avatar/blob/9792d24dcdadb13b960757f4352e3fc11bb11130/src/avatarPresetSnapshots/breeds/pig--pink-pig.svg>
- Raw source URL:
  <https://raw.githubusercontent.com/oneworks-ai/avatar/9792d24dcdadb13b960757f4352e3fc11bb11130/src/avatarPresetSnapshots/breeds/pig--pink-pig.svg>
- Contents API metadata:
  <https://api.github.com/repos/oneworks-ai/avatar/contents/src/avatarPresetSnapshots/breeds/pig--pink-pig.svg?ref=9792d24dcdadb13b960757f4352e3fc11bb11130>
- Snapshot blob SHA: `4dac35833dcf7be98d07e1d0f2c168cce52aba7e`
- Snapshot size reported by the Contents API: 56,900 bytes.
- The file's history shows it was introduced/first visible in commit `9792d24dcdadb13b960757f4352e3fc11bb11130` (`feat(avatar): ship compiled SVG renderer and cached previews`, authored 2026-08-27):
  <https://github.com/oneworks-ai/avatar/commits/9792d24dcdadb13b960757f4352e3fc11bb11130/src/avatarPresetSnapshots/breeds/pig--pink-pig.svg>

The official snapshot registry at `src/avatarPresetSnapshots.ts` uses Vite's eager glob over `./avatarPresetSnapshots/breeds/*.svg` and maps each basename to a URL; `getAvatarBreedPresetSnapshotUrl(species, breed)` looks up the exact `${species}--${breed}` key. This is the source-level proof that `pig--pink-pig` is a first-class preset identity rather than a filename guessed for this report:

<https://raw.githubusercontent.com/oneworks-ai/avatar/9792d24dcdadb13b960757f4352e3fc11bb11130/src/avatarPresetSnapshots.ts>

### Release/revision cross-check

The same snapshot blob (`4dac35833dcf7be98d07e1d0f2c168cce52aba7e`) is present at all newer official SDK tags checked:

| Reference | Revision | `@oneworks/avatar` package version | Snapshot path |
| --- | --- | --- | --- |
| `sdk-v1.0.0-rc.7` | `0b4a3404fa0b463ddcad3205c5db4fcfd804e050` | `1.0.0-rc.7` | present |
| `sdk-v1.0.0-rc.8` | `473341758fc479f5e963135cdb9bd08b9d2f3d10` | `1.0.0-rc.8` | present |
| `sdk-v1.0.0-rc.9` | `abce277ee9a9d846ef6964766d3be8938d787ffc` | `1.0.0-rc.9` | present |
| deployed/assets revision | `9792d24dcdadb13b960757f4352e3fc11bb11130` | manifest says `1.0.0-rc.6` at this source revision | present |

The official tag list and rc.9 release notes are available at:

- <https://api.github.com/repos/oneworks-ai/avatar/tags?per_page=100>
- <https://github.com/oneworks-ai/avatar/releases>

The earlier points that were searched are materially different:

- `sdk-v1.0.0-rc.6` tag commit `c7b1847da43bc7043058dbcc89bdfb5896e3cffe`: the `pig--pink-pig.svg` path is absent.
- Previously pinned source commit `3ad2542ea4487e95884f313b84943df602c0e742`: the path is absent; that revision only has the earlier generic entity set.

Therefore, the prior rc.6/`3ad2542` negative search was a version boundary, not evidence that the official preset never existed. The exact snapshot is a newer catalog/gallery artifact retained unchanged through rc.7–rc.9.

### Official app/gallery deployment pointer

The OneWorks app commit that deployed the compiled avatar renderer updates its `assets/avatar` submodule to `9792d24`:

<https://github.com/oneworks-ai/app/commit/80ae2ad670933e17b4e0b71c67c500a02d954b29>

The hosted editor can be opened with the explicit entity/palette selector:

<https://oneworks.cloud/avatar/?entity=pig&palette=pink-pig>

That URL is a reproducible selector for the built-in pig/pink-pig scene, not the user's missing opaque share URL. The official README documents the hosted editor and export entry points:

<https://github.com/oneworks-ai/avatar>

## Source geometry/occlusion facts (inspection fingerprint only)

At `9792d24` / rc.9, `src/avatarEntityPresets.ts` defines the pig parts and scene. The relevant values are recorded only to make visual inspection reproducible; they must not be transplanted into Ameow's different renderer/coordinate system:

- `PIG_PARTS` has two `teardrop` ears with `occludedByFace: true`, `occlusionAmount: 9`, `occlusionPole: 'bottom'`, `roundness: 76`.
- Local ear positions are `(-71, -68, -13)` and `(71, -68, -13)`; rotations are mirrored (`x=-8`, `y=±12`, `z=±27`); scales are `.25 × .35 × .19`.
- The pig head is an ellipse (`roundness: 100`, `bottomTaper: 7`, position `(0,17,0)`, scale `.78 × .73 × .70`).
- `PIG_PRESET_SCENE` selects `paletteId: 'pink-pig'`, camera background `#90a17d`, and authored view state `pitch: -.15`, `positionX: -69`, `positionY: 103`, `roll: .21`, `scale: 1.86`, `yaw: .22`.
- The generated SVG includes `data-avatar-entity-preset="pig"`, compiled owner-partition metadata, and the `production-pig` fragment revision. These markers corroborate that the file is the compiled built-in preset preview rather than an unrelated pig illustration.

Source file:

<https://github.com/oneworks-ai/avatar/blob/abce277ee9a9d846ef6964766d3be8938d787ffc/src/avatarEntityPresets.ts>

Palette source (`id: 'pink-pig'`, named `Pink Pig`) is in the framework-neutral catalog:

<https://raw.githubusercontent.com/oneworks-ai/avatar/abce277ee9a9d846ef6964766d3be8938d787ffc/packages/avatar/src/catalog.ts>

## Permitted reference-use boundary

For this Ameow task, the approved boundary remains **visual reference only**:

1. Inspect the official snapshot/editor for ear silhouette, attachment placement, root embedding, and partial face occlusion behavior.
2. Do not copy the SVG, generated path data, `data-avatar-*` metadata, OneWorks renderer/editor code, or the OneWorks package into Ameow production or this task archive.
3. Do not copy the numeric OneWorks coordinates as Ameow geometry. Ameow uses `@bible-strong/avatar-core` and a different scale/projection; any production values require independent calibration and visual evidence.
4. Do not treat the official `occludedByFace` implementation as permission to add a second OneWorks renderer. If Ameow later needs partial root occlusion, implement/attribute a compatible change in its own core contract under the project's existing license/compliance review.
5. The OneWorks repository is MIT licensed at this revision, which permits copying/modification only with the copyright and permission notice retained; that legal permission does not override this task's stricter product boundary. No OneWorks asset was copied here.

License source: <https://github.com/oneworks-ai/avatar/blob/9792d24dcdadb13b960757f4352e3fc11bb11130/LICENSE>

## What remains unproven

The exact official `pig--pink-pig` identity is now reproducible. What remains unavailable is the user's original share/export URL or screenshot, so this report cannot prove that the user's previously viewed image used the same authored pose, camera, or a later private/custom edit. The missing input needed for that stronger claim is the original OneWorks share URL, exported SVG/PNG, or screenshot.

## Search scope and non-changes

Searched on 2026-09-08:

- Ameow active sources, task reports, archived OneWorks reports, and session memory for `pig--pink-pig`/original links.
- Installed `@oneworks/avatar`/`@oneworks/avatar-react` rc.6 and pinned upstream commit `3ad2542` (negative, as previously recorded).
- Official `oneworks-ai/avatar` GitHub tree/API, `src/avatarPresetSnapshots.ts`, `src/avatarEntityPresets.ts`, `packages/avatar/src/catalog.ts`, snapshot history, tags rc.6–rc.9, release notes, and the hosted editor selector.
- Official `oneworks-ai/app` deployment commit `80ae2ad` and `assets/avatar` pointer `9792d24`.

Only this report was added under the active task's `research/` directory. No production code, specs, task metadata, historical/archive files, commits, or OneWorks assets were modified or copied.
