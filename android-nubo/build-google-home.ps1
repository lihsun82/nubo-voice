param(
    [string]$SdkZip = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Step([string]$message) {
    Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Fail([string]$message) {
    throw "AinuboX1 Google Home build stopped: $message"
}

$AndroidProject = $PSScriptRoot
$RepoRoot = Split-Path -Parent $AndroidProject

Step "Locate Google Home Android SDK 1.10.0"
if ([string]::IsNullOrWhiteSpace($SdkZip)) {
    $candidates = @(
        (Join-Path $env:USERPROFILE "Downloads\home.android.sdk_1_10_0.zip"),
        (Join-Path $env:USERPROFILE "Desktop\home.android.sdk_1_10_0.zip"),
        (Join-Path $RepoRoot "home.android.sdk_1_10_0.zip")
    )
    $SdkZip = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $SdkZip -or -not (Test-Path $SdkZip)) {
    Fail "home.android.sdk_1_10_0.zip not found. Put it in Downloads or Desktop, then run this script again."
}
Write-Host "SDK ZIP: $SdkZip"

Step "Install Home SDK into local Maven repository"
$SdkExtract = Join-Path $env:TEMP "ainubo-home-sdk-1.10.0"
if (Test-Path $SdkExtract) { Remove-Item $SdkExtract -Recurse -Force }
Expand-Archive -Path $SdkZip -DestinationPath $SdkExtract -Force

$HomeAar = Join-Path $SdkExtract "com\google\android\gms\play-services-home\17.1.0\play-services-home-17.1.0.aar"
$TypesAar = Join-Path $SdkExtract "com\google\android\gms\play-services-home-types\17.1.0\play-services-home-types-17.1.0.aar"
if (-not (Test-Path $HomeAar)) { Fail "play-services-home:17.1.0 was not found in the SDK ZIP." }
if (-not (Test-Path $TypesAar)) { Fail "play-services-home-types:17.1.0 was not found in the SDK ZIP." }

$MavenRepo = Join-Path $env:USERPROFILE ".m2\repository"
$MavenCom = Join-Path $MavenRepo "com"
New-Item -ItemType Directory -Force -Path $MavenCom | Out-Null
Copy-Item -Path (Join-Path $SdkExtract "com\*") -Destination $MavenCom -Recurse -Force
Write-Host "Installed to: $MavenRepo"

Step "Prepare AinuboX1 stable signing key"
$KeyB64 = Join-Path $AndroidProject "ainubo-debug.jks.b64"
$KeyFile = Join-Path $AndroidProject "ainubo-debug.jks"
if (-not (Test-Path $KeyB64)) { Fail "ainubo-debug.jks.b64 is missing from the branch." }
$keyText = (Get-Content $KeyB64 -Raw).Trim()
[IO.File]::WriteAllBytes($KeyFile, [Convert]::FromBase64String($keyText))

Step "Prepare AinuboX1 launcher icon"
$IconB64 = Join-Path $AndroidProject "assets\ainubox1_uploaded_logo_v3.jpg.b64"
$IconDir = Join-Path $AndroidProject "app\src\main\res\drawable-nodpi"
$IconFile = Join-Path $IconDir "ainubox1_launcher_uploaded.jpg"
if (-not (Test-Path $IconB64)) { Fail "AinuboX1 launcher icon source is missing." }
New-Item -ItemType Directory -Force -Path $IconDir | Out-Null
$iconText = (Get-Content $IconB64 -Raw).Trim()
[IO.File]::WriteAllBytes($IconFile, [Convert]::FromBase64String($iconText))

Step "Locate Android SDK 35"
$AndroidSdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk")
) | Where-Object { $_ -and (Test-Path $_) }
$AndroidSdk = $AndroidSdkCandidates | Select-Object -First 1
if (-not $AndroidSdk) {
    Fail "Android SDK not found. Install/open Android Studio first and install Android 15 (API 35)."
}
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
if (-not (Test-Path (Join-Path $AndroidSdk "platforms\android-35\android.jar"))) {
    Fail "Android SDK Platform 35 is missing. Android Studio > SDK Manager > install Android 15 / API 35, then rerun."
}
Write-Host "ANDROID_HOME: $AndroidSdk"

Step "Use Android Studio JDK when available"
$StudioJbr = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path (Join-Path $StudioJbr "bin\java.exe")) {
    $env:JAVA_HOME = $StudioJbr
    $env:Path = (Join-Path $StudioJbr "bin") + ";" + $env:Path
}
& java -version

Step "Provision Gradle 8.11.1"
$AinuboTools = Join-Path $env:LOCALAPPDATA "AinuboX1\tools"
$GradleHome = Join-Path $AinuboTools "gradle-8.11.1"
$GradleExe = Join-Path $GradleHome "bin\gradle.bat"
if (-not (Test-Path $GradleExe)) {
    New-Item -ItemType Directory -Force -Path $AinuboTools | Out-Null
    $GradleZip = Join-Path $env:TEMP "gradle-8.11.1-bin.zip"
    Write-Host "Downloading Gradle 8.11.1..."
    Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip" -OutFile $GradleZip
    Expand-Archive -Path $GradleZip -DestinationPath $AinuboTools -Force
}
if (-not (Test-Path $GradleExe)) { Fail "Gradle 8.11.1 could not be prepared." }

Step "Build Google Home enabled AinuboX1 APK"
Push-Location $RepoRoot
try {
    & $GradleExe -p $AndroidProject clean assembleRelease "-PnuboGoogleHome=true" --stacktrace
    if ($LASTEXITCODE -ne 0) { Fail "Gradle build failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

$Apk = Join-Path $AndroidProject "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $Apk)) { Fail "Build finished but app-release.apk was not produced." }

Step "Publish local test APK"
$Desktop = [Environment]::GetFolderPath("Desktop")
$Output = Join-Path $Desktop "AinuboX1-v23-GoogleHome-TEST.apk"
Copy-Item $Apk $Output -Force
$Hash = (Get-FileHash $Output -Algorithm SHA256).Hash
Write-Host ""
Write-Host "SUCCESS" -ForegroundColor Green
Write-Host "APK: $Output" -ForegroundColor Green
Write-Host "SHA256: $Hash"
Write-Host ""
Write-Host "Install this APK on an Android 10+ test phone, open AinuboX1, then use the Google Home authorization button in /smart-home."
