import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMessage, chatEnabled } from "@/services/chat";
import type { ChatMessage } from "@/services/chat";

export function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !chatEnabled) return;
    if (messages.length === 0) {
      setMessages([
        {
          role: "model",
          text: "Hi! I'm CampusBot 👋 Ask me anything about the OneCampus app — food court timings, how to report an issue, finding teammates, and more!",
        },
      ]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Don't render if no API key configured — after all hooks
  if (!chatEnabled) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError("");
    setBusy(true);

    try {
      // Pass all messages so far as conversation history
      const reply = await sendMessage(messages, text);
      setMessages((prev) => [...prev, { role: "model", text: reply }]);
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="chatbot-root">
      {open && (
        <div className="chatbot-panel" role="dialog" aria-label="Campus assistant">
          <div className="chatbot-header">
            <div className="chatbot-title">
              <Bot size={18} />
              <span>CampusBot</span>
              <small>Alliance University</small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Minimise chat"
              onClick={() => setOpen(false)}
            >
              <Minimize2 size={16} />
            </Button>
          </div>

          <div className="chatbot-messages" aria-live="polite">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chatbot-bubble ${msg.role === "user" ? "chatbot-bubble-user" : "chatbot-bubble-bot"}`}
              >
                {msg.role === "model" && (
                  <span className="chatbot-avatar" aria-hidden>
                    <Bot size={14} />
                  </span>
                )}
                <p>{msg.text}</p>
              </div>
            ))}
            {busy && (
              <div className="chatbot-bubble chatbot-bubble-bot">
                <span className="chatbot-avatar" aria-hidden>
                  <Bot size={14} />
                </span>
                <div className="chatbot-typing" aria-label="CampusBot is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            {error && (
              <p className="chatbot-error" role="alert">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chatbot-input-row">
            <input
              ref={inputRef}
              className="chatbot-input"
              placeholder="Ask anything about campus…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={busy}
              maxLength={500}
              aria-label="Your message"
            />
            <Button
              className="chatbot-send"
              size="icon"
              disabled={busy || !input.trim()}
              onClick={() => void handleSend()}
              aria-label="Send message"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      )}

      <button
        className={`chatbot-fab ${open ? "chatbot-fab-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close campus assistant" : "Open campus assistant"}
        aria-expanded={open}
      >
        {open ? <X size={22} /> : <Bot size={22} />}
      </button>
    </div>
  );
}
