export interface ControlSpec {
  id: string;
  type: 'button' | 'slider';
}

export type CodegenPlatform = 'arduino' | 'plotter' | 'stm32' | 'micropython';

// Valid Arduino Uno/Nano PWM-capable timer pins: D3, D5, D6, D9, D10, D11
export const ARDUINO_PWM_PINS = [3, 5, 6, 9, 10, 11] as const;
// Valid Arduino Uno/Nano standard digital output pins (excluding Serial D0/D1)
export const ARDUINO_DIGITAL_PINS = [2, 4, 7, 8, 12, 13] as const;

// Safe ADC1 pins on ESP32 (GPIO 32..39) â€” safe to use with active Wi-Fi (avoids ADC2 conflict)
export const ESP32_ADC1_PINS = [32, 33, 34, 35, 36, 39] as const;
// Analog ADC pins on Raspberry Pi Pico RP2040/RP2350
export const PICO_ADC_PINS = [26, 27, 28] as const;

function sanitizeIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  return cleaned || 'channel';
}

/**
 * Platform 1: Arduino / ESP32 (C++ with ArduinoJson v7 & static char buffer)
 */
export function generateArduinoCode(widgets: string[], controls: ControlSpec[]): string {
  const hasRx = controls.length > 0;
  const hasTx = widgets.length > 0;
  const txWidgets = hasTx ? widgets : ['Temperature', 'Humidity'];

  let code = `/*
 * OpenSerial Studio v3.2 â€” Auto-Generated Firmware
 * Target: Arduino (Uno, Mega, Nano) / ESP32 / WCH CH32V208 (RISC-V)
 * Protocol: JSON + 8-Byte Bit-Packed Framebuffer over UART (115200 bps)
 * Dependency: ArduinoJson v7+ (install via Library Manager)
 * Memory Safety: Uses static char rxBuffer (zero String heap fragmentation)
 */

#include <Arduino.h>
#include <ArduinoJson.h>

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL_MS = 100; // 10 Hz telemetry rate

/**
 * 64-Core GPU Framebuffer Helper (v3.2 Bit-Packed 9-Bit Coordinates 0..511)
 * Emits 8-byte binary pixel packet: [0xAA, 0x55, X_low, Y_low, R, G, B, CORE_AND_XY_HIGH]
 */
static inline void sendPixel512(uint16_t x, uint16_t y, uint8_t r, uint8_t g, uint8_t b, uint8_t coreId) {
  uint8_t pkt[8] = {
    0xAA,
    0x55,
    (uint8_t)(x & 0xFF),
    (uint8_t)(y & 0xFF),
    r,
    g,
    b,
    (uint8_t)((coreId & 0x3F) | (((x >> 8) & 0x01) << 6) | (((y >> 8) & 0x01) << 7))
  };
  Serial.write(pkt, 8);
}

`;

  if (hasRx) {
    code += `// Static RX Ring/Line Buffer (avoids Arduino String heap fragmentation)\n`;
    code += `static char rxBuffer[256];\n`;
    code += `static size_t rxIndex = 0;\n\n`;
  }

  code += `// --- Hardware Pin Mapping ---\n`;
  if (hasRx) {
    let pwmIdx = 0;
    let digIdx = 0;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      if (c.type === 'slider') {
        const pin = ARDUINO_PWM_PINS[pwmIdx % ARDUINO_PWM_PINS.length];
        pwmIdx++;
        code += `const int ${ident}_PIN = ${pin}; // PWM OUT (Timer pin D${pin}) for "${c.id}"\n`;
      } else {
        const pin = ARDUINO_DIGITAL_PINS[digIdx % ARDUINO_DIGITAL_PINS.length];
        digIdx++;
        code += `const int ${ident}_PIN = ${pin}; // Digital OUT (D${pin}) for "${c.id}"\n`;
      }
    });
  }

  if (hasTx || !hasRx) {
    txWidgets.forEach((w, i) => {
      const ident = sanitizeIdentifier(w);
      code += `const int ${ident}_PIN = A${i}; // Analog IN for "${w}"\n`;
    });
  }

  code += `\nvoid setup() {\n  Serial.begin(115200);\n  while (!Serial) { ; }\n`;

  if (hasRx) {
    code += `\n  // Configure actuator output pins\n`;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      code += `  pinMode(${ident}_PIN, OUTPUT);\n`;
    });
  }

  code += `}\n\n`;

  if (hasRx) {
    code += `void processCommandLine(const char* jsonLine) {\n`;
    code += `  JsonDocument doc;\n`;
    code += `  DeserializationError error = deserializeJson(doc, jsonLine);\n`;
    code += `  if (error) return;\n\n`;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      if (c.type === 'button') {
        code += `  if (doc["${c.id}"].is<int>()) {\n`;
        code += `    int state = doc["${c.id}"].as<int>();\n`;
        code += `    digitalWrite(${ident}_PIN, state ? HIGH : LOW);\n`;
        code += `  }\n`;
      } else {
        code += `  if (doc["${c.id}"].is<float>() || doc["${c.id}"].is<int>()) {\n`;
        code += `    int pwmVal = constrain((int)doc["${c.id}"].as<float>(), 0, 255);\n`;
        code += `    analogWrite(${ident}_PIN, pwmVal);\n`;
        code += `  }\n`;
      }
    });
    code += `}\n\n`;
  }

  code += `void loop() {\n`;

  if (hasRx) {
    code += `  // --- RX: Non-blocking Serial Line Reader ---\n`;
    code += `  while (Serial.available() > 0) {\n`;
    code += `    char ch = (char)Serial.read();\n`;
    code += `    if (ch == '\\n' || ch == '\\r') {\n`;
    code += `      if (rxIndex > 0) {\n`;
    code += `        rxBuffer[rxIndex] = '\\0';\n`;
    code += `        processCommandLine(rxBuffer);\n`;
    code += `        rxIndex = 0;\n`;
    code += `      }\n`;
    code += `    } else if (rxIndex < sizeof(rxBuffer) - 1) {\n`;
    code += `      rxBuffer[rxIndex++] = ch;\n`;
    code += `    } else {\n`;
    code += `      rxIndex = 0; // Overflow protection\n`;
    code += `    }\n`;
    code += `  }\n\n`;
  }

  if (hasTx || !hasRx) {
    code += `  // --- TX: Non-blocking Sensor Telemetry ---\n`;
    code += `  unsigned long now = millis();\n`;
    code += `  if (now - lastSendTime >= SEND_INTERVAL_MS) {\n`;
    code += `    lastSendTime = now;\n\n`;
    code += `    JsonDocument doc;\n`;
    code += `    doc["t_us"] = micros(); // Microsecond hardware timebase (zero USB CDC jitter)\n`;
    txWidgets.forEach((w) => {
      const ident = sanitizeIdentifier(w);
      code += `    doc["${w}"] = analogRead(${ident}_PIN);\n`;
    });
    code += `\n    serializeJson(doc, Serial);\n`;
    code += `    Serial.println();\n`;
    code += `  }\n`;
  }

  code += `}\n`;
  return code;
}

/**
 * Platform 2: Zero-Library Arduino / AVR (Lightweight Key:Value Serial Plotter format)
 */
export function generateArduinoPlotterCode(widgets: string[], controls: ControlSpec[]): string {
  const hasRx = controls.length > 0;
  const hasTx = widgets.length > 0;
  const txWidgets = hasTx ? widgets : ['Temp', 'Humid'];

  let code = `/*
 * OpenSerial Studio v2.0 â€” Zero-Library Lightweight Firmware
 * Target: Any 8-bit/32-bit MCU (ATmega328P, ATtiny, STM32duino, ESP32)
 * Protocol: Key:Value Serial Plotter Stream (Zero external libraries required!)
 */

#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL_MS = 50; // 20 Hz fast plotter stream

`;

  if (hasRx) {
    code += `static char rxBuffer[128];\n`;
    code += `static uint8_t rxIndex = 0;\n\n`;
    let pwmIdx = 0;
    let digIdx = 0;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      if (c.type === 'slider') {
        const pin = ARDUINO_PWM_PINS[pwmIdx % ARDUINO_PWM_PINS.length];
        pwmIdx++;
        code += `const int ${ident}_PIN = ${pin}; // PWM pin D${pin} for "${c.id}"\n`;
      } else {
        const pin = ARDUINO_DIGITAL_PINS[digIdx % ARDUINO_DIGITAL_PINS.length];
        digIdx++;
        code += `const int ${ident}_PIN = ${pin}; // Digital pin D${pin} for "${c.id}"\n`;
      }
    });
  }

  txWidgets.forEach((w, i) => {
    const ident = sanitizeIdentifier(w);
    code += `const int ${ident}_PIN = A${i};\n`;
  });

  code += `\nvoid setup() {\n  Serial.begin(115200);\n`;
  if (hasRx) {
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      code += `  pinMode(${ident}_PIN, OUTPUT);\n`;
    });
  }
  code += `}\n\n`;

  if (hasRx) {
    code += `// Parses either {"KEY":123} or KEY:123 without external libraries\n`;
    code += `void parseLightweightCommand(const char* line) {\n`;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      code += `  const char* pos_${ident} = strstr(line, "${c.id}");\n`;
      code += `  if (pos_${ident}) {\n`;
      code += `    const char* colon = strchr(pos_${ident}, ':');\n`;
      code += `    if (colon) {\n`;
      code += `      int val = atoi(colon + 1);\n`;
      if (c.type === 'button') {
        code += `      digitalWrite(${ident}_PIN, val ? HIGH : LOW);\n`;
      } else {
        code += `      analogWrite(${ident}_PIN, constrain(val, 0, 255));\n`;
      }
      code += `    }\n`;
      code += `  }\n`;
    });
    code += `}\n\n`;
  }

  code += `void loop() {\n`;
  if (hasRx) {
    code += `  while (Serial.available() > 0) {\n`;
    code += `    char ch = (char)Serial.read();\n`;
    code += `    if (ch == '\\n' || ch == '\\r') {\n`;
    code += `      if (rxIndex > 0) {\n`;
    code += `        rxBuffer[rxIndex] = '\\0';\n`;
    code += `        parseLightweightCommand(rxBuffer);\n`;
    code += `        rxIndex = 0;\n`;
    code += `      }\n`;
    code += `    } else if (rxIndex < sizeof(rxBuffer) - 1) {\n`;
    code += `      rxBuffer[rxIndex++] = ch;\n`;
    code += `    }\n`;
    code += `  }\n\n`;
  }

  code += `  if (millis() - lastSendTime >= SEND_INTERVAL_MS) {\n`;
  code += `    lastSendTime = millis();\n`;
  code += `    Serial.print("t_us:");\n`;
  code += `    Serial.print(micros());\n`;
  code += `    Serial.print(",");\n`;
  txWidgets.forEach((w, idx) => {
    const ident = sanitizeIdentifier(w);
    code += `    Serial.print("${w}:");\n`;
    code += `    Serial.print(analogRead(${ident}_PIN));\n`;
    if (idx < txWidgets.length - 1) {
      code += `    Serial.print(",");\n`;
    }
  });
  code += `    Serial.println();\n`;
  code += `  }\n`;
  code += `}\n`;

  return code;
}

/**
 * Platform 3: STM32 (HAL C with UART Idle DMA & snprintf)
 */
export function generateSTM32Code(widgets: string[], controls: ControlSpec[]): string {
  const hasRx = controls.length > 0;
  const hasTx = widgets.length > 0;
  const txWidgets = hasTx ? widgets : ['Temperature', 'Voltage_V'];

  let code = `/*
 * OpenSerial Studio v3.2 â€” STM32 HAL Firmware Template
 * Target: STM32F1 / STM32F4 / STM32G4 / STM32H7 (STM32CubeIDE)
 * UART Peripheral: huart2 (115200-8-N-1, DMA / Interrupt RX enabled)
 *
 * NOTE FOR FLOAT PRINTING (%.2f):
 * In STM32CubeIDE / GCC ARM toolchain, float support in snprintf is disabled by default to save flash.
 * Enable it via: Project Properties -> C/C++ Build -> Settings -> Tool Settings -> MCU GCC Linker -> Miscellaneous -> Linker flags: add "-u _printf_float"
 */

#include "main.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern UART_HandleTypeDef huart2;

#define UART_RX_BUF_SIZE 256
#define UART_TX_BUF_SIZE 256

/**
 * 64-Core GPU Framebuffer Helper (v3.2 Bit-Packed 9-Bit Coordinates 0..511)
 * Emits 8-byte binary pixel packet: [0xAA, 0x55, X_low, Y_low, R, G, B, CORE_AND_XY_HIGH]
 */
static inline void OpenSerial_SendPixel512(uint16_t x, uint16_t y, uint8_t r, uint8_t g, uint8_t b, uint8_t coreId) {
    uint8_t pkt[8] = {
        0xAA,
        0x55,
        (uint8_t)(x & 0xFF),
        (uint8_t)(y & 0xFF),
        r,
        g,
        b,
        (uint8_t)((coreId & 0x3F) | (((x >> 8) & 0x01) << 6) | (((y >> 8) & 0x01) << 7))
    };
    HAL_UART_Transmit(&huart2, pkt, 8, 10);
}

static uint8_t rxDmaBuffer[UART_RX_BUF_SIZE];
static volatile char rxCommandLine[UART_RX_BUF_SIZE];
static volatile uint8_t rxFrameReady = 0;
static uint32_t lastTelemetryTick = 0;

/**
 * Call OpenSerial_Init() once inside main() after MX_USART2_UART_Init()
 */
void OpenSerial_Init(void) {
    HAL_UARTEx_ReceiveToIdle_DMA(&huart2, rxDmaBuffer, UART_RX_BUF_SIZE);
    // Ignore half-transfer DMA interrupts so callback only triggers on idle line or complete frame
    __HAL_DMA_DISABLE_IT(huart2.hdmarx, DMA_IT_HT);
}

/**
 * STM32 HAL UART Idle Line Callback â€” captures complete JSON/Command frames via DMA
 */
void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size) {
    if (huart->Instance == USART2) {
        // Prevent race condition: only write if previous frame was consumed by main task
        if (!rxFrameReady) {
            uint16_t copyLen = (Size < UART_RX_BUF_SIZE - 1) ? Size : (UART_RX_BUF_SIZE - 1);
            memcpy((void *)rxCommandLine, rxDmaBuffer, copyLen);
            rxCommandLine[copyLen] = '\\0';
            rxFrameReady = 1;
        }
        // Re-arm DMA receive to idle line and keep HT interrupt disabled
        HAL_UARTEx_ReceiveToIdle_DMA(&huart2, rxDmaBuffer, UART_RX_BUF_SIZE);
        __HAL_DMA_DISABLE_IT(huart2.hdmarx, DMA_IT_HT);
    }
}

`;

  if (hasRx) {
    code += `static void OpenSerial_ProcessRx(const char *line) {\n`;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      code += `    const char *p_${ident} = strstr(line, "\\"${c.id}\\"");\n`;
      code += `    if (p_${ident}) {\n`;
      code += `        const char *colon = strchr(p_${ident}, ':');\n`;
      code += `        if (colon) {\n`;
      code += `            int val = atoi(colon + 1);\n`;
      if (c.type === 'button') {
        code += `            // Example GPIO Output for ${c.id}:\n`;
        code += `            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, val ? GPIO_PIN_SET : GPIO_PIN_RESET);\n`;
      } else {
        code += `            // Example Timer PWM Duty update for ${c.id}:\n`;
        code += `            // __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, (uint32_t)val);\n`;
        code += `            (void)val;\n`;
      }
      code += `        }\n`;
      code += `    }\n`;
    });
    code += `}\n\n`;
  }

  code += `/**
 * Call OpenSerial_Task() inside your main while(1) loop or FreeRTOS task
 */
void OpenSerial_Task(void) {
`;

  if (hasRx) {
    code += `    // --- 1. Handle Incoming Commands from Web Dashboard (Thread-safe snapshot) ---\n`;
    code += `    if (rxFrameReady) {\n`;
    code += `        char localBuf[UART_RX_BUF_SIZE];\n`;
    code += `        __disable_irq();\n`;
    code += `        memcpy(localBuf, (const void *)rxCommandLine, sizeof(localBuf));\n`;
    code += `        rxFrameReady = 0;\n`;
    code += `        __enable_irq();\n`;
    code += `        OpenSerial_ProcessRx(localBuf);\n`;
    code += `    }\n\n`;
  }

  code += `    // --- 2. Non-blocking Telemetry Transmission (10 Hz) ---\n`;
  code += `    uint32_t now = HAL_GetTick();\n`;
  code += `    if (now - lastTelemetryTick >= 100) {\n`;
  code += `        lastTelemetryTick = now;\n`;
  code += `        char txBuf[UART_TX_BUF_SIZE];\n`;

  const formatParts = txWidgets.map((w) => `\\"${w}\\":%.2f`).join(',');
  const argParts = txWidgets.map((_, idx) => `${(24.5 + idx * 3.2).toFixed(2)}f`).join(', ');

  code += `        int len = snprintf(txBuf, sizeof(txBuf), "{\\"t_us\\":%lu,${formatParts}}\\r\\n", (unsigned long)(HAL_GetTick() * 1000), ${argParts});\n`;
  code += `        if (len > 0) {\n`;
  code += `            HAL_UART_Transmit(&huart2, (uint8_t *)txBuf, (uint16_t)len, 20);\n`;
  code += `        }\n`;
  code += `    }\n`;
  code += `}\n`;

  return code;
}

/**
 * Platform 4: MicroPython (ESP32 / Raspberry Pi Pico RP2040 / RP2350)
 */
export function generateMicroPythonCode(widgets: string[], controls: ControlSpec[]): string {
  const hasRx = controls.length > 0;
  const hasTx = widgets.length > 0;
  const txWidgets = hasTx ? widgets : ['Temperature', 'Humidity'];

  let code = `"""
OpenSerial Studio v2.1.1 â€” Auto-Generated MicroPython Firmware
Target: ESP32 / Raspberry Pi Pico (RP2040 / RP2350)
Protocol: JSON over USB CDC / UART (115200 bps)
"""

import machine
import json
import time
import select
import sys

# --- Hardware Pin Configuration ---
# Notes:
# - ESP32: Uses ADC1 pins (GPIO 32..39) so ADC reads remain functional while Wi-Fi is active.
# - RP2040 Pico: Uses analog GP26 (ADC0), GP27 (ADC1), GP28 (ADC2).
`;

  if (hasRx) {
    controls.forEach((c, i) => {
      const ident = sanitizeIdentifier(c.id);
      if (c.type === 'button') {
        code += `${ident}_pin = machine.Pin(${i + 2}, machine.Pin.OUT)\n`;
      } else {
        code += `${ident}_pwm = machine.PWM(machine.Pin(${i + 2}))\n`;
        code += `${ident}_pwm.freq(1000)\n`;
      }
    });
  }

  if (hasTx || !hasRx) {
    txWidgets.forEach((w, i) => {
      const ident = sanitizeIdentifier(w);
      const espPin = ESP32_ADC1_PINS[i % ESP32_ADC1_PINS.length];
      const picoPin = PICO_ADC_PINS[i % PICO_ADC_PINS.length];
      code += `${ident}_adc = machine.ADC(machine.Pin(${espPin})) # ESP32 ADC1 GPIO${espPin} (or machine.Pin(${picoPin}) on RP2040 Pico)\n`;
    });
  }

  code += `
def set_pwm_level(pwm_obj, val_0_to_255):
    clamped = max(0, min(255, int(val_0_to_255)))
    if hasattr(pwm_obj, "duty_u16"):
        pwm_obj.duty_u16(int(clamped * 65535 / 255))
    else:
        pwm_obj.duty(int(clamped * 1023 / 255))

def send_pixel_512(x, y, r, g, b, core_id=0):
    """Emits 8-byte bit-packed binary pixel frame ([0xAA, 0x55, X_low, Y_low, R, G, B, CORE_XY_HIGH])"""
    packed = (int(core_id) & 0x3F) | (((int(x) >> 8) & 0x01) << 6) | (((int(y) >> 8) & 0x01) << 7)
    pkt = bytes([0xAA, 0x55, int(x) & 0xFF, int(y) & 0xFF, int(r) & 0xFF, int(g) & 0xFF, int(b) & 0xFF, packed])
    sys.stdout.buffer.write(pkt)

last_send_ms = time.ticks_ms()
SEND_INTERVAL_MS = 100

poll_obj = select.poll()
poll_obj.register(sys.stdin, select.POLLIN)

while True:
`;

  if (hasRx) {
    code += `    # --- RX: Non-blocking Command Reader ---\n`;
    code += `    if poll_obj.poll(0):\n`;
    code += `        line = sys.stdin.readline()\n`;
    code += `        if line:\n`;
    code += `            try:\n`;
    code += `                cmd = json.loads(line.strip())\n`;
    controls.forEach((c) => {
      const ident = sanitizeIdentifier(c.id);
      code += `                if "${c.id}" in cmd:\n`;
      if (c.type === 'button') {
        code += `                    ${ident}_pin.value(1 if int(cmd["${c.id}"]) else 0)\n`;
      } else {
        code += `                    set_pwm_level(${ident}_pwm, cmd["${c.id}"])\n`;
      }
    });
    code += `            except Exception:\n`;
    code += `                pass\n\n`;
  }

  if (hasTx || !hasRx) {
    code += `    # --- TX: Periodic Sensor Telemetry ---\n`;
    code += `    now_ms = time.ticks_ms()\n`;
    code += `    if time.ticks_diff(now_ms, last_send_ms) >= SEND_INTERVAL_MS:\n`;
    code += `        last_send_ms = now_ms\n`;
    code += `        payload = {\n`;
    code += `            "t_us": time.ticks_us(),\n`;
    txWidgets.forEach((w) => {
      const ident = sanitizeIdentifier(w);
      code += `            "${w}": round(${ident}_adc.read_u16() * 100.0 / 65535.0, 2),\n`;
    });
    code += `        }\n`;
    code += `        sys.stdout.write(json.dumps(payload) + "\\n")\n`;
  }

  return code;
}

