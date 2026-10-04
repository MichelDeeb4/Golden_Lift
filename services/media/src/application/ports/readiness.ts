export interface Readiness {
  check(): Promise<boolean>;
}
