"use client"

/* Language scaffold: English is built now; Tamil slot exists so the Settings
   toggle is real. Add keys here — never hardcode UI strings in pages. */
export type Lang = "en" | "ta"

const en = {
  today: "Today",
  chats: "Chats",
  broadcast: "Broadcast",
  orders: "Orders",
  customers: "Customers",
  catalog: "Catalog",
  settings: "Settings",
  sales_today: "Sales today",
  orders_today: "Orders",
  to_reply: "To reply",
  reached: "Customers reached",
  needs_reply: "Needs your reply",
  todays_orders: "Today's orders",
  send_stock: "Send today's stock",
  wa_connected: "WhatsApp connected",
  wa_not_connected: "WhatsApp not connected",
  window_open: "Can chat freely",
  window_closed: "Ready message only",
  view_all: "View all",
  open_chats: "Open chats",
  send_again: "Send again",
  type_message: "Type a message…",
  send: "Send",
  new_broadcast: "New broadcast",
  pick_message: "Pick a message",
  pick_customers: "Pick customers",
  review_send: "Review and send",
  new_customer: "New customer",
  new_order: "New order",
  new_item: "New item",
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  ready_messages: "Ready messages",
  language: "Language",
  delivered: "delivered",
  read: "read",
  replied: "replied",
} as const

export type TKey = keyof typeof en

const ta: Partial<Record<TKey, string>> = {
  // Tamil translations land here in v2
}

let current: Lang = "en"

export function setLang(lang: Lang) {
  current = lang
}

export function t(key: TKey): string {
  if (current === "ta" && ta[key]) return ta[key] as string
  return en[key]
}
