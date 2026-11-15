"use client";

type NuboPhoneState = "idle" | "ringing" | "connecting" | "connected" | "error";

export function NuboPhoneAction({
  state,
  onClick,
}: {
  state: NuboPhoneState;
  onClick: () => void;
}) {
  const inCall = state === "connected";
  const busy = state === "ringing" || state === "connecting";
  const label = inCall
    ? "通話中，點電話圖示結束"
    : state === "ringing"
      ? "電話響鈴中"
      : state === "connecting"
        ? "正在接通 NUBO"
        : "點電話圖示開始對話";

  return (
    <div className="nubo-phone-action">
      <button
        className={`primary nubo-guest-talk-button nubo-phone-button${inCall ? " is-active" : ""}`}
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={inCall ? "通話中，掛斷電話" : busy ? label : "開始對話"}
        aria-pressed={inCall}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {inCall ? (
            <path d="M3.8 15.7c4.9-4.2 11.5-4.2 16.4 0l-2.1 2.3a1 1 0 0 1-1.2.2l-2.2-1.1a1 1 0 0 1-.5-.9v-1a13 13 0 0 0-4.4 0v1a1 1 0 0 1-.5.9l-2.2 1.1a1 1 0 0 1-1.2-.2z" />
          ) : (
            <>
              <path d="M7.2 3.7c.4-.4 1-.5 1.5-.3l2.1 1.2c.6.3.9 1 .7 1.6l-.8 2.1a14 14 0 0 0 5 5l2.1-.8c.6-.2 1.3.1 1.6.7l1.2 2.1c.2.5.1 1.1-.3 1.5l-1.4 1.4a2 2 0 0 1-2 .5A20 20 0 0 1 4.3 8.1a2 2 0 0 1 .5-2z" />
              {busy ? <path d="M15 3a6 6 0 0 1 6 6M15 6a3 3 0 0 1 3 3" /> : null}
            </>
          )}
        </svg>
        {inCall ? <span className="nubo-phone-live-dot" aria-hidden="true" /> : null}
      </button>
      <span className="nubo-phone-action-label">{label}</span>
    </div>
  );
}
