'use client'

import { useChat } from 'ai/react'
import { useEffect, useRef } from 'react'
import styles from './chat.module.css'
import { Send, Bot, User, Sparkles } from 'lucide-react'

function formatMessage(content: string) {
    const parts: JSX.Element[] = []
    let remaining = content
    let key = 0

    while (remaining.length > 0) {
        // Check for code blocks
        const codeMatch = remaining.match(/```(\w*)\n([\s\S]*?)```/)
        // Check for markdown tables
        const tableMatch = remaining.match(/(\|.+\|)\n(\|[\s-:|]+\|)\n((?:\|.+\|\n?)+)/)

        let nextMatch: { index: number; type: string; match: RegExpMatchArray } | null = null

        if (codeMatch?.index !== undefined) {
            nextMatch = { index: codeMatch.index, type: 'code', match: codeMatch }
        }
        if (tableMatch?.index !== undefined) {
            if (!nextMatch || tableMatch.index < nextMatch.index) {
                nextMatch = { index: tableMatch.index, type: 'table', match: tableMatch }
            }
        }

        if (!nextMatch) {
            // No more special content — render rest as text
            if (remaining.trim()) {
                parts.push(
                    <span key={key++} dangerouslySetInnerHTML={{
                        __html: remaining
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                    }} />
                )
            }
            break
        }

        // Add text before the match
        const before = remaining.substring(0, nextMatch.index)
        if (before.trim()) {
            parts.push(
                <span key={key++} dangerouslySetInnerHTML={{
                    __html: before
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br/>')
                }} />
            )
        }

        if (nextMatch.type === 'code') {
            const lang = nextMatch.match[1]
            const code = nextMatch.match[2]
            parts.push(
                <pre key={key++} className={styles.codeBlock}>
                    {lang && <span className={styles.codeLang}>{lang}</span>}
                    <code>{code}</code>
                </pre>
            )
            remaining = remaining.substring(nextMatch.index + nextMatch.match[0].length)
        } else if (nextMatch.type === 'table') {
            const headerRow = nextMatch.match[1]
            const dataRows = nextMatch.match[3].trim().split('\n')
            const headers = headerRow.split('|').filter(h => h.trim()).map(h => h.trim())
            const rows = dataRows.map(row =>
                row.split('|').filter(c => c.trim() !== '').map(c => c.trim())
            )

            parts.push(
                <div key={key++} className={styles.tableWrapper}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                {headers.map((h, i) => <th key={i}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    {row.map((cell, j) => <td key={j}>{cell}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
            remaining = remaining.substring(nextMatch.index + nextMatch.match[0].length)
        }
    }

    return <>{parts}</>
}

export default function ChatPage() {
    const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
        api: '/api/chat',
    })

    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    return (
        <div className={styles.container}>
            <div className={`${styles.chatBox} glass`}>
                <div className={styles.messages}>
                    {messages.length === 0 && (
                        <div className={styles.empty}>
                            <Sparkles size={48} className={styles.sparkle} />
                            <h2>How can I help you today?</h2>
                            <p>Ask me about grades, attendance, or student performance.</p>
                            <div className={styles.suggestions}>
                                <button onClick={() => append({ role: 'user', content: 'Show me the average grade for Grade 10' })}>
                                    Average grade for Grade 10
                                </button>
                                <button onClick={() => append({ role: 'user', content: 'How many students were absent yesterday?' })}>
                                    Absences yesterday
                                </button>
                                <button onClick={() => append({ role: 'user', content: 'Who are the top performing students?' })}>
                                    Top performers
                                </button>
                                <button onClick={() => append({ role: 'user', content: 'Show attendance summary by grade level' })}>
                                    Attendance by grade
                                </button>
                            </div>
                        </div>
                    )}

                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={`${styles.message} ${m.role === 'user' ? styles.userMessage : styles.botMessage}`}
                        >
                            <div className={styles.avatar}>
                                {m.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                            </div>
                            <div className={styles.messageContent}>
                                {m.role === 'assistant' ? formatMessage(m.content) : <p>{m.content}</p>}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className={`${styles.message} ${styles.botMessage}`}>
                            <div className={styles.avatar}>
                                <Bot size={20} />
                            </div>
                            <div className={styles.messageContent}>
                                <div className={styles.typing}>
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} className={styles.inputArea}>
                    <input
                        className="input-field"
                        value={input}
                        placeholder="Ask about grades, attendance, students..."
                        onChange={handleInputChange}
                    />
                    <button type="submit" className="btn-primary" disabled={isLoading}>
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    )
}
