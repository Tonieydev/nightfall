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
export const ROOM_COUNT_KEY = 'rooms:concurrent';
