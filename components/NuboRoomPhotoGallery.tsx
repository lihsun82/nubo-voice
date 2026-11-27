"use client";

import { useEffect, useRef, useState } from "react";
import type { NuboKioskLanguage } from "@/lib/nubo-kiosk-language";
import type { RoomPhotoFloor, RoomPhotoFloorGallery } from "@/lib/nubo-room-photos";

const COPY = {
  zh: { loading: "正在載入客房照片…", empty: "目前尚無客房照片。", failed: "照片暫時無法載入，請稍後再試。", floors: "樓層", photo: "客房照片" },
  en: { loading: "Loading room photos…", empty: "Room photos are coming soon.", failed: "Photos are unavailable. Please try again later.", floors: "Floors", photo: "Room photo" },
  ja: { loading: "客室の写真を読み込んでいます…", empty: "客室の写真は準備中です。", failed: "写真を読み込めませんでした。しばらくしてからお試しください。", floors: "フロア", photo: "客室の写真" },
  ko: { loading: "객실 사진을 불러오는 중…", empty: "객실 사진을 준비 중입니다.", failed: "사진을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", floors: "층", photo: "객실 사진" },
  vi: { loading: "Đang tải ảnh phòng…", empty: "Hiện chưa có ảnh phòng.", failed: "Không tải được ảnh. Vui lòng thử lại sau.", floors: "Tầng", photo: "Ảnh phòng" },
} satisfies Record<NuboKioskLanguage, { loading: string; empty: string; failed: string; floors: string; photo: string }>;
const ALL_PHOTOS: Record<NuboKioskLanguage, string> = {
  zh: "查看全部照片", en: "All photos", ja: "すべての写真", ko: "전체 사진", vi: "Tất cả ảnh",
};

export function NuboRoomPhotoGallery({ language, title, close, onClose }: {
  language: NuboKioskLanguage; title: string; close: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [floors, setFloors] = useState<RoomPhotoFloorGallery[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<RoomPhotoFloor | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const copy = COPY[language];

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    const controller = new AbortController();
    void fetch("/api/room-photos", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("room_photos_unavailable");
        return response.json() as Promise<{ floors: RoomPhotoFloorGallery[] }>;
      })
      .then((data) => setFloors(data.floors.filter((floor) => floor.photos.length)))
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  const current = floors?.find(({ floor }) => floor === selected) ?? floors?.[0];
  const enlargedPhoto = current?.photos.find(({ id }) => id === selectedPhoto);

  return (
    <dialog className="nubo-kiosk-gallery" ref={dialog} aria-labelledby="nubo-room-photo-title" onClose={onClose}>
      <header>
        <h2 id="nubo-room-photo-title">{title}</h2>
        <form method="dialog"><button type="submit" aria-label={close}>×</button></form>
      </header>
      {current ? (
        <>
          <nav aria-label={copy.floors} className="nubo-kiosk-gallery-floors">
            {floors?.map(({ floor }) => (
              <button key={floor} type="button" aria-pressed={current.floor === floor} onClick={() => {
                setSelected(floor);
                setSelectedPhoto(null);
              }}>
                {floor}
              </button>
            ))}
          </nav>
          {enlargedPhoto && (
            <button type="button" className="nubo-kiosk-gallery-back" onClick={() => setSelectedPhoto(null)}>
              {ALL_PHOTOS[language]}
            </button>
          )}
          <div className="nubo-kiosk-gallery-images" data-enlarged={enlargedPhoto ? true : undefined}>
            {current.photos.map((item, index) => (!enlargedPhoto || item.id === enlargedPhoto.id) && (
              <button key={item.id} type="button" aria-pressed={item.id === selectedPhoto}
                onClick={() => setSelectedPhoto(enlargedPhoto ? null : item.id)}>
                <img src={item.url} alt={`${copy.photo} ${current.floor} · ${index + 1}`} loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <p role="status">{failed ? copy.failed : floors === null ? copy.loading : copy.empty}</p>
      )}
    </dialog>
  );
}
