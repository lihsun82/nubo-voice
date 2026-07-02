const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");

function getEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const text = fs.readFileSync(".env.local", "utf8");
    const line = text.split(/\r?\n/).find((x) => x.startsWith(name + "="));
    if (!line) return "";
    return line.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
  } catch {
    return "";
  }
}

const email = getEnv("NUBO_TAPO_EMAIL");
const password = getEnv("NUBO_TAPO_PASSWORD");

const endpoints = [
  "https://aps1-wap.tplinkcloud.com/",
  "https://eu-wap.tplinkcloud.com/",
];

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

  if (res.data.error_code !== 0) {
    throw new Error(`${endpoint} login failed: ${JSON.stringify(res.data)}`);
  }

  return res.data.result.token;
}

async function getDeviceList(endpoint, token) {
  const res = await axios.post(endpoint, { method: "getDeviceList" }, { params: { token } });

  if (res.data.error_code !== 0) {
    throw new Error(`${endpoint} getDeviceList failed: ${JSON.stringify(res.data)}`);
  }

  return res.data.result.deviceList || [];
}

async function passthrough(server, token, deviceId, state) {
  const requestData = JSON.stringify({
    system: {
      set_relay_state: {
        state,
      },
    },
  });

  const res = await axios.post(
    server,
    {
      method: "passthrough",
      params: {
        deviceId,
        requestData,
      },
    },
    { params: { token } }
  );

  return res.data;
}

(async () => {
  if (!email || !password) {
    throw new Error(`Missing credentials. email=${email}, password length=${password.length}`);
  }

  console.log("email:", email);
  console.log("password length:", password.length);

  for (const endpoint of endpoints) {
    console.log("\n==============================");
    console.log("LOGIN ENDPOINT:", endpoint);

    try {
      const token = await login(endpoint);
      console.log("login OK");

      const devices = await getDeviceList(endpoint, token);
      const plugs = devices.filter((d) => d.deviceType === "SMART.TAPOPLUG");

      console.log(
        plugs.map((d) => ({
          alias: d.alias,
          deviceName: d.deviceName,
          status: d.status,
          isSameRegion: d.isSameRegion,
          region: d.deviceRegion,
          server: d.appServerUrl,
          serverV2: d.appServerUrlV2,
          deviceId: d.deviceId,
          mac: d.deviceMac,
        }))
      );

      const target =
        plugs.find((d) => d.deviceMac === "6032B1D3DD64") ||
        plugs.find((d) => d.deviceId === "80225EA7D3137AA90D1E0C9339DA3FE61D80BB88");

      if (!target) {
        console.log("找不到投射燈 MAC / deviceId");
        continue;
      }

      const server = target.appServerUrlV2 || target.appServerUrl;
      console.log("target server:", server);
      console.log("target deviceId:", target.deviceId);

      const offResult = await passthrough(server, token, target.deviceId, 0);
      console.log("OFF RESULT:", offResult);
    } catch (e) {
      console.error("FAIL:", e.message || e);
    }
  }
})();
