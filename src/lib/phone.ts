export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  // Brazilian phone: 10 (landline) or 11 (mobile) digits
  if (digits.length !== 10 && digits.length !== 11) {
    return false;
  }
  // DDD must be between 11 and 99
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) {
    return false;
  }
  // Mobile: 5th digit must be 9 (for 11 digits)
  if (digits.length === 11) {
    const fifthDigit = digits[2]; // after DDD
    if (fifthDigit !== "9") {
      return false;
    }
  }
  // Check if all digits are the same (invalid patterns like 11111111111)
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }
  return true;
}
