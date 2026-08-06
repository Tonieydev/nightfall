'use client';

import { useState } from 'react';
import { PaperPlaneRightIcon } from '@phosphor-icons/react';
import { CHANNEL_LABEL, channelFor } from './audio-state';
import { MAX_CHAT_CHARS } from '@/room-store/chat';
import type { RoomView } from '@/room-store';

/**
 * Chat is routed by computeAudioGraph, exactly like voice: whatever you can say
 * out loud right now is who reads this. Nothing here chooses an audience, and
 * the messages already in `view.chat` are only the ones this viewer was allowed
 * to receive, filtered before the emit.
 *
 * It exists for "mic dead, voting Musa", not for arguing. The 140 character cap
 * is the rule that pushes people back to voice, so the counter is shown rather
 * than the input silently refusing a longer line.
 */
export function ChatPanel({
  view,
  onSend,
}: {
  view: RoomView;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const channel = view.you === null ? 'silenced' : channelFor(view, view.you.playerId);
  const open = channel !== 'silenced';
  const left = MAX_CHAT_CHARS - draft.length;

  function send(): void {
    const text = draft.trim();
    if (text === '' || text.length > MAX_CHAT_CHARS) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="nf-chat">
      <ul className="nf-chat-log">
        {view.chat.length === 0 ? (
          <li className="nf-chat-empty">
            {open
              ? 'Nothing here yet. Whoever can hear you can read this.'
              : 'Nothing here yet, and nobody can read you right now.'}
          </li>
        ) : (
          view.chat.map((message) => (
            <li
              key={message.id}
              className="nf-chat-line"
              data-mine={String(message.senderId === view.you?.playerId)}
            >
              <span className="nf-chat-who">{message.senderName}</span>
              <span className="nf-chat-text">{message.text}</span>
            </li>
          ))
        )}
      </ul>

      <div className="nf-chat-composer">
        <input
          className="input"
          value={draft}
          disabled={!open}
          maxLength={MAX_CHAT_CHARS}
          placeholder={open ? `Message the ${CHANNEL_LABEL[channel].toLowerCase()}` : 'Muted by the game master'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!open || draft.trim() === ''}
          onClick={send}
          aria-label="Send"
        >
          <PaperPlaneRightIcon size={16} />
        </button>
      </div>

      {/* Shown from 40 out, so it arrives as a warning rather than a refusal. */}
      {left <= 40 ? <p className="nf-chat-count">{left} left</p> : null}
    </div>
  );
}
