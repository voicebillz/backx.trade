#!/usr/bin/env bash
# Voiceover on top of the music+SFX bed from mix.py, with sidechain ducking.
# usage: mix-vo.sh bed.wav vo.mp3 VO_OFFSET_S DUR_S out.wav
# Result of the GazzPad v4 video: VO ~10 dB over the bed, -14 LUFS / -1.5 dBTP.
set -e
bed="$1"; vo="$2"; off="$3"; dur="$4"; out="$5"
ms=$(python3 -c "print(int(float('$off')*1000))"); fo=$(python3 -c "print(float('$dur')-2.5)")
ffmpeg -loglevel error -y -i "$bed" -i "$vo" -filter_complex "\
[1:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-15:TP=-2:LRA=7,adelay=${ms}|${ms},apad=whole_dur=${dur},asplit=2[vo][sc];\
[0:a]aresample=48000,volume=-9dB[bed];\
[bed][sc]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=500:makeup=1[duck];\
[duck][vo]amix=inputs=2:normalize=0:duration=first,atrim=0:${dur},afade=t=out:st=${fo}:d=2.5[m]" -map "[m]" -c:a pcm_s16le "$out.pre.wav"
# measure, then lift to -14 LUFS with a limiter (adjust the dB if the measure differs)
I=$(ffmpeg -hide_banner -i "$out.pre.wav" -af loudnorm=print_format=summary -f null - 2>&1 | awk '/Input Integrated/{print $3}')
g=$(python3 -c "print(round(-14-float('$I'),2))")
ffmpeg -loglevel error -y -i "$out.pre.wav" -af "volume=${g}dB,alimiter=limit=0.82:level=false" -c:a pcm_s16le "$out"
rm -f "$out.pre.wav"
ffmpeg -hide_banner -i "$out" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
