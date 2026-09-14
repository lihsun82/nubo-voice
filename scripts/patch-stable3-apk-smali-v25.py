from pathlib import Path
import re

# Apktool-decoded Stable 3.0 MainActivity. Patch only WebView freshness logic.
root = Path("decoded")
main_candidates = list(root.glob("smali*/com/ainubo/nubo/MainActivity.smali"))
if len(main_candidates) != 1:
    raise SystemExit(f"Expected exactly one MainActivity.smali, got {len(main_candidates)}")
main = main_candidates[0]
s = main.read_text()

# Update human-readable shell identifiers.
s = s.replace(
    '.field private static final NUBO_URL:Ljava/lang/String; = "https://nubo.ainubo.com/?native=stable-3"',
    '.field private static final NUBO_URL:Ljava/lang/String; = "https://nubo.ainubo.com/?native=android-v25"',
)
s = s.replace('const-string v4, " NUBO-Stable/3.0"', 'const-string v4, " NUBO-V25/22.2.3"')

# WebSettings.LOAD_NO_CACHE = 2. Insert after database enablement.
anchor = '''    .line 92
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
'''
patch = anchor + '''
    # V25 Fresh WebView: never serve stale NUBO JS bundles from WebView cache.
    const/4 v3, 0x2
    invoke-virtual {v0, v3}, Landroid/webkit/WebSettings;->setCacheMode(I)V
'''
if anchor not in s:
    raise SystemExit("configureWebView database anchor missing")
s = s.replace(anchor, patch, 1)

# Replace conditional first-load/restore-state block with unconditional fresh navigation.
old = '''    if-nez p1, :cond_0

    .line 80
    iget-object p1, p0, Lcom/ainubo/nubo/MainActivity;->webView:Landroid/webkit/WebView;

    const-string v0, "https://nubo.ainubo.com/?native=stable-3"

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    goto :goto_0

    .line 82
    :cond_0
    iget-object v0, p0, Lcom/ainubo/nubo/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {v0, p1}, Landroid/webkit/WebView;->restoreState(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;

    .line 85
    :goto_0
'''
new = '''    # V25 Fresh WebView: never restore stale navigation/JS state.
    iget-object p1, p0, Lcom/ainubo/nubo/MainActivity;->webView:Landroid/webkit/WebView;

    const/4 v0, 0x1
    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->clearCache(Z)V
    invoke-virtual {p1}, Landroid/webkit/WebView;->clearHistory()V

    new-instance v0, Ljava/lang/StringBuilder;
    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    const-string v1, "https://nubo.ainubo.com/?native=android-v25&v="
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v0

    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J
    move-result-wide v1

    invoke-virtual {v0, v1, v2}, Ljava/lang/StringBuilder;->append(J)Ljava/lang/StringBuilder;
    move-result-object v0

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v0

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
'''
if old not in s:
    raise SystemExit("onCreate stale restore block missing")
s = s.replace(old, new, 1)

# Never persist WebView back/forward page + JS state across Activity recreation.
old_save = '''.method protected onSaveInstanceState(Landroid/os/Bundle;)V
    .locals 1

    .line 1113
    iget-object v0, p0, Lcom/ainubo/nubo/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {v0, p1}, Landroid/webkit/WebView;->saveState(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;

    .line 1114
    invoke-super {p0, p1}, Lcom/ainubo/nubo/GoogleHomeActivity;->onSaveInstanceState(Landroid/os/Bundle;)V

    return-void
.end method'''
new_save = '''.method protected onSaveInstanceState(Landroid/os/Bundle;)V
    .locals 0

    # V25 Fresh WebView: retain Activity state only; never persist stale WebView page state.
    invoke-super {p0, p1}, Lcom/ainubo/nubo/GoogleHomeActivity;->onSaveInstanceState(Landroid/os/Bundle;)V

    return-void
.end method'''
if old_save not in s:
    raise SystemExit("onSaveInstanceState stale save block missing")
s = s.replace(old_save, new_save, 1)

# Defensive contracts.
for forbidden in [
    'WebView;->restoreState(Landroid/os/Bundle;)',
    'WebView;->saveState(Landroid/os/Bundle;)',
    'https://nubo.ainubo.com/?native=stable-3',
]:
    if forbidden in s:
        raise SystemExit(f"Forbidden stale marker remains: {forbidden}")
for required in [
    'WebSettings;->setCacheMode(I)V',
    'WebView;->clearCache(Z)V',
    'WebView;->clearHistory()V',
    'Ljava/lang/System;->currentTimeMillis()J',
    'https://nubo.ainubo.com/?native=android-v25&v=',
    'NUBO-V25/22.2.3',
]:
    if required not in s:
        raise SystemExit(f"Required V25 marker missing: {required}")

main.write_text(s)

# Bump version in apktool metadata so Android accepts this as an upgrade.
yml = root / "apktool.yml"
y = yml.read_text()
y, n1 = re.subn(r"versionCode: '?\d+'?", "versionCode: '3301'", y, count=1)
y, n2 = re.subn(r"versionName: .+", "versionName: 22.2.3-googlehome-nativewake-webviewfresh", y, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit(f"apktool version metadata patch failed: versionCode={n1} versionName={n2}")
yml.write_text(y)

print(f"Patched {main} to Android V25 Fresh WebView")
