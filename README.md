# STEM Audio Workbench — public interface

This repository contains the static public website for STEM. It connects to the processing API hosted from [demtaiwo1-eng/Stem](https://github.com/demtaiwo1-eng/Stem).

## Current architecture

- **This repository / GitHub Pages:** public upload and download interface.
- **Neon project:** durable processing-job records in Postgres and private audio/result storage in Neon Object Storage.
- **Stem repository:** Node.js API and Demucs/FFmpeg worker. It must run on a machine or container with enough CPU, RAM and disk to process audio.

## Use

1. Deploy the backend from the Stem repository on a Docker-capable host with Python/PyTorch and FFmpeg.
2. Configure the backend with the Neon Postgres and Object Storage environment values described in the Stem repository README.
3. Open this site and enter the backend's public HTTPS URL in **Connect STEM engine**.
4. Confirm the connection status reports Neon database and Object Storage readiness.
5. Upload an audio file and download the result ZIP when processing completes.

For local testing, enter `http://localhost:8787` while the backend is running locally.

## GitHub Pages

The included Actions workflow deploys this repository to GitHub Pages when pushed to `main`. In repository Settings → Pages, set the build/deployment source to **GitHub Actions**.

Audio processing does not happen on GitHub Pages. Neon stores the job and files but does not run the Demucs separation model. The site therefore requires a running STEM worker/API. Restrict the backend's `ALLOWED_ORIGIN` to the GitHub Pages origin when deploying publicly.

## Important

Do not put database passwords or Neon storage credentials in this repository or in browser JavaScript. The public page is not itself a secure processing backend. Add authentication, upload quotas and retention controls before accepting unrestricted public uploads.

## Free on-demand processing (no paid hosting)

The main page now links to a Google Colab runner built from the open-source STEM worker:

[Launch STEM Free Runner](https://colab.research.google.com/github/demtaiwo1-eng/Stem/blob/main/notebooks/STEM_Free_Colab.ipynb)

1. Open the notebook and choose **Runtime → Run all**.
2. Wait for the dependencies and Demucs model to install/download.
3. Upload an audio file in the STEM panel.
4. Listen to the six estimated stems and download the complete ZIP.

This is a free, user-started processing path, not an always-on cloud service. Colab free GPU availability, session duration, compute limits and temporary share links are controlled by Google. Keep the notebook session open while processing and download your result before the session ends. CPU fallback is available but can be much slower. No Neon credentials are required for this Colab workflow; processing is performed in the temporary Colab session.

The original API/server connection remains available for users who run their own STEM backend. GitHub Pages itself does not run Demucs.
