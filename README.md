# STEM Audio Workbench

STEM is a browser-based audio source-separation app. Upload a recording, follow its processing job, preview the separated tracks, and download the finished stem pack.

**Live app:** https://demtaiwo1-eng.github.io/stem.github.io/

## How processing works

1. The GitHub Pages website uploads the selected audio to the STEM API over HTTPS.
2. The API stores the original privately and creates a job in the queue.
3. A GitHub-hosted Actions CPU runner claims queued work and runs the open-source Demucs model (`htdemucs_6s`).
4. The runner sends the completed stem files back to the API.
5. The API saves the results in private object storage. The website displays previews and download links.

No Windows processor, Python installation, Google Colab session, or customer-side model setup is required.

## Free processing and availability

The worker uses standard GitHub-hosted CPU runners and is scheduled to poll for jobs every five minutes. Operators can also start it manually from [GitHub Actions](https://github.com/demtaiwo1-eng/Stem/actions/workflows/stem-free-cpu-worker.yml).

This is a free-tier design, not an unlimited or guaranteed-throughput service. GitHub-hosted runner availability, fair-use policies, concurrency and execution limits apply. CPU source separation can be slow, especially for long or high-resolution recordings. The queue may wait for the next runner cycle.

## Infrastructure

- **Frontend:** GitHub Pages — `demtaiwo1-eng/stem.github.io`
- **API:** Render — `https://stem-api-o0ij.onrender.com`
- **Job records and private files:** Neon Postgres and private object storage
- **Processing:** GitHub Actions hosted CPU runner
- **Model:** Demucs `htdemucs_6s`

The API health endpoint is available at https://stem-api-o0ij.onrender.com/health. It reports API, database, object-storage and worker readiness.

## Operator setup and maintenance

The API and GitHub Actions worker share a secret named `STEM_WORKER_TOKEN`. Store it only in the Render service environment and the Stem repository's GitHub Actions secrets. Never put it in this public frontend repository, browser JavaScript, issue comments, or chat.

The worker uses short-lived signed URLs to retrieve an input file and authenticated API endpoints to report progress and upload results. It does not need Neon database credentials.

To inspect or manually start the worker, open [the worker workflow](https://github.com/demtaiwo1-eng/Stem/actions/workflows/stem-free-cpu-worker.yml). Check the API health endpoint before investigating a queued job.

## Supported results and limitations

STEM provides six aligned Demucs source groups: vocals, drums, bass, guitar, piano and other. AI separation estimates broad source groups; it cannot guarantee perfectly isolated lead or backing singers, ad-libs, individual drum pieces, every instrument, or separate reverb and delay. Some sound may bleed between stems.

Do not upload audio unless you own it or have permission to process it. Apply appropriate upload quotas, retention rules and user support controls before opening the service to unrestricted public traffic.
