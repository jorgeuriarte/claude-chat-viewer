#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const HtmlGenerator = require('../lib/html-generator');

// Create test JSONL file with various TODO scenarios
const testJsonlContent = `
{"timestamp":"2024-01-01T10:00:00Z","type":"user","message":{"content":"Create a todo list"}}
{"timestamp":"2024-01-01T10:00:05Z","type":"assistant","message":{"content":[{"type":"text","text":"I'll create a todo list for you."}]}}
{"timestamp":"2024-01-01T10:00:10Z","type":"user","message":{"content":[{"type":"tool_result","content":"[todo.status"}]}}
{"timestamp":"2024-01-01T10:00:15Z","type":"user","message":{"content":[{"type":"tool_result","content":"[\\"status\\": \\"pending\\", \\"priority\\": \\"high\\", \\"content\\": \\"Test incomplete JSON\\""}]}}
{"timestamp":"2024-01-01T10:00:20Z","type":"user","message":{"content":[{"type":"tool_result","content":"Todos have been modified successfully:\\n[{\\"status\\": \\"pending\\", \\"priority\\": \\"high\\", \\"content\\": \\"Complete project\\", \\"id\\": \\"1\\"}]"}]}}
{"timestamp":"2024-01-01T10:00:25Z","type":"user","message":{"content":[{"type":"tool_result","content":"[{\\"status\\": \\"completed\\", \\"priority\\": \\"medium\\", \\"content\\": \\"Review code\\", \\"id\\": \\"2\\"}] extra text after JSON"}]}}
`.trim();

// Write test file
const testFile = path.join(__dirname, 'test-todos.jsonl');
fs.writeFileSync(testFile, testJsonlContent);

console.log('Testing full HTML generation flow with problematic TODO data...\n');

try {
    const generator = new HtmlGenerator();
    const messages = generator.parseJsonlConversation(testFile);
    
    console.log(`Parsed ${messages.length} messages successfully`);
    console.log('\nMessage types:');
    messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.type}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`);
    });
    
    // Generate HTML
    const outputFile = path.join(__dirname, 'test-output.html');
    generator.generateHtml(messages, outputFile);
    
    console.log(`\n✅ HTML generated successfully: ${outputFile}`);
    console.log('\nNo JSON parsing errors should have been shown to the console!');
    
} catch (error) {
    console.error('❌ Error during processing:', error.message);
} finally {
    // Clean up test file
    if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
    }
}