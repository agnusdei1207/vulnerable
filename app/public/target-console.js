(function () {
  const outputEl = document.getElementById('consoleOutput');
  const connectionEl = document.getElementById('connectionState');
  const maxLines = 3000;
  let lines = [];
  let atBottom = true;

  function postObserverStatus(status) {
    if (window.parent === window) return;
    window.parent.postMessage({
      type: 'observer-status',
      source: 'target',
      payload: Object.assign({
        linked: true,
        service: 'vuln-web',
        activityAt: Date.now()
      }, status)
    }, '*');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function render() {
    const scrollOffset = outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight;
    outputEl.innerHTML = lines.map(function (line) {
      const levelClass = 'line-' + (line.level || 'info');
      const meta = line.meta && Object.keys(line.meta).length
        ? ' <span class="line-meta">' + escapeHtml(JSON.stringify(line.meta)) + '</span>'
        : '';
      return '<span class="line ' + levelClass + '">[' +
        escapeHtml(line.timestamp || '') +
        '] ' +
        escapeHtml(line.message || '') +
        meta +
        '</span>';
    }).join('');
    if (atBottom || scrollOffset < 24) {
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  }

  function applySnapshot(payload) {
    lines = Array.isArray(payload.lines) ? payload.lines.slice(-maxLines) : [];
    render();
    postObserverStatus({
      connected: true,
      running: true,
      lines: lines.length,
      latestLevel: lines.length ? (lines[lines.length - 1].level || 'info') : 'info'
    });
  }

  function appendLine(line) {
    lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(-maxLines);
    }
    render();
    postObserverStatus({
      connected: true,
      running: true,
      lines: lines.length,
      latestLevel: line.level || 'info'
    });
  }

  outputEl.addEventListener('scroll', function () {
    const delta = outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight;
    atBottom = delta < 24;
  });

  const eventSource = new EventSource('/__console/stream');

  eventSource.addEventListener('open', function () {
    if (connectionEl) {
      connectionEl.textContent = 'connected';
    }
    postObserverStatus({ connected: true, running: true, lines: lines.length });
  });

  eventSource.addEventListener('error', function () {
    if (connectionEl) {
      connectionEl.textContent = 'reconnecting';
    }
    postObserverStatus({ connected: false, running: false, lines: lines.length });
  });

  eventSource.addEventListener('snapshot', function (event) {
    applySnapshot(JSON.parse(event.data));
  });

  eventSource.addEventListener('line', function (event) {
    appendLine(JSON.parse(event.data));
  });
})();
