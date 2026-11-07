#!/usr/bin/env bash
# Capture verification screenshots of scripted demos with headless Firefox.
# Usage: PORT=8070 tests/screenshots.sh [outdir]   (the dev server must be running)
set -euo pipefail
OUT="${1:-docs/screenshots}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"   # Firefox needs an absolute path
PROFILE="$(mktemp -d)"
shot() { # name url width height
  timeout 60 firefox --headless --no-remote --profile "$PROFILE" --window-size="$3,$4" \
    --screenshot "$OUT/$1.png" "http://localhost:${PORT:-8070}/$2&motion=full" >/dev/null 2>&1 || true
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
shot desktop-walk           "?demo=go&to=basin&t=2.4"             $D $DH
shot desktop-drink          "?demo=at&to=basin&t=1.8"             $D $DH
shot desktop-rock           "?demo=at&to=rock&t=2"                $D $DH
shot desktop-snail          "?demo=at&to=snail&t=2.3"             $D $DH
shot desktop-behind         "?demo=go&x=300&y=760&t=14"           $D $DH
shot desktop-front          "?demo=go&x=960&y=962&t=12"           $D $DH
shot desktop-stalk          "?demo=stalk2&dur=4.2"                $D $DH
shot desktop-pounce         "?demo=pounce&t=0.5&dur=3.4"          $D $DH
shot desktop-lantern-night  "?demo=at&to=lantern&t=2.2&hour=21"   $D $DH
shot desktop-tempt          "?demo=tempt"                         $D $DH
shot desktop-zazen          "?demo=zazen&t=0.6"                   $D $DH
shot desktop-satori         "?demo=satori"                        $D $DH
shot desktop-gotcha         "?demo=gotcha"                        $D $DH
shot desktop-judge          "?demo=judge&t=5.2"                   $D $DH
shot desktop-doodle         "?demo=doodle&visits=3&away=5"        $D $DH
shot desktop-dusk           "?demo=idle&hour=18"                  $D $DH
shot mobile-idle            "?demo=idle"                          $M $MH
shot mobile-peek            "?demo=peek"                          $M $MH
shot mobile-typing          "?demo=typing"                        $M $MH
shot mobile-night           "?demo=night"                         $M $MH
shot mobile-basin           "?demo=at&to=basin&t=2"               $M $MH
shot mobile-rock            "?demo=at&to=rock&t=2"                $M $MH
rm -rf "$PROFILE"
