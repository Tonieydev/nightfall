export const ROOM_TTL_SECONDS = 90 * 60;
export const MAX_SEATS = 12;
/** GM plus five players: the GM does not play, and assignRoles needs five. */
export const MIN_PLAYERS_TO_START = 5;
export const MIN_LOBBY_TO_START = MIN_PLAYERS_TO_START + 1;

export const roomKey = (crewCode: string): string => `room:${crewCode}`;
export const crewKey = (crewCode: string): string => `crew:${crewCode}`;
export const sessionKey = (crewCode: string): string => `crew:${crewCode}:session`;
export const ROOM_COUNT_KEY = 'rooms:concurrent';
