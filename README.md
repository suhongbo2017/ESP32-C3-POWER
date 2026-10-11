# ESP32-C3 PC Power Controller

第一阶段固件：

- `GPIO1` 控制开关机光耦模块，默认保持 `LOW`
- 串口和 Web 都可以触发一次约 `300ms` 的短脉冲
- 内置 Web Server，提供状态页和手动 `PULSE` 控制
- 内置浏览器 OTA 上传固件
- Wi-Fi 连接失败时启动配置 AP，便于首次测试
- 暂不包含 MQTT、Ping、PWR-LED 和温湿度传感器功能

## 硬件安全

当前不要把 `GPIO1` 直接接到光耦模块 `IN+`。模块板上的 `30R0` 为 `30.0 ohm`，需要外接约 `330 ohm` 串联电阻后再测试：

```text
GPIO1 --- 330 ohm --- IN+
GND ----------------- IN-
```

光耦输出端 `S1/S2` 在固件和限流测试通过后，再接主板 `PWR_SW` 两针。

## 编译与烧录

```bash
pio run
pio run -t upload
pio device monitor -b 115200
```

上电后串口会打印设备 IP。浏览器访问：

```text
http://<设备IP>/
```

若 Wi-Fi 连接失败，连接 AP：

```text
PC-Power-C3-XXXX
```

密码：

```text
pcpower123
```

AP 模式地址固定为 `192.168.4.1`。

## OTA

访问 `/ota`，输入 HTTP Basic Auth：

```text
用户名：admin
密码：修改 src/config.h 中的 OTA_PASSWORD
```

上传由 PlatformIO 编译生成的 `.pio/build/esp32-c3-pc-power/firmware.bin`。
