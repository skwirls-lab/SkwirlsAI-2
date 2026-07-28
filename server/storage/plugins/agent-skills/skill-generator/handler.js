const fs = require("fs");
const path = require("path");

/**
 * Skill Generator Plugin
 * Creates new agent skills from natural language descriptions.
 * Uses the LLM to generate plugin.json and handler.js files.
 */
module.exports = {
  runtime: {
    /**
     * Main handler - generates a new skill from a description
     * @param {Object} params
     * @param {string} params.description - What the skill should do
     * @param {string} params.name - Slug name for the skill
     */
    handler: async function ({ description, name }) {
      try {
        if (!description || !description.trim()) {
          return "Error: A description of what the skill should do is required.";
        }

        const slug = this.sanitizeSlug(name || this.generateSlug(description));
        this.introspect(`${this.caller}: Generating skill "${slug}"...`);

        const pluginsDir = this.getPluginsDir();
        const skillDir = path.join(pluginsDir, slug);
        if (fs.existsSync(skillDir)) {
          return `Error: A skill named "${slug}" already exists. Choose a different name.`;
        }

        this.introspect(`${this.caller}: Asking LLM to generate plugin code...`);
        const generated = await this.generatePluginCode(description, slug);

        if (!generated.pluginJson || !generated.handlerJs) {
          return "Error: Failed to generate valid plugin code. The LLM response could not be parsed. Try a more detailed description.";
        }

        const validationError = this.validatePluginJson(generated.pluginJson);
        if (validationError) {
          return `Error: Generated invalid plugin.json: ${validationError}`;
        }

        this.introspect(`${this.caller}: Saving plugin files...`);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, "plugin.json"),
          JSON.stringify(generated.pluginJson, null, 2),
          "utf-8"
        );
        fs.writeFileSync(
          path.join(skillDir, "handler.js"),
          generated.handlerJs,
          "utf-8"
        );

        this.logger(`skill-generator: Created skill "${slug}" at ${skillDir}`);

        return [
          `Skill "${slug}" created successfully!`,
          "",
          `Name: ${generated.pluginJson.name}`,
          `Description: ${generated.pluginJson.description}`,
          `Location: storage/plugins/agent-skills/${slug}/`,
          "",
          "The skill is active and will be available in the next agent session.",
          "You may need to restart the server or start a new chat for it to appear.",
        ].join("\n");
      } catch (error) {
        this.logger(`skill-generator error: ${error.message}`);
        return `Error generating skill: ${error.message}`;
      }
    },

    generatePluginCode: async function (description, slug) {
      const prompt = `You are a plugin code generator for SkwirlsAI. Generate a valid agent skill plugin.

SKILL DESCRIPTION: ${description}
SKILL SLUG: ${slug}

You must return EXACTLY two code blocks with no other text:

1. A JSON code block for plugin.json
2. A JavaScript code block for handler.js

IMPORTANT RULES:
- plugin.json must have: hubId, name, description, active (true), examples array, entrypoint with params object, setup_args object
- handler.js must export: module.exports = { runtime: { handler: async function(params) { ... } } }
- The handler function receives destructured params matching entrypoint.params
- Use this.introspect("message") for status updates visible to the user
- Use this.logger("message") for server-side logging
- Return a string result from the handler
- Keep the code simple and focused
- Do NOT use any require() statements unless absolutely necessary
- Do NOT access the filesystem or network directly - just return data
- The handler must be a pure function that processes input and returns output

Return your response in this EXACT format:

\`\`\`plugin.json
{
  "hubId": "${slug}",
  "name": "display-name",
  "description": "What this skill does",
  "active": true,
  "examples": [
    {
      "prompt": "Example user prompt",
      "call": "{\\"param\\": \\"value\\"}"
    }
  ],
  "entrypoint": {
    "params": {
      "paramName": {
        "type": "string",
        "description": "What this param does"
      }
    }
  },
  "setup_args": {}
}
\`\`\`

\`\`\`handler.js
module.exports = {
  runtime: {
    handler: async function({ paramName }) {
      try {
        this.introspect(this.caller + ": Processing...");
        // Your logic here
        return "result string";
      } catch (error) {
        return "Error: " + error.message;
      }
    },
  },
};
\`\`\``;

      const messages = [{ role: "user", content: prompt }];
      const response = await this.super.providerInstance.complete(messages);

      if (!response || !response.textResponse) {
        throw new Error("No response from LLM");
      }

      return this.parseGeneratedCode(response.textResponse);
    },

    parseGeneratedCode: function (text) {
      const result = { pluginJson: null, handlerJs: null };

      const jsonMatch = text.match(/```plugin\.json\s*\n([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          result.pluginJson = JSON.parse(jsonMatch[1].trim());
        } catch (e) {
          try {
            const fixed = jsonMatch[1]
              .trim()
              .replace(/,\s*}/g, "}")
              .replace(/,\s*]/g, "]");
            result.pluginJson = JSON.parse(fixed);
          } catch (e2) {
            // Failed to parse
          }
        }
      }

      const handlerMatch = text.match(/```handler\.js\s*\n([\s\S]*?)```/);
      if (handlerMatch) {
        result.handlerJs = handlerMatch[1].trim();
      }

      return result;
    },

    validatePluginJson: function (config) {
      if (!config || typeof config !== "object") return "Must be a valid object";
      if (!config.hubId || typeof config.hubId !== "string") return "Missing or invalid hubId";
      if (!config.name || typeof config.name !== "string") return "Missing or invalid name";
      if (!config.description || typeof config.description !== "string") return "Missing or invalid description";
      if (typeof config.active !== "boolean") return "Missing or invalid active flag";
      if (!config.entrypoint || typeof config.entrypoint !== "object") return "Missing or invalid entrypoint";
      if (!config.entrypoint.params || typeof config.entrypoint.params !== "object") return "Missing or invalid entrypoint.params";
      return null;
    },

    getPluginsDir: function () {
      const storageDir = process.env.STORAGE_DIR || path.resolve(__dirname, "../../../../../storage");
      return path.join(storageDir, "plugins", "agent-skills");
    },

    sanitizeSlug: function (input) {
      return input
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 64);
    },

    generateSlug: function (description) {
      const words = description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .slice(0, 3);
      return words.join("-") || "custom-skill";
    },
  },
};
