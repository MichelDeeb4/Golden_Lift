import { ApplicationError } from '@golden-lift/contracts';
import type { CatalogReader } from '../../application/ports/catalog-reader.js';
export class HttpCatalogReader implements CatalogReader {
  constructor(private readonly origin: string) {}
  async read(
    path: string,
    query: Readonly<Record<string, string>>,
    requestId: string | undefined,
  ): Promise<unknown> {
    const url = new URL(path, this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, {
        headers:
          requestId && /^[a-zA-Z0-9_-]{1,64}$/.test(requestId) ? { 'x-request-id': requestId } : {},
        signal: AbortSignal.timeout(4000),
        redirect: 'error',
      });
      if (response.status === 404) throw new ApplicationError('NOT_FOUND', 'Resource not found.');
      if (response.status === 400)
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid category request.');
      if (!response.ok)
        throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Catalog is unavailable.');
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Catalog is unavailable.');
    }
  }
}
