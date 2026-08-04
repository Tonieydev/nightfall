/**
 * The slice of LiveKit's RoomServiceClient this project uses. Narrow on purpose:
 * the test double must reproduce it exactly, and nothing outside src/voice/ may
 * import LiveKit at all.
 */
export interface VoiceRoomService {
  /** Standing allow-list: who may subscribe to this publisher's tracks. */
  updateParticipant(
    room: string,
    identity: string,
    options: { permission: { canPublish: boolean; canSubscribe: boolean } },
  ): Promise<unknown>;
  /** Server-driven subscribe/unsubscribe for the honest path. */
  updateSubscriptions(
    room: string,
    identity: string,
    trackSids: string[],
    subscribe: boolean,
  ): Promise<void>;
  listParticipants(room: string): Promise<VoiceParticipant[]>;
  deleteRoom(room: string): Promise<void>;
}

export interface VoiceParticipant {
  identity: string;
  tracks: { sid: string }[];
}
