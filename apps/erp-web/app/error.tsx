'use client';
import { ErrorPanel } from '@business-platform/ui';
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel retry={reset} />;
}
