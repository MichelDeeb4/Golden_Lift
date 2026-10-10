'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
export function WorkspaceShell({ title, children }: { title: string; children: ReactNode }) {
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  return (
    <div dir={direction} className="workspace">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header>
        <a href="/" className="brand">
          Business Platform
        </a>
        <nav aria-label="Main navigation">
          <a href="/" aria-current="page">
            Home
          </a>
        </nav>
      </header>
      <main id="content">
        <p className="eyebrow">Business Platform</p>
        <h1>{title}</h1>
        {children}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setDirection(data.get('direction') === 'rtl' ? 'rtl' : 'ltr');
          }}
        >
          <label htmlFor="direction">Display direction</label>
          <select id="direction" name="direction" defaultValue={direction}>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
          <button type="submit">Apply display preference</button>
          <output aria-live="polite">
            {direction === 'rtl' ? 'Right to left' : 'Left to right'}
          </output>
        </form>
      </main>
      <footer>Business Platform</footer>
    </div>
  );
}
export function ErrorPanel({ retry }: { retry: () => void }) {
  return (
    <main>
      <h1>This page could not load</h1>
      <p>Please try again.</p>
      <button onClick={retry}>Try again</button>
    </main>
  );
}
