"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Send, ArrowLeft, Check, CheckCheck, Clock, MessageCircle, FileText, Search } from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Chip, Avatar, Button, EmptyState, ErrorState, Input, timeAgo, timeShort, windowLeft } from "@/components/ui"
import { ChatListSkeleton, ThreadSkeleton } from "@/components/skeletons"
import { get, post, subscribeEvents } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import posthog from "posthog-js"

function Ticks({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={13} className="text-primary" />
  if (status === "delivered") return <CheckCheck size={13} className="opacity-60" />
  return <Check size={13} className="opacity-60" />
}

function ChatsInner() {
  const params = useSearchParams()
  const router = useRouter()
  const selectedId = params.get("c") ? Number(params.get("c")) : null

  const [convos, setConvos] = useState<any[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [thread, setThread] = useState<any | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [readyMessages, setReadyMessages] = useState<any[]>([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadConvos = useCallback(() => {
    setListError(false)
    get("/chats")
      .then((r) => setConvos(r.items ?? r))
      .catch(() => setListError(true))
      .finally(() => setListLoading(false))
  }, [])

  const loadThread = useCallback((id: number) => {
    get(`/chats/${id}`).then(setThread).catch(() => toastError("Couldn't open this chat"))
  }, [])

  const loadOlder = useCallback(async () => {
    if (!thread?.has_more || !thread?.oldest_id || loadingOlder) return
    setLoadingOlder(true)
    try {
      const older = await get(`/chats/${thread.customer.id}?before_id=${thread.oldest_id}`)
      setThread((t: any) => t && ({
        ...t,
        has_more: older.has_more,
        oldest_id: older.oldest_id ?? t.oldest_id,
        messages: [...older.messages, ...t.messages],
      }))
    } catch {
      toastError("Couldn't load earlier messages")
    } finally {
      setLoadingOlder(false)
    }
  }, [thread, loadingOlder])

  useEffect(() => {
    loadConvos()
    get("/ready-messages").then(setReadyMessages).catch(() => {})
  }, [loadConvos])

  useEffect(() => {
    setThread(null)
    if (selectedId) loadThread(selectedId)
    setError("")
  }, [selectedId, loadThread])

  useEffect(() => {
    const unsub = subscribeEvents((e) => {
      loadConvos()
      if (selectedId && e.customer_id === selectedId) loadThread(selectedId)
    })
    return unsub
  }, [selectedId, loadConvos, loadThread])

  const lastMsgId = thread?.messages?.[thread.messages.length - 1]?.id
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lastMsgId])

  const windowOpen = thread?.window?.open ?? false

  const sendText = async () => {
    if (!selectedId || !text.trim()) return
    setSending(true)
    setError("")
    try {
      await post(`/chats/${selectedId}/send`, { text: text.trim() })
      posthog.capture("chat_message_sent", { message_type: "freeform" })
      setText("")
      loadThread(selectedId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send"
      setError(msg)
      toastError(msg)
    } finally {
      setSending(false)
    }
  }

  const sendReady = async (rmId: number) => {
    if (!selectedId) return
    setSending(true)
    setError("")
    try {
      await post(`/chats/${selectedId}/send-ready`, { ready_message_id: rmId })
      posthog.capture("ready_message_sent")
      loadThread(selectedId)
      toast("Ready message sent")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send"
      setError(msg)
      toastError(msg)
    } finally {
      setSending(false)
    }
  }

  const filtered = convos.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
  )

  return (
    <Shell title="Chats">
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={cn(
          "w-full md:w-80 md:border-r border-border flex flex-col shrink-0",
          selectedId ? "hidden md:flex" : "",
        )}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Search customers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listLoading && <ChatListSkeleton />}
            {!listLoading && listError && <ErrorState onRetry={loadConvos} />}
            {!listLoading && !listError && filtered.length === 0 && (
              <EmptyState
                icon={<MessageCircle size={26} />}
                title="No chats yet"
                hint="Broadcast to your customers and replies land here."
                action={<Button variant="secondary" onClick={() => router.push("/broadcast?new=1")}>Send a broadcast</Button>}
              />
            )}
            {filtered.map((c) => (
              <button
                key={c.customer_id}
                onClick={() => router.push(`/chats?c=${c.customer_id}`)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 border-b border-border text-left hover:bg-secondary/60 transition-colors",
                  selectedId === c.customer_id && "bg-info-soft/60",
                )}
              >
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm truncate", c.needs_reply ? "font-semibold" : "font-medium")}>{c.name}</span>
                    <span className="text-[11px] text-faint ml-auto shrink-0">{timeAgo(c.last_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground truncate flex-1">{c.last_body}</p>
                    {c.needs_reply && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className={cn("flex-1 flex-col min-w-0", selectedId ? "flex" : "hidden md:flex")}>
          {selectedId && !thread ? (
            <ThreadSkeleton />
          ) : !thread ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={<MessageCircle size={30} />} title="Pick a chat" hint="Choose a customer on the left to see the conversation." />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-3 md:px-4 py-2.5 border-b border-border bg-white">
                <button className="md:hidden p-1 -ml-1 text-muted-foreground" onClick={() => router.push("/chats")}>
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={thread.customer.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{thread.customer.name}</p>
                  <p className="text-[11px] text-muted-foreground">{thread.customer.phone}{thread.customer.area ? ` · ${thread.customer.area}` : ""}</p>
                </div>
                {windowOpen ? (
                  <Chip tone="green"><MessageCircle size={11} /> {windowLeft(thread.window.expires_at)}</Chip>
                ) : (
                  <Chip tone="amber"><Clock size={11} /> Ready message only</Chip>
                )}
              </div>

              <div className="flex-1 overflow-y-auto bg-secondary/40 px-3 md:px-5 py-4 space-y-2">
                {thread.has_more && (
                  <div className="flex justify-center pb-1">
                    <Button variant="secondary" disabled={loadingOlder} onClick={loadOlder} className="h-7 text-xs">
                      {loadingOlder ? "Loading…" : "Load earlier messages"}
                    </Button>
                  </div>
                )}
                {thread.messages.map((m: any) => {
                  const out = m.direction === "out"
                  return (
                    <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[82%] md:max-w-[480px] rounded-lg px-3 py-2 text-sm",
                        out ? "bg-action text-white" : "bg-white border border-border",
                      )}>
                        {m.kind !== "text" && m.ready_label && (
                          <p className={cn("text-[10px] flex items-center gap-1 mb-0.5", out ? "text-white/60" : "text-faint")}>
                            <FileText size={10} /> {m.ready_label}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cn("text-[10px] mt-1 flex items-center gap-1 justify-end", out ? "text-white/60" : "text-faint")}>
                          {timeShort(m.created_at)}
                          {out && <Ticks status={m.status} />}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border bg-white p-3">
                {error && <p className="text-xs text-destructive-text mb-2">{error}</p>}
                {windowOpen ? (
                  <div className="flex items-end gap-2">
                    <Input
                      placeholder="Type a message…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendText()}
                    />
                    <Button onClick={sendText} disabled={sending || !text.trim()} className="h-9 w-10 px-0 shrink-0">
                      <Send size={15} />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock size={12} />
                      Customer hasn't messaged in 24 hours — send a ready message to restart the chat
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {readyMessages.map((rm) => (
                        <Button key={rm.id} variant="secondary" disabled={sending} onClick={() => sendReady(rm.id)}>
                          <FileText size={13} /> {rm.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

export default function ChatsPage() {
  return (
    <Suspense>
      <ChatsInner />
    </Suspense>
  )
}
