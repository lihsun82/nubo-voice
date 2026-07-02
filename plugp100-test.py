import asyncio
import os
import sys
import traceback
from plugp100.common.credentials import AuthCredential
from plugp100.new.device_factory import connect, DeviceConnectConfiguration

def get_env(name):
    if os.environ.get(name):
        return os.environ.get(name)
    try:
        with open(".env.local", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"')
    except FileNotFoundError:
        pass
    return ""

async def try_connect(name, host, credentials, config_kwargs):
    print(f"\n===== {host} / {name} =====")
    try:
        config = DeviceConnectConfiguration(
            host=host,
            credentials=credentials,
            **config_kwargs
        )
        device = await connect(config)
        await device.update()

        print("CONNECTED")
        print("type:", type(device))
        print("protocol:", getattr(device, "protocol_version", None))
        print("is_on:", getattr(device, "is_on", None))
        print("raw_state:", getattr(device, "raw_state", None))
        print("methods:", [m for m in dir(device) if "turn" in m.lower() or m in ["is_on"]])

        return device
    except Exception as e:
        print("FAIL:", repr(e))
        return None

async def main():
    email = get_env("NUBO_TAPO_EMAIL")
    password = get_env("NUBO_TAPO_PASSWORD")

    print("email:", email)
    print("password length:", len(password))

    if not email or not password:
        raise RuntimeError("Missing NUBO_TAPO_EMAIL / NUBO_TAPO_PASSWORD")

    credentials = AuthCredential(email, password)

    hosts = ["192.168.1.120"]

    tests = [
        ("auto guess", {}),
        ("known smart plug auto protocol", {
            "device_type": "SMART.TAPOPLUG",
        }),
        ("klap v2", {
            "device_type": "SMART.TAPOPLUG",
            "encryption_type": "klap",
            "encryption_version": 2,
        }),
        ("klap v1", {
            "device_type": "SMART.TAPOPLUG",
            "encryption_type": "klap",
            "encryption_version": 1,
        }),
        ("aes passthrough", {
            "device_type": "SMART.TAPOPLUG",
            "encryption_type": "aes",
        }),
    ]

    first_working = None

    for host in hosts:
        for name, kwargs in tests:
            device = await try_connect(name, host, credentials, kwargs)
            if device and first_working is None:
                first_working = (host, name, kwargs, device)

    if not first_working:
        print("\nRESULT: plugp100 全部失敗")
        return

    host, name, kwargs, device = first_working
    print(f"\nRESULT: 第一個成功裝置 = {host} / {name}")

    try:
        print("測試 turn_off...")
        await device.turn_off()
        print("OK turn_off")

        await asyncio.sleep(1)

        print("測試 turn_on...")
        await device.turn_on()
        print("OK turn_on")
    except Exception as e:
        print("CONTROL FAIL:", repr(e))
        traceback.print_exc()

    try:
        await device.client.close()
    except Exception:
        pass

if __name__ == "__main__":
    asyncio.run(main())
