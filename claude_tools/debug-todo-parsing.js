#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Test cases that are causing JSON parsing errors
const problematicCases = [
    // Case 1: Error at position 11
    '[todo.status',
    
    // Case 2: Partial JSON array
    '[{"status": "pending", "priority": "high", "content": "Test task"}',
    
    // Case 3: Extra content after JSON
    '[{"status": "pending", "priority": "high", "content": "Test task"}] some extra text',
    
    // Case 4: Malformed JSON
    '[{status: "pending", priority: "high", content: "Test task"}]',
    
    // Case 5: Valid JSON
    '[{"status": "pending", "priority": "high", "content": "Test task"}]'
];

console.log('Testing problematic JSON parsing cases:\n');

problematicCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}: "${testCase.substring(0, 50)}${testCase.length > 50 ? '...' : ''}"`);
    
    try {
        // Try basic parsing
        const parsed = JSON.parse(testCase);
        console.log('✅ Basic parsing successful');
        console.log('   Parsed:', parsed);
    } catch (error) {
        console.log('❌ Basic parsing failed:', error.message);
        
        // Try regex extraction
        const jsonMatch = testCase.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            console.log('   Found match with regex:', jsonMatch[0]);
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('   ✅ Regex + parsing successful');
            } catch (e) {
                console.log('   ❌ Regex + parsing failed:', e.message);
            }
        } else {
            console.log('   No JSON array found with regex');
        }
    }
    console.log('');
});

// Test improved extraction logic
console.log('\n=== Testing improved extraction logic ===\n');

function improvedExtractJson(content) {
    try {
        // First try direct parsing
        return JSON.parse(content);
    } catch (error) {
        // Try to find a complete JSON array
        const arrayStartIndex = content.indexOf('[');
        if (arrayStartIndex === -1) {
            throw new Error('No JSON array found');
        }
        
        // Find matching closing bracket
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = arrayStartIndex; i < content.length; i++) {
            const char = content[i];
            
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                escapeNext = true;
                continue;
            }
            
            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }
            
            if (!inString) {
                if (char === '[') depth++;
                if (char === ']') {
                    depth--;
                    if (depth === 0) {
                        // Found complete array
                        const jsonStr = content.substring(arrayStartIndex, i + 1);
                        return JSON.parse(jsonStr);
                    }
                }
            }
        }
        
        throw new Error('Incomplete JSON array');
    }
}

console.log('Testing improved extraction on problematic cases:\n');

problematicCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}:`);
    try {
        const result = improvedExtractJson(testCase);
        console.log('✅ Success:', result);
    } catch (error) {
        console.log('❌ Failed:', error.message);
    }
    console.log('');
});