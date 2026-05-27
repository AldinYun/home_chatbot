import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, MessageCirclePlus, Save, Send, Settings, Trash2, X } from 'lucide-react';
import './styles.css';

const defaultPrompt = `너는 집에서 편하게 쓰는 한국어 챗봇이야.
반드시 자연스러운 한국어로만 답해. 중국어, 일본어, 러시아어, 베트남어, 영어 단어를 섞지 마.
사용자가 외국어를 요청하지 않는 한 외국어를 사용하지 마.
너 자신에게 별명이나 이름을 붙이지 말고, 모르는 것은 솔직하게 짧게 말해.
말투는 너무 격식 차리지 말고 편하게 하되, 문장은 또렷하게 써.`;

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
  const [includeHistory, setIncludeHistory] = useState(true);
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

  async function deleteSession(id, event) {
    event.stopPropagation();
    if (!window.confirm('이 대화를 삭제할까요?')) return;
    await api(`/sessions/${id}`, { method: 'DELETE' });
    const payload = await api('/sessions');
    setSessions(payload.sessions);
    if (active?.id === id) {
      if (payload.sessions.length) {
        await openSession(payload.sessions[0].id);
      } else {
        setActive(null);
        setMessages([]);
        await newChat();
      }
    }
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
          include_history: includeHistory,
          max_new_tokens: 2048,
          temperature: 0,
          top_p: 1,
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
              <span className="sessionTitle">{session.title}</span>
              <small>{session.last_message || '아직 조용함'}</small>
              <span className="deleteSession" onClick={(event) => deleteSession(session.id, event)} title="대화 삭제">
                <Trash2 size={15} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat">
        <header>
          <button className="iconBtn mobileOnly" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div>
            <h1>{active?.title || '새 대화'}</h1>
            <p>Kanana 1.5 8B · streaming · {includeHistory ? '멀티턴 ON' : '단발 질문'}</p>
          </div>
          <div className="headerActions">
            <label className="memoryToggle">
              <input type="checkbox" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} />
              <span>맥락 기억</span>
            </label>
            <button className="promptBtn" onClick={() => setPromptOpen(true)}><Settings size={17} /> 시스템 프롬프트</button>
          </div>
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
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              </div>
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
