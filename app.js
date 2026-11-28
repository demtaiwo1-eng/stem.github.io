const $ = selector => document.querySelector(selector);
const apiBase = String(window.STEM_API_BASE || '').replace(/\/$/, '');
const localWorkerBase = String(window.STEM_LOCAL_WORKER_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const cloudWorkerBase = String(window.STEM_CLOUD_WORKER_URL || '').replace(/\/$/, '');
let processorMode = 'none';
const form = $('#upload-form');
const fileInput = $('#audio-file');
const selected = $('#selected-file');
const button = $('#submit-btn');
const jobPanel = $('#job');
const drop = $('#dropzone');
const serverStatus = $('#server-status');
const servicePill = $('#service-pill');
let pollHandle = null;
let activeJob = null;

function setServiceState(online, message) {
  serverStatus.textContent = message;
  servicePill.classList.toggle('is-online', online);
  servicePill.classList.toggle('is-offline', !online);
  button.disabled = !online;
}

async function apiFetch(path, options = {}) {
  if (!apiBase) throw new Error('The secure processing service has not been connected yet.');
  return fetch(apiBase + path, {
    ...options,
    headers: { ...(options.headers || {}) }
  });
}

async function checkService() {
  if (!apiBase) {
    setServiceState(false, 'The STEM job-history service is not configured.');
    return;
  }
  try {
    const response = await apiFetch('/health');
    const data = await response.json();
    if (!response.ok || data.ok !== true || data.objectStorage !== true) throw new Error('STEM storage is not ready.');
    let localReady = false;
    try {
      const local = await fetch(localWorkerBase + '/health', { signal: AbortSignal.timeout(2500) });
      const status = await local.json();
      localReady = local.ok && status.ok === true;
    } catch (_) {}
    if (localReady) {
      processorMode = 'local';
      setServiceState(true, 'Free local Demucs processor connected. Audio is processed on this device; only completed stems are saved to your STEM job history.');
      servicePill.lastChild.textContent = ' Local processor';
      return;
    }
    if (cloudWorkerBase) {
      try {
        const cloud = await fetch(cloudWorkerBase + '/config', { signal: AbortSignal.timeout(5000) });
        const status = await cloud.json();
        if (cloud.ok && status && Array.isArray(status.dependencies)) {
          processorMode = 'cloud';
          setServiceState(true, 'Local processor is offline. Free cloud fallback is available; its capacity may be quota-limited.');
          servicePill.lastChild.textContent = ' Free cloud fallback';
          return;
        }
      } catch (_) {}
    }
    processorMode = 'none';
    setServiceState(false, 'STEM job history is online. Start the free local processor on your Windows computer to enable audio separation.');
    servicePill.lastChild.textContent = ' Processor not connected';
  } catch (error) {
    processorMode = 'none';
    setServiceState(false, 'STEM job-history or private storage service is temporarily unavailable.');
  }
}

fileInput.addEventListener('change', () => showFile(fileInput.files[0]));

function showFile(file) {
  if (!file) return;
  selected.hidden = false;
  selected.textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
}

['dragenter', 'dragover'].forEach(eventName => drop.addEventListener(eventName, event => {
  event.preventDefault();
  drop.classList.add('drag');
}));

['dragleave', 'drop'].forEach(eventName => drop.addEventListener(eventName, event => {
  event.preventDefault();
  drop.classList.remove('drag');
}));

drop.addEventListener('drop', event => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  fileInput.files = event.dataTransfer.files;
  showFile(file);
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) return showMessage('Choose an audio file first.');
  if (file.size > 250 * 1024 * 1024) return showMessage('Choose a file smaller than 250 MB.');
  if (processorMode === 'none') return showMessage('Start the free STEM local processor first, then refresh this page.');
  button.disabled = true;
  button.textContent = 'Preparing free processing…';
  jobPanel.hidden = true;
  $('#results-panel').hidden = true;
  $('#download-link').hidden = true;
  $('#upload-progress').hidden = false;
  $('#job-title').textContent = 'Preparing your stems';
  $('#job-state').textContent = 'STARTING';
  $('#local-progress-bar').style.width = '100%';
  $('#local-percent').textContent = 'Ready';
  $('#upload-stage').textContent = 'Creating your private job-history record…';
  setUploadProgress(0);
  try {
    const outputFormat = $('#output-format').value;
    const createResponse = await apiFetch('/api/jobs/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        outputFormat,
        sizeBytes: file.size,
        contentType: file.type || 'application/octet-stream',
        sourceType: file.name.toLowerCase().endsWith('.zip') ? 'zip' : 'audio'
      })
    });
    const job = await createResponse.json();
    if (!createResponse.ok) throw new Error(job.error || 'Could not create the job-history record.');
    activeJob = job.id;
    $('#upload-stage').textContent = 'Job saved. Sending audio to the free ' + (processorMode === 'local' ? 'processor on this device' : 'cloud fallback') + '…';
    setMessage('Open-source Demucs is preparing your audio. Processing time depends on your device and track length.');
    jobPanel.hidden = false;
    $('#job-state').textContent = 'PROCESSING';
    $('#job-title').textContent = 'Separating your audio';
    setProgress(12);

    let archive;
    let provider = processorMode;
    try {
      archive = await runWorker(localWorkerBase, file, outputFormat);
      provider = 'local';
    } catch (localError) {
      if (!cloudWorkerBase) throw localError;
      $('#upload-stage').textContent = 'Local processing is unavailable. Trying the configured free cloud fallback…';
      archive = await runCloudWorker(cloudWorkerBase, file, outputFormat);
      provider = 'cloud';
    }
    setProgress(82);
    $('#upload-stage').textContent = 'Separation complete. Saving your stems and job history securely…';
    await saveArchive(activeJob, archive);
    setUploadProgress(100);
    $('#upload-stage').textContent = 'Completed stems saved to your STEM job history.';
    $('#upload-progress').hidden = true;
    setProgress(100);
    setMessage(provider === 'local'
      ? 'Completed with open-source Demucs on your device. Your result pack is saved in STEM.'
      : 'Completed with the configured free cloud worker. Cloud availability and quotas may vary.');
    $('#job-state').textContent = 'COMPLETED';
    $('#job-title').textContent = 'Your stems are ready';
    button.disabled = false;
    button.innerHTML = 'Separate another song <span>→</span>';
    const link = $('#download-link');
    link.hidden = false;
    link.onclick = downloadZip;
    await loadResults(activeJob);
  } catch (error) {
    $('#upload-stage').textContent = error.message;
    $('#job-state').textContent = 'ERROR';
    setMessage(error.message);
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  }
});

function runWorker(base, file, outputFormat) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('audio', file);
    body.append('outputFormat', outputFormat);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/separate');
    xhr.responseType = 'blob';
    xhr.timeout = 4 * 60 * 60 * 1000;
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) {
        const percent = Math.round(event.loaded / event.total * 100);
        setUploadProgress(percent);
        $('#upload-stage').textContent = percent >= 100
          ? 'Audio received. Demucs is separating the stems on the selected processor…'
          : 'Sending audio to the selected free processor…';
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const reader = new FileReader();
        reader.onload = () => {
          try { reject(new Error(JSON.parse(reader.result).detail || 'Free processor failed.')); }
          catch (_) { reject(new Error('Free processor failed (' + xhr.status + ').')); }
        };
        reader.readAsText(xhr.response);
        return;
      }
      resolve(xhr.response);
    });
    xhr.addEventListener('error', () => reject(new Error('Could not reach the free processor. Check that it is running and refresh STEM.')));
    xhr.addEventListener('timeout', () => reject(new Error('Processing timed out. Try a shorter track or use the cloud fallback if available.')));
    xhr.send(body);
  });
}

async function runCloudWorker(base, file, outputFormat) {
  const uploadForm = new FormData();
  uploadForm.append('files', file, file.name);
  const uploadResponse = await fetch(base + '/gradio_api/upload', { method: 'POST', body: uploadForm });
  if (!uploadResponse.ok) throw new Error('The free cloud worker could not accept the upload.');
  const uploaded = await uploadResponse.json();
  const filePath = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  const payload = {
    data: [{ path: typeof filePath === 'string' ? filePath : filePath.path, orig_name: file.name, mime_type: file.type }, outputFormat]
  };
  const start = await fetch(base + '/gradio_api/call/separate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!start.ok) throw new Error('The free cloud worker could not start this job.');
  const started = await start.json();
  if (!started.event_id) throw new Error('The free cloud worker returned no job identifier.');
  const deadline = Date.now() + 60 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    const poll = await fetch(base + '/gradio_api/call/separate/' + encodeURIComponent(started.event_id));
    if (!poll.ok) throw new Error('The free cloud worker status check failed.');
    const stream = await poll.text();
    const lines = stream.split(/\r?\n/);
    let eventName = '';
    let dataLine = '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLine = line.slice(5).trim();
    }
    if (eventName === 'error') throw new Error(dataLine || 'The free cloud worker could not process this track.');
    if (eventName === 'complete' && dataLine) {
      const result = JSON.parse(dataLine);
      const item = Array.isArray(result) ? result[0] : result;
      const fileUrl = item?.url || (item?.path ? base + '/gradio_api/file=' + encodeURIComponent(item.path) : '');
      if (!fileUrl) throw new Error('The free cloud worker returned an invalid result.');
      const resultResponse = await fetch(fileUrl);
      if (!resultResponse.ok) throw new Error('Could not download the free cloud worker result.');
      return resultResponse.blob();
    }
  }
  throw new Error('The free cloud worker timed out. Try the local processor or a shorter track.');
}

function saveArchive(jobId, archive) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('archive', archive, 'STEM-results.zip');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiBase + '/api/jobs/' + encodeURIComponent(jobId) + '/local-result');
    xhr.responseType = 'json';
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) {
        const percent = Math.round(event.loaded / event.total * 100);
        setUploadProgress(percent);
        $('#upload-stage').textContent = 'Saving completed stems to private storage… ' + percent + '%';
      }
    });
    xhr.addEventListener('load', () => {
      const data = xhr.response || {};
      if (xhr.status < 200 || xhr.status >= 300) reject(new Error(data.error || 'Could not save the completed stems.'));
      else resolve(data);
    });
    xhr.addEventListener('error', () => reject(new Error('Connection lost while saving the completed stems.')));
    xhr.send(body);
  });
}

function setUploadProgress(value) {
  const percent = Math.max(0, Math.min(100, value));
  $('#upload-progress-bar').style.width = percent + '%';
  $('#upload-percent').textContent = percent + '%';
}

function failUpload(message) {
  $('#upload-stage').textContent = message;
  $('#job-state').textContent = 'ERROR';
  button.disabled = false;
  button.innerHTML = 'Try again <span>→</span>';
}

function poll(id) {
  if (pollHandle) clearInterval(pollHandle);
  const check = async () => {
    try {
      const response = await apiFetch('/api/jobs/' + encodeURIComponent(id));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not read job status.');
      setProgress(data.progress || 5);
      setMessage(data.message || data.status);
      $('#job-state').textContent = data.status.toUpperCase();
      $('#job-title').textContent = data.status === 'completed'
        ? 'Your stems are ready'
        : data.status === 'failed' ? 'Processing needs attention' : 'Separating your audio';

      if (data.status === 'completed') {
        clearInterval(pollHandle);
        button.disabled = false;
        button.innerHTML = 'Separate another song <span>→</span>';
        const link = $('#download-link');
        link.hidden = false;
        link.onclick = downloadZip;
        await loadResults(id);
      } else if (data.status === 'failed') {
        clearInterval(pollHandle);
        button.disabled = false;
        button.innerHTML = 'Try another upload <span>→</span>';
      }
    } catch (error) {
      clearInterval(pollHandle);
      setMessage(error.message);
      $('#job-state').textContent = 'DISCONNECTED';
      button.disabled = false;
      button.innerHTML = 'Try again <span>→</span>';
    }
  };
  check();
  pollHandle = setInterval(check, 3000);
}

async function downloadZip(event) {
  event.preventDefault();
  try {
    const response = await apiFetch('/api/jobs/' + encodeURIComponent(activeJob) + '/download');
    if (!response.ok) throw new Error('Could not download the completed stem pack.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'STEM-results.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    setMessage(error.message);
  }
}

async function loadResults(id) {
  const response = await apiFetch('/api/jobs/' + encodeURIComponent(id) + '/results');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load result previews.');
  const grid = $('#results-grid');
  grid.replaceChildren();

  for (const item of data.files || []) {
    const card = document.createElement('article');
    card.className = 'result-card';

    const title = document.createElement('h3');
    title.textContent = String(item.stem || 'Audio stem').toUpperCase();
    card.appendChild(title);

    const meta = document.createElement('p');
    meta.textContent = (Number(item.sizeBytes || 0) / 1048576).toFixed(1) + ' MB · ' + String(data.outputFormat || 'audio').toUpperCase();
    card.appendChild(meta);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = item.downloadUrl;
    audio.setAttribute('aria-label', item.stem + ' audio preview');
    card.appendChild(audio);

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const download = document.createElement('a');
    download.className = 'secondary result-download';
    download.href = item.downloadUrl;
    download.download = item.fileName || (item.stem + '.' + data.outputFormat);
    download.textContent = 'Download ' + String(data.outputFormat || '').toUpperCase();
    actions.appendChild(download);
    card.appendChild(actions);
    grid.appendChild(card);
  }
  $('#results-panel').hidden = false;
}

function setProgress(value) {
  $('#progress-bar').style.width = Math.max(2, Math.min(100, value)) + '%';
}

function setMessage(value) {
  $('#job-message').textContent = value;
}

function showMessage(value) {
  serverStatus.textContent = value;
}

checkService();
