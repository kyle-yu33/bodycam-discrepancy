# Demo clips: getting them and adding new ones

Video files are **never committed** (`data/clips/*` is gitignored). The repo stores a
recipe for each clip instead, and `fetch_clips` rebuilds the exact same file on any
machine.

## Get the clips

From `backend/` with the venv active:

```powershell
pip install -r requirements.txt          # includes yt-dlp
python -m app.fetch_clips                # every clip -> data/clips/<name>.mp4
python -m app.fetch_clips sfst1          # just one
```

ffmpeg must be on PATH (yt-dlp uses it to cut the section). Clips that already exist are
skipped; delete the file to re-download it.

## Current clips

| Case | Source | Section | What it shows |
|---|---|---|---|
| `sfst1` | [YouTube 4ThCZOa20wc](https://www.youtube.com/watch?v=4ThCZOa20wc) | 3:40–5:00 (80 s) | Walk-and-Turn field sobriety test: nine steps along a line, a slow turn, nine steps back. Main demo case. |
| `copa184` | BodyCam-VQA `eval_videos/video184.mp4` | whole video (~60 s) | Handcuffed subject beside an SUV, officers talking. Backup case. |

## Add a YouTube clip

1. Find the start and end times. Keep it **90 s or shorter**: the pipeline trims anything longer.
2. Pick a short case name, e.g. `sfst2`. The same name is used for the clip, the report
   and the ground truth.
3. Add one line to `YOUTUBE` in `backend/app/fetch_clips.py`:
   ```python
   "sfst2": ("https://www.youtube.com/watch?v=VIDEO_ID", "1:05-2:05"),
   ```
   Times can be `m:ss`, `h:mm:ss` or plain seconds.
4. Run `python -m app.fetch_clips sfst2` and check it:
   ```powershell
   ffprobe -v error -show_entries format=duration:stream=codec_type ..\data\clips\sfst2.mp4
   ```
   You want one `video` stream, one `audio` stream, and the duration you asked for.
5. Write `data/reports/sfst2.txt` (fictional, labelled as such) and, after watching the
   clip, `data/ground_truth/sfst2.json`. Each claim's `text` must be an exact substring of
   the report.

## Choosing clips

- Staged or training footage beats real incidents: no real people's worst day, no risk the
  model already knows the case, and the ground truth is certain.
- Daylight, a steady camera, and the whole body in frame, feet included.
- No weapons, injuries or force.
- Avoid news edits with captions, blur boxes or narration over the audio.

## If the download fails

- "Sign in to confirm you're not a bot" or missing formats: `pip install -U yt-dlp`, then
  retry. If that doesn't work, run yt-dlp by hand with `--cookies-from-browser chrome`.
- "Requested format is not available": the video has no ≤720p stream; drop the `-f`
  argument in `_fetch_youtube` for that run.

YouTube's terms don't permit downloading, and the videos belong to their owners. This is
tolerated for a private hackathon prototype: credit the source on screen and don't
redistribute the files.
