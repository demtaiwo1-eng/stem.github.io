# STEM Audio Workbench — public interface

This repository contains the static public website for STEM. The free processing workflow is a Google Colab notebook in [demtaiwo1-eng/Stem](https://github.com/demtaiwo1-eng/Stem).

## Free processing (recommended)

Open the [STEM Free Colab Runner](https://colab.research.google.com/github/demtaiwo1-eng/Stem/blob/main/notebooks/STEM_Free_Colab.ipynb).

1. In Colab, choose **Runtime → Run all**.
2. Wait for FFmpeg and Demucs to install and for the STEM engine to clone.
3. In the upload cell, select your audio file.
4. Wait for the six stems to be generated.
5. Listen to the six previews and download the result ZIP.

The notebook runs the existing `worker.py` directly. It does not require Gradio, a temporary share server, an API URL, Neon credentials, or paid hosting. The ZIP contains WAV and MP3 exports, an original reference, and a manifest. All stems are normalized to stereo 44.1 kHz and the source duration.

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
