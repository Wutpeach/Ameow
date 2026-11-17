#!/bin/bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
    printf 'Usage: %s <arm64 executable> <new Ameow.app path>\n' "$0" >&2
    exit 2
fi

repository=$(cd "$(dirname "$0")/.." && pwd -P)
executable=$1
destination=$2
updater="$(dirname "$executable")/ameow-updater"
if [[ $(uname -s) != Darwin || $(uname -m) != arm64 ]]; then
    printf 'Packaging requires an Apple Silicon Mac.\n' >&2
    exit 1
fi
if [[ ! -f $executable || ! -x $executable || $(lipo -archs "$executable") != arm64 ]]; then
    printf 'Expected an executable containing only arm64 code.\n' >&2
    exit 1
fi
if [[ ! -f $updater || ! -x $updater || $(lipo -archs "$updater") != arm64 ]]; then
    printf 'Expected an arm64 ameow-updater beside the application executable.\n' >&2
    exit 1
fi
if [[ $destination != /* || $(basename "$destination") != Ameow.app || -e $destination || -L $destination ]]; then
    printf 'Choose an absolute, unused Ameow.app path.\n' >&2
    exit 1
fi
parent=$(dirname "$destination")
if [[ ! -d $parent ]]; then
    printf 'The destination parent directory must already exist.\n' >&2
    exit 1
fi
version=$(sed -n 's/^version = "\([0-9][0-9.]*\)"$/\1/p' "$repository/Cargo.toml" | head -n 1)
minimum=$(xcrun vtool -show-build "$executable" | awk '/^[[:space:]]*minos / { print $2; exit }')
updater_minimum=$(xcrun vtool -show-build "$updater" | awk '/^[[:space:]]*minos / { print $2; exit }')
if [[ -z $version || -z $minimum || $minimum != "$updater_minimum" ]]; then
    printf 'Cannot determine matching deployment targets for the application and updater.\n' >&2
    exit 1
fi
minimum_major=${minimum%%.*}
if [[ ! $minimum_major =~ ^[0-9]+$ ]] || (( 10#$minimum_major < 13 )); then
    printf 'The application requires a deployment target of macOS 13 or later.\n' >&2
    exit 1
fi
staging=$(mktemp -d "$parent/.ameow-package.XXXXXXXX")
trap 'rm -rf "$staging"' EXIT
bundle="$staging/Ameow.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources" "$staging/ameow.iconset"
cp "$executable" "$bundle/Contents/MacOS/ameow"
cp "$updater" "$bundle/Contents/MacOS/ameow-updater"
cp "$repository/site/public/ameow-logo.png" "$staging/ameow.iconset/icon_256x256.png"
cp "$repository/site/public/ameow-logo.png" "$staging/ameow.iconset/icon_128x128@2x.png"
iconutil -c icns "$staging/ameow.iconset" -o "$bundle/Contents/Resources/ameow.icns"
cat > "$bundle/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleExecutable</key><string>ameow</string>
<key>CFBundleIconFile</key><string>ameow</string>
<key>CFBundleIdentifier</key><string>io.github.wutpeach.ameow</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>Ameow</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$version</string>
<key>LSMinimumSystemVersion</key><string>$minimum</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
plutil -lint "$bundle/Contents/Info.plist"
codesign --force --sign - "$bundle/Contents/MacOS/ameow-updater"
codesign --force --sign - "$bundle"
codesign --verify --deep --strict "$bundle"
mv "$bundle" "$destination"
printf 'Created %s (arm64, executable minimum macOS %s, ad-hoc signed)\n' "$destination" "$minimum"
