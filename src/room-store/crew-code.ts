// This code gets read aloud in a WhatsApp group, so the characters that get
// misheard or misread — 0/O, 1/I/L, 5/S — are not in the alphabet at all.
export const CREW_CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';
export const CREW_CODE_LENGTH = 6;

export function generateCrewCode(rng: () => number): string {
  let code = '';
  for (let i = 0; i < CREW_CODE_LENGTH; i += 1) {
    const index = Math.floor(rng() * CREW_CODE_ALPHABET.length);
    code += CREW_CODE_ALPHABET.charAt(index);
  }
  return code;
}

// Players type this out of a chat message, so tolerate case and separators
// before validating. Characters outside the alphabet still fail isCrewCode.
export function normaliseCrewCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isCrewCode(value: string): boolean {
  if (value.length !== CREW_CODE_LENGTH) return false;
  return [...value].every((char) => CREW_CODE_ALPHABET.includes(char));
}
