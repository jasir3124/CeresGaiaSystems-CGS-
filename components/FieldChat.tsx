'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import type { ChatContext, ChatMessage, ChatSource } from '@/lib/field-chat';

type DisplayMessage = ChatMessage & { sources?: ChatSource[] };
type Props = {
  open: boolean;
  field: ChatContext | null;
  fields: { id: string; name: string }[];
  activeFieldId: string | null;
  onSelectField: (id: string) => void;
  onClose: () => void;
};
const suggestions = ['What do the latest observations tell me about this field?', 'How might the weather affect my crops?', 'What should I consider for the next planting?'];

export default function FieldChat({ open, field, fields, activeFieldId, onSelectField, onClose }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  async function ask(text: string) {
    if (!field || loading || !text.trim()) return;
    const next: DisplayMessage[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages(next); setQuestion(''); setLoading(true); setError(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, messages: next.slice(-19).map(({ role, content }) => ({ role, content })) }),
        signal: abort.signal
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'The assistant is unavailable. Please try again.');
      setMessages([...next, { role: 'assistant', content: json.answer, sources: json.sources }]);
    } catch (cause) {
      if (abort.signal.aborted) return;
      setMessages(next.slice(0, -1)); setQuestion(text);
      setError(cause instanceof Error ? cause.message : 'Could not send your question.');
    } finally { if (!abort.signal.aborted) setLoading(false); }
  }

  return <section hidden={!open} aria-labelledby="field-chat-title" className="absolute bottom-3 left-[calc(var(--sidebar-width)+14px)] right-3 top-3 z-30 flex flex-col overflow-hidden rounded-2xl border border-[#dbe6da] dark:border-[#364b40] bg-[#fbfcf9] dark:bg-[#1b2b23] shadow-2xl sm:right-auto sm:w-[min(540px,var(--map-panel-width))] md:left-[calc(var(--sidebar-width)+14px)]" style={!open ? { display: 'none' } : undefined}>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-[#eaf3e5] dark:bg-[#263b2e] p-2 text-[#397c58] dark:text-[#9dd6b3]"><MessageCircle size={22}/></span><div><h2 id="field-chat-title" className="font-bold text-[#2b5038] dark:text-[#e2ece5]">CGS Assistant</h2><p className="text-xs text-[#71836f] dark:text-[#9dd6b3]">Ask about your land and crops</p></div></div>
      <button type="button" onClick={onClose} aria-label="Close field assistant" className="rounded-lg p-2 text-[#71836f] dark:text-[#9dd6b3] hover:bg-[#edf3e9] dark:hover:bg-[#263b2e]"><X size={20}/></button>
    </header>
    <div className="shrink-0 border-b border-[#e3ebe0] dark:border-[#364b40] p-4">
      <label htmlFor="chat-field" className="text-xs font-semibold text-[#2b5038] dark:text-[#e2ece5]">Field context</label>
      <select id="chat-field" value={activeFieldId ?? ''} onChange={event => onSelectField(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] px-3 py-2 text-sm text-[#2b5038] dark:text-[#e2ece5]">
        <option value="" disabled>{field && !activeFieldId ? field.name : 'Select a saved field'}</option>
        {fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {field ? <p className="mt-2 text-xs text-[#71836f] dark:text-[#9dd6b3]">{field.point[1].toFixed(4)}, {field.point[0].toFixed(4)} · {field.cropHistory.length} crop records · NASA + weather</p> : <p className="mt-2 text-xs text-[#71836f] dark:text-[#9dd6b3]">Select a field above or a location in Explore to begin.</p>}
      <p className="mt-1 text-[11px] text-[#71836f] dark:text-[#9dd6b3]">Changing field starts a new chat. Closing this tab keeps the current chat until you reload.</p>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {!messages.length && <div className="py-3">
        <h3 className="font-semibold text-[#2b5038] dark:text-[#e2ece5]">Your field, with context</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#71836f] dark:text-[#9dd6b3]">Ask about temperature, humidity, rainfall, soil wetness, or your planting history. I can look up more NASA historical data when needed.</p>
        <div className="mt-4 space-y-2">{suggestions.map(text => <button key={text} type="button" disabled={!field || loading} onClick={() => void ask(text)} className="block w-full rounded-xl border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-3 text-left text-xs text-[#397c58] dark:text-[#9dd6b3] hover:bg-[#edf4e7] dark:hover:bg-[#263b2e] disabled:opacity-40">{text}</button>)}</div>
      </div>}
      <div role="log" aria-label="Field assistant conversation" aria-live="polite" className="space-y-4">
        {messages.map((message, index) => <article key={index} className={`rounded-xl p-3 text-sm ${message.role === 'user' ? 'ml-6 bg-[#286048] text-white' : 'mr-2 border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] text-[#2b5038] dark:text-[#e2ece5]'}`}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-70">{message.role === 'user' ? 'You' : 'CGS Assistant'}</p>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          {!!message.sources?.length && <details className="mt-3 border-t border-[#e3ebe0] dark:border-[#364b40] pt-2 text-xs"><summary className="cursor-pointer font-semibold">Data sources used</summary><ul className="mt-2 space-y-2">{message.sources.map((source, i) => <li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[#397c58] dark:text-[#9dd6b3] underline">{source.label}</a></li>)}</ul></details>}
        </article>)}
        {loading && <p role="status" className="flex items-center gap-2 text-xs text-[#71836f] dark:text-[#9dd6b3]"><LoaderCircle size={16} className="animate-spin"/> Checking field data and preparing your answer...</p>}
      </div>
      <div ref={bottom}/>
    </div>
    <div className="shrink-0 border-t border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-3">
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 dark:bg-[#342722] p-3 text-xs text-red-700 dark:text-red-300">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); void ask(question); }} className="flex items-end gap-2">
        <label htmlFor="chat-question" className="sr-only">Ask a question about this field</label>
        <textarea ref={input} id="chat-question" rows={2} maxLength={6000} disabled={!field || loading} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); } }} placeholder={field ? 'Ask about this field...' : 'Select a field to start chatting'} className="min-w-0 flex-1 resize-none rounded-xl border border-[#dbe6da] dark:border-[#364b40] px-3 py-2 text-sm text-[#2b5038] dark:text-[#e2ece5] outline-none focus:border-[#397c58] disabled:bg-[#f5f7f3]"/>
        <button type="submit" aria-label="Send question" disabled={!field || loading || !question.trim()} className="rounded-xl bg-[#286048] p-3 text-white disabled:opacity-40"><Send size={18}/></button>
      </form>
      <p className="mt-2 text-[10px] leading-relaxed text-[#71836f] dark:text-[#9dd6b3]">Powered by Gemini. Sending shares this chat, field location, crop history, and retrieved data with Google. Free-tier data may be used to improve Google products. AI suggestions can be mistaken.</p>
    </div>
  </section>;
}
