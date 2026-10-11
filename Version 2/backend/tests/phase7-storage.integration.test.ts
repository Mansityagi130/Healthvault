import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { S3StorageProvider } from "../src/services/storage/S3StorageProvider.js";
import { StorageFactory } from "../src/services/storage/StorageFactory.js";
import { LocalStorageProvider } from "../src/services/storage/LocalStorageProvider.js";
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand,
  CopyObjectCommand 
} from "@aws-sdk/client-s3";

describe("Phase 7 Stage 1: S3-Compatible Storage Provider Integration", () => {
  const originalEnv = process.env.STORAGE_PROVIDER;

  beforeEach(() => {
    StorageFactory.resetInstance();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.STORAGE_PROVIDER = originalEnv;
    } else {
      delete process.env.STORAGE_PROVIDER;
    }
    StorageFactory.resetInstance();
  });

  describe("StorageFactory Provider Selection", () => {
    it("defaults to LocalStorageProvider when STORAGE_PROVIDER is unset", () => {
      delete process.env.STORAGE_PROVIDER;
      const provider = StorageFactory.getProvider();
      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });

    it("returns LocalStorageProvider when STORAGE_PROVIDER=local", () => {
      process.env.STORAGE_PROVIDER = "local";
      const provider = StorageFactory.getProvider();
      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });

    it("returns S3StorageProvider when STORAGE_PROVIDER=s3", () => {
      process.env.STORAGE_PROVIDER = "s3";
      const provider = StorageFactory.getProvider();
      expect(provider).toBeInstanceOf(S3StorageProvider);
    });

    it("returns S3StorageProvider when STORAGE_PROVIDER=minio", () => {
      process.env.STORAGE_PROVIDER = "minio";
      const provider = StorageFactory.getProvider();
      expect(provider).toBeInstanceOf(S3StorageProvider);
    });

    it("throws error for unsupported STORAGE_PROVIDER value", () => {
      process.env.STORAGE_PROVIDER = "invalid_provider";
      expect(() => StorageFactory.getProvider()).toThrow(
        "Unsupported STORAGE_PROVIDER configuration: 'invalid_provider'"
      );
    });
  });

  describe("S3StorageProvider Path Traversal Security Checks", () => {
    let s3Provider: S3StorageProvider;
    let mockSend: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSend = vi.fn();
      const mockClient = { send: mockSend } as unknown as S3Client;
      s3Provider = new S3StorageProvider({
        bucket: "test-bucket",
        s3Client: mockClient,
      });
    });

    it("rejects keys containing '..'", async () => {
      await expect(s3Provider.upload("../secret.txt", Buffer.from("data"), "text/plain")).rejects.toThrow(
        "Invalid storage key - path traversal detected"
      );
      await expect(s3Provider.get("quarantine/../secret.txt")).rejects.toThrow(
        "Invalid storage key - path traversal detected"
      );
      await expect(s3Provider.delete("../secret.txt")).rejects.toThrow(
        "Invalid storage key - path traversal detected"
      );
      await expect(s3Provider.exists("../secret.txt")).rejects.toThrow(
        "Invalid storage key - path traversal detected"
      );
    });

    it("rejects keys starting with leading slash '/'", async () => {
      await expect(s3Provider.get("/etc/passwd")).rejects.toThrow(
        "Invalid storage key - path traversal detected"
      );
    });

    it("rejects keys containing backslash '\\'", async () => {
      await expect(s3Provider.get("quarantine\\file.pdf")).rejects.toThrow(
        "Invalid storage key - path traversal detected"
      );
    });
  });

  describe("S3StorageProvider Operations", () => {
    let s3Provider: S3StorageProvider;
    let mockSend: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSend = vi.fn();
      const mockClient = { send: mockSend } as unknown as S3Client;
      s3Provider = new S3StorageProvider({
        bucket: "test-healthvault-bucket",
        s3Client: mockClient,
      });
    });

    it("successfully uploads buffer data using PutObjectCommand", async () => {
      mockSend.mockResolvedValue({});

      const key = "quarantine/test-doc.pdf";
      const buffer = Buffer.from("pdf-content");
      const resultKey = await s3Provider.upload(key, buffer, "application/pdf");

      expect(resultKey).toBe(key);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const commandCall = mockSend.mock.calls[0][0];
      expect(commandCall).toBeInstanceOf(PutObjectCommand);
      expect(commandCall.input).toEqual({
        Bucket: "test-healthvault-bucket",
        Key: key,
        Body: buffer,
        ContentType: "application/pdf",
      });
    });

    it("retrieves document content using GetObjectCommand", async () => {
      const payloadBytes = new Uint8Array(Buffer.from("file content bytes"));
      mockSend.mockResolvedValue({
        Body: {
          transformToByteArray: async () => payloadBytes,
        },
      });

      const key = "approved/test-doc.pdf";
      const data = await s3Provider.get(key);

      expect(data.toString()).toBe("file content bytes");
      expect(mockSend).toHaveBeenCalledTimes(1);

      const commandCall = mockSend.mock.calls[0][0];
      expect(commandCall).toBeInstanceOf(GetObjectCommand);
      expect(commandCall.input).toEqual({
        Bucket: "test-healthvault-bucket",
        Key: key,
      });
    });

    it("throws error with code ENOENT when object does not exist", async () => {
      const missingError: any = new Error("NoSuchKey");
      missingError.name = "NoSuchKey";
      missingError.$metadata = { httpStatusCode: 404 };

      mockSend.mockRejectedValue(missingError);

      try {
        await s3Provider.get("approved/non-existent.pdf");
        expect.unreachable("Should have thrown error");
      } catch (err: any) {
        expect(err.message).toBe("File not found in S3 storage");
        expect(err.code).toBe("ENOENT");
      }
    });

    it("checks object existence using HeadObjectCommand", async () => {
      mockSend.mockResolvedValue({});

      const key = "approved/doc123.pdf";
      const exists = await s3Provider.exists(key);

      expect(exists).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const commandCall = mockSend.mock.calls[0][0];
      expect(commandCall).toBeInstanceOf(HeadObjectCommand);
      expect(commandCall.input).toEqual({
        Bucket: "test-healthvault-bucket",
        Key: key,
      });
    });

    it("returns false for existence check when object is missing", async () => {
      const notFoundError: any = new Error("NotFound");
      notFoundError.name = "NotFound";
      notFoundError.$metadata = { httpStatusCode: 404 };

      mockSend.mockRejectedValue(notFoundError);

      const exists = await s3Provider.exists("approved/missing.pdf");
      expect(exists).toBe(false);
    });

    it("deletes object using DeleteObjectCommand", async () => {
      mockSend.mockResolvedValue({});

      const key = "quarantine/temp-file.pdf";
      await s3Provider.delete(key);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const commandCall = mockSend.mock.calls[0][0];
      expect(commandCall).toBeInstanceOf(DeleteObjectCommand);
      expect(commandCall.input).toEqual({
        Bucket: "test-healthvault-bucket",
        Key: key,
      });
    });

    it("moves object to new namespace (quarantine -> approved) via CopyObjectCommand and Delete", async () => {
      mockSend.mockResolvedValue({});

      const oldKey = "quarantine/doc-777.pdf";
      const newNamespace = "approved";

      const finalKey = await s3Provider.moveToNamespace(oldKey, newNamespace);

      expect(finalKey).toBe("approved/doc-777.pdf");
      expect(mockSend).toHaveBeenCalledTimes(2);

      const copyCall = mockSend.mock.calls[0][0];
      expect(copyCall).toBeInstanceOf(CopyObjectCommand);
      expect(copyCall.input).toEqual({
        Bucket: "test-healthvault-bucket",
        CopySource: "test-healthvault-bucket/quarantine/doc-777.pdf",
        Key: "approved/doc-777.pdf",
      });

      const deleteCall = mockSend.mock.calls[1][0];
      expect(deleteCall).toBeInstanceOf(DeleteObjectCommand);
      expect(deleteCall.input).toEqual({
        Bucket: "test-healthvault-bucket",
        Key: oldKey,
      });
    });

    it("generates local internal download endpoint path for signed URL contract", async () => {
      const key = "approved/confidential-record.pdf";
      const url = await s3Provider.createSignedAccessUrl(key);
      expect(url).toBe(`/api/patient/documents/${key}`);
    });
  });
});
