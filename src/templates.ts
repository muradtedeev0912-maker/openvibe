export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "react-vite",
    name: "React + Vite",
    description: "React 18 with Vite, TypeScript, and CSS Modules",
    icon: "⚛️",
    prompt: `Create a React + Vite project with TypeScript. Include:
- vite.config.ts
- tsconfig.json
- package.json with react, react-dom, @vitejs/plugin-react, typescript, vite
- src/main.tsx (entry point with ReactDOM.createRoot)
- src/App.tsx (simple component with a counter)
- src/App.css (basic styles)
- index.html
- src/vite-env.d.ts
Make it minimal and working. Use modern React 18 patterns.`,
  },
  {
    id: "next-app",
    name: "Next.js App",
    description: "Next.js 14 with App Router, TypeScript, Tailwind",
    icon: "▲",
    prompt: `Create a Next.js 14 project with App Router and TypeScript. Include:
- package.json with next, react, react-dom, typescript, tailwindcss, postcss, autoprefixer
- next.config.js
- tsconfig.json
- tailwind.config.ts
- postcss.config.js
- app/layout.tsx (root layout with html/body)
- app/page.tsx (home page with a hero section)
- app/globals.css (tailwind directives + basic styles)
Make it minimal and working with Tailwind CSS.`,
  },
  {
    id: "express-api",
    name: "Express API",
    description: "Express.js REST API with TypeScript",
    icon: "🚀",
    prompt: `Create an Express.js REST API with TypeScript. Include:
- package.json with express, typescript, ts-node, @types/express, nodemon
- tsconfig.json
- src/index.ts (server with basic routes: GET /, GET /api/health)
- src/routes/api.ts (example CRUD routes for /api/items)
- nodemon.json
- .env.example
Make it minimal with proper error handling and JSON responses.`,
  },
  {
    id: "python-flask",
    name: "Python Flask",
    description: "Flask web app with basic structure",
    icon: "🐍",
    prompt: `Create a Python Flask project. Include:
- app.py (main Flask app with routes: /, /api/health)
- requirements.txt (flask, python-dotenv)
- templates/index.html (simple HTML page)
- static/style.css (basic styles)
- .env.example
- README.md with run instructions
Make it minimal and working.`,
  },
  {
    id: "electron-app",
    name: "Electron App",
    description: "Electron desktop app with React",
    icon: "⚡",
    prompt: `Create an Electron app with React and Vite. Include:
- package.json with electron, react, react-dom, vite, @vitejs/plugin-react
- electron/main.ts (main process with BrowserWindow)
- electron/preload.ts
- src/main.tsx (React entry)
- src/App.tsx (simple UI)
- vite.config.ts
- tsconfig.json
Make it minimal with proper electron-vite setup.`,
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    description: "Python Telegram bot with aiogram",
    icon: "🤖",
    prompt: `Create a Python Telegram bot with aiogram. Include:
- bot.py (main bot file with /start, /help commands and echo handler)
- requirements.txt (aiogram, python-dotenv)
- .env.example (BOT_TOKEN=)
- README.md with setup instructions
Make it minimal and working with aiogram 3.x.`,
  },
  {
    id: "discord-bot",
    name: "Discord Bot",
    description: "Discord.js bot with slash commands",
    icon: "🎮",
    prompt: `Create a Discord.js bot with TypeScript. Include:
- package.json with discord.js, typescript, ts-node, dotenv
- tsconfig.json
- src/index.ts (bot client with ready event and slash command handler)
- src/commands/ping.ts (example slash command)
- .env.example (DISCORD_TOKEN=, CLIENT_ID=)
- README.md
Make it minimal with discord.js v14 and slash commands.`,
  },
  {
    id: "vue-vite",
    name: "Vue 3 + Vite",
    description: "Vue 3 with Vite and TypeScript",
    icon: "💚",
    prompt: `Create a Vue 3 + Vite project with TypeScript. Include:
- package.json with vue, vite, @vitejs/plugin-vue, typescript, vue-tsc
- vite.config.ts
- tsconfig.json
- index.html
- src/main.ts
- src/App.vue (simple component with counter)
- src/components/HelloWorld.vue
- src/vite-env.d.ts
Make it minimal and working.`,
  },
];
