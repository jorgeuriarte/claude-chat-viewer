#!/usr/bin/env node
const HtmlGenerator = require('../lib/html-generator');

// Create instance
const generator = new HtmlGenerator();

// Test cases that were causing errors
const testCases = [
    {
        name: "Malformed JSON - '[todo.status'",
        data: {
            message: {
                content: [{
                    type: 'tool_result',
                    content: '[todo.status'
                }]
            }
        }
    },
    {
        name: "Incomplete JSON array",
        data: {
            message: {
                content: [{
                    type: 'tool_result',
                    content: '[{"status": "pending", "priority": "high", "content": "Test task"}'
                }]
            }
        }
    },
    {
        name: "JSON with extra content",
        data: {
            message: {
                content: [{
                    type: 'tool_result',
                    content: '[{"status": "pending", "priority": "high", "content": "Test task"}] some extra text after'
                }]
            }
        }
    },
    {
        name: "Valid JSON array",
        data: {
            message: {
                content: [{
                    type: 'tool_result',
                    content: '[{"status": "pending", "priority": "high", "content": "Test task", "id": "1"}]'
                }]
            }
        }
    },
    {
        name: "JSON embedded in text",
        data: {
            message: {
                content: [{
                    type: 'tool_result',
                    content: 'Todos have been modified successfully:\n[{"status": "completed", "priority": "medium", "content": "Fix bugs", "id": "2"}]\nAll done!'
                }]
            }
        }
    }
];

console.log('Testing improved extractTodoFromToolResult method:\n');

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    
    const result = generator.extractTodoFromToolResult(testCase.data);
    
    if (result) {
        console.log('✅ Successfully extracted TODOs:');
        console.log(result);
    } else {
        console.log('❌ Failed to extract TODOs (returned null)');
    }
    console.log('');
});