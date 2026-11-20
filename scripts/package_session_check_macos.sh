#!/bin/bash
set -euo pipefail
if [[ $# -ne 1 || $(uname -s) != Darwin ]]; then
    printf 'Usage on Mac: %s <new absolute validation directory>\n' "$0" >&2
    exit 2
fi
destination=$1
[[ $destination == /* && ! -e $destination && ! -L $destination ]] || exit 2
repository=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$repository"
MACOSX_DEPLOYMENT_TARGET=13.0 cargo build --locked --example browser_session_native --bin ameow-browser-host
bundle="$destination/Ameow Session Check.app"
mkdir -p "$bundle/Contents/MacOS"
cp target/debug/examples/browser_session_native "$bundle/Contents/MacOS/ameow"
cp target/debug/ameow-browser-host "$bundle/Contents/MacOS/ameow-browser-host"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.github.wutpeach.ameow.session-check</string>
<key>CFBundleName</key><string>Ameow Session Check</string>
<key>CFBundleExecutable</key><string>ameow</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
plutil -lint "$bundle/Contents/Info.plist"
codesign --force --sign - --identifier ameow-browser-host "$bundle/Contents/MacOS/ameow-browser-host"
codesign --force --sign - "$bundle"
codesign --verify --deep --strict "$bundle"
{
    git rev-parse HEAD
    git diff --stat
    shasum -a 256 "$bundle/Contents/MacOS/ameow" "$bundle/Contents/MacOS/ameow-browser-host"
    codesign -d --verbose=4 -r- "$bundle"
    codesign -d --verbose=4 -r- "$bundle/Contents/MacOS/ameow-browser-host"
} > "$destination/identity.txt" 2>&1
printf 'Prepared %s. No GUI or Keychain operation has been started.\n' "$bundle"
