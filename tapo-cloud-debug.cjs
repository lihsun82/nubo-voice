const axios = require("axios");

function scrub(x) {
  let s = "";
  try {
    s = JSON.stringify(x, null, 2);
  } catch {
    s = String(x);
  }

  const pwd = process.env.TAPO_PASSWORD || "__NO_PWD__";

  return s
    .replace(/("token"\s*:\s*")[^"]+/gi, "$1***")
    .replace(/token=[^&"\s]+/gi, "token=***")
    .replace(/("password"\s*:\s*")[^"]+/gi, "$1***")
    .replace(new RegExp(pwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "***");
}

axios.interceptors.request.use((r) => {
  console.log("--- AXIOS REQUEST ---");
  console.log(scrub({
    method: r.method,
    url: r.url,
    params: r.params,
    data: r.data,
    headers: r.headers,
  }));
  return r;
});

axios.interceptors.response.use(
  (res) => {
    console.log("--- AXIOS RESPONSE ---");
    console.log(scrub({
      status: res.status,
      data: res.data,
    }));
    return res;
  },
  (err) => {
    console.log("--- AXIOS ERROR RESPONSE ---");
    console.log(scrub({
      status: err.response && err.response.status,
      data: err.response && err.response.data,
      message: err.message,
    }));
    throw err;
  }
);

import("tp-link-tapo-connect").then(async (m) => {
  try {
    const api = await m.cloudLogin(process.env.TAPO_EMAIL, process.env.TAPO_PASSWORD);
    const ds = await api.listDevicesByType("SMART.TAPOPLUG");

    const target = ds.find((d) => (d.alias || "").includes("投射燈"));
    if (!target) throw new Error("找不到投射燈");

    console.log("TARGET", scrub({
      alias: target.alias,
      status: target.status,
      deviceId: target.deviceId,
      appServerUrl: target.appServerUrl,
      appServerUrlV2: target.appServerUrlV2,
    }));

    const dev = await api.getTapoDevice(target);
    console.log("METHODS", Object.keys(dev));

    await dev.turnOff();

    console.log("OK turnOff");
    process.exit(0);
  } catch (e) {
    console.error("FINAL FAIL:", e.message || e);
    process.exit(1);
  }
});
