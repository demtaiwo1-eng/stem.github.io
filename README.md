# STEM Audio Workbench — public interface

This repository contains the static public website for STEM. The free processing workflow is a Google Colab notebook in [demtaiwo1-eng/Stem](https://github.com/demtaiwo1-eng/Stem).

## Free processing (recommended)

Open the [STEM Free Colab Runner](https://colab.research.google.com/github/demtaiwo1-eng/Stem/blob/main/notebooks/STEM_Free_Colab.ipynb).

1. In Colab, choose **Runtime → Run all**.
2. Wait for FFmpeg and Demucs to install and for the STEM engine to clone.
3. In the upload cell, select your audio file.
4. Wait for the six stems to be generated.
5. Listen to the six previews and download the result ZIP.

The notebook runs the existing `worker.py` directly. It does not require Gradio, a temporary share server, an API URL, Neon credentials, or paid hosting. The worker now checks vocal signal levels and, when the six-stem vocal estimate is unusually quiet, attempts a second Demucs model and compares candidates. The ZIP contains WAV and MP3 exports, an original reference, a manifest with signal diagnostics, and a simple stem-sum preview. All stems are normalized to stereo 44.1 kHz and the source duration. The preview is not a professionally mixed/mastered song.

**Free-tier limitation:** Colab is on-demand, not always-on. Google controls free GPU availability, quotas and session duration. Keep the tab open until the ZIP downloads. CPU fallback is supported but can be slow. Do not upload audio you do not own or have permission to process.

## Optional self-hosted API

The advanced upload form on the website is for operators who deploy the Node.js API from the Stem repository on a Docker-capable host with enough CPU, RAM and disk.

- **GitHub Pages:** serves only the static website.
- **Neon Postgres:** stores processing-job records.
- **Neon Object Storage:** stores originals and result files.
- **Stem API + worker:** runs the Demucs/FFmpeg processing job.

For this advanced mode, configure the API with the Neon Postgres and object-storage environment values in the Stem repository's `.env.example`, then enter its public HTTPS URL under **Connect your own STEM API**. GitHub Pages itself does not run Demucs, and the advanced form will not work without that separate backend.

Never put database passwords or Neon storage credentials in this repository or browser JavaScript. Add authentication, upload quotas and retention controls before accepting unrestricted public uploads.

## GitHub Pages

The included Actions workflow deploys this repository to GitHub Pages on pushes to `main`. In repository **Settings → Pages**, set the build/deployment source to **GitHub Actions** if it is not already selected.


## AI music generation and reconstruction

STEM keeps source separation separate from generated replacement material. The connected fal music-generation plugin can create original instrumental layers or replacement passages from ChatGPT. Those outputs may use account credits and are not part of the free Colab run. Import generated audio as a separate track, align it to the song's tempo/key/section, and label it as generated before mixing. The static GitHub Pages frontend does not inherit ChatGPT plugin credentials; never put a fal API key in browser JavaScript.

## Upload and receive results directly on the website using Colab

1. Open the [STEM Colab Bridge notebook](https://colab.research.google.com/github/demtaiwo1-eng/Stem/blob/main/notebooks/STEM_Free_Colab.ipynb) and choose **Runtime → Run all**.
2. Wait for Colab to print a temporary HTTPS address and a session token.
3. Open the [STEM website](https://demtaiwo1-eng.github.io/stem.github.io/), paste both values into **Connect your Colab processing session**, and connect.
4. Upload your recording from the website. The website polls the Colab bridge, then displays audio previews and WAV/MP3 download options for each stem, plus the complete ZIP.

The Colab runtime is the temporary compute server. Keep it running while uploads and jobs are active. If it disconnects or expires, restart the notebook and reconnect using the new URL and token. The URL and token are temporary; the token is required to protect the active bridge. GitHub Pages does not itself run the audio model.
