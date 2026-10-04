export interface CatalogReader {
  read(
    path: string,
    query: Readonly<Record<string, string>>,
    requestId: string | undefined,
  ): Promise<unknown>;
}
