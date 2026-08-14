package com.ainubo.nubo.googlehome

import androidx.activity.ComponentActivity
import com.ainubo.nubo.GoogleHomeGateway
import com.google.home.FactoryRegistry
import com.google.home.ForcePermissionFlow
import com.google.home.Home
import com.google.home.HomeClient
import com.google.home.HomeConfig
import com.google.home.HomeDevice
import com.google.home.HomeException
import com.google.home.PermissionsResultStatus
import com.google.home.matter.standard.ColorTemperatureLightDevice
import com.google.home.matter.standard.DimmableLightDevice
import com.google.home.matter.standard.ExtendedColorLightDevice
import com.google.home.matter.standard.OnOff
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.OnOffLightSwitchDevice
import com.google.home.matter.standard.OnOffPluginUnitDevice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject

class GoogleHomeGatewayImpl(
    private val activity: ComponentActivity,
) : GoogleHomeGateway.Delegate {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val client: HomeClient by lazy {
        val registry = FactoryRegistry(
            traits = listOf(OnOff),
            types = listOf(
                ColorTemperatureLightDevice,
                DimmableLightDevice,
                ExtendedColorLightDevice,
                OnOffLightDevice,
                OnOffLightSwitchDevice,
                OnOffPluginUnitDevice,
            ),
        )

        Home.getClient(
            activity.applicationContext,
            homeConfig = HomeConfig(
                coroutineContext = Dispatchers.IO,
                factoryRegistry = registry,
                homePlatformScope = HomeConfig.HomePlatformScope.HOME_PLATFORM_SCOPE_VERSION_1,
            ),
        )
    }

    init {
        client.registerActivityResultCallerForPermissions(activity)
    }

    override fun status(): String = JSONObject()
        .put("ok", true)
        .put("available", true)
        .put("enabled", true)
        .put("platform", "google-home")
        .put("sdk", "1.10.0")
        .put("homeArtifact", "17.1.0")
        .put("controlRevision", "r3-typed-trait")
        .toString()

    override fun requestPermissions(callback: GoogleHomeGateway.Callback) {
        scope.launch {
            try {
                val result = client.requestPermissions(
                    ForcePermissionFlow.FORCE_LAUNCH,
                )
                val ok = result.status == PermissionsResultStatus.SUCCESS
                val payload = JSONObject()
                    .put("ok", ok)
                    .put("status", result.status.name)
                    .put("message", result.errorMessage ?: "")
                callback.onResult(payload.toString())
            } catch (error: Exception) {
                callback.onResult(errorPayload(error))
            }
        }
    }

    override fun listDevices(callback: GoogleHomeGateway.Callback) {
        scope.launch {
            try {
                val devicesJson = JSONArray()
                val roomsJson = JSONArray()
                val structures = client.structures().list()

                for (structure in structures) {
                    val rooms = structure.rooms().list()
                    val roomNames = rooms.associate { room -> room.id.id to room.name }

                    for (room in rooms) {
                        roomsJson.put(
                            JSONObject()
                                .put("structureId", structure.id.id)
                                .put("structure", structure.name)
                                .put("roomId", room.id.id)
                                .put("room", room.name),
                        )
                    }

                    for (device in structure.devices().list()) {
                        val roomId = device.roomId?.id ?: ""
                        val trait = findOnOffTrait(device)
                        val onSupported = trait?.supports(OnOff.Command.On) == true
                        val offSupported = trait?.supports(OnOff.Command.Off) == true
                        val toggleSupported = trait?.supports(OnOff.Command.Toggle) == true
                        val stateSupported = trait?.supports(OnOff.Attribute.onOff) == true
                        val controllable = onSupported || offSupported

                        devicesJson.put(
                            JSONObject()
                                .put("structureId", structure.id.id)
                                .put("structure", structure.name)
                                .put("roomId", roomId)
                                .put("room", roomNames[roomId] ?: "")
                                .put("deviceId", device.id.id)
                                .put("device", device.name)
                                .put("isMatterDevice", device.isMatterDevice)
                                .put("controlPath", controlPath(device))
                                .put("controllable", controllable)
                                .put("onSupported", onSupported)
                                .put("offSupported", offSupported)
                                .put("toggleSupported", toggleSupported)
                                .put("stateSupported", stateSupported)
                                .put("state", JSONObject.NULL),
                        )
                    }
                }

                callback.onResult(
                    JSONObject()
                        .put("ok", true)
                        .put("rooms", roomsJson)
                        .put("devices", devicesJson)
                        .toString(),
                )
            } catch (error: Exception) {
                callback.onResult(errorPayload(error))
            }
        }
    }

    override fun control(
        action: String,
        roomName: String,
        deviceName: String,
        callback: GoogleHomeGateway.Callback,
    ) {
        scope.launch {
            try {
                val normalizedAction = action.trim().lowercase()
                if (normalizedAction != "on" && normalizedAction != "off") {
                    callback.onResult(
                        JSONObject()
                            .put("ok", false)
                            .put("error", "目前只支援 on / off")
                            .toString(),
                    )
                    return@launch
                }

                val wantedRoom = roomName.trim()
                val wantedDevice = deviceName.trim()
                if (wantedRoom.isEmpty() && wantedDevice.isEmpty()) {
                    callback.onResult(
                        JSONObject()
                            .put("ok", false)
                            .put("error", "為避免誤控整個住宅，請先指定房間或裝置")
                            .toString(),
                    )
                    return@launch
                }

                var matched = 0
                var controlled = 0
                val failures = JSONArray()
                val structures = client.structures().list()

                for (structure in structures) {
                    val rooms = structure.rooms().list()
                    val roomNames = rooms.associate { room -> room.id.id to room.name }

                    for (device in structure.devices().list()) {
                        val room = roomNames[device.roomId?.id ?: ""] ?: ""
                        if (wantedRoom.isNotEmpty() && !matches(room, wantedRoom)) continue
                        if (wantedDevice.isNotEmpty() && !matches(device.name, wantedDevice)) continue

                        val trait = findOnOffTrait(device) ?: continue
                        matched += 1
                        try {
                            executeOnOff(trait, normalizedAction)
                            controlled += 1
                        } catch (error: Exception) {
                            failures.put(
                                JSONObject()
                                    .put("device", device.name)
                                    .put("controlPath", controlPath(device))
                                    .put("isMatterDevice", device.isMatterDevice)
                                    .put("error", safeMessage(error)),
                            )
                        }
                    }
                }

                val hasSuccess = controlled > 0
                callback.onResult(
                    JSONObject()
                        .put("ok", hasSuccess)
                        .put("action", normalizedAction)
                        .put("room", wantedRoom)
                        .put("device", wantedDevice)
                        .put("matched", matched)
                        .put("controlled", controlled)
                        .put("failures", failures)
                        .put(
                            "message",
                            when {
                                matched == 0 -> "找不到符合房間／名稱且支援開關控制的裝置"
                                controlled == 0 -> "有找到裝置，但控制失敗"
                                failures.length() > 0 -> "部分裝置控制成功"
                                else -> "控制完成"
                            },
                        )
                        .toString(),
                )
            } catch (error: Exception) {
                callback.onResult(errorPayload(error))
            }
        }
    }

    override fun destroy() {
        scope.cancel()
    }

    private suspend fun findOnOffTrait(device: HomeDevice): OnOff? {
        if (device.has(OnOffPluginUnitDevice)) {
            return device.type(OnOffPluginUnitDevice).first().standardTraits.onOff
        }
        if (device.has(OnOffLightDevice)) {
            return device.type(OnOffLightDevice).first().standardTraits.onOff
        }
        if (device.has(DimmableLightDevice)) {
            return device.type(DimmableLightDevice).first().standardTraits.onOff
        }
        if (device.has(ExtendedColorLightDevice)) {
            return device.type(ExtendedColorLightDevice).first().standardTraits.onOff
        }
        if (device.has(ColorTemperatureLightDevice)) {
            return device.type(ColorTemperatureLightDevice).first().standardTraits.onOff
        }
        if (device.has(OnOffLightSwitchDevice)) {
            return device.type(OnOffLightSwitchDevice).first().standardTraits.onOff
        }

        val types = device.types().first()
        for (type in types) {
            val trait = type.trait(OnOff)
            if (trait != null) return trait
        }
        return null
    }

    private fun controlPath(device: HomeDevice): String = when {
        device.has(OnOffPluginUnitDevice) -> "OnOffPluginUnitDevice.standardTraits.onOff"
        device.has(OnOffLightDevice) -> "OnOffLightDevice.standardTraits.onOff"
        device.has(DimmableLightDevice) -> "DimmableLightDevice.standardTraits.onOff"
        device.has(ExtendedColorLightDevice) -> "ExtendedColorLightDevice.standardTraits.onOff"
        device.has(ColorTemperatureLightDevice) -> "ColorTemperatureLightDevice.standardTraits.onOff"
        device.has(OnOffLightSwitchDevice) -> "OnOffLightSwitchDevice.standardTraits.onOff"
        else -> "generic type.trait(OnOff) fallback"
    }

    private suspend fun executeOnOff(trait: OnOff, action: String) {
        val turnOn = action == "on"
        val directCommand = if (turnOn) OnOff.Command.On else OnOff.Command.Off

        if (!trait.supports(directCommand)) {
            throw UnsupportedOperationException(
                if (turnOn) "此裝置的 Google Home OnOff trait 不支援 On 指令"
                else "此裝置的 Google Home OnOff trait 不支援 Off 指令",
            )
        }

        withTimeout(7_000L) {
            if (turnOn) trait.on() else trait.off()
        }
    }

    private fun matches(actual: String, wanted: String): Boolean {
        val left = actual.trim().lowercase()
        val right = wanted.trim().lowercase()
        return left == right || left.contains(right) || right.contains(left)
    }

    private fun errorPayload(error: Throwable): String = JSONObject()
        .put("ok", false)
        .put("error", safeMessage(error))
        .toString()

    private fun safeMessage(error: Throwable): String {
        if (error is HomeException) {
            val root = error.unwrap()
            val subCodes = error.getSubErrorCodes().joinToString(",")
            return buildString {
                append("HomeException ")
                append(error.error.code)
                append(": ")
                append(error.error.message)
                if (subCodes.isNotBlank()) {
                    append(" | subCodes=")
                    append(subCodes)
                }
                if (root.error.code != error.error.code || root.error.message != error.error.message) {
                    append(" | root=")
                    append(root.error.code)
                    append(":")
                    append(root.error.message)
                }
                root.error.reason?.takeIf { it.isNotBlank() }?.let {
                    append(" | reason=")
                    append(it)
                }
                root.error.domain?.let {
                    append(" | domain=")
                    append(it)
                }
            }
        }

        val detail = error.message?.takeIf { it.isNotBlank() }
        return if (detail != null) "${error.javaClass.simpleName}: $detail" else error.javaClass.simpleName
    }
}
