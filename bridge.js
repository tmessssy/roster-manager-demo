// Cross-platform host bridge for Android WebView, iOS WKWebView, and browser fallback.
(function () {
  function getIOSBridge() {
    return window.webkit && window.webkit.messageHandlers
      ? window.webkit.messageHandlers
      : null;
  }

  function postIOSMessage(name, payload) {
    const bridge = getIOSBridge();
    const handler = bridge && bridge[name];
    if (!handler || typeof handler.postMessage !== 'function') {
      return false;
    }
    handler.postMessage(payload);
    return true;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function browserPrintHtml(html, filename, fallbackDownloadName) {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      return true;
    }

    triggerDownload(
      new Blob([html], { type: 'text/html' }),
      fallbackDownloadName || filename.replace(/\.pdf$/i, '.html')
    );
    return false;
  }

  window.AppBridge = {
    isNativeHost() {
      return Boolean(window.AndroidBridge) || Boolean(getIOSBridge());
    },

    showToast(message) {
      if (window.AndroidBridge && typeof window.AndroidBridge.showToast === 'function') {
        window.AndroidBridge.showToast(message);
        return;
      }
      if (postIOSMessage('showToast', { message })) {
        return;
      }
      alert(message);
    },

    exportJSON(jsonStr, filename) {
      const targetFilename = filename || 'roster_manager.json';
      if (window.AndroidBridge && typeof window.AndroidBridge.exportJSON === 'function') {
        window.AndroidBridge.exportJSON(jsonStr);
        return;
      }
      if (postIOSMessage('exportJSON', { json: jsonStr, filename: targetFilename })) {
        return;
      }
      triggerDownload(new Blob([jsonStr], { type: 'application/json' }), targetFilename);
    },

    printHtml(html, filename, browserOptions) {
      const options = browserOptions || {};
      if (window.AndroidBridge && typeof window.AndroidBridge.printHtml === 'function') {
        window.AndroidBridge.printHtml(html, filename);
        return true;
      }
      if (postIOSMessage('printHtml', { html, filename })) {
        return true;
      }
      return browserPrintHtml(
        html,
        filename,
        options.downloadName || filename.replace(/\.pdf$/i, '.html')
      );
    },

    notifyReady() {
      postIOSMessage('appReady', {});
    }
  };
})();
