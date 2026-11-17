import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Brak klucza GEMINI_API_KEY po stronie serwera.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // AI Route & Weather Analysis endpoint
  app.post('/api/analyze-route', async (req, res) => {
    try {
      const payload = req.body;
      if (!payload || !payload.routeSummary) {
        return res.status(400).json({ error: 'Brak danych trasy do analizy.' });
      }

      const ai = getGeminiClient();

      const prompt = `Przeanalizuj poniższą trasę rowerową i warunki pogodowe w języku polskim jako doświadczony trener kolarski i przewodnik tras GPX. Bądź konkretny, praktyczny i odwołuj się do podanych liczb (kilometry, nachylenie, prędkość wiatru, porywy, opady, jakość powietrza, zachód słońca).

Dane przejazdu:
${JSON.stringify(payload, null, 2)}

Zwróć zwięzłą, konkretną analizę taktyczną w zadanym schemacie JSON.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Jesteś ekspertem od planowania tras rowerowych i meteorologii sportowej. Odpowiadasz wyłącznie po polsku, konkretnie i bez lania wody.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readinessScore: {
                type: Type.INTEGER,
                description: 'Ocena warunków jazdy od 1 do 100 (100 = idealne warunki).',
              },
              overallVerdict: {
                type: Type.STRING,
                description: 'Krótki werdykt 2-4 słowa (np. Świetne warunki, Dobre z uwagami, Wymagające warunki).',
              },
              summary: {
                type: Type.STRING,
                description: 'Zwięzłe podsumowanie całej trasy i warunków w 2-3 zdaniach.',
              },
              tacticalTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 do 4 konkretnych wskazówek taktycznych (wiatr, rozłożenie sił, nawadnianie, moment startu).',
              },
              climbStrategy: {
                type: Type.STRING,
                description: 'Konkretna wskazówka dotycząca podjazdów i zjazdów na tej trasie (1-2 zdania).',
              },
              clothingAdvice: {
                type: Type.STRING,
                description: 'Zalecany zestaw ubrań dopasowany do temperatury odczuwalnej, wiatru i opadów (1-2 zdania).',
              },
              safetyNote: {
                type: Type.STRING,
                description: 'Najważniejsza uwaga bezpieczeństwa (smog/UV/zmrok/mokre zjazdy/silne porywy).',
              },
            },
            required: [
              'readinessScore',
              'overallVerdict',
              'summary',
              'tacticalTips',
              'climbStrategy',
              'clothingAdvice',
              'safetyNote',
            ],
          },
        },
      });

      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Błąd analizy AI.';
      console.error('AI analyze-route error:', err);
      const status =
        message.includes('GEMINI_API_KEY') || message.includes('API_KEY')
          ? 403
          : message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
          ? 429
          : 500;
      return res.status(status).json({ error: message });
    }
  });

  // Follow-up AI question about the active route
  app.post('/api/analyze-route-question', async (req, res) => {
    try {
      const { question, context } = req.body || {};
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Wpisz pytanie do asystenta trasy.' });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Kontekst trasy i pogody:\n${JSON.stringify(context || {})}\n\nPytanie rowerzysty: ${question}`,
        config: {
          systemInstruction:
            'Jesteś ekspertem od kolarstwa i prognozy pogody na trasie GPX. Odpowiadaj zwięźle po polsku (maksymalnie 3-5 zdań), opierając się ściśle na podanych danych trasy.',
        },
      });

      return res.json({ answer: (response.text ?? '').trim() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Błąd zapytania AI.';
      console.error('AI question error:', err);
      return res.status(500).json({ error: message });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkyTrail server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
