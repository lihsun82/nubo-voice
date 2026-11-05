#!/usr/bin/env python3
"""Patch the *verified* Stable-3 APK in apktool decoded/ for a JJ1-only preview.

This avoids rebuilding the Google Home SDK (its historical download URL is gone).
All voice, AudioRecord, Home and LINE service DEX code is retained; only a
WebView User-Agent constant, a trusted-page style injection and package identity
are changed. Never run on the production APK.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

root = Path("decoded")
main_candidates = list(root.glob("smali*/com/ainubo/nubo/MainActivity.smali"))
if len(main_candidates) != 1:
    raise SystemExit(f"Expected one MainActivity.smali, got {len(main_candidates)}")

main = main_candidates[0]
source = main.read_text(encoding="utf-8")
ua_original = '" NUBO-Stable/3.0"'
ua_updated = '" NUBO-Stable/3.0 NUBO-JJ1/1"'
if source.count(ua_original) != 1:
    raise SystemExit(f"Expected one Stable-3 User-Agent suffix, got {source.count(ua_original)}")
source = source.replace(ua_original, ua_updated, 1)
main.write_text(source, encoding="utf-8")

# WebViewClient already gates on trusted nubo.ainubo.com before firing this event.
# Append a scoped CSS injection after the existing stable-3 native-ready event.
native_css = """
.orb-wrap{display:grid!important;place-items:center!important;width:100%!important}
.nubo-energy-orb{position:relative!important;left:auto!important;right:auto!important;
transform:none!important;margin-inline:auto!important;width:min(100%,560px)!important;
max-width:560px!important;filter:none!important}
.nubo-energy-orb canvas{display:block!important;width:100%!important;
max-width:100%!important;height:auto!important;aspect-ratio:560/620!important;
filter:none!important}
.console{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.nubo-space-grid,.nubo-space-horizon{animation:none!important}
"""
native_css = " ".join(native_css.split())
if "'" in native_css or '"' in native_css:
    raise SystemExit("JJ1 CSS must be quote-free for safe Smali string insertion")
js = (
    ";(function(){"
    "if((navigator.userAgent||'').indexOf('NUBO-JJ1/1')<0)return;"
    "document.documentElement.dataset.nuboDevice='jj1';"
    "if(document.getElementById('nubo-jj1-native-style'))return;"
    "var s=document.createElement('style');"
    "s.id='nubo-jj1-native-style';"
    f"s.textContent='{native_css}';"
    "(document.head||document.documentElement).appendChild(s);"
    "window.dispatchEvent(new Event('nubo:jj1-ready'));"
    "})();"
)
if '"' in js or "\n" in js:
    raise SystemExit("Smali JavaScript contains unsafe literal syntax")

modified = []
pattern = re.compile(
    r'(?m)^(?P<pre>\s*const-string(?:/jumbo)?\s+[vp]\d+,\s*")'
    r'(?P<value>[^"\n]*nubo-native-ready[^"\n]*)(?P<post>")$'
)
for path in root.glob("smali*/com/ainubo/nubo/MainActivity*.smali"):
    text = path.read_text(encoding="utf-8")
    matches = list(pattern.finditer(text))
    if not matches:
        continue
    if len(matches) != 1:
        raise SystemExit(f"Ambiguous trusted native-ready JS in {path}: {len(matches)}")
    match = matches[0]
    patch = match.group("pre") + match.group("value") + js + match.group("post")
    text = text[:match.start()] + patch + text[match.end():]
    path.write_text(text, encoding="utf-8")
    modified.append(str(path))
if len(modified) != 1:
    raise SystemExit(f"Expected one trusted onPageFinished JS string; files={modified}")

# Side-by-side test APK. Preserve the implementation classes in com.ainubo.nubo.
# Only Android's installation package identity changes. Fully qualify relative
# manifest component names so '.MainActivity' continues pointing to the original
# implementation after the manifest package change.
manifest = root / "AndroidManifest.xml"
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
tree = ET.parse(manifest)
xmlroot = tree.getroot()
old_package = xmlroot.attrib.get("package")
new_package = "com.ainubo.nubo.jj1test"
if old_package != "com.ainubo.nubo":
    raise SystemExit(f"Unexpected original manifest package: {old_package}")
android_ns = "{http://schemas.android.com/apk/res/android}"
class_tags = {"application", "activity", "activity-alias", "service", "receiver", "provider"}
for element in xmlroot.iter():
    tag = element.tag.rsplit("}", 1)[-1]
    namekey = android_ns + "name"
    value = element.attrib.get(namekey)
    if tag in class_tags and value and value.startswith("."):
        element.set(namekey, old_package + value)
    authority_key = android_ns + "authorities"
    authority = element.attrib.get(authority_key)
    if authority and old_package in authority:
        element.set(authority_key, authority.replace(old_package, new_package))
application = xmlroot.find("application")
if application is None:
    raise SystemExit("Application manifest element missing")
application.set(android_ns + "label", "NUBO JJ1 TEST")
xmlroot.set("package", new_package)
tree.write(manifest, encoding="utf-8", xml_declaration=True)

# Bump test-only version metadata. A signed test APK must remain a distinct
# installable package and never replace/erase the original NUBO installation.
yml = root / "apktool.yml"
y = yml.read_text(encoding="utf-8")
y, codes = re.subn(r"versionCode: '?\d+'?", "versionCode: 3302", y, count=1)
y, names = re.subn(r"versionName: .+", "versionName: 3.3.1-jj1-preview", y, count=1)
if codes != 1 or names != 1:
    raise SystemExit("Unable to bump apktool package version")
yml.write_text(y, encoding="utf-8")

print("Patched Stable-3 APK: NUBO-JJ1/1, trusted CSS injector, separate com.ainubo.nubo.jj1test package")
print("Native JS owner:", modified[0])
