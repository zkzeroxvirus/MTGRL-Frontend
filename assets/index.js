const statusElement = document.getElementById("status");
const responseElement = document.getElementById("response");
const statusLight = document.getElementById("status-light");
const latencyElement = document.getElementById("latency");
const httpCodeElement = document.getElementById("http-code");
const lastCheckElement = document.getElementById("last-check");
const detailsElement = document.getElementById("details");

if (statusElement && responseElement) {
  const updateStatus = (text, tone) => {
    statusElement.textContent = text;
    statusElement.classList.toggle("error", tone === "error");
    if (statusLight) {
      statusLight.classList.toggle("status-light--error", tone === "error");
      statusLight.classList.toggle("status-light--ok", tone !== "error");
    }
  };

  const renderDetails = (data) => {
    if (!detailsElement) {
      return;
    }
    detailsElement.replaceChildren();
    const entries = Object.entries(data);
    if (!entries.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "key-value";
      emptyRow.innerHTML = "<span class=\"key\">Status</span><span class=\"value\">No data</span>";
      detailsElement.appendChild(emptyRow);
      return;
    }
    entries.forEach(([key, value]) => {
      const row = document.createElement("div");
      row.className = "key-value";
      const keySpan = document.createElement("span");
      keySpan.className = "key";
      keySpan.textContent = key;
      const valueSpan = document.createElement("span");
      valueSpan.className = "value";
      valueSpan.textContent = typeof value === "string" ? value : JSON.stringify(value);
      row.appendChild(keySpan);
      row.appendChild(valueSpan);
      detailsElement.appendChild(row);
    });
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

      if (!response.ok) {
        throw new Error(`API responded with ${response.status}`);
      }

      const data = await parseResponseData(response);
      updateStatus("API online and responding.", "ok");

      if (typeof data === "string") {
        responseElement.textContent = data.trim() || "(Empty API response)";
        renderDetails({ status: "ok", message: data.trim() || "Empty response" });
      } else {
        responseElement.textContent = JSON.stringify(data, null, 2);
        renderDetails(data);
      }
    } catch (error) {
      updateStatus("Unable to reach the API.", "error");
      const message = error instanceof Error ? error.message : String(error);
      responseElement.textContent = message;
      renderDetails({ status: "error", message });
    }
  };

  checkApi();
}
