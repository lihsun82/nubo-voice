const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");

function getEnv(name) {
  if (process.env[name]) return process.env[name];
  const text = fs.readFileSync(".env.local", "utf8");
  const line = text.split(/\r?\n/).find((x) => x.startsWith(name + "="));
  if (!line) return "";
  return line.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
}

const email = getEnv("NUBO_TAPO_EMAIL");
const password = getEnv("NUBO_TAPO_PASSWORD");

const targetDeviceId = "80225EA7D3137AA90D1E0C9339DA3FE61D80BB88";
const targetMac = "6032B1D3DD64";

async function login(endpoint) {
  const res = await axios.post(endpoint, {
    method: "login",
    params: {
      appType: "Tapo_Android",
      cloudUserName: email,
      cloudPassword: password,
      terminalUUID: crypto.randomUUID(),
    },
  });

  console.log("LOGIN", endpoint, res.data.error_code, res.data.msg || "OK");

  if (res.data.error_code !== 0) return null;
  return res.data.result.token;
}

async function list(endpoint, token) {
  const res = await axios.post(endpoint, { method: "getDeviceList" }, { params: { token } });
  console.log("LIST", endpoint, res.data.error_code, res.data.msg || "OK");

  const devices = res.data?.result?.deviceList || [];
  const target =
    devices.find((d) => d.deviceMac === targetMac) ||
    devices.find((d) => d.deviceId === targetDeviceId);

  if (target) {
    console.log("TARGET", {
      alias: target.alias,
      status: target.status,
      isSameRegion: target.isSameRegion,
      region: target.deviceRegion,
      server: target.appServerUrl,
      serverV2: target.appServerUrlV2,
      deviceId: target.deviceId,
      mac: target.deviceMac,
    });
  }

  return target;
}

async function passthrough(name, server, token, deviceId, requestData) {
  const body = {
    method: "passthrough",
    params: {
      deviceId,
      requestData: JSON.stringify(requestData),
    },
  };

  console.log("\nTEST:", name);
  console.log("SERVER:", server);
  console.log("REQUEST_DATA:", body.params.requestData);

  const res = await axios.post(server, body, { params: { token } });
  console.log("RESULT:", res.data);
}

(async () => {
  console.log("email:", email);
  console.log("password length:", password.length);

  const endpoints = [
    "https://aps1-wap.tplinkcloud.com/",
    "https://eu-wap.tplinkcloud.com/",
  ];

  const payloads = [
    {
      name: "legacy system.set_relay_state off",
      data: { system: { set_relay_state: { state: 0 } } },
    },
    {
      name: "new tapo set_device_info device_on false",
      data: { method: "set_device_info", params: { device_on: false } },
    },
    {
      name: "new tapo multipleRequest off",
      data: {
        method: "multipleRequest",
        params: {
          requests: [
            { method: "set_device_info", params: { device_on: false } },
          ],
        },
      },
    },
  ];

  for (const endpoint of endpoints) {
    console.log("\n==============================");
    console.log("ENDPOINT:", endpoint);

    const token = await login(endpoint);
    if (!token) continue;

    const target = await list(endpoint, token);
    const server = target?.appServerUrlV2 || target?.appServerUrl || "https://aps1-wap.tplinkcloud.com";
    const deviceId = target?.deviceId || targetDeviceId;

    for (const payload of payloads) {
      try {
        await passthrough(payload.name, server, token, deviceId, payload.data);
      } catch (e) {
        console.log("ERROR:", e.response?.data || e.message || e);
      }
    }
  }
})();
