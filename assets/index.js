const statusElement = document.getElementById("status");
const statusLight = document.getElementById("status-light");
const latencyElement = document.getElementById("latency");
const httpCodeElement = document.getElementById("http-code");
const lastCheckElement = document.getElementById("last-check");
const apiSummaryElement = document.getElementById("api-summary");
const imageCacheSummaryElement = document.getElementById("image-cache-summary");
const autoRefreshToggleElement = document.getElementById("auto-refresh-toggle");
const autoRefreshIntervalElement = document.getElementById("auto-refresh-interval");
const refreshNowElement = document.getElementById("refresh-now");

if (statusElement) {
  const updateStatus = (text, tone) => {
    statusElement.textContent = text;
    statusElement.classList.toggle("error", tone === "error");
    if (statusLight) {
      statusLight.classList.toggle("status-light--error", tone === "error");
      statusLight.classList.toggle("status-light--ok", tone !== "error");
    }
  };

  const renderKeyValues = (container, rows) => {
    if (!container) {
      return;
    }
    container.replaceChildren();
    if (!rows.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "key-value";
      emptyRow.innerHTML = "<span class=\"key\">Status</span><span class=\"value\">No data</span>";
      container.appendChild(emptyRow);
      return;
    }
    rows.forEach(({ key, value }) => {
      const row = document.createElement("div");
      row.className = "key-value";
      const keySpan = document.createElement("span");
      keySpan.className = "key";
      keySpan.textContent = key;
      const valueSpan = document.createElement("span");
      valueSpan.className = "value";
      valueSpan.textContent = value;
      row.appendChild(keySpan);
      row.appendChild(valueSpan);
      container.appendChild(row);
    });
  };

  const mb = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;

  const renderApiSummary = (response, data) => {
    const safeObject = (data && typeof data === "object") ? data : {};
    const metricInfo = safeObject.metrics || {};
    const bulkInfo = safeObject.bulkData || {};

    renderKeyValues(apiSummaryElement, [
      {
        key: "Connection",
        value: response.ok ? "Reachable" : "Error"
      },
      {
        key: "Service",
        value: safeObject.service || "MTGR backend"
      },
      {
        key: "Error Rate",
        value: metricInfo.errorRate || "n/a"
      },
      {
        key: "Memory",
        value: metricInfo.memoryMB ? `${metricInfo.memoryMB} MB` : "n/a"
      },
      {
        key: "Bulk Data",
        value: bulkInfo.enabled ? (bulkInfo.loaded ? "Enabled, loaded" : "Enabled, loading") : "Disabled"
      }
    ]);
  };

  const renderImageCacheSummary = (response, data) => {
    const safeObject = (data && typeof data === "object") ? data : {};
    const cache = safeObject.imageCache || {};
    const memory = cache.memory || {};
    const disk = cache.disk || {};

    renderKeyValues(imageCacheSummaryElement, [
      {
        key: "Endpoint",
        value: response.ok ? "Reachable" : `Error (${response.status})`
      },
      {
        key: "Memory Cache",
        value: `${memory.entries ?? 0} entries, ${mb(memory.bytes)}`
      },
      {
        key: "Memory Limit",
        value: `${memory.maxEntries ?? 0} entries, ${mb(memory.maxBytes)}`
      },
      {
        key: "Disk Cache",
        value: `${disk.cachedImages ?? disk.binFiles ?? 0} images, ${mb(disk.bytes)}`
      },
      {
        key: "Disk Limit",
        value: mb(disk.maxBytes)
      },
      {
        key: "In Flight",
        value: String(cache.inFlightRequests ?? 0)
      }
    ]);
  };

  const parseResponseData = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  };

  let refreshTimerId = null;
  let refreshInProgress = false;

  const checkApi = async () => {
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/", { cache: "no-store" });
      const elapsed = Math.round(performance.now() - startedAt);
      if (latencyElement) {
        latencyElement.textContent = `${elapsed} ms`;
      }
      if (httpCodeElement) {
        httpCodeElement.textContent = String(response.status);
      }
      if (lastCheckElement) {
        lastCheckElement.textContent = new Date().toLocaleTimeString();
      }
      const data = await parseResponseData(response);

      if (!response.ok) {
        const message = typeof data === "string"
          ? data.trim() || `API responded with ${response.status}`
          : data?.error || data?.message || `API responded with ${response.status}`;
        updateStatus("API responded with an error.", "error");
        renderKeyValues(apiSummaryElement, [
          { key: "Connection", value: "Error" },
          { key: "HTTP Code", value: String(response.status) },
          { key: "Message", value: message }
        ]);
        return;
      }

      updateStatus("API online and responding.", "ok");
      renderApiSummary(response, data);
    } catch (error) {
      updateStatus("Unable to reach the API.", "error");
      const message = error instanceof Error ? error.message : String(error);
      renderKeyValues(apiSummaryElement, [
        { key: "Connection", value: "Unreachable" },
        { key: "Message", value: message }
      ]);
    }
  };

  const checkImageCacheStats = async () => {
    if (!imageCacheSummaryElement) {
      return;
    }
    try {
      const response = await fetch("/api/image-cache/stats", { cache: "no-store" });
      const data = await parseResponseData(response);
      if (!response.ok) {
        const message = typeof data === "string"
          ? data.trim() || `Image cache stats responded with ${response.status}`
          : data?.details || data?.message || `Image cache stats responded with ${response.status}`;
        renderKeyValues(imageCacheSummaryElement, [
          { key: "Endpoint", value: `Error (${response.status})` },
          { key: "Message", value: message }
        ]);
        return;
      }
      renderImageCacheSummary(response, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderKeyValues(imageCacheSummaryElement, [
        { key: "Endpoint", value: "Unreachable" },
        { key: "Message", value: message }
      ]);
    }
  };

  const runChecks = async () => {
    if (refreshInProgress) {
      return;
    }
    refreshInProgress = true;
    if (refreshNowElement) {
      refreshNowElement.disabled = true;
    }
    try {
      await Promise.all([checkApi(), checkImageCacheStats()]);
    } finally {
      refreshInProgress = false;
      if (refreshNowElement) {
        refreshNowElement.disabled = false;
      }
    }
  };

  const stopAutoRefresh = () => {
    if (refreshTimerId) {
      clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
  };

  const startAutoRefresh = () => {
    stopAutoRefresh();
    if (!autoRefreshToggleElement?.checked) {
      return;
    }
    const intervalMs = Number(autoRefreshIntervalElement?.value || 30000);
    refreshTimerId = setInterval(() => {
      runChecks();
    }, intervalMs);
  };

  if (autoRefreshToggleElement && autoRefreshIntervalElement) {
    autoRefreshToggleElement.addEventListener("change", () => {
      autoRefreshIntervalElement.disabled = !autoRefreshToggleElement.checked;
      startAutoRefresh();
    });

    autoRefreshIntervalElement.addEventListener("change", () => {
      if (autoRefreshToggleElement.checked) {
        startAutoRefresh();
      }
    });
  }

  if (refreshNowElement) {
    refreshNowElement.addEventListener("click", () => {
      runChecks();
    });
  }

  window.addEventListener("beforeunload", () => {
    stopAutoRefresh();
  });

  runChecks();
}
