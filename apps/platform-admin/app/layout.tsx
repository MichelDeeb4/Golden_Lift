import type { ReactNode } from 'react';
import '@business-platform/ui/styles.css';
export const metadata = {
  title: 'Platform administration | Business Platform',
  description: 'Business Platform',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
