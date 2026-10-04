export interface StaffProxyRequest {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}
export interface StaffProxyResponse {
  readonly status: number;
  readonly body: unknown;
  readonly cookies: readonly string[];
}
export interface StaffProxy {
  forward(request: StaffProxyRequest): Promise<StaffProxyResponse>;
}
