const reportedErrors = new Set<string>();

function setupClientErrorHandler() {
  const originalOnError = window.onerror;
  window.onerror = function (msg, url, lineNo, columnNo, error) {
    let isEmbedded = false;
    try {
      isEmbedded = window.location !== window.parent.location;
    } catch (e) {
      isEmbedded = true;
    }
    
    if (msg === 'Script error.' && isEmbedded) {
      return true; // suppress
    }
    
    const errorKey = msg + ':' + url + ':' + lineNo;
    if (reportedErrors.has(errorKey)) {
      return true;
    }
    reportedErrors.add(errorKey);

    if (originalOnError) {
      return originalOnError(msg, url, lineNo, columnNo, error);
    }
    return false;
  };

  window.addEventListener('error', (e) => {
    let isEmbedded = false;
    try {
      isEmbedded = window.location !== window.parent.location;
    } catch (err) {
      isEmbedded = true;
    }
    
    if (e.message === 'Script error.' && isEmbedded) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return true;
    }
    
    const errorKey = e.message + ':' + e.filename + ':' + e.lineno;
    if (reportedErrors.has(errorKey)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return true;
    }
    reportedErrors.add(errorKey);
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const errorKey = event.reason?.message || String(event.reason);
    if (reportedErrors.has(errorKey)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    reportedErrors.add(errorKey);
  });
}

setupClientErrorHandler();
