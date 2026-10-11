import type { MalwareScanner } from "./MalwareScanner.js";
import { MockScanner } from "./MockScanner.js";
import { ClamAVScanner } from "./ClamAVScanner.js";

export class ScannerFactory {
  private static instance: MalwareScanner | null = null;

  public static getScanner(): MalwareScanner {
    if (this.instance) {
      return this.instance;
    }

    const provider = (process.env.SCANNER_PROVIDER || (process.env.NODE_ENV === "production" ? "clamav" : "mock")).toLowerCase();

    if (provider === "clamav") {
      this.instance = new ClamAVScanner();
    } else if (provider === "mock") {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Production configuration cannot silently fall back to MockScanner. SCANNER_PROVIDER must be 'clamav'.");
      }
      this.instance = new MockScanner();
    } else {
      throw new Error(`Unsupported SCANNER_PROVIDER configuration: '${provider}'. Supported values are 'clamav', 'mock'.`);
    }

    return this.instance;
  }

  public static resetInstance(): void {
    this.instance = null;
  }
}

export const scanner = ScannerFactory.getScanner();
