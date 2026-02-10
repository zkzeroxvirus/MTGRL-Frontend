const statusElement = document.getElementById("status");
const statusLight = document.getElementById("status-light");
const latencyElement = document.getElementById("latency");
const httpCodeElement = document.getElementById("http-code");
const lastCheckElement = document.getElementById("last-check");
const detailsElement = document.getElementById("details");

const shouldHideDetailKey = (key) => {
  const lowered = key.toLowerCase();
  return ["endpoint", "endpoints", "bulk", "metric"].some((token) => lowered.includes(token));
};

if (statusElement) {
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
    const entries = Object.entries(data).filter(([key]) => !shouldHideDetailKey(key));
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
        renderDetails({ status: "ok", message: data.trim() || "Empty response" });
      } else {
        renderDetails(data);
      }
    } catch (error) {
      updateStatus("Unable to reach the API.", "error");
      const message = error instanceof Error ? error.message : String(error);
      renderDetails({ status: "error", message });
    }
  };

  checkApi();
}

const overviewModal = document.getElementById("gameplay-modal");
const openOverview = document.getElementById("open-overview");

if (overviewModal && openOverview) {
  const closeModal = () => {
    overviewModal.classList.remove("is-open");
    overviewModal.setAttribute("aria-hidden", "true");
    openOverview.focus();
  };

  const openModal = () => {
    overviewModal.classList.add("is-open");
    overviewModal.setAttribute("aria-hidden", "false");
    const closeButton = overviewModal.querySelector(".modal-close");
    if (closeButton) {
      closeButton.focus();
    }
  };

  openOverview.addEventListener("click", openModal);

  overviewModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.close === "true") {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overviewModal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

const highlightModal = document.getElementById("highlight-modal");
const highlightTitle = document.getElementById("highlight-modal-title");
const highlightCopy = document.getElementById("highlight-modal-copy");
const highlightButtons = document.querySelectorAll(".pill-button[data-detail]");

if (highlightModal && highlightTitle && highlightCopy && highlightButtons.length) {
  const closeHighlight = () => {
    highlightModal.classList.remove("is-open");
    highlightModal.setAttribute("aria-hidden", "true");
  };

  const openHighlight = (button) => {
    highlightTitle.textContent = button.dataset.title || "Run Highlight";
    highlightCopy.textContent = button.dataset.detail || "";
    highlightModal.classList.add("is-open");
    highlightModal.setAttribute("aria-hidden", "false");
    const closeButton = highlightModal.querySelector(".modal-close");
    if (closeButton) {
      closeButton.focus();
    }
  };

  highlightButtons.forEach((button) => {
    button.addEventListener("click", () => openHighlight(button));
  });

  highlightModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.close === "true") {
      closeHighlight();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && highlightModal.classList.contains("is-open")) {
      closeHighlight();
    }
  });
}

