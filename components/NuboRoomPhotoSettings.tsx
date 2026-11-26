"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  isRoomPhotoFloor, ROOM_PHOTO_ACCEPT, ROOM_PHOTO_FLOORS, ROOM_PHOTO_MAX_BYTES,
  type RoomPhoto, type RoomPhotoFloor, type RoomPhotoFloorGallery,
} from "@/lib/nubo-room-photos";

const ADMIN_URL = "/api/admin/room-photos";
const fileTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function NuboRoomPhotoSettings({ fieldStyle, buttonStyle }: { fieldStyle: CSSProperties; buttonStyle: CSSProperties }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [floor, setFloor] = useState<RoomPhotoFloor>("2F");
  const [gallery, setGallery] = useState<RoomPhotoFloorGallery[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/room-photos", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("無法讀取客房照片");
        return response.json() as Promise<{ floors: RoomPhotoFloorGallery[] }>;
      })
      .then(({ floors }) => setGallery(floors))
      .catch(() => {
        if (!controller.signal.aborted) setMessage("無法讀取客房照片，請重新整理。");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const updateFloor = (target: RoomPhotoFloor, update: (photos: RoomPhoto[]) => RoomPhoto[]) => {
    setGallery((current) => ROOM_PHOTO_FLOORS.map((item) => {
      const photos = current.find((group) => group.floor === item)?.photos ?? [];
      return { floor: item, photos: item === target ? update(photos) : photos };
    }));
  };

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !files.length) return;
    setBusy(true);
    setMessage("");
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (file.size > ROOM_PHOTO_MAX_BYTES) throw new Error("每張照片上限 8 MB");
          const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
          const type = file.type || fileTypes[extension] || "";
          const response = await fetch(`${ADMIN_URL}?floor=${floor}`, {
            method: "POST",
            headers: { "Content-Type": type, "x-nubo-admin-action": "1" },
            body: file,
          });
          const result = await response.json().catch(() => ({})) as { photo?: RoomPhoto; error?: string };
          if (!response.ok || !result.photo) throw new Error(result.error || "照片上傳失敗");
          const uploaded = result.photo;
          updateFloor(floor, (photos) => [uploaded, ...photos.filter((item) => item.id !== uploaded.id)]);
          completed++;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "照片上傳失敗");
        }
      }
      setMessage(failures.length
        ? `${floor} 已上傳 ${completed} 張，${failures.length} 張未完成。${failures[0]}。`
        : `${floor} 已上傳 ${completed} 張照片。`);
    } finally {
      setBusy(false);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(id: string) {
    if (busy || !window.confirm(`從旅客頁移除這張 ${floor} 照片？`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${ADMIN_URL}?floor=${floor}&id=${id}`, {
        method: "DELETE", headers: { "x-nubo-admin-action": "1" },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "照片移除失敗");
      }
      updateFloor(floor, (photos) => photos.filter((item) => item.id !== id));
      setMessage(`已移除 ${floor} 照片。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "照片移除失敗");
    } finally {
      setBusy(false);
    }
  }

  const photos = gallery.find((item) => item.floor === floor)?.photos ?? [];
  return (
    <>
      <h2>客房照片</h2>
      <p>選擇樓層後上傳。照片會顯示在旅客首頁的「客房照片」。</p>
      <form onSubmit={upload} style={{ display: "grid", gap: 12 }}>
        <label htmlFor="room-photo-floor">樓層</label>
        <select id="room-photo-floor" style={fieldStyle} value={floor} disabled={busy}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (isRoomPhotoFloor(next)) setFloor(next);
          }}>
          {ROOM_PHOTO_FLOORS.map((item) => <option key={item}>{item}</option>)}
        </select>
        <label htmlFor="room-photo-files">選擇照片</label>
        <input ref={fileInput} id="room-photo-files" type="file" accept={ROOM_PHOTO_ACCEPT}
          multiple disabled={busy} onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} />
        <small>支援 JPEG、PNG、WebP，可多選，每張上限 8 MB。</small>
        <button type="submit" style={{ ...buttonStyle, justifySelf: "start" }} disabled={busy || loading || !files.length}>
          {busy ? "處理中…" : "上傳照片"}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))" }}>
        {photos.map((item, index) => (
          <figure key={item.id} style={{ margin: 0, display: "grid", gap: 6 }}>
            <img src={item.url} alt={`${floor} 客房照片 ${index + 1}`} loading="lazy"
              style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8 }} />
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => void remove(item.id)}>移除照片</button>
          </figure>
        ))}
      </div>
    </>
  );
}
