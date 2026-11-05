/** Small palette drawings for the sequence, state, use case and component items. Returns null for ids it does not know. */
const ST = { stroke: 'currentColor', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const BG = 'var(--elevated, #fff)';

export function Uml2Glyph({ id }: { id: string }) {
  const svg = (children: React.ReactNode) => (
    <svg className="palette-uml-glyph" width="32" height="32" viewBox="0 0 32 32" aria-hidden>{children}</svg>
  );
  const blue = '#2f6fdb', teal = '#0f9d8f', purple = '#8e5bd6', orange = '#d9822b';
  switch (id) {
    case 'uml-sequence':
      return svg(<><rect x="3.5" y="4.5" width="9" height="5" rx="1" fill={BG} stroke={blue} strokeWidth="1.4" /><rect x="19.5" y="4.5" width="9" height="5" rx="1" fill={BG} stroke={blue} strokeWidth="1.4" /><path d="M8 9.5V28M24 9.5V28" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2.5 2" /><path d="M8 14H23" {...ST} /><path d="M20 11.5 23.5 14 20 16.5z" fill="currentColor" stroke="currentColor" strokeWidth="1" /><path d="M24 21H9" {...ST} strokeDasharray="3 2" /><path d="M12 18.5 8.5 21l3.5 2.5" {...ST} /></>);
    case 'uml-lifeline':
      return svg(<><rect x="8.5" y="4.5" width="15" height="6" rx="1.2" fill={BG} stroke={blue} strokeWidth="1.5" /><path d="M16 10.5V28" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.5 2" /><rect x="14" y="15" width="4" height="8" fill={BG} stroke="currentColor" strokeWidth="1.2" /></>);
    case 'uml-state':
      return svg(<><rect x="3.5" y="8.5" width="25" height="15" rx="6" fill={BG} stroke={blue} strokeWidth="1.5" /><path d="M7 14.5h18" stroke={blue} strokeWidth="1.1" /><path d="M9 19h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>);
    case 'uml-state-composite':
      return svg(<><rect x="2.5" y="4.5" width="27" height="23" rx="7" fill={BG} stroke={blue} strokeWidth="1.5" /><path d="M2.8 11h26.4" stroke={blue} strokeWidth="1.1" /><rect x="7" y="15" width="8" height="7" rx="2.5" fill={BG} stroke="currentColor" strokeWidth="1.2" /><rect x="18" y="15" width="8" height="7" rx="2.5" fill={BG} stroke="currentColor" strokeWidth="1.2" /></>);
    case 'uml-initial':
      return svg(<circle cx="16" cy="16" r="6.5" fill="currentColor" />);
    case 'uml-final':
      return svg(<><circle cx="16" cy="16" r="9" fill={BG} stroke="currentColor" strokeWidth="1.6" /><circle cx="16" cy="16" r="5" fill="currentColor" /></>);
    case 'uml-choice':
      return svg(<path d="M16 5 27 16 16 27 5 16z" fill={BG} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />);
    case 'uml-fork':
    case 'uml-join':
      return svg(<><rect x="3.5" y="14" width="25" height="4.5" rx="1" fill="currentColor" />{id === 'uml-fork' ? <path d="M16 4v10M16 18.5 10 28M16 18.5 22 28" {...ST} strokeWidth="1.2" /> : <path d="M10 4l6 9.5M22 4l-6 9.5M16 18.5V28" {...ST} strokeWidth="1.2" />}</>);
    case 'uml-history':
    case 'uml-deep-history':
      return svg(<><circle cx="16" cy="16" r="10" fill={BG} stroke="currentColor" strokeWidth="1.6" /><text x="16" y="20.4" textAnchor="middle" fontSize={id === 'uml-history' ? 13 : 11} fontWeight="700" fill="currentColor">{id === 'uml-history' ? 'H' : 'H*'}</text></>);
    case 'uml-entry-point':
      return svg(<circle cx="16" cy="16" r="8" fill={BG} stroke="currentColor" strokeWidth="1.6" />);
    case 'uml-exit-point':
      return svg(<><circle cx="16" cy="16" r="8" fill={BG} stroke="currentColor" strokeWidth="1.6" /><path d="M10.3 10.3l11.4 11.4M21.7 10.3 10.3 21.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>);
    case 'uml-actor':
      return svg(<><circle cx="16" cy="8" r="3.8" fill={BG} stroke={teal} strokeWidth="1.5" /><path d="M16 12v9M9 15.5h14M16 21l-5.5 7M16 21l5.5 7" stroke={teal} strokeWidth="1.6" strokeLinecap="round" fill="none" /></>);
    case 'uml-act-initial': return svg(<circle cx="16" cy="16" r="6.5" fill="currentColor" />);
    case 'uml-act-final': return svg(<><circle cx="16" cy="16" r="9" fill={BG} stroke="currentColor" strokeWidth="1.6" /><circle cx="16" cy="16" r="5" fill="currentColor" /></>);
    case 'uml-act-flow-final': return svg(<><circle cx="16" cy="16" r="9" fill={BG} stroke="currentColor" strokeWidth="1.6" /><path d="M11.5 11.5l9 9M20.5 11.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>);
    case 'uml-act-action': return svg(<rect x="3.5" y="8.5" width="25" height="15" rx="7" fill={BG} stroke={orange} strokeWidth="1.6" />);
    case 'uml-act-decision': return svg(<path d="M16 5 27 16 16 27 5 16z" fill={BG} stroke={orange} strokeWidth="1.6" strokeLinejoin="round" />);
    case 'uml-act-fork': return svg(<rect x="3.5" y="14" width="25" height="4.5" rx="1" fill="currentColor" />);
    case 'uml-act-object': return svg(<rect x="4.5" y="9.5" width="23" height="13" fill={BG} stroke={orange} strokeWidth="1.6" />);
    case 'uml-act-send': return svg(<path d="M4.5 9.5H22L28 16l-6 6.5H4.5z" fill={BG} stroke={orange} strokeWidth="1.6" strokeLinejoin="round" />);
    case 'uml-act-accept': return svg(<path d="M4.5 9.5H28v13H4.5l5.5-6.5z" fill={BG} stroke={orange} strokeWidth="1.6" strokeLinejoin="round" />);
    case 'uml-act-note': return svg(<><path d="M5.5 6.5H21l5.5 5.5v14h-21z" fill="#fff8c5" stroke="#c9b037" strokeWidth="1.4" strokeLinejoin="round" /><path d="M21 6.5V12h5.5" fill="none" stroke="#c9b037" strokeWidth="1.2" /></>);
    case 'uml-act-lane-v': return svg(<><rect x="4.5" y="4.5" width="10" height="23" fill={BG} stroke={orange} strokeWidth="1.5" /><rect x="14.5" y="4.5" width="13" height="23" fill={BG} stroke={orange} strokeWidth="1.5" /><path d="M4.5 9.5h23" stroke={orange} strokeWidth="1.2" /></>);
    case 'uml-act-lane-h': return svg(<><rect x="4.5" y="4.5" width="23" height="10" fill={BG} stroke={orange} strokeWidth="1.5" /><rect x="4.5" y="14.5" width="23" height="13" fill={BG} stroke={orange} strokeWidth="1.5" /><path d="M9.5 4.5v23" stroke={orange} strokeWidth="1.2" /></>);
    case 'uml-usecase':
      return svg(<ellipse cx="16" cy="16" rx="13" ry="8.5" fill={BG} stroke={teal} strokeWidth="1.6" />);
    case 'uml-system':
      return svg(<><rect x="3.5" y="4.5" width="25" height="23" rx="2" fill="none" stroke={teal} strokeWidth="1.8" /><path d="M10 9.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><ellipse cx="16" cy="19" rx="7" ry="4.5" fill={BG} stroke={teal} strokeWidth="1.3" /></>);
    case 'uml-component':
      return svg(<><rect x="4.5" y="6.5" width="23" height="19" rx="2" fill={BG} stroke={purple} strokeWidth="1.5" /><rect x="19" y="9" width="6.5" height="5" fill={BG} stroke={purple} strokeWidth="1.1" /><rect x="17" y="10" width="4" height="1.6" fill={BG} stroke={purple} strokeWidth="0.9" /><rect x="17" y="12.6" width="4" height="1.6" fill={BG} stroke={purple} strokeWidth="0.9" /></>);
    case 'uml-node':
      return svg(<><path d="M4.5 11.5 9.5 6.5h18v14l-5 5h-18z" fill={BG} stroke={purple} strokeWidth="1.5" strokeLinejoin="round" /><path d="M4.5 11.5h18v14M22.5 11.5l5-5" stroke={purple} strokeWidth="1.3" fill="none" /></>);
    case 'uml-artifact':
      return svg(<><path d="M7 4.5h13l5 5v18H7z" fill={BG} stroke={purple} strokeWidth="1.5" strokeLinejoin="round" /><path d="M20 4.5v5h5" stroke={purple} strokeWidth="1.3" fill="none" /><path d="M11 16h10M11 20h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>);
    case 'uml-provided':
      return svg(<><circle cx="21" cy="16" r="5.5" fill={BG} stroke="currentColor" strokeWidth="1.6" /><path d="M4 16h11.5" {...ST} /></>);
    case 'uml-required':
      return svg(<><path d="M20 9.5a7 7 0 0 0 0 13" {...ST} /><path d="M4 16h14" {...ST} /></>);
    case 'uml-dep-node': case 'uml-dep-device': case 'uml-dep-env':
      return svg(<><rect x="4.5" y="11.5" width="18" height="15" rx={id === 'uml-dep-env' ? 4 : 1} fill={BG} stroke="#3f8f6b" strokeWidth="1.5" /><path d="M4.5 11.5 9.5 6.5h18v14l-5 6M22.5 11.5l5-5" stroke="#3f8f6b" strokeWidth="1.5" fill="none" strokeLinejoin="round" />{id === 'uml-dep-device' && <path d="M10 22.5h7" {...ST} strokeWidth="1.3" />}</>);
    case 'uml-dep-artifact':
      return svg(<><path d="M7 4.5h13l5 5v18H7z" fill={BG} stroke="#3f8f6b" strokeWidth="1.5" strokeLinejoin="round" /><path d="M20 4.5v5h5" stroke="#3f8f6b" strokeWidth="1.3" fill="none" /></>);
    case 'uml-dep-component':
      return svg(<><rect x="4.5" y="7.5" width="23" height="17" rx="2" fill={BG} stroke="#3f8f6b" strokeWidth="1.5" /><rect x="19" y="10" width="7" height="5" fill={BG} stroke="currentColor" strokeWidth="1.2" /></>);
    case 'uml-rel-communication':
      return svg(<path d="M3 16h26" {...ST} />);
    case 'uml-rel-deploy':
    case 'uml-rel-manifest':
      return svg(<><path d="M3 16h23" {...ST} strokeDasharray="3 2.5" /><path d="M21 11.5 27.5 16 21 20.5" {...ST} /></>);
    case 'uml-rel-import':
    case 'uml-rel-access':
    case 'uml-rel-merge':
      return svg(<><path d="M3 16h23" {...ST} strokeDasharray="3 2.5" /><path d="M21 11.5 27.5 16 21 20.5" {...ST} /></>);
    case 'uml-rel-link':
      return svg(<path d="M3 16h26" {...ST} />);
    case 'uml-obj':
      return svg(<><rect x="4.5" y="6.5" width="23" height="19" rx="1.5" fill={BG} stroke="#0e7490" strokeWidth="1.5" /><path d="M4.5 13h23" stroke="#0e7490" strokeWidth="1.2" /><path d="M9 10h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M9 17.5h10M9 21.5h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>);
    case 'uml-comm-object':
      return svg(<><rect x="3.5" y="10.5" width="9" height="11" rx="1.2" fill={BG} stroke="#0e7490" strokeWidth="1.5" /><rect x="19.5" y="10.5" width="9" height="11" rx="1.2" fill={BG} stroke="#0e7490" strokeWidth="1.5" /><path d="M12.5 16h7" {...ST} /><path d="M15 13.2 18 11.5M15 20.5 18 22" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M6 14.5h4M22 14.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>);
    case 'uml-timing':
      return svg(<><rect x="3.5" y="4.5" width="25" height="23" rx="1.5" fill={BG} stroke="#8e5bd6" strokeWidth="1.5" /><path d="M3.5 10h25" stroke="#8e5bd6" strokeWidth="1.1" /><path d="M7 15.5h6v-3h6v3h6M7 23.5h4v-3h8v3h6" {...ST} strokeWidth="1.3" /></>);
    case 'uml-timing-lifeline':
      return svg(<><rect x="3.5" y="9.5" width="25" height="13" rx="1.5" fill={BG} stroke="#8e5bd6" strokeWidth="1.5" /><path d="M10.5 9.5v13" stroke="#8e5bd6" strokeWidth="1.1" /><path d="M13 18.5h4v-4h5v4h3.5" {...ST} strokeWidth="1.3" /></>);
    case 'uml-rel-transition':
      return svg(<><path d="M3 16h22" {...ST} /><path d="M20 11.5 27.5 16 20 20.5" {...ST} /></>);
    case 'uml-rel-include':
    case 'uml-rel-extend':
      return svg(<><path d="M3 16h23" {...ST} strokeDasharray="3 2.5" /><path d="M21 11.5 27.5 16 21 20.5" {...ST} /></>);
    case 'uml-rel-generalization':
      return svg(<><path d="M3 16h16" {...ST} /><path d="M19 10.5 29 16 19 21.5z" fill={BG} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></>);
    case 'uml-rel-assembly':
      return svg(<><circle cx="12" cy="16" r="4.5" fill={BG} stroke="currentColor" strokeWidth="1.5" /><path d="M16 11.5a5.5 5.5 0 0 1 0 9" {...ST} /><path d="M3 16h4.5M16.5 16H29" {...ST} /></>);
    default:
      return null;
  }
}
