"use client";

import { useEffect, useMemo, useState } from "react";
import NuboV12Shell from "@/components/v12/NuboV12Shell";
import {
  connectGoogleHome,
  controlGoogleHome,
  getDefaultGoogleHomeRoom,
  getGoogleHomeBridgeStatus,
  listGoogleHomeDevices,
  setDefaultGoogleHomeRoom,
  type GoogleHomeDevice,
  type GoogleHomeRoom,
} from "@/lib/google-home-native";

export default function SmartHomePage() {
  const [message, setMessage] = useState("正在檢查 Google Home 連線…");
  const [available, setAvailable] = useState(false);
  const [bridgeMode, setBridgeMode] = useState<"native" | "webhook">("webhook");
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<GoogleHomeRoom[]>([]);
  const [devices, setDevices] = useState<GoogleHomeDevice[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSelectedRoom(getDefaultGoogleHomeRoom());

    void getGoogleHomeBridgeStatus().then((status) => {
      if (cancelled) return;
      const ready = Boolean(status.available && status.enabled);
      setAvailable(ready);
      setBridgeMode(status.mode === "native" ? "native" : "webhook");
      setMessage(
        status.message ||
          status.error ||
          (ready ? "Google Home 已連線。" : "Google Home 尚未完成串接。"),
      );
    });

    return () => {
      cancelled = true;
    };
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
    const result = (await run(
      bridgeMode === "native"
        ? "請在 Google 畫面授權 NUBO 存取你的住宅與裝置…"
        : "正在確認 Google Home 智慧燈橋接…",
      connectGoogleHome,
    )) as { message?: string } | null;
    if (!result) return;
    setMessage(
      result.message ||
        (bridgeMode === "native"
          ? "Google Home 授權完成，請掃描房間與裝置。"
          : "Google Home 智慧燈橋接已就緒。"),
    );
  }

  async function scan() {
    const result = (await run(
      bridgeMode === "native"
        ? "正在讀取 Google Home 房間與裝置…"
        : "正在確認智慧燈橋接…",
      listGoogleHomeDevices,
    )) as
      | {
          rooms?: GoogleHomeRoom[];
          devices?: GoogleHomeDevice[];
          message?: string;
        }
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

    setMessage(
      result.message ||
        `找到 ${nextRooms.length} 個房間、${nextDevices.length} 個裝置。`,
    );
  }

  function chooseRoom(room: string) {
    setSelectedRoom(room);
    setDefaultGoogleHomeRoom(room);
    setMessage(room ? `這台 NUBO 已綁定：${room}` : "已取消預設房間");
  }

  async function controlRoom(action: "on" | "off") {
    if (bridgeMode === "native" && !selectedRoom) {
      setMessage("請先選擇這台 NUBO 所在的房間，避免誤控其他房間。");
      return;
    }

    const target = selectedRoom || "預設智慧燈";
    const result = (await run(
      action === "on" ? `正在開啟 ${target}…` : `正在關閉 ${target}…`,
      () =>
        controlGoogleHome({
          action,
          room: selectedRoom || undefined,
        }),
    )) as
      | {
          controlled?: number;
          matched?: number;
          message?: string;
          failures?: Array<{ device?: string; error?: string }>;
        }
      | null;

    if (result) {
      const failureCount = result.failures?.length ?? 0;
      setMessage(
        `${result.message || "控制完成"}；成功 ${result.controlled ?? 1} 個${
          failureCount ? `，失敗 ${failureCount} 個` : ""
        }。`,
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
            <span>
              {available
                ? bridgeMode === "native"
                  ? "Native Home API"
                  : "Smart Home Bridge"
                : "尚未啟用"}
            </span>
          </div>

          <div className={`nubo-device-card ${available ? "" : "warning"}`}>
            <div>
              <strong>Google Home 連線</strong>
              <p>
                {bridgeMode === "native"
                  ? "NUBO 直接透過 Android Home API 控制已授權的住宅裝置。"
                  : "目前使用智慧燈橋接模式，可直接由 NUBO 語音控制既有 Google Home／Tapo 燈具。"}
              </p>
            </div>
            <span>{available ? "Ready" : "Setup"}</span>
          </div>

          <div className="nubo-action-row">
            <button disabled={!available || busy} onClick={connect}>
              {bridgeMode === "native" ? "連接 Google Home" : "確認橋接"}
            </button>
            <button disabled={!available || busy} onClick={scan}>
              {bridgeMode === "native" ? "掃描房間／裝置" : "檢查狀態"}
            </button>
          </div>

          <p className="nubo-live-message">{message}</p>
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>燈光控制</h2>
            <span>{bridgeMode === "native" ? "房間綁定" : "預設智慧燈"}</span>
          </div>

          {bridgeMode === "native" ? (
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
          ) : (
            <p>橋接模式不需要在 APK 重新選房，會使用既有智慧燈事件設定。</p>
          )}

          <div className="nubo-action-row" style={{ marginTop: 16 }}>
            <button
              disabled={!available || busy || (bridgeMode === "native" && !selectedRoom)}
              onClick={() => controlRoom("on")}
            >
              測試開燈
            </button>
            <button
              disabled={!available || busy || (bridgeMode === "native" && !selectedRoom)}
              onClick={() => controlRoom("off")}
            >
              測試關燈
            </button>
          </div>
        </div>

        {bridgeMode === "native" ? (
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
                        <button disabled={busy} onClick={() => controlDevice(device, "on")}>
                          開
                        </button>
                        <button disabled={busy} onClick={() => controlDevice(device, "off")}>
                          關
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>語音範例</h2>
            <span>本機快速路由</span>
          </div>
          <p>「NUBO，開燈」→ 直接送出智慧燈開啟指令。</p>
          <p>「NUBO，關燈」→ 直接送出智慧燈關閉指令。</p>
          {bridgeMode === "native" ? <p>「207 房開燈」→ 優先控制語音指定的 207 房。</p> : null}
        </div>
      </section>
    </NuboV12Shell>
  );
}
