import { colors, palette, space, radius, shadows, motion, zIndex } from '@golden-lift/tokens';
export function GLTokenStyles() {
  const vars: Record<string, string> = {};
  for (const [group, values] of Object.entries(colors))
    for (const [key, v] of Object.entries(values)) vars[`--${group}-${key}`] = v;
  for (const [k, v] of Object.entries(space)) vars['--' + k] = v + 'px';
  for (const [k, v] of Object.entries(radius)) vars['--' + k] = v + 'px';
  for (const [k, v] of Object.entries(shadows)) vars['--' + k] = v;
  for (const [k, v] of Object.entries(motion))
    vars['--motion-' + k] = typeof v === 'number' ? v + 'ms' : v;
  for (const [k, v] of Object.entries(zIndex)) vars['--z-' + k] = String(v);
  vars['--brand-gold'] = palette.gold500;
  vars['--dark-border'] = palette.charcoal600;
  vars['--dark-muted'] = palette.silver400;
  return (
    <style>
      {':root{' +
        Object.entries(vars)
          .map(([k, v]) => k + ':' + v)
          .join(';') +
        '}'}
    </style>
  );
}
