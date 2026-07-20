/* Shared input validation — mirror of the backend rules. */

export function cleanPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export function isValidPhone(phone: string): boolean {
  return cleanPhone(phone).length === 10
}

export function phoneError(phone: string): string {
  if (!phone.trim()) return "WhatsApp number is required"
  if (!isValidPhone(phone)) return "Enter a valid 10-digit number"
  return ""
}

export function requiredError(value: string, label: string): string {
  return value.trim() ? "" : `${label} is required`
}

export function priceError(value: string | number): string {
  const n = Number(value)
  if (!value && value !== 0) return "Price is required"
  if (isNaN(n) || n <= 0) return "Price must be more than 0"
  return ""
}
