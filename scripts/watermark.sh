#!/usr/bin/env bash
# Download copy of a reel (the app itself never shows this):
#   • Faisal Show logo + @username in a corner — half-way it jumps to the opposite corner
#   • a 2-second end clip: the Faisal Show intro (scripts/outro.mp4, with its own sound) + @username
#   • optional: the reel's sound comes from another file (a reel that used someone's sound)
# usage: watermark.sh IN.mp4 OUT.mp4 USERNAME LOGO.png [AUDIO_URL_OR_FILE]
set -euo pipefail
in=$1; out=$2; user=$(printf '%s' "$3" | tr -cd 'A-Za-z0-9._' | cut -c1-24); logo=$4; audio=${5:-}
[ -n "$user" ] || user=fshow
font=$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || echo /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf)

IFS=x read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$in" | head -1)
# phones store some videos turned sideways: use the displayed size
rot=$(ffprobe -v error -select_streams v:0 -show_entries stream_side_data=rotation -of default=nw=1:nk=1 "$in" | head -1 || true)
case "${rot#-}" in 90|270) t=$W; W=$H; H=$t;; esac
# keep it ≤ 720 px wide, even sizes
if [ "$W" -gt 720 ]; then H=$(( H * 720 / W )); W=720; fi
W=$(( W / 2 * 2 )); H=$(( H / 2 * 2 ))
Df=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=nw=1:nk=1 "$in" | head -1)
case "$Df" in ''|N/A) Df=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$in");; esac
[ -n "$Df" ] || Df=10
D=$(awk "BEGIN{print int($Df)+1}")
half=$(awk "BEGIN{print $Df/2}")
# ── the corner mark, like TikTok: [logo] Faisal Show / @username — always fully inside the picture ──
calc() { awk "BEGIN{printf \"%d\", $1}"; }
S=$(( W < H ? W : H ))   # landscape videos: size by the height
L=$(calc "$S*0.095");  [ "$L" -lt 30 ] && L=30
F1=$(calc "$S*0.042"); [ "$F1" -lt 12 ] && F1=12
F2=$(calc "$S*0.034"); [ "$F2" -lt 10 ] && F2=10
GAP=$(calc "$F1*0.3")
ulen=$(( ${#user} + 1 ))
BW=$(calc "($L+$GAP+$F1*6.7 > $ulen*$F2*0.75+4) ? $L+$GAP+$F1*6.7 : $ulen*$F2*0.75+4")
BH=$(calc "$L+$F2*1.55")
MX=$(calc "$W*0.05"); MT=$(calc "$H*0.06"); MB=$(calc "$H*0.11")
# first half: top-left · second half: bottom-right (above where phone players put their buttons)
BX="if(lt(t,$half),$MX,$W-$MX-$BW)"; BY="if(lt(t,$half),$MT,$H-$MB-$BH)"
NX="$BX+$L+$GAP"; NY="$BY+($L-$F1)/2"
UX="$BX"; UY="$BY+$L+$F2*0.3"

# ── the end clip: Faisal Show intro animation with its sound + the uploader's @username ──
outro="$(dirname "$0")/outro.mp4"
CH=$(calc "($H < $W*16/9) ? $H : $W*16/9")
OFS=$(calc "$CH*9/16*0.04"); [ "$OFS" -lt 14 ] && OFS=14
OY=$(calc "$H/2+$CH*0.135")

has_audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$in" | head -1)
args=(-nostdin -v error -y -i "$in" -loop 1 -t "$((D + 1))" -i "$logo" -i "$outro")
if [ -n "$audio" ]; then args+=(-stream_loop -1 -i "$audio"); amain="[3:a]"
elif [ -n "$has_audio" ]; then amain="[0:a]"
else args+=(-f lavfi -t "$D" -i "anullsrc=r=44100:cl=stereo"); amain="[3:a]"; fi

shadow="shadowcolor=black@0.6:shadowx=2:shadowy=2"
filter="
[1:v]scale=$L:$L,format=rgba,colorchannelmixer=aa=0.92[lg];
[0:v]scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[base];
[base][lg]overlay=x='$BX':y='$BY':shortest=1[wl];
[wl]drawtext=fontfile=$font:text='Faisal Show':fontsize=$F1:fontcolor=white@0.95:$shadow:x='$NX':y='$NY',
    drawtext=fontfile=$font:text='@$user':fontsize=$F2:fontcolor=white@0.95:$shadow:x='$UX':y='$UY'[main];
  [2:v]scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2:color=0x07080D,setsar=1,fps=30,format=yuv420p,
    drawtext=fontfile=$font:text='@$user':fontsize=$OFS:fontcolor=0xC8C8D2:x='(w-text_w)/2':y=$OY:enable='gte(t,0.8)'[outro];
${amain}atrim=0:$Df,apad,atrim=0:$Df,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[am];
[2:a]aformat=sample_rates=44100:channel_layouts=stereo[ao];
[main][am][outro][ao]concat=n=2:v=1:a=1[v][a]"
ffmpeg "${args[@]}" -filter_complex "$filter" -map '[v]' -map '[a]' -t "$(awk "BEGIN{print $Df+1.9}")" \
  -c:v libx264 -preset veryfast -crf 27 -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart "$out"
