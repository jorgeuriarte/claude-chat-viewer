const fs = require('fs');
const path = require('path');
const os = require('os');

class HtmlGenerator {
    constructor() {
        this.claudeTodosDir = path.join(os.homedir(), '.claude', 'todos');
    }

    /**
     * Load TODO content for a session
     */
    loadTodoContent(sessionId) {
        try {
            const todoPath = path.join(this.claudeTodosDir, `${sessionId}.json`);
            if (fs.existsSync(todoPath)) {
                const todoContent = fs.readFileSync(todoPath, 'utf-8');
                const todos = JSON.parse(todoContent);
                return this.formatTodos(todos);
            }
        } catch (error) {
            console.warn(`Could not load TODOs for session ${sessionId}: ${error.message}`);
        }
        return null;
    }

    /**
     * Format TODO array into readable text
     */
    formatTodos(todos) {
        if (!Array.isArray(todos) || todos.length === 0) {
            return 'No tasks found';
        }

        const statusEmojis = {
            'pending': '⬜',
            'in_progress': '🔄', 
            'completed': '✅',
            'cancelled': '❌'
        };

        const priorityEmojis = {
            'high': '⭐',
            'medium': '◆',
            'low': '○'
        };

        let formatted = `📋 **TODO List** (${todos.length} tasks)\n\n`;
        
        todos.forEach(todo => {
            const statusEmoji = statusEmojis[todo.status] || '❓';
            const priorityEmoji = priorityEmojis[todo.priority] || '⚪';
            formatted += `${statusEmoji} ${priorityEmoji} ${todo.content}\n`;
        });

        return formatted;
    }

    /**
     * Extract TODO content from tool result data
     */
    extractTodoFromToolResult(data) {
        try {
            // Check if this has toolUseResult with newTodos
            if (data.toolUseResult && data.toolUseResult.newTodos) {
                return this.formatTodos(data.toolUseResult.newTodos);
            }
            
            // Fallback: try to parse from content if it contains JSON
            const content = data.message?.content;
            if (Array.isArray(content)) {
                for (const item of content) {
                    if (item.type === 'tool_result' && item.content) {
                        // Try to find JSON in the content
                        const jsonMatch = item.content.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                            const todos = JSON.parse(jsonMatch[0]);
                            return this.formatTodos(todos);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Could not parse TODO from tool result: ${error.message}`);
        }
        return null;
    }

    /**
     * Parse JSONL conversation file and extract messages
     */
    parseJsonlConversation(jsonlPath) {
        const content = fs.readFileSync(jsonlPath, 'utf-8');
        const lines = content.trim().split('\n');
        const rawMessages = [];
        
        // Extract session ID from the file for TODO loading
        let sessionId = null;
        try {
            const firstLine = JSON.parse(lines[0]);
            sessionId = firstLine.sessionId;
        } catch (error) {
            // Fallback to filename
            sessionId = path.basename(jsonlPath, '.jsonl');
        }

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                
                // Skip meta messages
                if (data.isMeta) continue;
                
                const timestamp = data.timestamp || '';
                const msgType = data.type || '';
                
                if (msgType === 'user') {
                    const content = data.message?.content || '';
                    if (Array.isArray(content)) {
                        const textParts = [];
                        let hasToolResults = false;
                        
                        for (const item of content) {
                            if (item.type === 'text') {
                                const text = item.text || '';
                                // Skip CLAUDE.md init messages
                                if (text.includes('init is analyzing your codebase') && text.includes('CLAUDE.md')) {
                                    continue;
                                }
                                if (text.includes('This session is being continued from a previous conversation')) {
                                    continue;
                                }
                                textParts.push(text);
                            } else if (item.type === 'tool_result') {
                                hasToolResults = true;
                                // Handle tool results - these are Claude's responses to tools
                                if (item.content === '' && !item.is_error) {
                                    rawMessages.push({
                                        type: 'system',
                                        content: 'Command executed successfully with no output',
                                        timestamp
                                    });
                                } else if (item.content) {
                                    // Check if this is a TODO message
                                    const isTodoMessage = item.content.includes('Todos have been modified successfully') || 
                                                         item.content.includes('"status":') ||
                                                         item.content.includes('"priority":');
                                    
                                    // Limit long outputs
                                    let limitedContent = item.content;
                                    const lines = limitedContent.split('\n');
                                    
                                    // For TODO messages, try to extract actual TODO content from this specific tool result
                                    if (isTodoMessage) {
                                        const actualTodoContent = this.extractTodoFromToolResult(data);
                                        if (actualTodoContent) {
                                            limitedContent = actualTodoContent;
                                        } else {
                                            // Fallback to original processing
                                            const processedLines = lines.map(line => {
                                                if (line.length > 300) {
                                                    return line.substring(0, 297) + '...';
                                                }
                                                return line;
                                            });
                                            limitedContent = processedLines.join('\n');
                                        }
                                    } else {
                                        // Limit number of lines
                                        if (lines.length > 6) {
                                            limitedContent = lines.slice(0, 3).join('\n') + '\n...\n' + lines.slice(-2).join('\n');
                                        }
                                        
                                        // Also limit very long single lines
                                        const processedLines = limitedContent.split('\n').map(line => {
                                            if (line.length > 200) {
                                                return line.substring(0, 197) + '...';
                                            }
                                            return line;
                                        });
                                        limitedContent = processedLines.join('\n');
                                    }
                                    
                                    rawMessages.push({
                                        type: isTodoMessage ? 'todo' : 'system',
                                        content: limitedContent,
                                        timestamp
                                    });
                                }
                            }
                        }
                        
                        // Only add user message if there are actual text parts from user
                        const userContent = textParts.join('\n').trim();
                        if (userContent) {
                            rawMessages.push({
                                type: 'user',
                                content: userContent,
                                timestamp
                            });
                        }
                        // Note: Tool results are already added as system messages above
                    } else if (typeof content === 'string' && content.trim()) {
                        // Handle string content
                        if (!content.includes('init is analyzing your codebase') && 
                            !content.includes('This session is being continued from a previous conversation')) {
                            rawMessages.push({
                                type: 'user',
                                content: content,
                                timestamp
                            });
                        }
                    }
                } else if (msgType === 'assistant') {
                    const msgData = data.message || {};
                    const contentList = msgData.content || [];
                    
                    const textParts = [];
                    for (const item of contentList) {
                        if (item.type === 'text') {
                            textParts.push(item.text || '');
                        }
                    }
                    
                    if (textParts.length > 0) {
                        rawMessages.push({
                            type: 'assistant',
                            content: textParts.join('\n'),
                            timestamp
                        });
                    }
                }
            } catch (error) {
                // Skip invalid JSON lines
                continue;
            }
        }

        return this.groupConsecutiveSystemMessages(rawMessages);
    }

    /**
     * Group consecutive system messages and limit them to max 3
     */
    groupConsecutiveSystemMessages(messages) {
        const result = [];
        let i = 0;

        while (i < messages.length) {
            if (messages[i].type === 'system') {
                // Find consecutive system messages (but not TODOs)
                const systemGroup = [];
                while (i < messages.length && messages[i].type === 'system') {
                    systemGroup.push(messages[i]);
                    i++;
                }

                // Process the group
                if (systemGroup.length <= 2) {
                    // Add all messages as is
                    result.push(...systemGroup);
                } else {
                    // Add first message
                    result.push(systemGroup[0]);
                    
                    // Add ellipsis message
                    result.push({
                        type: 'system',
                        content: '...',
                        timestamp: systemGroup[1].timestamp
                    });
                    
                    // Add last message
                    result.push(systemGroup[systemGroup.length - 1]);
                }
            } else if (messages[i].type === 'todo') {
                // TODOs are always shown individually, never grouped
                result.push(messages[i]);
                i++;
            } else {
                result.push(messages[i]);
                i++;
            }
        }

        return result;
    }

    /**
     * Get TODO background styles for different themes
     */
    getTodoBackgroundStyles(theme) {
        const themes = {
            grid: `
                background-image: 
                    linear-gradient(to right, #e0e0e0 1px, transparent 1px),
                    linear-gradient(to bottom, #e0e0e0 1px, transparent 1px);
                background-size: 12px 12px;`,
            lines: `
                background-image: 
                    linear-gradient(to bottom, transparent 19px, #d0d0d0 20px);
                background-size: 100% 20px;`,
            graph: `
                background-image: 
                    linear-gradient(to right, #e8e8e8 1px, transparent 1px),
                    linear-gradient(to bottom, #e8e8e8 1px, transparent 1px),
                    linear-gradient(to right, #d0d0d0 1px, transparent 1px),
                    linear-gradient(to bottom, #d0d0d0 1px, transparent 1px);
                background-size: 5px 5px, 5px 5px, 25px 25px, 25px 25px;`,
            dots: `
                background-image: 
                    radial-gradient(circle, #c0c0c0 1px, transparent 1px);
                background-size: 15px 15px;
                background-position: 7.5px 7.5px;`,
            clean: '' // No background
        };
        
        return themes[theme] || themes.grid;
    }

    /**
     * Generate HTML with embedded conversation data
     */
    generateHtml(messages, outputPath, todoTheme = 'grid') {
        const htmlTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Conversation Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #e5ddd5;
            background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2UwZTBlMCIgb3BhY2l0eT0iMC4yIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+');
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #f0f0f0;
            min-height: 100vh;
        }
        
        .header {
            background-color: #075e54;
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        
        .header h1 {
            font-size: 19px;
            font-weight: 500;
            margin-left: 15px;
        }
        
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background-color: #25d366;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }
        
        .chat-container {
            padding: 20px;
            padding-bottom: 80px;
        }
        
        .message {
            margin-bottom: 12px;
            display: flex;
            align-items: flex-end;
            animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .message.user {
            justify-content: flex-end;
        }
        
        .message.assistant {
            justify-content: flex-start;
        }
        
        .message.system {
            justify-content: flex-start;
            margin: 8px 0;
        }
        
        .message.todo {
            justify-content: flex-start;
            margin: 12px 0;
        }
        
        .message-bubble {
            max-width: 65%;
            padding: 8px 12px;
            border-radius: 7.5px;
            position: relative;
            word-wrap: break-word;
            white-space: pre-wrap;
            font-size: 14.5px;
            line-height: 1.4;
        }
        
        .user .message-bubble {
            background-color: #dcf8c6;
            margin-right: 8px;
        }
        
        .assistant .message-bubble {
            background-color: white;
            margin-left: 8px;
        }
        
        .system .message-bubble {
            background-color: #f0f0f0;
            border: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            max-width: 80%;
            margin-left: 20px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }
        
        .todo .message-bubble {
            background-color: #f5f7fa;
            ${this.getTodoBackgroundStyles(todoTheme)}
            border: 1px solid #607d8b;
            border-left: 4px solid #607d8b;
            font-size: 13px;
            color: #37474f;
            max-width: 85%;
            margin-left: 20px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            position: relative;
        }
        
        .todo .message-bubble::before {
            content: "📋 TODO";
            position: absolute;
            top: -8px;
            left: 8px;
            background-color: #607d8b;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
        }
        
        .timestamp {
            font-size: 11px;
            color: #667781;
            margin-top: 4px;
            text-align: right;
        }
        
        .user .timestamp {
            text-align: right;
        }
        
        .assistant .timestamp {
            text-align: left;
        }
        
        .system .timestamp {
            text-align: left;
            font-size: 10px;
        }
        
        .todo .timestamp {
            text-align: left;
            font-size: 10px;
            margin-top: 8px;
        }
        
        .date-divider {
            text-align: center;
            margin: 20px 0;
            position: relative;
        }
        
        .date-divider span {
            background-color: #e1f3fb;
            padding: 5px 12px;
            border-radius: 7.5px;
            font-size: 12.5px;
            color: #54656f;
            display: inline-block;
        }
        
        /* Código y formato */
        pre {
            background-color: #f4f4f4;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 8px 0;
        }
        
        code {
            background-color: #f4f4f4;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 13px;
        }
        
        /* Responsivo */
        @media (max-width: 600px) {
            .message-bubble {
                max-width: 80%;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="avatar">C</div>
            <h1>Claude Conversation</h1>
        </div>
        <div class="chat-container" id="chat">
            <!-- Messages will be inserted here -->
        </div>
    </div>
    
    <script>
        // Embedded conversation data
        const conversationData = ${JSON.stringify(messages).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/'/g, '\\u0027')};
        
        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        }
        
        function formatDate(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function processMarkdown(text) {
            let processed = text;
            
            // First, temporarily replace code blocks to protect them
            const codeBlocks = [];
            processed = processed.replace(/\`\`\`([\\\\s\\\\S]*?)\`\`\`/g, (match, code) => {
                codeBlocks.push('<pre><code>' + escapeHtml(code) + '</code></pre>');
                return '___CODEBLOCK_' + (codeBlocks.length - 1) + '___';
            });
            
            // Handle inline code
            processed = processed.replace(/\`([^\\\`]+)\`/g, (match, code) => {
                return '<code>' + escapeHtml(code) + '</code>';
            });
            
            // Now escape the rest of the HTML
            processed = escapeHtml(processed);
            
            // Bold: **text** or __text__
            processed = processed.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
            processed = processed.replace(/__(.*?)__/g, '<strong>$1</strong>');
            
            // Strikethrough: ~~text~~
            processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');
            
            // Restore code blocks
            processed = processed.replace(/___CODEBLOCK_(\\d+)___/g, (match, index) => {
                return codeBlocks[parseInt(index)];
            });
            
            return processed;
        }
        
        function renderMessages() {
            const chatContainer = document.getElementById('chat');
            let lastDate = null;
            
            conversationData.forEach((msg, index) => {
                // Add date divider if needed
                const msgDate = new Date(msg.timestamp).toDateString();
                if (msgDate !== lastDate) {
                    const dateDivider = document.createElement('div');
                    dateDivider.className = 'date-divider';
                    dateDivider.innerHTML = \`<span>\${formatDate(msg.timestamp)}</span>\`;
                    chatContainer.appendChild(dateDivider);
                    lastDate = msgDate;
                }
                
                // Create message element
                const messageEl = document.createElement('div');
                messageEl.className = \`message \${msg.type}\`;
                
                const bubbleEl = document.createElement('div');
                bubbleEl.className = 'message-bubble';
                
                // Process content to handle markdown (including code blocks)
                let content = processMarkdown(msg.content);
                
                bubbleEl.innerHTML = content;
                
                const timestampEl = document.createElement('div');
                timestampEl.className = 'timestamp';
                timestampEl.textContent = formatTimestamp(msg.timestamp);
                
                bubbleEl.appendChild(timestampEl);
                messageEl.appendChild(bubbleEl);
                chatContainer.appendChild(messageEl);
            });
        }
        
        // Render messages on load
        document.addEventListener('DOMContentLoaded', renderMessages);
    </script>
</body>
</html>`;

        fs.writeFileSync(outputPath, htmlTemplate);
        return outputPath;
    }

    /**
     * Generate HTML for a conversation file
     */
    async generateConversationHtml(jsonlPath, outputDir = './', todoTheme = 'grid') {
        const messages = this.parseJsonlConversation(jsonlPath);
        const filename = `claude-conversation-${Date.now()}.html`;
        const outputPath = path.join(outputDir, filename);
        
        this.generateHtml(messages, outputPath, todoTheme);
        return { outputPath, messageCount: messages.length };
    }
}

module.exports = HtmlGenerator;