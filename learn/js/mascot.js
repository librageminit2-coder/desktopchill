// Ốc — linh vật: một con ốc lục giác đội mũ bảo hộ. Màu mũ theo ngôn ngữ đang học.
export function mascot({ mood = 'happy', size = 96, cls = '', wave = false } = {}) {
  const mouth = mood === 'wow'
    ? '<ellipse cx="60" cy="97" rx="6" ry="7" fill="var(--oc-ink)"/><ellipse cx="60" cy="99.5" rx="3.6" ry="3" fill="#F2876B"/>'
    : mood === 'calm'
      ? '<path d="M53 96 Q60 100 67 96" fill="none" stroke="var(--oc-ink)" stroke-width="3.5" stroke-linecap="round"/>'
      : '<path d="M51 93 Q60 104 69 93 Z" fill="var(--oc-ink)"/><path d="M55 98 Q60 102 65 98" fill="#F2876B"/>';
  return `<svg class="oc ${cls} ${wave ? 'wave' : ''}" viewBox="0 0 120 134" width="${size}" height="${Math.round(size * 134 / 120)}" aria-hidden="true">
  <ellipse class="oc-sh" cx="60" cy="129" rx="28" ry="4.5"/>
  <g class="oc-b">
    <path class="oc-arm l" d="M27 92 Q14 88 12 76" fill="none" stroke="#D49B0F" stroke-width="7" stroke-linecap="round"/>
    <path class="oc-arm r" d="M93 92 Q106 88 108 76" fill="none" stroke="#D49B0F" stroke-width="7" stroke-linecap="round"/>
    <path d="M60 44 94.6 64v40L60 124l-34.6-20V64z" fill="#F6C431" stroke="#D49B0F" stroke-width="4" stroke-linejoin="round"/>
    <path d="M60 50 89 67 60 84 31 67z" fill="#FFE07A" opacity=".55"/>
    <path d="M31 101 60 118 89 101" fill="none" stroke="#E2AA16" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <g class="oc-eyes"><ellipse cx="47" cy="80" rx="5.6" ry="7.2" fill="var(--oc-ink)"/><ellipse cx="73" cy="80" rx="5.6" ry="7.2" fill="var(--oc-ink)"/><circle cx="49" cy="77" r="2.1" fill="#fff"/><circle cx="75" cy="77" r="2.1" fill="#fff"/></g>
    <ellipse cx="37" cy="92" rx="6" ry="3.4" fill="#F2876B" opacity=".55"/><ellipse cx="83" cy="92" rx="6" ry="3.4" fill="#F2876B" opacity=".55"/>
    ${mouth}
    <path d="M26 52 Q26 15 60 15 Q94 15 94 52 Z" fill="var(--acc)"/>
    <path d="M60 15 V50" stroke="#fff" stroke-opacity=".35" stroke-width="5"/>
    <path d="M40 22 Q34 30 33 44" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>
    <rect x="17" y="47" width="86" height="10" rx="5" fill="var(--acc)"/>
    <rect x="17" y="53" width="86" height="4" rx="2" fill="#000" opacity=".15"/>
  </g></svg>`;
}
