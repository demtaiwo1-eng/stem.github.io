const $ = selector => document.querySelector(selector);
const apiBase = String(window.STEM_API_BASE || '').replace(/\/$/, '');

let jobServiceOnline = false;
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
let isUploading = false;

function setServiceState(online, message) {
  serverStatus.textContent = message;
  servicePill.classList.toggle('is-online', online);
  servicePill.classList.toggle('is-offline', !online);
  button.disabled = !online || isUploading;
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
    setServiceState(false, 'The secure STEM processing API is not configured.');
    servicePill.textContent = ' API not connected';
    return;
  }
  try {
    const response = await apiFetch('/health');
    const data = await response.json();
    if (!response.ok || data.ok !== true || data.objectStorage !== true) throw new Error('STEM private storage is not ready.');
    if (!data.workerConfigured) {
      setServiceState(false, 'STEM storage is online, but the secure CPU worker has not been configured yet.');
      servicePill.textContent = ' Worker setup pending';
      return;
    }
    setServiceState(true, data.workerOnline
      ? 'The free GitHub Actions CPU runner is active. Your upload will enter the processing queue.'
      : 'The secure queue is ready. A free GitHub-hosted CPU runner will pick up your audio; it may take a little time to start.');
    servicePill.textContent = data.workerOnline ? ' GitHub Actions · Active' : ' GitHub Actions · Queue ready';
  } catch (error) {
    setServiceState(false, 'STEM API or private storage is temporarily unavailable.');
    servicePill.textContent = ' Service unavailable';
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
  if (!apiBase) return showMessage('The STEM API is not connected.');
  isUploading = true;
  button.disabled = true;
  button.textContent = 'Uploading securely…';
  jobPanel.hidden = true;
  $('#results-panel').hidden = true;
  $('#download-link').hidden = true;
  $('#upload-progress').hidden = false;
  $('#job-title').textContent = 'Uploading your audio';
  $('#job-state').textContent = 'UPLOADING';
  $('#upload-stage').textContent = 'Sending your audio to private STEM storage…';
  setUploadProgress(0);

  const body = new FormData();
  body.append('audio', file, file.name);
  body.append('outputFormat', $('#output-format').value);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', apiBase + '/api/jobs');
  xhr.responseType = 'json';
  xhr.timeout = 60 * 60 * 1000;
  xhr.upload.addEventListener('progress', event => {
    if (event.lengthComputable) {
      const percent = Math.round(event.loaded / event.total * 100);
      setUploadProgress(percent);
      $('#upload-stage').textContent = percent >= 100
        ? 'Upload received. Saving your job and adding it to the free CPU queue…'
        : 'Uploading to private storage… ' + percent + '%';
    }
  });
  xhr.addEventListener('load', () => {
    const data = xhr.response || {};
    if (xhr.status < 200 || xhr.status >= 300 || !data.id) {
      const message = data.error || 'STEM could not save this upload.';
      $('#upload-stage').textContent = message;
      $('#job-state').textContent = 'ERROR';
      setMessage(message);
      isUploading = false;
      button.disabled = false;
      button.innerHTML = 'Try again <span>→</span>';
      return;
    }
    activeJob = data.id;
    jobPanel.hidden = false;
    $('#upload-progress').hidden = true;
    $('#job-title').textContent = 'Waiting for the free processor';
    $('#job-state').textContent = 'QUEUED';
    setProgress(5);
    setMessage('Your audio is safely stored. The free GitHub Actions CPU runner will process it when available.');
    button.disabled = true;
    button.textContent = 'Processing in queue…';
    poll(activeJob);
  });
  xhr.addEventListener('error', () => {
    $('#upload-stage').textContent = 'Connection lost while uploading. Your job may not have been created.';
    $('#job-state').textContent = 'ERROR';
    isUploading = false;
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  });
  xhr.addEventListener('timeout', () => {
    $('#upload-stage').textContent = 'Upload timed out. Please retry with a smaller file or a more stable connection.';
    $('#job-state').textContent = 'ERROR';
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  });
  xhr.send(body);
});

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
        isUploading = false;
        button.disabled = false;
        button.innerHTML = 'Separate another song <span>→</span>';
        const link = $('#download-link');
        link.hidden = false;
        link.onclick = downloadZip;
        await loadResults(id);
      } else if (data.status === 'failed') {
        clearInterval(pollHandle);
        isUploading = false;
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
    meta.textContent = [item.track, (Number(item.sizeBytes || 0) / 1048576).toFixed(1) + ' MB', String(data.outputFormat || 'audio').toUpperCase()].filter(Boolean).join(' · ');
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
setInterval(checkService, 30000);
