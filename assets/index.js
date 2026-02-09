const statusElement = document.getElementById("status");
const responseElement = document.getElementById("response");

const updateStatus = (text, tone) => {
  statusElement.textContent = text;
  statusElement.classList.toggle("error", tone === "error");
};

const checkApi = async () => {
  try {
    const response = await fetch("/api/");
    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }
    const text = await response.text();
    updateStatus("API connection established.", "ok");
    responseElement.textContent = text.trim() || "(Empty API response)";
  } catch (error) {
    updateStatus("Unable to reach the API.", "error");
    responseElement.textContent = error instanceof Error ? error.message : String(error);
  }
};

checkApi();
