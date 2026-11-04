#!/usr/bin/env bash
# Sentence/word timing of a voiceover take from its pauses (no transcription needed).
# usage: vo-timing.sh take.mp3 [noise_dB=-40] [min_pause_s=0.12]
# prints "pause_start-pause_end" pairs; speech segments are the gaps between them.
f="$1"; n="${2:--40}"; d="${3:-0.12}"
ffmpeg -hide_banner -i "$f" -af "silencedetect=noise=${n}dB:d=${d}" -f null - 2>&1 \
  | grep -oE "silence_(start|end): [0-9.]+" | paste - - | awk '{printf "%.2f-%.2f\n", $2, $4}'
