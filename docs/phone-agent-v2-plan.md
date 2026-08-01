# NUBO Phone Agent V2

- Mobile-first Deep Link launcher for LINE, Facebook, Instagram, Google Maps, YouTube, YouTube Music, Gmail, Google, Spotify, phone, SMS, email, and the NUBO calculator.
- Android uses explicit intent URLs with HTTPS fallbacks.
- iOS and other mobile browsers use Universal Links or standard URI schemes.
- NUBO stores automatic voice-resume state before leaving the page and restores the existing session when the user returns.
- Desktop requests safely fall back to the existing Windows or website controls.
- Existing LINE webhook, authentication, command parsing, and desktop-control code remain unchanged.

## Voice routing

- Supported mobile apps use `open_mobile_app`.
- YouTube and YouTube Music playback use `open_youtube` and are handed to the native mobile app when possible.
- Nearby searches and navigation use Google Maps Deep Links.
- Arbitrary websites continue to use `open_website`.

## Safety

- Only allowlisted apps, Universal Links, standard URI schemes, and HTTP/HTTPS URLs are supported.
- Phone, SMS, and email actions only open the corresponding compose interface; they do not claim that a call or message was completed.
- Payment, pricing, deletion, cancellation, and PMS actions retain the existing confirmation rules.
