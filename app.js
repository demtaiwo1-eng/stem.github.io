const $ = selector => document.querySelector(selector);
const apiBase = String(window.STEM_API_BASE || '').replace(/\/$/, '');
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
    setServiceState(false, 'The secure processing service is being connected. Uploads will be enabled automatically when it is ready.');
    return;
  }
  try {
    const response = await apiFetch('/health');
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'Service health check failed.');
    setServiceState(true, 'Processing service online. Your audio is uploaded securely and processed in the cloud.');
  } catch (error) {
    setServiceState(false, 'Processing service is temporarily unavailable. Please try again shortly.');
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
  if (!apiBase) return showMessage('The cloud processing service is not connected yet.');
  if (file.size > 250 * 1024 * 1024) return showMessage('Choose an audio file smaller than 250 MB.');

  button.disabled = true;
  button.textContent = 'Uploading audio…';
  jobPanel.hidden = false;
  $('#results-panel').hidden = true;
  $('#download-link').hidden = true;
  $('#job-title').textContent = 'Preparing your stems';
  $('#job-state').textContent = 'UPLOADING';
  setProgress(3);
  setMessage('Uploading ' + file.name + ' securely…');

  try {
    const body = new FormData();
    body.append('audio', file);
    body.append('outputFormat', $('#output-format').value);
    const response = await apiFetch('/api/jobs', { method: 'POST', body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed.');
    activeJob = data.id;
    setMessage('Upload complete. FAL Demucs is preparing your six stems…');
    poll(data.id);
  } catch (error) {
    setMessage(error.message);
    $('#job-state').textContent = 'ERROR';
    button.disabled = false;
    button.innerHTML = 'Try again <span>→</span>';
  }
});

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
