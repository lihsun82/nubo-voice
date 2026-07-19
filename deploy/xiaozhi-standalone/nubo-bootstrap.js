(() => {
  const otaUrl = `${window.location.origin}/xiaozhi/ota/`;
  const clientIdKey = "xz_tester_clientId";

  if (!window.localStorage.getItem(clientIdKey)) {
    const randomId =
      window.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(clientIdKey, `nubo-web-${randomId}`);
  }

  window.localStorage.setItem("xz_tester_otaUrl", otaUrl);
  window.localStorage.setItem("xz_tester_deviceName", "NUBO 手機語音");
  window.localStorage.setItem("xz_tester_emojiEnabled", "false");
  window.localStorage.setItem("xz_tester_wakewordEnabled", "false");
  window.localStorage.removeItem("xz_tester_wsUrl");
  window.localStorage.removeItem("xz_tester_vision");

  const style = document.createElement("style");
  style.textContent = `
    #cameraContainer,
    #cameraBtn,
    #visionUrl,
    label[for="visionUrl"] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  window.addEventListener("DOMContentLoaded", () => {
    const otaInput = document.getElementById("otaUrl");
    if (otaInput) otaInput.value = otaUrl;

    const deviceName = document.getElementById("deviceName");
    if (deviceName) deviceName.value = "NUBO 手機語音";

    const title = document.querySelector("title");
    if (title) title.textContent = "NUBO 小智 Opus 語音";
  });
})();
