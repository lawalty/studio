# **App Name**: AI Blair

## Core Features:

- Interactive Landing Page: Landing page featuring a talking head avatar (image and optional data). Includes a brief summary of the last source uploaded from the general knowledge base.
- AI-Powered Conversation: Real-time Conversational AI with audio-to-audio responses using cloned voice (Elevenlabs API), built on conversational AI frameworks, and displaying both user and AI text bubbles.
- Multi-Modal Input: Supports both text input and voice input via microphone, automatically processing voice input upon a short pause.
- Admin Panel Access: Admin panel accessible via a footer link, providing access to manage the general knowledge base, API keys, and avatar settings.
- General Knowledge Base Management: Allows adding, deleting, and managing source content (text, PDFs, mp3s, etc.) for the knowledge base using Firebase Storage.
- API Key Management: Storage for managing various API keys (Gemini, TTS, STT) and corresponding Voice-IDs for voice cloning; persistent via Firebase Storage.
- AI Persona and Personality Settings: Admin interface for persona and personality tuning that lets you upload or update persona trait attributes. AI tool to allow modifications to conversational nuances; saved persistently.

## Style Guidelines:

- Primary color: Slate blue (#708090). Evokes professionalism, knowledge, and trustworthiness.
- Background color: Light gray (#E0E0E0).  Maintains a light, clean look, suitable for prolonged reading or use.
- Accent color: Soft lavender (#B497D6).  Highlights interactive elements.
- Body and headline font: 'Inter', sans-serif, with a modern machined look
- Use a set of clear and simple icons for the admin panel actions.
- Conversation log should be visually separated, displaying conversation turns clearly. Use a traditional bubble layout to represent the speaker for each turn in the conversation.
- Use smooth transitions when loading content, such as the chatbot response appearing, to create a more polished experience.