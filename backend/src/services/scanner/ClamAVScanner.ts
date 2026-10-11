import net from "net";
import type { MalwareScanner, ScanResult } from "./MalwareScanner.js";

export interface ClamAVConfig {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export class ClamAVScanner implements MalwareScanner {
  private host: string;
  private port: number;
  private timeoutMs: number;

  constructor(config: ClamAVConfig = {}) {
    this.host = config.host || process.env.CLAMAV_HOST || "localhost";
    this.port = config.port || (process.env.CLAMAV_PORT ? parseInt(process.env.CLAMAV_PORT, 10) : 3310);
    this.timeoutMs = config.timeoutMs || 10000; // 10 second timeout default
  }

  async scan(buffer: Buffer): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve) => {
      let resolved = false;

      const safeResolve = (result: ScanResult) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      const socket = new net.Socket();
      socket.setTimeout(this.timeoutMs);

      socket.on("connect", () => {
        // Send INSTREAM command
        socket.write("zINSTREAM\0");

        // Send buffer in chunks (4 bytes big-endian length prefix)
        const chunkSize = 8192;
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.subarray(i, i + chunkSize);
          const lengthBuffer = Buffer.alloc(4);
          lengthBuffer.writeUInt32BE(chunk.length, 0);
          socket.write(lengthBuffer);
          socket.write(chunk);
        }

        // Send 0-length chunk to indicate end of stream
        const zeroChunk = Buffer.alloc(4);
        zeroChunk.writeUInt32BE(0, 0);
        socket.write(zeroChunk);
      });

      const parseAndResolve = (raw: string) => {
        const response = raw.trim();
        if (response.includes("OK")) {
          safeResolve({ status: "CLEAN" });
        } else if (response.includes("FOUND")) {
          const match = response.match(/stream:\s*(.*?)\s*FOUND/i);
          const signature = (match && match[1]) ? match[1] : "UNKNOWN_MALWARE";
          safeResolve({ status: "INFECTED", signature });
        } else {
          // Fail-closed on malformed response
          safeResolve({ status: "SCAN_FAILED" });
        }
      };

      let responseData = "";
      socket.on("data", (data) => {
        responseData += data.toString("utf8");
        if (responseData.includes("\0") || responseData.includes("\n")) {
          socket.destroy();
          parseAndResolve(responseData);
        }
      });

      socket.on("end", () => {
        socket.destroy();
        parseAndResolve(responseData);
      });

      socket.on("timeout", () => {
        socket.destroy();
        safeResolve({ status: "SCAN_FAILED" });
      });

      socket.on("error", () => {
        socket.destroy();
        // Fail-closed security rule: unreachable scanner yields SCAN_FAILED (quarantined)
        safeResolve({ status: "SCAN_FAILED" });
      });

      socket.connect(this.port, this.host);
    });
  }
}
