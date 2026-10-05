export interface StoredObject {
  readonly key: string;
  readonly bytes: string;
  readonly sha256: string;
  readonly version: string | null;
}
export interface PrivateStorage {
  readonly bucket: string;
  put(key: string, body: AsyncIterable<Uint8Array>, bytes: number): Promise<StoredObject>;
  inspect(key: string, maxBytes: number): Promise<StoredObject>;
  available(key: string, bytes: string): Promise<boolean>;
  read(
    key: string,
    range?: { start: number; end: number },
    version?: string | null,
  ): Promise<AsyncIterable<Uint8Array>>;
  sign?(
    key: string,
    seconds: number,
    mime: string,
    download: boolean,
    version?: string | null,
  ): Promise<string>;
  close(): void;
}
