/**
 * ai-provider.js
 *
 * Pluggable AI abstraction for Camporee Conductor.
 * Supports Gemini and Claude behind a common interface.
 *
 * Switch via env var:
 *   AI_PROVIDER=gemini   (default)
 *   AI_PROVIDER=claude
 *
 * Model overrides:
 *   GEMINI_MODEL=gemini-2.5-flash    (default)
 *   CLAUDE_MODEL=claude-sonnet-4-6   (default)
 *
 * Usage:
 *   import { generateText } from '../lib/ai-provider.js';
 *   const text = await generateText(prompt);
 */

import { GoogleGenAI } from '@google/genai';

const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

async function generateGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env');

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({ model, contents: prompt });
    return response.text;
}

// ---------------------------------------------------------------------------
// Claude provider
// ---------------------------------------------------------------------------

async function generateClaude(prompt) {
    // Dynamically import so the package is optional — only needed when AI_PROVIDER=claude
    let Anthropic;
    try {
        ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch {
        throw new Error(
            'AI_PROVIDER=claude requires @anthropic-ai/sdk. Run: npm install @anthropic-ai/sdk'
        );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in .env');

    const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
        model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].text;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Generate text from a prompt using the configured AI provider.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generateText(prompt) {
    switch (PROVIDER) {
        case 'gemini': return generateGemini(prompt);
        case 'claude': return generateClaude(prompt);
        default: throw new Error(`Unknown AI_PROVIDER: "${PROVIDER}". Use "gemini" or "claude".`);
    }
}

/**
 * Parse JSON from an AI response, stripping markdown code fences if present.
 * @param {string} text  Raw text from generateText()
 * @returns {*}  Parsed JSON value
 */
export function parseJsonResponse(text) {
    const fenceMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
    const raw = fenceMatch ? fenceMatch[1] : text.trim();
    return JSON.parse(raw);
}

export { PROVIDER };
