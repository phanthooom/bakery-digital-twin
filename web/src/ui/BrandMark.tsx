import { useState } from 'react';
import { GRAINS } from './brandEmblem';

/** Логотип в шапке: файл из config (site.brand.logo) или нейтральная эмблема-колос. */
export function BrandMark({ logo, name, color = '#B71F3E' }: { logo?: string | null; name: string; color?: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed)
    return (
      <span className="brand-logo" style={{ background: color }}>
        <img src={logo} alt={name} onError={() => setFailed(true)} />
      </span>
    );
  return (
    <svg className="brand-mark" viewBox="0 0 100 100" role="img" aria-label={name}>
      <circle cx="50" cy="50" r="49" fill={color} />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#ffd9a0" strokeWidth="3.5" />
      <line x1="50" y1="26" x2="50" y2="82" stroke="#fff3df" strokeWidth="3" strokeLinecap="round" />
      {GRAINS.map(([x, y, r]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="5.2" ry="9" fill="#fff3df" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </svg>
  );
}
