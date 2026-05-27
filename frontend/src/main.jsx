import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Menu, MessageCirclePlus, Save, Send, Settings, X } from 'lucide-react';
import './styles.css';

const defaultPrompt = '너는 집에서 편하게 쓰는 친근한 한국어 챗봇이야. 과하게 격식 차리지 말고, 필요한 건 분명하게 도와줘.';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || '요청이 실패했어요.');
  }
  return response.json();
}

function App() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt);
  const [promptOpen, setPromptOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function bootstrap() {
    const payload = await api('/sessions');
    if (payload.sessions.length) {
      setSessions(payload.sessions);
      await openSession(payload.sessions[0].id);
      return;
    }
    await newChat();
  }

  async function refreshSessions() {
    const payload = await api('/sessions');
    setSessions(payload.sessions);
  }

  async function newChat() {
    const session = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: '새 대화', system_prompt: systemPrompt || defaultPrompt }),
    });
    await refreshSessions();
    await openSession(session.id);
    setSidebarOpen(false);
  }

  async function openSession(id) {
    const payload = await api(`/sessions/${id}`);
    setActive(payload.session);
    setSystemPrompt(payload.session.system_prompt);
    setMessages(payload.messages);
    setSidebarOpen(false);
  }

  async function savePrompt() {
    if (!active) return;
    const session = await api(`/sessions/${active.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ system_prompt: systemPrompt }),
    });
    setActive(session);
    setPromptOpen(false);
    await refreshSessions();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !active || streaming) return;
    setInput('');
    setError('');
    const userMessage = { role: 'user', content: text };
    const assistantMessage = { role: 'assistant', content: '' };
    setMessages((items) => [...items, userMessage, assistantMessage]);
    setStreaming(true);
    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: active.id,
          message: text,
          max_new_tokens: 2048,
          temperature: 0.7,
          top_p: 0.9,
        }),
      });
      if (!response.ok || !response.body) throw new Error('응답을 시작하지 못했어요.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((items) => {
          const next = [...items];
          next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + chunk };
          return next;
        });
      }
      await refreshSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <main>
      <aside className={sidebarOpen ? 'open' : ''}>
        <div className="sideTop">
          <div className="logo">home chat</div>
          <button className="iconBtn mobileOnly" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <button className="newChat" onClick={newChat}><MessageCirclePlus size={18} /> 새 대화</button>
        <div className="sessionList">
          {sessions.map((session) => (
            <button key={session.id} className={active?.id === session.id ? 'session active' : 'session'} onClick={() => openSession(session.id)}>
              <span>{session.title}</span>
              <small>{session.last_message || '아직 조용함'}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat">
        <header>
          <button className="iconBtn mobileOnly" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div>
            <h1>{active?.title || '새 대화'}</h1>
            <p>Llama 3.2 3B · streaming</p>
          </div>
          <button className="promptBtn" onClick={() => setPromptOpen(true)}><Settings size={17} /> 시스템 프롬프트</button>
        </header>

        <div className="messages">
          {messages.length === 0 && (
            <div className="empty">
              <h2>편하게 물어봐.</h2>
              <p>새 대화는 따로 저장되고, 시스템 프롬프트는 오른쪽 위에서 바꿀 수 있어.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`bubble ${message.role}`} key={`${message.role}-${index}`}>
              <div>{message.content}</div>
            </div>
          ))}
          {streaming && <div className="typing">생각 중...</div>}
          <div ref={bottomRef} />
        </div>

        {error && <div className="error">{error}</div>}
        <div className="composer">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder="메시지 입력..." />
          <button onClick={sendMessage} disabled={!input.trim() || streaming}><Send size={18} /></button>
        </div>
      </section>

      {promptOpen && (
        <div className="modalBackdrop">
          <div className="modal">
            <div className="modalHead">
              <h2>시스템 프롬프트</h2>
              <button className="iconBtn" onClick={() => setPromptOpen(false)}><X size={18} /></button>
            </div>
            <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
            <button className="saveBtn" onClick={savePrompt}><Save size={17} /> 저장하고 적용</button>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

