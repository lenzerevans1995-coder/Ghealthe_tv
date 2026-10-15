#!/bin/sh
# Downloads the board's Google Fonts (Barlow Condensed, Inter) into tpv/fonts/
# for render.mjs. Headless Chromium in some sandboxes can't reach Google Fonts
# itself; curl can, so the render serves these files in its place.
set -e
D="$(dirname "$0")/fonts"; mkdir -p "$D"; : > "$D/map.txt"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
curl -sf -A "$UA" "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;600&display=swap" -o "$D/fonts.css"
i=0
for u in $(grep -o 'https://fonts.gstatic.com/[^)]*' "$D/fonts.css" | sort -u); do
  i=$((i+1)); curl -sf "$u" -o "$D/f$i.woff2"; echo "$u $D/f$i.woff2" >> "$D/map.txt"
done
echo "$i font files in $D"
