# STEM Audio Workbench — public interface

This repository contains the static public website for STEM. It connects to the processing API hosted from [demtaiwo1-eng/Stem](https://github.com/demtaiwo1-eng/Stem).

## Use
1. Deploy the backend from the Stem repository on a machine with Docker, Python/PyTorch and FFmpeg.
2. Open this site and enter the backend's public HTTPS URL in **Connect STEM engine**.
3. Upload an audio file and download the result ZIP when processing completes.

For local testing, enter `http://localhost:8787` while the backend is running locally.

## GitHub Pages
The included Actions workflow deploys this repository to GitHub Pages when pushed to `main`. In repository Settings → Pages, set the build/deployment source to **GitHub Actions** if it is not already selected.

Audio processing does not happen on GitHub Pages. The site requires a running STEM backend. The backend's CORS policy defaults to permissive; restrict `ALLOWED_ORIGIN` to this Pages domain when you deploy it publicly.
