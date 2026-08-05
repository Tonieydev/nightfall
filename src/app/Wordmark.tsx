// The ssr entry rather than the package root, so the lockup can sit in a server
// component as easily as a client one. Every other icon in the app is inside a
// 'use client' file already and has no such need.
import { MoonStarsIcon } from '@phosphor-icons/react/dist/ssr';

/**
 * The product's one piece of identity: a mark, the name, and what it is.
 *
 * Drawn rather than shipped as an asset, so it inherits the accent from the
 * Nocturne tokens and cannot drift out of step with the rest of the page when a
 * ramp changes. The tile is a surface with an edge, not a filled block: the
 * design system's elevation rule applies to the logo like everything else.
 */
export function Wordmark({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="nf-wordmark">
      <span className="nf-wordmark-mark" aria-hidden="true">
        <MoonStarsIcon size={22} weight="fill" />
      </span>
      <span className="nf-wordmark-text">
        <span className="nf-wordmark-name">Nightfall</span>
        {tagline ? <span className="nf-wordmark-tag">Moderated voice mafia</span> : null}
      </span>
    </span>
  );
}
