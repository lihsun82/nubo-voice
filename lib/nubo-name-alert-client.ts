export async function sendTranscriptToNameAlert(transcript: string): Promise<void> {
  const text = transcript?.trim();

  if (!text) return;

  try {
    await fetch("/api/notify/name-called", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: text,
      }),
    });
  } catch (error) {
    console.warn("[name-alert] failed to send transcript", error);
  }
}