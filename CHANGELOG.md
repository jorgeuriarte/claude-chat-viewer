# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2024-05-28

### Fixed
- Silent handling of malformed TODO JSON parsing errors
- Improved JSON extraction from mixed content in tool results
- No more console warnings during HTML generation

### Added
- Demo screenshots in README for better user understanding
- Images folder with example screenshots

## [0.1.0] - 2024-05-28

### Added
- Initial release of Claude Chat Viewer
- Interactive CLI interface for browsing Claude conversations
- Real-time search functionality for filtering conversations
- WhatsApp-style HTML export with beautiful chat interface
- TODO list tracking with special formatting
- Multiple theme options for TODO backgrounds (grid, lines, graph, dots, clean)
- Support for markdown rendering in messages
- Code block syntax highlighting
- Session metadata display (time, duration, message count)
- Date separators in exported conversations
- Automatic browser opening after export

### Features
- Parses JSONL conversation files from `~/.claude/projects/`
- Extracts and displays conversation metadata
- Supports real-time filtering by date, project, content, or session ID
- Generates self-contained HTML exports with embedded CSS
- Preserves conversation context and formatting

### Technical
- Built with Node.js and modern ES modules
- Uses Inquirer.js for interactive CLI interface
- Implements custom JSONL parser for Claude conversation format
- Generates responsive HTML with mobile-friendly design

[0.1.0]: https://github.com/yourusername/claude-chat-viewer/releases/tag/v0.1.0