package com.ainubo.nubo.googlehome

import androidx.activity.ComponentActivity
import com.ainubo.nubo.GoogleHomeGateway
import com.google.home.FactoryRegistry
import com.google.home.ForcePermissionFlow
import com.google.home.Home
import com.google.home.HomeClient
import com.google.home.HomeConfig
import com.google.home.HomeDevice
import com.google.home.PermissionsResultStatus
import com.google.home.matter.standard.ColorTemperatureLightDevice
import com.google.home.matter.standard.DimmableLightDevice
import com.google.home.matter.standard.ExtendedColorLightDevice
import com.google.home.matter.standard.OnOff
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.OnOffLightSwitchDevice
import com.google.home.matter.standard.OnOffPluginUnitDevice
import com.google.home.matter.standard.OnOffTrait
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
                        devicesJson.put(
                            JSONObject()
                                .put("structureId", structure.id.id)
                                .put("structure", structure.name)
                                .put("roomId", roomId)
                                .put("room", roomNames[roomId] ?: "")
                                .put("deviceId", device.id.id)
                                .put("device", device.name)
                                .put("controllable", findOnOffTrait(device) != null),
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
                            if (normalizedAction == "on") trait.on() else trait.off()
                            controlled += 1
                        } catch (error: Exception) {
                            failures.put(
                                JSONObject()
                                    .put("device", device.name)
                                    .put("error", safeMessage(error)),
                            )
                        }
                    }
                }

                callback.onResult(
                    JSONObject()
                        .put("ok", controlled > 0 && failures.length() == 0)
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

    private suspend fun findOnOffTrait(device: HomeDevice): OnOffTrait? {
        val types = device.types().first()
        for (type in types) {
            val trait = type.trait(OnOff)
            if (trait != null) return trait
        }
        return null
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

    private fun safeMessage(error: Throwable): String =
        error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName
}
