import bcrypt from "bcrypt";

export class CryptUtils {
  static generateHash(str: string) {
    const salt_rounds = 12;
    const hash = bcrypt.hash(str, salt_rounds);
    return hash;
  }

  static compareHash(raw: string, hashed: string) {
    return bcrypt.compare(raw, hashed);
  }
}
