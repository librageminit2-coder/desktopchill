// Mochi — linh vật: bé mèo tròn như bánh mochi, đeo vòng cổ màu theo ngôn ngữ đang học.
// mood: happy (mắt long lanh) · wow (mắt lấp lánh, há miệng) · calm (mắt híp mãn nguyện)
export function mascot({ mood = 'happy', size = 96, cls = '', wave = false } = {}) {
  const ink = 'var(--mo-ink)';
  const eyes = mood === 'calm'
    ? `<path d="M40 73 Q46 67 52 73M68 73 Q74 67 80 73" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`
    : mood === 'wow'
      ? `<g class="mo-eyes"><ellipse cx="46" cy="71" rx="7.2" ry="8.4" fill="${ink}"/><ellipse cx="74" cy="71" rx="7.2" ry="8.4" fill="${ink}"/>
         <circle cx="48.6" cy="67.6" r="3" fill="#fff"/><circle cx="76.6" cy="67.6" r="3" fill="#fff"/><circle cx="43.6" cy="74.6" r="1.5" fill="#fff"/><circle cx="71.6" cy="74.6" r="1.5" fill="#fff"/>
         <path class="mo-spark" d="M96 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FFC531"/></g>`
      : `<g class="mo-eyes"><ellipse cx="46" cy="72" rx="5.8" ry="7" fill="${ink}"/><ellipse cx="74" cy="72" rx="5.8" ry="7" fill="${ink}"/>
         <circle cx="48" cy="69" r="2.3" fill="#fff"/><circle cx="76" cy="69" r="2.3" fill="#fff"/><circle cx="44.5" cy="75" r="1.1" fill="#fff"/><circle cx="72.5" cy="75" r="1.1" fill="#fff"/></g>`;
  const mouth = mood === 'wow'
    ? `<ellipse cx="60" cy="86" rx="4.6" ry="5.2" fill="${ink}"/><ellipse cx="60" cy="88" rx="2.8" ry="2.2" fill="#FF8FA3"/>`
    : `<path d="M53.5 83.5 Q56.75 87.5 60 83.5 Q63.25 87.5 66.5 83.5" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg class="oc mo ${cls} ${wave ? 'wave' : ''}" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
  <ellipse class="oc-sh" cx="60" cy="114" rx="31" ry="4.6"/>
  <g class="oc-b">
    <path class="mo-tail" d="M86 98 Q113 97 108 72 Q106 63 99 66" fill="none" stroke="${ink}" stroke-width="12" stroke-linecap="round"/>
    <path class="mo-tail" d="M86 98 Q113 97 108 72 Q106 63 99 66" fill="none" stroke="#FFB870" stroke-width="7" stroke-linecap="round"/>
    <g class="mo-ear l"><path d="M33 56 L27 24 Q28 18.5 33.5 21 L56 40 Z" fill="#FFF8F0" stroke="${ink}" stroke-width="3.4" stroke-linejoin="round"/><path d="M35 48 L32.5 29 L47 41 Z" fill="#FFB3C1"/></g>
    <g class="mo-ear r"><path d="M87 56 L93 24 Q92 18.5 86.5 21 L64 40 Z" fill="#FFB870" stroke="${ink}" stroke-width="3.4" stroke-linejoin="round"/><path d="M85 48 L87.5 29 L73 41 Z" fill="#FFD9B0"/></g>
    <path d="M60 36 C88 36 100 52 100 74 C100 96 84 108 60 108 C36 108 20 96 20 74 C20 52 32 36 60 36 Z" fill="#FFF8F0" stroke="${ink}" stroke-width="3.4"/>
    <path d="M72 38.5 C86 40.5 95 49 98.4 61 C91 58 84 51 72 38.5 Z" fill="#FFB870"/>
    <ellipse cx="44" cy="46" rx="9" ry="4" fill="#fff" opacity=".9"/>
    ${eyes}
    <ellipse cx="34" cy="83" rx="6.4" ry="3.8" fill="#FF9CB0" opacity=".55"/><ellipse cx="86" cy="83" rx="6.4" ry="3.8" fill="#FF9CB0" opacity=".55"/>
    <path d="M57.6 79.6 h4.8 l-2.4 2.8z" fill="#FF8FA3" stroke="#FF8FA3" stroke-width="1.4" stroke-linejoin="round"/>
    ${mouth}
    <path d="M22 78 l-9 -2M22 84 l-9 2M98 78 l9 -2M98 84 l9 2" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
    <path d="M33 97 Q60 108 87 97" fill="none" stroke="var(--acc)" stroke-width="6.5" stroke-linecap="round"/>
    <circle cx="60" cy="103.5" r="4.6" fill="#FFC531" stroke="${ink}" stroke-width="2"/>
    <ellipse class="mo-paw l" cx="45" cy="108" rx="9.5" ry="6" fill="#FFF8F0" stroke="${ink}" stroke-width="3"/>
    <ellipse class="mo-paw r" cx="75" cy="108" rx="9.5" ry="6" fill="#FFF8F0" stroke="${ink}" stroke-width="3"/>
  </g></svg>`;
}
