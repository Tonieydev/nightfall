export const ROOM_TTL_SECONDS = 90 * 60;
export const MAX_SEATS = 12;

/**
 * LiveKit's free tier caps concurrent participants at 100. At the 12-seat room
 * cap that allows 8 rooms, not the 25 this defaulted to — which would have
 * permitted 300 concurrent participants, three times what the provider allows.
 */
export const LIVEKIT_MAX_CONCURRENT_PARTICIPANTS = 100;
export const MAX_CONCURRENT_ROOMS_DEFAULT = Math.floor(
  LIVEKIT_MAX_CONCURRENT_PARTICIPANTS / MAX_SEATS,
);
/** GM plus five players: the GM does not play, and assignRoles needs five. */
export const MIN_PLAYERS_TO_START = 5;
export const MIN_LOBBY_TO_START = MIN_PLAYERS_TO_START + 1;

export const roomKey = (crewCode: string): string => `room:${crewCode}`;
export const crewKey = (crewCode: string): string => `crew:${crewCode}`;
export const sessionKey = (crewCode: string): string => `crew:${crewCode}:session`;
/**
 * An index of live rooms, each stamped with its own expiry — not a counter.
 * A counter has to be told when a room ends, and nothing tells it about the
 * rooms that end by TTL, which is most of them. Deliberately a new key: the old
 * `rooms:concurrent` holds a drifted value and must not be read again.
 */
export const LIVE_ROOMS_KEY = 'rooms:live';

/**
 * Rooms that actually hold voice. A separate set from LIVE_ROOMS_KEY because a
 * voiceless room occupies a seat but publishes nothing, so it must cost the
 * participant-minute budget nothing.
 */
export const VOICE_ROOMS_KEY = 'rooms:voice';
