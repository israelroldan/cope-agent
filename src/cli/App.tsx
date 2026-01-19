/**
 * COPE Agent CLI - Ink-based Terminal UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { marked } from 'marked';
// @ts-expect-error - no types available
import TerminalRenderer from 'marked-terminal';
import { createCopeAgent } from '../agent.js';
import * as fs from 'fs';
import * as path from 'path';
import { getConfigDir } from '../config/index.js';

// Configure marked with terminal renderer
marked.setOptions({
  renderer: new TerminalRenderer({
    reflowText: true,
    width: 80,
  }),
});

// CLI commands for tab completion
const CLI_COMMANDS = [
  '/quit', '/exit', '/q',
  '/clear', '/c',
  '/status', '/s',
  '/mcp',
  '/credentials',
  '/help', '/h',
];

// Quick commands (natural language triggers)
const QUICK_COMMANDS = [
  'briefing', 'daily briefing',
  'inbox', 'check email', 'email',
  'calendar', "what's on today",
  'priorities', 'tasks',
  'slack', 'messages',
];

// History management
function getHistoryFilePath(): string {
  return path.join(getConfigDir(), '.cope_history');
}

function loadHistory(): string[] {
  try {
    const historyFile = getHistoryFilePath();
    if (fs.existsSync(historyFile)) {
      return fs.readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean);
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistory(history: string[]): void {
  try {
    const toSave = history.slice(-500); // Keep last 500
    fs.writeFileSync(getHistoryFilePath(), toSave.join('\n') + '\n', 'utf-8');
  } catch { /* ignore */ }
}

// Completion helpers
function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

function getCompletions(input: string): string[] {
  const trimmed = input.trimStart();
  if (trimmed.startsWith('/')) {
    return CLI_COMMANDS.filter(cmd => cmd.startsWith(trimmed));
  } else if (trimmed.length > 0) {
    return QUICK_COMMANDS.filter(cmd => cmd.toLowerCase().startsWith(trimmed.toLowerCase()));
  }
  return [];
}

// Message type for chat history display
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Props for the main app
interface AppProps {
  agent: ReturnType<typeof createCopeAgent>;
}

// Text input component with static cursor
const TextInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onTab: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, onChange, onSubmit, onTab, onHistoryUp, onHistoryDown, placeholder, disabled }) => {
  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      onSubmit(value);
    } else if (key.tab) {
      onTab();
    } else if (key.upArrow) {
      onHistoryUp();
    } else if (key.downArrow) {
      onHistoryDown();
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (key.ctrl && input === 'c') {
      // Handled by useApp
    } else if (key.ctrl && input === 'u') {
      onChange('');
    } else if (!key.ctrl && !key.meta && input) {
      onChange(value + input);
    }
  });

  const displayValue = value || (placeholder && !disabled ? placeholder : '');
  const showPlaceholder = !value && placeholder && !disabled;

  return (
    <Text>
      <Text color={showPlaceholder ? 'gray' : undefined}>{displayValue}</Text>
      {!disabled && <Text color="#A82800">▋</Text>}
    </Text>
  );
};

// Spinner component
const Spinner: React.FC<{ label?: string }> = ({ label = 'Thinking' }) => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % frames.length), 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color="#A82800">
      {frames[frame]} {label}...
    </Text>
  );
};

// Main App component
const App: React.FC<AppProps> = ({ agent }) => {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [completions, setCompletions] = useState<string[]>([]);
  const [history] = useState<string[]>(() => loadHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedInput, setSavedInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Handle graceful exit
  const handleExit = useCallback(() => {
    saveHistory(history);
    exit();
    process.exit(0);
  }, [history, exit]);

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      handleExit();
    }
  });

  // Clear status message after delay
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Handle tab completion
  const handleTab = useCallback(() => {
    const candidates = getCompletions(input);

    if (candidates.length === 0) {
      setCompletions([]);
      return;
    }

    if (candidates.length === 1) {
      // Single match - complete it
      setInput(candidates[0] + ' ');
      setCompletions([]);
      return;
    }

    // Multiple matches - find LCP
    const lcp = longestCommonPrefix(candidates);
    if (lcp.length > input.length) {
      // Extend to LCP
      setInput(lcp);
      setCompletions([]);
    } else {
      // Show completions (already at LCP)
      setCompletions(candidates);
    }
  }, [input]);

  // Clear completions when input changes (except from tab)
  const handleInputChange = useCallback((newValue: string) => {
    setInput(newValue);
    setCompletions([]);
    setHistoryIndex(-1);
  }, []);

  // History navigation
  const handleHistoryUp = useCallback(() => {
    if (history.length === 0) return;

    if (historyIndex === -1) {
      setSavedInput(input);
    }

    const newIndex = Math.min(historyIndex + 1, history.length - 1);
    setHistoryIndex(newIndex);
    setInput(history[history.length - 1 - newIndex]);
    setCompletions([]);
  }, [history, historyIndex, input]);

  const handleHistoryDown = useCallback(() => {
    if (historyIndex <= 0) {
      setHistoryIndex(-1);
      setInput(savedInput);
      setCompletions([]);
      return;
    }

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setInput(history[history.length - 1 - newIndex]);
    setCompletions([]);
  }, [history, historyIndex, savedInput]);

  // Handle command submission
  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setInput('');
    setCompletions([]);
    setHistoryIndex(-1);

    // Add to history
    if (trimmed !== history[history.length - 1]) {
      history.push(trimmed);
    }

    // Handle exit commands
    const exitPhrases = ['exit', 'quit', 'bye', 'goodbye', 'q', '/quit', '/exit', '/q'];
    if (exitPhrases.includes(trimmed.toLowerCase())) {
      handleExit();
      return;
    }

    // Handle CLI commands
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.toLowerCase();

      if (cmd === '/clear' || cmd === '/c') {
        setMessages([]);
        agent.clearHistory();
        setStatusMessage('Conversation cleared');
        return;
      }

      if (cmd === '/status' || cmd === '/s') {
        const tokens = agent.estimateContextTokens();
        const msgCount = agent.getHistory().length;
        setStatusMessage(`Messages: ${msgCount} | Est. tokens: ~${tokens}`);
        return;
      }

      if (cmd === '/help' || cmd === '/h') {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Commands:
  /quit, /q     - Exit
  /clear, /c    - Clear conversation
  /status, /s   - Show status
  /help, /h     - Show this help

Tips:
  - Tab for completion
  - Up/Down for history
  - Ctrl+U to clear line
  - Ctrl+C to exit`
        }]);
        return;
      }

      if (cmd === '/mcp' || cmd === '/credentials') {
        setStatusMessage(`Use 'npm start' for full ${cmd} support`);
        return;
      }

      setStatusMessage(`Unknown command: ${trimmed}`);
      return;
    }

    // Send to agent
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setIsLoading(true);

    try {
      const response = await agent.chat(trimmed);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${message}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [agent, history, handleExit]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Banner with ASCII logo */}
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="column">
          <Text color="#A82800">    ████   █████     ██████      █████  </Text>
          <Text color="#A82800">  ██     ██     ██  ██     ██  █░    ██ </Text>
          <Text color="#A82800"> ██     ░█       ██ █       █ ██  ░███  </Text>
          <Text color="#A82800"> ██     ▒█       ██ █       █ ▒███      </Text>
          <Text color="#A82800">  ██▒    ███   ░██  ███   ███ ██   ▒██  </Text>
          <Text color="#A82800">     ███    ▓██     █  ░█▓      ▓███    </Text>
          <Text color="#A82800">                   ▓█                   </Text>
          <Text color="#A82800">                    █                   </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Personal Executive Assistant</Text>
          <Text color="gray" dimColor>  ·  Clarify · Organise · Prioritise · Execute</Text>
        </Box>
      </Box>

      {/* Messages */}
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1}>
          {msg.role === 'user' && (
            <Text>
              <Text color="green" bold>you → </Text>
              <Text>{msg.content}</Text>
            </Text>
          )}
          {msg.role === 'assistant' && (
            <Box flexDirection="column">
              <Text color="#A82800" bold>cope → </Text>
              <Box marginLeft={2} flexDirection="column">
                <Text>{marked(msg.content) as string}</Text>
              </Box>
            </Box>
          )}
          {msg.role === 'system' && (
            <Box marginLeft={2}>
              <Text color="gray">{msg.content}</Text>
            </Box>
          )}
        </Box>
      ))}

      {/* Loading spinner */}
      {isLoading && (
        <Box marginBottom={1} marginLeft={2}>
          <Spinner />
        </Box>
      )}

      {/* Status message */}
      {statusMessage && (
        <Box marginBottom={1} marginLeft={2}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}

      {/* Input box */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={isLoading ? 'gray' : 'cyan'}
        paddingX={1}
        marginTop={1}
      >
        {/* Completions (shown inside box) */}
        {completions.length > 0 && (
          <Box marginBottom={0}>
            <Text color="gray" dimColor>{completions.join('  ')}</Text>
          </Box>
        )}

        {/* Input line */}
        <Box>
          <Text color={isLoading ? 'gray' : 'green'} bold>{isLoading ? '...' : '>'} </Text>
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            onTab={handleTab}
            onHistoryUp={handleHistoryUp}
            onHistoryDown={handleHistoryDown}
            disabled={isLoading}
            placeholder="Type a message or /help"
          />
        </Box>

        {/* Footer hint inside box */}
        <Box>
          <Text color="gray" dimColor>Tab complete · ↑↓ history · Ctrl+C exit</Text>
        </Box>
      </Box>
    </Box>
  );
};

// Export render function
export function renderApp(agent: ReturnType<typeof createCopeAgent>): void {
  render(<App agent={agent} />);
}

export default App;
