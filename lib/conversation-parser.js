const fs = require('fs');
const path = require('path');
const os = require('os');

class ConversationParser {
    constructor() {
        this.claudeDir = path.join(os.homedir(), '.claude', 'projects');
    }

    /**
     * Get all conversation files from the Claude directory
     */
    async getAllConversations() {
        if (!fs.existsSync(this.claudeDir)) {
            throw new Error('Claude directory not found. Make sure Claude Code has been used.');
        }

        const conversations = [];
        const sessionMap = new Map(); // To track unique sessions
        const projectDirs = fs.readdirSync(this.claudeDir);

        for (const projectDir of projectDirs) {
            const projectPath = path.join(this.claudeDir, projectDir);
            if (!fs.statSync(projectPath).isDirectory()) continue;

            const files = fs.readdirSync(projectPath);
            const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

            for (const file of jsonlFiles) {
                const filePath = path.join(projectPath, file);
                try {
                    const conversation = await this.parseConversation(filePath, projectDir);
                    if (conversation) {
                        // Check if we already have this session
                        const existingSession = sessionMap.get(conversation.actualSessionId);
                        if (existingSession) {
                            // Keep the one with more messages or newer timestamp
                            if (conversation.messageCount > existingSession.messageCount || 
                                new Date(conversation.startTime) > new Date(existingSession.startTime)) {
                                sessionMap.set(conversation.actualSessionId, conversation);
                            }
                        } else {
                            sessionMap.set(conversation.actualSessionId, conversation);
                        }
                    }
                } catch (error) {
                    console.warn(`Warning: Could not parse ${filePath}: ${error.message}`);
                }
            }
        }

        // Convert map to array and sort by start time (newest first)
        return Array.from(sessionMap.values()).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    }

    /**
     * Parse a single conversation file
     */
    async parseConversation(filePath, projectName) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        if (lines.length === 0) return null;

        const messages = [];
        const userPrompts = [];
        let startTime = null;
        let endTime = null;
        let actualSessionId = null;

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                
                // Skip meta messages
                if (data.isMeta) continue;

                const timestamp = data.timestamp;
                if (!startTime) startTime = timestamp;
                endTime = timestamp;

                // Extract actual session ID from data
                if (!actualSessionId && data.sessionId) {
                    actualSessionId = data.sessionId;
                }

                if (data.type === 'user') {
                    const content = this.extractUserContent(data);
                    if (content && content.trim()) {
                        // Skip CLAUDE.md init messages and continuation messages
                        if (!content.includes('init is analyzing your codebase') && 
                            !content.includes('This session is being continued from a previous conversation')) {
                            userPrompts.push({
                                content: content.trim(),
                                timestamp
                            });
                        }
                    }
                    // Note: Don't count tool-only messages as user prompts since they're system responses
                }

                messages.push(data);
            } catch (error) {
                // Skip invalid JSON lines
                continue;
            }
        }

        // Get first meaningful user prompt
        const firstPrompt = userPrompts.length > 0 ? userPrompts[0].content : 'No user content found';
        
        // Get first 5 prompts for indexing
        const firstFivePrompts = userPrompts.slice(0, 5).map(p => p.content).join(' ');

        return {
            filePath,
            projectName: this.cleanProjectName(projectName),
            sessionId: path.basename(filePath, '.jsonl'),
            actualSessionId: actualSessionId || path.basename(filePath, '.jsonl'), // Fallback to filename
            startTime,
            endTime,
            messageCount: messages.length,
            userPromptCount: userPrompts.length,
            firstPrompt: this.truncateText(firstPrompt, 120),
            searchText: firstFivePrompts.toLowerCase(),
            fullFirstPrompt: firstPrompt,
            userPrompts: userPrompts.slice(0, 5) // Keep first 5 for summary
        };
    }

    /**
     * Extract meaningful content from user message
     */
    extractUserContent(data) {
        const message = data.message || {};
        const content = message.content;

        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            const textParts = [];
            
            for (const item of content) {
                if (item.type === 'text') {
                    textParts.push(item.text);
                }
                // Note: Don't include tool_result in user content - those are system responses
            }
            
            return textParts.join('\n');
        }

        return '';
    }

    /**
     * Clean project name for display
     */
    cleanProjectName(projectName) {
        return projectName
            .replace(/^-/, '')
            .replace(/-/g, '/')
            .replace(/^Volumes\/DevelopmentProjects\//, '')
            .replace(/^Users\/[^\/]+\//, '~/');
    }

    /**
     * Truncate text to specified length
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Filter conversations by search term
     */
    filterConversations(conversations, searchTerm) {
        if (!searchTerm) return conversations;
        
        const term = searchTerm.toLowerCase();
        return conversations.filter(conv => 
            conv.searchText.includes(term) || 
            conv.projectName.toLowerCase().includes(term)
        );
    }

    /**
     * Format date for display
     */
    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Format date for listing (compact format)
     */
    formatDateCompact(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Get conversation summary for preview
     */
    getConversationSummary(conversation) {
        const start = this.formatDate(conversation.startTime);
        const end = this.formatDate(conversation.endTime);
        const duration = this.calculateDuration(conversation.startTime, conversation.endTime);
        
        let summary = `📂 Proyecto: ${conversation.projectName}\n`;
        summary += `📅 Inicio: ${start}\n`;
        summary += `⏰ Fin: ${end}\n`;
        summary += `⏱️  Duración: ${duration}\n`;
        summary += `💬 Mensajes: ${conversation.messageCount} (${conversation.userPromptCount} del usuario)\n\n`;
        
        summary += `🎯 Primer prompt:\n"${conversation.fullFirstPrompt}"\n`;
        
        if (conversation.userPrompts.length > 1) {
            summary += `\n📝 Siguientes prompts:\n`;
            conversation.userPrompts.slice(1).forEach((prompt, i) => {
                summary += `${i + 2}. ${this.truncateText(prompt.content, 80)}\n`;
            });
        }

        return summary;
    }

    /**
     * Calculate duration between two timestamps
     */
    calculateDuration(start, end) {
        const diff = new Date(end) - new Date(start);
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
}

module.exports = ConversationParser;