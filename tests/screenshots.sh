#!/usr/bin/env bash
# Capture verification screenshots of scripted demos with headless Firefox.
# Usage: tests/screenshots.sh [outdir]   (the dev server must be running on :8070)
set -euo pipefail
OUT="${1:-docs/screenshots}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"   # Firefox needs an absolute path
PROFILE="$(mktemp -d)"
shot() { # name url width height
  timeout 60 firefox --headless --no-remote --profile "$PROFILE" --window-size="$3,$4" \
    --screenshot "$OUT/$1.png" "http://localhost:8070/$2" >/dev/null 2>&1 || true
  if [ -s "$OUT/$1.png" ]; then echo "  ok  $1"; else echo "  FAILED  $1"; fi
}
D=1440; DH=900; M=390; MH=844
shot desktop-idle           "?demo=idle"                          $D $DH
shot desktop-peek           "?demo=peek"                          $D $DH
shot desktop-noticed        "?demo=noticed"                       $D $DH
shot desktop-pretend-whistle "?demo=pretend&act=whistle"          $D $DH
shot desktop-pretend-meditate "?demo=pretend&act=meditate&t=2.6"  $D $DH
shot desktop-resume         "?demo=resume&act=whistle"            $D $DH
shot desktop-startle        "?demo=startle"                       $D $DH
shot desktop-cover          "?demo=cover"                         $D $DH
shot desktop-pout           "?demo=pout"                          $D $DH
shot desktop-bleh           "?demo=bleh"                          $D $DH
shot desktop-typing         "?demo=typing"                        $D $DH
shot desktop-typing-stop    "?demo=typing-stop&act=meditate"      $D $DH
shot desktop-both           "?demo=both"                          $D $DH
shot desktop-sleep          "?demo=sleep"                         $D $DH
shot desktop-dizzy          "?demo=dizzy"                         $D $DH
shot desktop-pet            "?demo=pet"                           $D $DH
shot desktop-boop           "?demo=boop"                          $D $DH
shot desktop-admire         "?demo=admire"                        $D $DH
shot desktop-night          "?demo=night"                         $D $DH
shot mobile-idle            "?demo=idle"                          $M $MH
shot mobile-peek            "?demo=peek"                          $M $MH
shot mobile-typing          "?demo=typing"                        $M $MH
shot mobile-night           "?demo=night"                         $M $MH
rm -rf "$PROFILE"
