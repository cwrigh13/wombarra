// AIS ship type codes: 80-89 are tankers, 70-79 are cargo.
// Anything else gets treated as "cargo" for rendering purposes (and filtered out
// at ingest time so only tanker/cargo vessels reach the map).

export type VesselKind = 'tanker' | 'cargo';

export function classifyShipType(shipType: number | null | undefined): {
  kind: VesselKind | null;
  label: string;
} {
  if (shipType == null) return { kind: null, label: 'Unknown' };
  if (shipType >= 80 && shipType <= 89) {
    return { kind: 'tanker', label: tankerLabel(shipType) };
  }
  if (shipType >= 70 && shipType <= 79) {
    return { kind: 'cargo', label: cargoLabel(shipType) };
  }
  return { kind: null, label: `Type ${shipType}` };
}

function tankerLabel(code: number): string {
  switch (code) {
    case 80:
      return 'Tanker';
    case 81:
      return 'Hazmat A Tanker';
    case 82:
      return 'Hazmat B Tanker';
    case 83:
      return 'Hazmat C Tanker';
    case 84:
      return 'Hazmat D Tanker';
    default:
      return `Tanker (${code})`;
  }
}

function cargoLabel(code: number): string {
  switch (code) {
    case 70:
      return 'Cargo';
    case 71:
      return 'Hazmat A Cargo';
    case 72:
      return 'Hazmat B Cargo';
    case 73:
      return 'Hazmat C Cargo';
    case 74:
      return 'Hazmat D Cargo';
    default:
      return `Cargo (${code})`;
  }
}
