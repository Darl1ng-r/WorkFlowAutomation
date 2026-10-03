import { ValidationError } from "./errors";
import { CorrespondenceDirection } from "./types";

/**
 * Value Object representing an immutable, gapless correspondence reference number.
 * Format: IN-YYYY-XXXXXX or OUT-YYYY-XXXXXX
 * Example: IN-2026-000412
 */
export class ReferenceNumber {
  private static readonly REGEX = /^(IN|OUT)-(\d{4})-(\d{6})$/;

  private constructor(
    public readonly direction: CorrespondenceDirection,
    public readonly year: number,
    public readonly sequence: number,
    public readonly value: string
  ) {}

  public static create(direction: CorrespondenceDirection, year: number, sequence: number): ReferenceNumber {
    if (sequence <= 0 || sequence > 999999) {
      throw new ValidationError(`Sequence number ${sequence} must be between 1 and 999999.`);
    }
    const paddedSequence = sequence.toString().padStart(6, "0");
    const formatted = `${direction}-${year}-${paddedSequence}`;
    return new ReferenceNumber(direction, year, sequence, formatted);
  }

  public static parse(raw: string): ReferenceNumber {
    const match = raw.trim().toUpperCase().match(ReferenceNumber.REGEX);
    if (!match) {
      throw new ValidationError(
        `Invalid reference number format '${raw}'. Expected format: 'IN-YYYY-XXXXXX' or 'OUT-YYYY-XXXXXX'.`
      );
    }

    const direction = match[1] as CorrespondenceDirection;
    const year = parseInt(match[2]!, 10);
    const sequence = parseInt(match[3]!, 10);

    return new ReferenceNumber(direction, year, sequence, raw.trim().toUpperCase());
  }

  public toString(): string {
    return this.value;
  }
}
