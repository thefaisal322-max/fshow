#!/usr/bin/env bash
# Download copy of a reel (the app itself never shows this):
#   • Faisal Show logo + @username in a corner — half-way it jumps to the opposite corner
#   • a 2-second end clip: black screen, the logo pops in, "Faisal Show" and @username
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
L=$(( W * 12 / 100 )); [ "$L" -lt 40 ] && L=40
FS=$(( W * 34 / 1000 )); [ "$FS" -lt 14 ] && FS=14
M=$(( W * 3 / 100 ))
BL=$(( W * 30 / 100 )); BFS=$(( W * 7 / 100 )); SFS=$(( W * 45 / 1000 ))

has_audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$in" | head -1)
args=(-nostdin -v error -y -i "$in" -loop 1 -t "$((D + 1))" -i "$logo" -loop 1 -t 2 -i "$logo"
      -f lavfi -t 2 -i "color=c=black:s=${W}x${H}:r=30" -f lavfi -t 2 -i "anullsrc=r=44100:cl=stereo")
if [ -n "$audio" ]; then args+=(-stream_loop -1 -i "$audio"); amain="[5:a]"
elif [ -n "$has_audio" ]; then amain="[0:a]"
else args+=(-f lavfi -t "$D" -i "anullsrc=r=44100:cl=stereo"); amain="[5:a]"; fi

# corner: top-left first half, bottom-right second half
X="if(lt(t,$half),$M,W-w-$M)"; Y="if(lt(t,$half),$M,H-h-$M-$FS-6)"
TX="if(lt(t,$half),$M,w-text_w-$M)"; TY="if(lt(t,$half),$M+$L+4,h-$M-$FS)"

filter="
[1:v]scale=$L:-1,format=rgba,colorchannelmixer=aa=0.85[lg];
[0:v]scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[base];
[base][lg]overlay=x='$X':y='$Y':shortest=1[wl];
[wl]drawtext=fontfile=$font:text='@$user':fontsize=$FS:fontcolor=white:borderw=2:bordercolor=black@0.55:x='$TX':y='$TY'[main];
[2:v]scale=$BL:-1,format=rgba[big];
[3:v][big]overlay=x='(W-w)/2':y='(H-h)/2-$BFS':enable='gte(t,0.15)',
  drawtext=fontfile=$font:text='Faisal Show':fontsize=$BFS:fontcolor=white:x='(w-text_w)/2':y='h/2+$BL/2-$BFS/2':enable='gte(t,0.6)',
  drawtext=fontfile=$font:text='@$user':fontsize=$SFS:fontcolor=0xFE2C55:x='(w-text_w)/2':y='h/2+$BL/2+$BFS*0.8':enable='gte(t,0.9)',
  fade=t=in:st=0:d=0.3,format=yuv420p,setsar=1[outro];
${amain}atrim=0:$Df,apad,atrim=0:$Df,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[am];
[4:a]aformat=sample_rates=44100:channel_layouts=stereo[ao];
[main][am][outro][ao]concat=n=2:v=1:a=1[v][a]"
ffmpeg "${args[@]}" -filter_complex "$filter" -map '[v]' -map '[a]' -t "$(awk "BEGIN{print $Df+2}")" \
  -c:v libx264 -preset veryfast -crf 27 -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart "$out"
