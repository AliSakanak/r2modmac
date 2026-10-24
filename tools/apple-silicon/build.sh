#!/usr/bin/env bash
# Builds the Apple Silicon add-on into tools/apple-silicon/dist: libjitwrite.dylib (arm64, ad-hoc signed) and
# AppleSiliconMods.dll. Needs Xcode's command line tools and the .NET SDK. Install with install.sh.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/dist"
rm -rf "$OUT" && mkdir -p "$OUT"
clang -arch arm64 -dynamiclib -O2 -Wall -o "$OUT/libjitwrite.dylib" "$HERE/jitwrite.c"
codesign --force --sign - "$OUT/libjitwrite.dylib"
dotnet build "$HERE/AppleSiliconMods" -c Release -o "$HERE/AppleSiliconMods/bin/build" --nologo -v quiet
cp "$HERE/AppleSiliconMods/bin/build/AppleSiliconMods.dll" "$OUT/"
ls -l "$OUT"
