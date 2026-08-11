"use client";

import { useEffect, useMemo, useState } from "react";
import NuboV12Shell from "@/components/v12/NuboV12Shell";
import {
  connectGoogleHome,
  controlGoogleHome,
  getDefaultGoogleHomeRoom,
  getGoogleHomeStatus,
  listGoogleHomeDevices,
  setDefaultGoogleHomeRoom,
  type GoogleHomeDevice,
  type GoogleHomeRoom,
} from "@/lib/google-home-native";

export default function SmartHomePage() {
  const [message, setMessage] = useState("準備連接 Google Home");
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<GoogleHomeRoom[]>([]);
  const [devices, setDevices] = useState<GoogleHomeDevice[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");

  useEffect(() => {
    const status = getGoogleHomeStatus();
    setAvailable(Boolean(status.available && status.enabled));
    setSelectedRoom(getDefaultGoogleHomeRoom());
    if (!status.available || !status.enabled) {
      setMessage(status.message || status.error || "目前 APK 尚未啟用 Google Home 模組");
    }
  }, []);

  const roomDevices = useMemo(
    () => devices.filter((device) => !selectedRoom || device.room === selectedRoom),
    [devices, selectedRoom],
  );

  async function run(label: string, task: () => Promise<unknown>) {
    setBusy(true);
    setMessage(label);
    try {
      return await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Home 操作失敗");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const result = await run("請在 Google 畫面授權 NUBO 存取你的住宅與裝置…", connectGoogleHome);
    if (!result) return;
    setMessage("Google Home 授權完成，請掃描房間與裝置。");
  }

  async function scan() {
    const result = (await run("正在讀取 Google Home 房間與裝置…", listGoogleHomeDevices)) as
      | { rooms?: GoogleHomeRoom[]; devices?: GoogleHomeDevice[] }
      | null;
    if (!result) return;

    const nextRooms = result.rooms ?? [];
    const nextDevices = result.devices ?? [];
    setRooms(nextRooms);
    setDevices(nextDevices);

    const savedRoom = getDefaultGoogleHomeRoom();
    if (!savedRoom && nextRooms.length === 1) {
      setSelectedRoom(nextRooms[0].room);
      setDefaultGoogleHomeRoom(nextRooms[0].room);
    }
    setMessage(`找到 ${nextRooms.length} 個房間、${nextDevices.length} 個裝置。`);
  }

  function chooseRoom(room: string) {
    setSelectedRoom(room);
    setDefaultGoogleHomeRoom(room);
    setMessage(room ? `這台 NUBO 已綁定：${room}` : "已取消預設房間");
  }

  async function controlRoom(action: "on" | "off") {
    if (!selectedRoom) {
      setMessage("請先選擇這台 NUBO 所在的房間，避免誤控其他房間。");
      return;
    }

    const result = (await run(
      action === "on" ? `正在開啟 ${selectedRoom} 的可控制裝置…` : `正在關閉 ${selectedRoom} 的可控制裝置…`,
      () => controlGoogleHome({ action, room: selectedRoom }),
    )) as { controlled?: number; matched?: number; message?: string; failures?: Array<{ device?: string; error?: string }> } | null;

    if (result) {
      const failureCount = result.failures?.length ?? 0;
      setMessage(
        `${result.message || "控制完成"}；找到 ${result.matched ?? 0} 個，成功 ${result.controlled ?? 0} 個${failureCount ? `，失敗 ${failureCount} 個` : ""}。`,
      );
    }
  }

  async function controlDevice(device: GoogleHomeDevice, action: "on" | "off") {
    const result = (await run(
      action === "on" ? `正在開啟「${device.device}」…` : `正在關閉「${device.device}」…`,
      () => controlGoogleHome({ action, room: device.room, device: device.device }),
    )) as { controlled?: number; message?: string } | null;

    if (result) {
      setMessage(`${device.device}：${result.message || "控制完成"}；成功 ${result.controlled ?? 0} 個。`);
    }
  }

  function capabilityLabel(device: GoogleHomeDevice) {
    if (!device.controllable) return "Read only";
    if (device.onSupported === undefined && device.offSupported === undefined) return "On/Off";
    const commands = [
      device.onSupported ? "On" : "",
      device.offSupported ? "Off" : "",
      device.toggleSupported ? "Toggle" : "",
    ].filter(Boolean);
    return commands.length ? commands.join(" / ") : "On/Off";
  }

  return (
    <NuboV12Shell title="Google Home 智慧家庭">
      <section className="nubo-page-grid">
        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>NUBO × Google Home</h2>
            <span>{available ? "Native Home API" : "尚未啟用"}</span>
          </div>

          <div className={`nubo-device-card ${available ? "" : "warning"}`}>
            <div>
              <strong>Google Home 授權</strong>
              <p>授權後，NUBO 可直接控制 Google Home 已連接的燈、開關與智慧插座，不需要讓音箱再次聽語音。</p>
            </div>
            <span>{available ? "Ready" : "APK Setup"}</span>
          </div>

          <div className="nubo-action-row">
            <button disabled={!available || busy} onClick={connect}>連接 Google Home</button>
            <button disabled={!available || busy} onClick={scan}>掃描房間／裝置</button>
          </div>

          <p className="nubo-live-message">{message}</p>
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>這台 NUBO 所在房間</h2>
            <span>防止跨房誤控</span>
          </div>

          <label style={{ display: "grid", gap: 8 }}>
            <span>預設房間</span>
            <select
              value={selectedRoom}
              onChange={(event) => chooseRoom(event.target.value)}
              disabled={busy || rooms.length === 0}
              style={{ padding: 12, borderRadius: 10 }}
            >
              <option value="">請選擇房間</option>
              {rooms.map((room) => (
                <option key={`${room.structureId}-${room.roomId}`} value={room.room}>
                  {room.structure} / {room.room}
                </option>
              ))}
            </select>
          </label>

          <div className="nubo-action-row" style={{ marginTop: 16 }}>
            <button disabled={!available || busy || !selectedRoom} onClick={() => controlRoom("on")}>測試開燈</button>
            <button disabled={!available || busy || !selectedRoom} onClick={() => controlRoom("off")}>測試關燈</button>
          </div>
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>可控制裝置</h2>
            <span>{roomDevices.filter((device) => device.controllable).length} 個</span>
          </div>

          {roomDevices.length === 0 ? (
            <p>完成 Google Home 授權後按「掃描房間／裝置」。</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {roomDevices.map((device) => (
                <div
                  className={`nubo-device-card ${device.controllable ? "" : "warning"}`}
                  key={`${device.structureId}-${device.deviceId}`}
                  style={{ alignItems: "stretch", gap: 12 }}
                >
                  <div style={{ flex: 1 }}>
                    <strong>{device.device}</strong>
                    <p>{device.structure} / {device.room || "未分房"}</p>
                    <span>{capabilityLabel(device)}</span>
                  </div>
                  {device.controllable ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button disabled={busy} onClick={() => controlDevice(device, "on")}>開</button>
                      <button disabled={busy} onClick={() => controlDevice(device, "off")}>關</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>語音範例</h2>
            <span>本機快速路由</span>
          </div>
          <p>「NUBO，開燈」→ 控制本機綁定房間。</p>
          <p>「NUBO，關燈」→ 控制本機綁定房間。</p>
          <p>「207 房開燈」→ 優先控制語音指定的 207 房。</p>
        </div>
      </section>
    </NuboV12Shell>
  );
}
