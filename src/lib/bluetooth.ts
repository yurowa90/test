/**
 * Web Bluetooth로 BLE 감열 프린터에 바이트를 흘려보낸다.
 * 지원: Android Chrome, 데스크톱 Chrome/Edge (HTTPS 필수). iOS Safari는 미지원.
 *
 * 프린터마다 쓰는 GATT 서비스가 제각각이라, 잘 알려진 시리얼 계열
 * 서비스들을 후보로 열어 두고 연결 후 쓰기 가능한 특성을 찾는다.
 */

export class BluetoothPrinterError extends Error {}

const CANDIDATE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // 감열 프린터 표준격 (18F0)
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb", // 일부 휴대용 프린터
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC/Microchip 투명 UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // 일부 ESC/POS BLE 어댑터
];

/** BLE 쓰기 단위 — MTU 협상 없이도 대부분의 프린터가 받는 크기 */
const CHUNK_SIZE = 180;
const CHUNK_DELAY_MS = 24;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  get name(): string {
    return this.device?.name || "프린터";
  }

  get connected(): boolean {
    return !!this.characteristic && !!this.device?.gatt?.connected;
  }

  /** 기기 선택 → 연결 → 쓰기 가능한 특성 탐색. 연결된 기기 이름을 반환. */
  async connect(): Promise<string> {
    if (!isBluetoothSupported()) {
      throw new BluetoothPrinterError(
        "이 브라우저는 블루투스 인쇄를 지원하지 않습니다. Android Chrome이나 데스크톱 Chrome을 사용해 주세요.",
      );
    }

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICES,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        throw new BluetoothPrinterError("프린터 선택이 취소되었습니다.");
      }
      throw new BluetoothPrinterError(
        "블루투스 기기를 찾지 못했습니다. 프린터 전원과 페어링 모드를 확인해 주세요.",
      );
    }

    const gatt = device.gatt;
    if (!gatt) {
      throw new BluetoothPrinterError("이 기기는 연결을 지원하지 않습니다.");
    }

    try {
      const server = await gatt.connect();
      const services = await server.getPrimaryServices();
      // 알려진 서비스를 우선 순회
      const ordered = [...services].sort((a, b) => {
        const ia = CANDIDATE_SERVICES.indexOf(String(a.uuid));
        const ib = CANDIDATE_SERVICES.indexOf(String(b.uuid));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      for (const service of ordered) {
        const chars = await service.getCharacteristics();
        const writable =
          chars.find((c) => c.properties.writeWithoutResponse) ??
          chars.find((c) => c.properties.write);
        if (writable) {
          this.device = device;
          this.characteristic = writable;
          device.addEventListener("gattserverdisconnected", () => {
            this.characteristic = null;
          });
          return this.name;
        }
      }
    } catch {
      gatt.disconnect();
      throw new BluetoothPrinterError(
        "프린터 연결에 실패했습니다. 전원을 껐다 켠 뒤 다시 시도해 주세요.",
      );
    }

    gatt.disconnect();
    throw new BluetoothPrinterError(
      "이 기기에서 인쇄용 통신 채널을 찾지 못했습니다. ESC/POS 지원 BLE 프린터인지 확인해 주세요.",
    );
  }

  /** 연결이 없거나 끊겼으면 연결부터. 이어서 바이트 전송. */
  async print(bytes: Uint8Array): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    const ch = this.characteristic;
    if (!ch) throw new BluetoothPrinterError("프린터가 연결되어 있지 않습니다.");

    const useNoResponse = ch.properties.writeWithoutResponse;
    try {
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, i + CHUNK_SIZE);
        if (useNoResponse) {
          await ch.writeValueWithoutResponse(chunk.slice().buffer);
          await sleep(CHUNK_DELAY_MS);
        } else {
          await ch.writeValueWithResponse(chunk.slice().buffer);
        }
      }
    } catch {
      this.characteristic = null;
      throw new BluetoothPrinterError(
        "전송 중 연결이 끊겼습니다. 프린터를 확인하고 다시 인쇄해 주세요.",
      );
    }
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.characteristic = null;
  }
}
